import { router } from 'expo-router';
import { createLinkToken, exchangePublicToken, markReauthorised } from '../services/api';
import { cacheDiscovered, type Flow } from './flow';
import { forgetLink, linkPlatform, openPlaidLink, rememberLink, type LinkResult } from './plaidLink';

// Live bank connections: Plaid Link → our server → the same 04c–05b screens as the demo.

async function finishConnect(result: LinkResult | { sandbox: true }, flow: Flow) {
  const r = await exchangePublicToken('sandbox' in result ? { sandbox: true } : result);
  cacheDiscovered(r.connectionId, r.discovered);
  router.push({ pathname: '/connect/[id]/found', params: { id: r.connectionId, flow } });
}

/** Opens Plaid Link (which lists every supported bank). Returns false if the person closed it. */
export async function connectBank(flow: Flow) {
  const token = await createLinkToken(linkPlatform);
  rememberLink({ token, flow });
  const result = await openPlaidLink(token);
  if (!result) return false;
  await finishConnect(result, flow);
  return true;
}

/** Sandbox only (server ALLOW_SANDBOX_SHORTCUT): connect Plaid's test bank without Link. */
export async function connectSandboxBank(flow: Flow) {
  await finishConnect({ sandbox: true }, flow);
}

/** The bank sent the person back after OAuth (web): finish the same Link session. */
export async function resumeAfterOAuth(ctx: { token: string; flow: string; connectionId?: string }, receivedRedirectUri: string) {
  const flow: Flow = ctx.flow === 'accounts' ? 'accounts' : 'onboarding';
  const result = await openPlaidLink(ctx.token, receivedRedirectUri);
  forgetLink();
  if (!result) return false;
  if (ctx.connectionId) {
    await markReauthorised(ctx.connectionId);
    router.replace({ pathname: '/connect/[id]/done', params: { id: ctx.connectionId, flow: 'accounts' } });
  } else {
    await finishConnect(result, flow);
  }
  return true;
}

/** E3: Plaid Link in update mode, so the person confirms access at their bank again. */
export async function reconnectBank(connectionId: string) {
  const token = await createLinkToken(linkPlatform, connectionId);
  rememberLink({ token, flow: 'accounts', connectionId });
  const result = await openPlaidLink(token);
  if (!result) return false;
  await markReauthorised(connectionId);
  router.replace({ pathname: '/connect/[id]/done', params: { id: connectionId, flow: 'accounts' } });
  return true;
}
