import { PermissionsAndroid, Platform } from 'react-native';

/**
 * ElevenLabs agent configuration, read from EXPO_PUBLIC_* env vars (see .env.example).
 *
 * - Public agent: the BACI agent below is the default; override with EXPO_PUBLIC_ELEVENLABS_AGENT_ID,
 *   or set it to `off` to use only the on-device answers (offline demos, e2e).
 * - Private agent (auth enabled): run `npm run token-server` with ELEVENLABS_API_KEY
 *   and set EXPO_PUBLIC_BACI_TOKEN_URL. The API key never ships in the app.
 */
/** The BACI agent on ElevenLabs. Public agent IDs aren't secret (they appear in widget embeds). */
const DEFAULT_AGENT_ID = 'agent_8601m3f031tgf81ajvvcd0xdezab';
const envAgent = process.env.EXPO_PUBLIC_ELEVENLABS_AGENT_ID?.trim();

export const agentConfig = {
  agentId: envAgent === 'off' ? '' : envAgent || DEFAULT_AGENT_ID,
  tokenUrl: process.env.EXPO_PUBLIC_BACI_TOKEN_URL?.trim().replace(/\/$/, '') || '',
};

export const isAgentConfigured = Boolean(agentConfig.agentId || agentConfig.tokenUrl);

export type SessionMode = 'voice' | 'text';

/** Builds the auth part of startSession() for the configured agent. */
export async function sessionAuth(mode: SessionMode) {
  const { agentId, tokenUrl } = agentConfig;
  if (tokenUrl) {
    if (mode === 'voice') {
      // WebRTC (required for voice on React Native) uses a conversation token.
      const res = await fetch(`${tokenUrl}/conversation-token`);
      if (!res.ok) throw new Error(`Token server returned ${res.status}`);
      const { token } = (await res.json()) as { token: string };
      return { conversationToken: token, connectionType: 'webrtc' as const };
    }
    const res = await fetch(`${tokenUrl}/signed-url`);
    if (!res.ok) throw new Error(`Token server returned ${res.status}`);
    const { signedUrl } = (await res.json()) as { signedUrl: string };
    return { signedUrl, connectionType: 'websocket' as const };
  }
  if (!agentId) throw new Error('No ElevenLabs agent configured. Set EXPO_PUBLIC_ELEVENLABS_AGENT_ID.');
  return { agentId, connectionType: mode === 'voice' ? ('webrtc' as const) : ('websocket' as const) };
}

/** Android needs a runtime prompt; iOS and web prompt when the mic is first opened. */
export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Talk to BACI',
    message: 'BACI needs your microphone so you can ask questions out loud.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
