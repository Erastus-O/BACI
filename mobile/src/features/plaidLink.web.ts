import type { LinkPlatform } from '../services/api';

export type LinkResult = { publicToken: string; institution: { id: string; name: string } | null };
export type LinkContext = { token: string; flow: string; connectionId?: string };

export const linkPlatform: LinkPlatform = 'web';

type PlaidHandler = { open: () => void; exit: () => void; destroy: () => void };
type PlaidGlobal = {
  create(o: {
    token: string;
    receivedRedirectUri?: string;
    onSuccess: (publicToken: string, metadata: { institution?: { institution_id: string; name: string } | null }) => void;
    onExit: (err: unknown) => void;
  }): PlaidHandler;
};
declare global {
  interface Window {
    Plaid?: PlaidGlobal;
  }
}

const SCRIPT = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
let loading: Promise<void> | null = null;

function loadPlaid() {
  if (window.Plaid) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Couldn’t load the secure bank connection window. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Web: Plaid Link in an overlay. UK banks use OAuth, so Link sends the person to their bank
 * (its app on a phone, its website on a computer) and the bank returns to /oauth, which calls
 * this again with receivedRedirectUri to finish. Resolves null if Link is closed.
 */
export async function openPlaidLink(token: string, receivedRedirectUri?: string): Promise<LinkResult | null> {
  await loadPlaid();
  return new Promise((resolve) => {
    const handler = window.Plaid!.create({
      token,
      receivedRedirectUri,
      onSuccess: (publicToken, metadata) => {
        forgetLink();
        resolve({ publicToken, institution: metadata.institution ? { id: metadata.institution.institution_id, name: metadata.institution.name } : null });
        handler.destroy();
      },
      onExit: () => {
        forgetLink();
        resolve(null);
        handler.destroy();
      },
    });
    handler.open();
  });
}

// The link token and where we were, kept across the bank's OAuth redirect.
const KEY = 'baci.plaidLink';

export function rememberLink(ctx: LinkContext) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ctx));
  } catch {}
}

export function forgetLink() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}

/** On /oauth: the Link session to resume, if the bank just sent the person back. */
export function pendingOAuthReturn(): LinkContext | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LinkContext) : null;
  } catch {
    return null;
  }
}
