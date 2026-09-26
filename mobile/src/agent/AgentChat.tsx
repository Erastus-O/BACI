import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  ConversationProvider,
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useConversationStatus,
} from '@elevenlabs/react-native';
import { ApiError, calculatePurchaseImpact, describeImpact, describeSnapshot, getCommitments, serverEvents, snapshotForAgent } from '../services/api';
import { parseAmount, parseItem, parseTerm } from '../lib/format';
import { ChatItem, coverageNotices, Ctx, followUps, initialCtx, respond, welcome } from './orchestrator';
import { ensureMicPermission, isAgentConfigured, sessionAuth, SessionMode } from './config';

export type { ChatItem } from './orchestrator';

type AgentChatValue = {
  /** An ElevenLabs agent is configured; otherwise answers come from the on-device orchestrator. */
  configured: boolean;
  items: ChatItem[];
  thinking: boolean;
  mode: SessionMode | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  isSpeaking: boolean;
  isMuted: boolean;
  error: string | null;
  send: (text: string) => Promise<boolean>;
  startCall: () => Promise<void>;
  endSession: () => void;
  setMuted: (muted: boolean) => void;
  /** Ends any session and clears the transcript (prototype restart). */
  reset: () => void;
};

const ChatContext = createContext<AgentChatValue>(null as never);

let nextId = 0;
const uid = () => `m${++nextId}`;
type NewItem = Parameters<typeof withId>[0];
const withId = <T extends object>(i: T) => ({ ...i, id: uid() }) as unknown as ChatItem;

const screens = { home: '/home', chat: '/chat', accounts: '/accounts', settings: '/settings', permissions: '/settings/permissions', add_account: '/accounts/add' } as const;

const TOOL_FAILED = "Tell the user: I couldn't retrieve your live financial data just now, so I won't guess at the numbers. Offer to try again.";
const NO_CONSENT = "The user hasn't given BACI permission to analyse this data. Tell them you can't answer, and that they can turn access on in Settings › Data permissions. Don't estimate.";

/**
 * Ask BACI state: the transcript plus the ElevenLabs conversation. Lives above the
 * tabs so a voice call keeps going while the user moves around the app.
 */
export function AgentChatProvider({ children }: { children: ReactNode }) {
  return (
    <ConversationProvider>
      <AgentChatInner>{children}</AgentChatInner>
    </ConversationProvider>
  );
}

