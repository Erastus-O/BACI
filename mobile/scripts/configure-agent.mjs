// Turns on what the BACI app needs from its ElevenLabs agent:
//   1. the four client tools the app implements (created once, then attached to the agent)
//   2. the "Text only" override, so typed chat can use the agent
//   3. if the agent restricts which websites may use it, the app's hosts are added
//   4. with --prompt, BACI's safety rules are appended to the agent's prompt (once)
//
//   ELEVENLABS_API_KEY=sk_... npm run configure-agent            # apply
//   ELEVENLABS_API_KEY=sk_... npm run configure-agent -- --dry-run
//
// Uses the official SDK. Re-running is safe: nothing is duplicated.
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const withPrompt = args.includes('--prompt');
const agentId = process.env.ELEVENLABS_AGENT_ID || 'agent_8601m3f031tgf81ajvvcd0xdezab';
const appHosts = (process.env.BACI_APP_HOSTS || 'erastus-o.github.io,localhost').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

if (!process.env.ELEVENLABS_API_KEY) {
  console.error('Set ELEVENLABS_API_KEY (ElevenLabs › Settings › API keys; it needs agent write access).');
  process.exit(1);
}

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY, baseUrl: process.env.ELEVENLABS_BASE_URL || undefined });

const str = (description) => ({ type: 'string', description });
const num = (description) => ({ type: 'number', description });
const bool = (description) => ({ type: 'boolean', description });

// Must match the handlers in src/agent/AgentChat.tsx.
const TOOLS = [
  {
    name: 'get_financial_snapshot',
    description: "Get the user's current balances, savings, debts, bills for the next 30 days and data coverage from their connected accounts. Call before answering questions about how much money they have.",
  },
  {
    name: 'get_upcoming_bills',
    description: 'List the bills and repayments due in the next 30 days, with dates and amounts.',
  },
  {
    name: 'check_affordability',
    description:
      'Work out whether the user can afford a purchase, using their connected accounts, bills, buffer and goal. Only call once the price is known; never guess it. For finance, also get the number of months and the APR (if the user does not know the APR, call without it and say it is shown at 0%).',
    parameters: {
      type: 'object',
      required: ['amount'],
      properties: {
        amount: num('Purchase price in pounds, e.g. 1200'),
        item: str('What is being bought, e.g. "laptop"'),
        on_finance: bool('True if the purchase is paid in monthly instalments'),
        months: num('Finance term in months'),
        apr: num('Finance APR as a percentage, e.g. 9.9'),
      },
    },
  },
  {
    name: 'navigate_to_screen',
    description: 'Open a screen in the BACI app when the user asks to see it.',
    parameters: {
      type: 'object',
      required: ['screen'],
      properties: {
        screen: { type: 'string', description: 'Screen to open', enum: ['home', 'chat', 'accounts', 'settings', 'permissions', 'add_account'] },
      },
    },
  },
];

const PROMPT_MARKER = '[BACI app rules]';
const PROMPT_RULES = `${PROMPT_MARKER}
You are BACI, a UK personal finance information agent inside the BACI app. Only use figures from BACI tools or BACI context updates. Never estimate or invent numbers.
If a purchase has no price, ask "How much does the {item} cost?" and make no tool call until you have it. For finance, ask for the number of months and the APR; if the user doesn't know the APR, use 0% and say clearly that the real cost will be higher.
If a tool says data couldn't be retrieved, say: "I couldn't retrieve your live financial data just now, so I won't guess at the numbers," and offer to try again. If a tool says permission is missing, say so and point to Settings › Data permissions.
Debts are never cash. Give options, not advice: BACI provides information, not regulated financial advice.`;

async function allTools() {
  const out = [];
  let cursor;
  do {
    const page = await client.conversationalAi.tools.list(cursor ? { cursor } : {});
    out.push(...page.tools);
    cursor = page.hasMore ? page.nextCursor : undefined;
  } while (cursor);
  return out;
}

const log = (s) => console.log(s);

