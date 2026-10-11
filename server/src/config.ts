// Every setting comes from the environment; see .env.example and docs/LAUNCH.md.

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const need = (name: string) => {
    const v = env[name];
    if (!v) throw new Error(`Missing environment variable ${name} (see server/.env.example).`);
    return v;
  };
  const list = (v: string | undefined, fallback: string[] = []) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : fallback);

  const key = Buffer.from(need('ENCRYPTION_KEY'), 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 random bytes, base64-encoded (openssl rand -base64 32).');

  const plaidEnv = env.PLAID_ENV || 'sandbox';
  if (!['sandbox', 'production'].includes(plaidEnv)) throw new Error('PLAID_ENV must be sandbox or production.');

  return {
    port: Number(env.PORT || 8080),
    databaseUrl: need('DATABASE_URL'),
    encryptionKey: key,
    /** Browser origins allowed to call the API (the web app). Native apps don't send an Origin. */
    corsOrigins: list(env.CORS_ORIGINS, ['http://localhost:8081']),
    sessionDays: Number(env.SESSION_DAYS || 60),
    plaid: {
      clientId: need('PLAID_CLIENT_ID'),
      secret: need('PLAID_SECRET'),
      env: plaidEnv,
      baseUrl: (env.PLAID_BASE_URL || `https://${plaidEnv}.plaid.com`).replace(/\/$/, ''),
      countryCodes: list(env.PLAID_COUNTRY_CODES, ['GB']),
      /** OAuth return for the web app, e.g. https://erastus-o.github.io/BACI/oauth (register it in the Plaid dashboard). */
      redirectUriWeb: env.PLAID_REDIRECT_URI_WEB || null,
      /** OAuth return for iOS: a universal link served from your domain (register it in the Plaid dashboard). */
      redirectUriIos: env.PLAID_REDIRECT_URI_IOS || null,
      /** Android app-to-app OAuth uses the package name instead of a redirect URI. */
      androidPackage: env.PLAID_ANDROID_PACKAGE || null,
      /** Public URL of POST /v1/plaid/webhook, e.g. https://baci-api.onrender.com/v1/plaid/webhook */
      webhookUrl: env.PLAID_WEBHOOK_URL || null,
      verifyWebhooks: env.PLAID_VERIFY_WEBHOOKS !== 'false',
      /** Sandbox only: lets the app connect Plaid's test bank without the Link UI (for testing). */
      sandboxShortcut: plaidEnv === 'sandbox' && env.ALLOW_SANDBOX_SHORTCUT === 'true',
      sandboxInstitution: env.PLAID_SANDBOX_INSTITUTION || 'ins_117650',
    },
    elevenlabs: {
      apiKey: env.ELEVENLABS_API_KEY || null,
      agentId: env.ELEVENLABS_AGENT_ID || null,
    },
  };
}
