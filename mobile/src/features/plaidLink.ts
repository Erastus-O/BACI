import { Platform } from 'react-native';
import { createPlaidLinkSession } from 'react-native-plaid-link-sdk';
import type { LinkPlatform } from '../services/api';

export type LinkResult = { publicToken: string; institution: { id: string; name: string } | null };

export const linkPlatform: LinkPlatform = Platform.OS === 'android' ? 'android' : 'ios';

/**
 * iOS/Android: Plaid's native Link SDK. It lists every supported bank and handles
 * app-to-app OAuth itself (universal link on iOS, package name on Android).
 * Resolves null when the person closes Link without connecting.
 */
export async function openPlaidLink(token: string, _receivedRedirectUri?: string): Promise<LinkResult | null> {
  return new Promise((resolve, reject) => {
    createPlaidLinkSession({
      token,
      onSuccess: (s) => resolve({ publicToken: s.publicToken, institution: s.metadata.institution ? { id: s.metadata.institution.id, name: s.metadata.institution.name } : null }),
      onExit: () => resolve(null),
      onEvent: () => {},
    })
      .then((session) => session.open(false))
      .catch(reject);
  });
}

/** Native apps return from the bank inside Link itself; nothing to resume. */
export function pendingOAuthReturn(): LinkContext | null {
  return null;
}
export function rememberLink(_ctx: LinkContext) {}
export function forgetLink() {}

export type LinkContext = { token: string; flow: string; connectionId?: string };