// 1. Client tools
const existing = await allTools();
const toolIds = [];
let toCreate = 0;
for (const t of TOOLS) {
  const found = existing.find((e) => e.toolConfig?.type === 'client' && e.toolConfig?.name === t.name);
  if (found) {
    log(`✓ tool ${t.name} already exists (${found.id})`);
    toolIds.push(found.id);
    continue;
  }
  if (dryRun) {
    log(`+ would create client tool ${t.name}`);
    toCreate++;
    continue;
  }
  const created = await client.conversationalAi.tools.create({
    toolConfig: { type: 'client', name: t.name, description: t.description, expectsResponse: true, responseTimeoutSecs: 20, ...(t.parameters ? { parameters: t.parameters } : {}) },
  });
  log(`+ created client tool ${t.name} (${created.id})`);
  toolIds.push(created.id);
}

// 2–4. Agent settings
const agent = await client.conversationalAi.agents.get(agentId);
log(`\nAgent: ${agent.name} (${agentId})`);
const prompt = agent.conversationConfig?.agent?.prompt ?? {};
const currentIds = prompt.toolIds ?? [];
const nextIds = [...new Set([...currentIds, ...toolIds])];
if (prompt.tools?.length && !currentIds.length) {
  log('! This agent has older inline tools. They are kept; the BACI tools are attached alongside them by ID.');
}

const overrideOn = Boolean(agent.platformSettings?.overrides?.conversationConfigOverride?.conversation?.textOnly);
const allowlist = agent.platformSettings?.auth?.allowlist ?? [];
const missingHosts = allowlist.length ? appHosts.filter((h) => !allowlist.some((a) => a.hostname === h)) : [];
const promptText = prompt.prompt ?? '';
const addPrompt = withPrompt && !promptText.includes(PROMPT_MARKER);

const changes = [];
const toAttach = nextIds.length - currentIds.length + toCreate;
if (toAttach) changes.push(`attach ${toAttach} tool(s)`);
if (!overrideOn) changes.push('allow the "Text only" override');
if (missingHosts.length) changes.push(`allow ${missingHosts.join(', ')} in the agent's website allowlist`);
if (addPrompt) changes.push("append BACI's rules to the prompt");

log(allowlist.length ? `Website allowlist: ${allowlist.map((a) => a.hostname).join(', ')}` : 'Website allowlist: empty (any website may use this public agent)');
if (!changes.length) {
  log('\n✓ Nothing to change: the agent already has everything the app needs.');
  process.exit(0);
}
log(`\n${dryRun ? 'Would' : 'Will'}: ${changes.join('; ')}`);
if (dryRun) process.exit(0);

const { tools: _inline, ...promptRest } = prompt;
await client.conversationalAi.agents.update(agentId, {
  conversationConfig: {
    agent: {
      prompt: {
        ...promptRest,
        toolIds: nextIds,
        ...(addPrompt ? { prompt: `${promptText.trim()}\n\n${PROMPT_RULES}`.trim() } : {}),
      },
    },
  },
  platformSettings: {
    overrides: {
      ...agent.platformSettings?.overrides,
      conversationConfigOverride: {
        ...agent.platformSettings?.overrides?.conversationConfigOverride,
        conversation: { ...agent.platformSettings?.overrides?.conversationConfigOverride?.conversation, textOnly: true },
      },
    },
    ...(missingHosts.length
      ? { auth: { ...agent.platformSettings?.auth, allowlist: [...allowlist, ...missingHosts.map((hostname) => ({ hostname }))] } }
      : {}),
  },
});

// Read back to confirm.
const after = await client.conversationalAi.agents.get(agentId);
const ids = after.conversationConfig?.agent?.prompt?.toolIds ?? [];
const ok = toolIds.every((id) => ids.includes(id)) && Boolean(after.platformSettings?.overrides?.conversationConfigOverride?.conversation?.textOnly);
log(ok ? '\n✓ Agent updated: tools attached and the "Text only" override allowed.' : '\n✗ The update was sent, but reading the agent back does not show every change. Check it in the ElevenLabs dashboard.');
process.exit(ok ? 0 : 1);