function AgentChatInner({ children }: { children: ReactNode }) {
  const { startSession, endSession, sendUserMessage, sendContextualUpdate } = useConversationControls();
  const { status, message } = useConversationStatus();
  const { isSpeaking } = useConversationMode();
  const { isMuted, setMuted } = useConversationInput();

  const [items, setItems] = useState<ChatItem[]>(() => [withId(welcome)]);
  const [thinking, setThinking] = useState(false);
  const [mode, setMode] = useState<SessionMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctx = useRef<Ctx>(initialCtx);
  const queued = useRef<string[]>([]);

  const push = useCallback((...next: NewItem[]) => setItems((prev) => [...prev, ...next.map(withId)]), []);

  // ---- Client tools. Register these names as "Client" tools on the ElevenLabs agent (see README). ----
  const clientTools = useMemo(() => {
    const guard = async (fn: () => Promise<string>) => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'consent_required') return NO_CONSENT;
        push({ kind: 'agent', text: "I couldn't retrieve your live financial data just now, so I won't guess at the numbers. Want me to try again?", error: true, quickReplies: ['Try again'] });
        return TOOL_FAILED;
      }
    };
    return {
      get_financial_snapshot: () =>
        guard(async () => {
          const snap = await snapshotForAgent();
          push({ kind: 'snapshot', snap }, ...coverageNotices(snap));
          return describeSnapshot(snap);
        }),
      get_upcoming_bills: () =>
        guard(async () => {
          const list = await getCommitments();
          push({ kind: 'commitments', items: list });
          return list.map((b) => `${b.date}: ${b.label} £${b.amount.toFixed(2)}`).join('\n');
        }),
      check_affordability: (params: Record<string, unknown>) =>
        guard(async () => {
          const price = Number(String(params.amount ?? params.price ?? '').replace(/[£,\s]/g, ''));
          if (!Number.isFinite(price) || price <= 0) return 'No price given. Ask the user how much it costs. Never guess a price.';
          const months = Number(params.months ?? 0);
          const aprRaw = params.apr;
          const apr = aprRaw === undefined || aprRaw === null || aprRaw === '' ? null : Number(aprRaw);
          const onFinance = Boolean(params.on_finance) || months > 0;
          if (onFinance && !months) return "It's on finance but the term is missing. Ask how many months and the APR (if unsure, you'll show 0% and flag it).";
          const item = typeof params.item === 'string' && params.item ? params.item : null;
          const result = await calculatePurchaseImpact({ price, item, finance: onFinance ? { months, apr: Number.isFinite(apr) ? apr : null } : null });
          ctx.current = { ...ctx.current, lastImpact: result };
          push({ kind: 'impact', result, followUps: followUps(result) });
          return describeImpact(result);
        }),
      navigate_to_screen: (params: Record<string, unknown>) => {
        const key = String(params.screen ?? '') as keyof typeof screens;
        if (!(key in screens)) return `Unknown screen. Use one of: ${Object.keys(screens).join(', ')}.`;
        router.navigate(screens[key]);
        return `Opened ${key}.`;
      },
    };
  }, [push]);

  const shareSnapshot = useCallback(async () => {
    try {
      sendContextualUpdate(describeSnapshot(await snapshotForAgent()));
    } catch (e) {
      sendContextualUpdate(e instanceof ApiError && e.code === 'consent_required' ? NO_CONSENT : TOOL_FAILED);
    }
  }, [sendContextualUpdate]);

  const callbacks = useMemo(
    () => ({
      onConnect: () => {
        setError(null);
        // The agent gets the user's numbers even if no client tools are configured.
        shareSnapshot();
        queued.current.splice(0).forEach((t) => sendUserMessage(t));
      },
      onDisconnect: () => {
        setMode(null);
        setThinking(false);
      },
      onError: (msg: string) => {
        setError(msg);
        setThinking(false);
      },
      onMessage: ({ message: text, role }: { message: string; role: 'user' | 'agent' }) => {
        if (role === 'agent') {
          setThinking(false);
          push({ kind: 'agent', text });
          return;
        }
        // Voice transcripts arrive here; typed messages are already in the list.
        setItems((prev) => {
          const last = [...prev].reverse().find((i) => i.kind === 'user');
          if (last?.kind === 'user' && last.text === text) return prev;
          return [...prev, withId({ kind: 'user', text })];
        });
        setThinking(true);
      },
    }),
    [push, sendUserMessage, shareSnapshot],
  );

  const open = useCallback(
    async (m: SessionMode) => {
      setError(null);
      setMode(m);
      try {
        const auth = await sessionAuth(m);
        startSession({ ...auth, textOnly: m === 'text', userId: 'baci-prototype-user', clientTools, ...callbacks });
      } catch (e) {
        setMode(null);
        setThinking(false);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [callbacks, clientTools, startSession],
  );

  const startCall = useCallback(async () => {
    if (!isAgentConfigured) {
      setError('Voice needs an ElevenLabs agent. Add EXPO_PUBLIC_ELEVENLABS_AGENT_ID to mobile/.env and restart.');
      return;
    }
    if (status === 'connected' || status === 'connecting') endSession();
    if (!(await ensureMicPermission())) {
      setError('Microphone access is off. Turn it on in your phone’s settings to talk to BACI.');
      return;
    }
    await open('voice');
  }, [endSession, open, status]);

  /** Returns false if the message couldn't be sent (the composer restores the text). */
  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return true;
      setError(null);
      push({ kind: 'user', text });

      if (!isAgentConfigured) {
        setThinking(true);
        try {
          const r = await respond(text, ctx.current);
          ctx.current = r.ctx;
          push(...r.items);
          return true;
        } catch {
          setError("Couldn't send that. Check your connection and try again.");
          return false;
        } finally {
          setThinking(false);
        }
      }

      // With a price in the message, attach the calculated figures so the agent's answer matches the card.
      let context = '';
      const price = /afford|buy|purchase|what about/i.test(text) ? parseAmount(text) : null;
      const term = parseTerm(text);
      if (price && (!/finance|monthly|instal/i.test(text) || term.months)) {
        try {
          const result = await calculatePurchaseImpact({ price, item: parseItem(text), finance: term.months ? { months: term.months, apr: term.aprUnknown ? null : term.apr } : null });
          ctx.current = { ...ctx.current, lastImpact: result };
          push({ kind: 'impact', result, followUps: followUps(result) });
          context = describeImpact(result);
        } catch (e) {
          context = e instanceof ApiError && e.code === 'consent_required' ? NO_CONSENT : TOOL_FAILED;
        }
      }

      setThinking(true);
      if (status === 'connected') {
        if (context) sendContextualUpdate(context);
        sendUserMessage(text);
      } else {
        queued.current.push(context ? `${text}\n\n[Figures from the BACI app — use these, don't recalculate]\n${context}` : text);
        if (status !== 'connecting') open('text');
      }
      return true;
    },
    [open, push, sendContextualUpdate, sendUserMessage, status],
  );

  // Keep the agent's numbers current when accounts or consent change mid-conversation.
  useEffect(() => {
    if (status !== 'connected') return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = serverEvents.subscribe(() => {
      clearTimeout(t);
      t = setTimeout(shareSnapshot, 400);
    });
    return () => {
      clearTimeout(t);
      off();
    };
  }, [status, shareSnapshot]);

  const value: AgentChatValue = {
    configured: isAgentConfigured,
    items,
    thinking,
    mode,
    status,
    isSpeaking,
    isMuted,
    error: error ?? (status === 'error' ? (message ?? 'Connection error') : null),
    send,
    startCall,
    endSession: () => {
      queued.current = [];
      endSession();
      setMode(null);
      setThinking(false);
    },
    setMuted,
    reset: () => {
      queued.current = [];
      endSession();
      setMode(null);
      setThinking(false);
      setError(null);
      ctx.current = initialCtx;
      setItems([withId(welcome)]);
    },
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useAgentChat() {
  return useContext(ChatContext);
}
