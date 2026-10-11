# Launching BACI with real people and real data

BACI is three parts:

| Part | Where | What it does |
| --- | --- | --- |
| **App** | `mobile/` (Expo) | iOS, Android and web. Sign-in, onboarding, Plaid Link, Home, Ask BACI, Settings. |
| **API** | `server/` (Node 22, Hono) | Accounts and sessions, consent and profile, Plaid tokens (encrypted), syncing, analytics, webhooks, account deletion. |
| **Database** | Postgres | Users, consent log, bank connections, accounts, transactions. |

Without `EXPO_PUBLIC_API_URL`, the app runs on sample data only, exactly as before. With it, people sign up and connect their real banks.

---

## 1. Everything BACI depends on

### Accounts and services

| Dependency | Needed for | Cost (indicative) | Who sets it up |
| --- | --- | --- | --- |
| **Plaid** (dashboard.plaid.com) | Bank connections, balances, transactions | Sandbox free; Production priced per connected account (ask Plaid) | You, as the company |
| **Postgres**: Neon (neon.tech) or Render Postgres | The database | Neon free tier; Render from ~$7/month | You |
| **Server hosting**: Render (render.com), via `render.yaml` | Runs `server/` | Starter ~$7/month. Free instances sleep and miss Plaid webhooks. | You |
| **GitHub Pages** | The web app (already set up) | Free | Done |
| **Expo / EAS** (expo.dev) | Building and submitting the iOS and Android apps | Free tier; paid for more builds | You |
| **Apple Developer Program** | App Store, TestFlight, universal links | $99/year | You, as the company |
| **Google Play Console** | Play Store | $25 one-off | You |
| **A domain** (e.g. `baci.app`) | iOS universal link for Plaid OAuth; a nicer API URL | ~£10/year | You |
| **ElevenLabs** (already set up) | The voice agent | Your current plan | Done; optional `ELEVENLABS_API_KEY` secret |

### Regulatory and legal (UK)

These aren't code, but you need them before real people use BACI.

1. **Account information services.** Reading bank data is a regulated activity, account information services under PSRs 2017. Plaid is FCA-authorised. Confirm with Plaid during production onboarding how BACI is covered: as Plaid's agent, under Plaid's permission, or with your own registration.
2. **"Not advice."** BACI gives information, not regulated financial advice; the app says so throughout. Keep answers factual: options, not recommendations to buy financial products.
3. **UK GDPR.**
   - Pay the ICO data protection fee (ico.org.uk) as a data controller.
   - Publish a privacy notice: what you collect, why, how long you keep it, Plaid as processor, and people's rights.
   - Keep a record of processing.
   - The app already supports consent with an audit log (`consent_events`), revocation, and delete-my-account (`DELETE /v1/me`, which also revokes access at each bank through Plaid).
4. **Terms of use**, and app store privacy labels for Apple and Google.
5. **Security review.** Plaid's production questionnaire asks about access control, encryption, MFA on your admin accounts, and incident response. BACI encrypts bank tokens at rest (AES-256-GCM), stores only hashes of session tokens and passwords (scrypt), verifies webhook signatures, and keeps secrets in the host's environment, never in the app.

---

## 2. Set it up (about an hour, plus Plaid's approval time)

### a. Plaid

1. Sign up at https://dashboard.plaid.com/signup. Sandbox works immediately.
2. Under **Developers → Keys**, copy the `client_id` and the **Sandbox** secret.
3. Under **Developers → API → Allowed redirect URIs**, add:
   - `https://erastus-o.github.io/BACI/oauth`, the web app's OAuth return.
   - `https://YOUR-DOMAIN/plaid/oauth` for iOS, once you have a domain (see e).
4. For real data, apply for **Production** under **Team settings → Production access**. You'll get a Production secret. Set `PLAID_ENV=production` and swap the secret.

### b. Database

Create a Postgres database. On Neon: New project → copy the connection string (`postgres://…?sslmode=require`). The server creates its tables on first start.

### c. API on Render

1. In Render, go to **New → Blueprint** and choose this repository. It reads `render.yaml`.
2. Fill in the variables:
   - `DATABASE_URL`: from step b.
   - `ENCRYPTION_KEY`: run `openssl rand -base64 32`. **Store a copy safely.** Losing it means everyone must reconnect their banks.
   - `PLAID_CLIENT_ID` and `PLAID_SECRET`: from step a.
   - `PLAID_WEBHOOK_URL`: `https://<your-service>.onrender.com/v1/plaid/webhook`.
3. Deploy, then open `https://<your-service>.onrender.com/health`. It should say `{"ok":true,…}`.

### d. Web app

In GitHub, go to **Settings → Secrets and variables → Actions → Variables** and add `BACI_API_URL` = `https://<your-service>.onrender.com`. Then re-run **Deploy web app**. The site now has sign-up and real bank connections, at https://erastus-o.github.io/BACI/.

### e. iOS and Android apps

1. `npm i -g eas-cli`, then `cd mobile && eas login && eas init`.
2. In `mobile/eas.json`, set `EXPO_PUBLIC_API_URL` for `preview` and `production` to your API URL.
3. **iOS app-to-app (OAuth) return.** Plaid needs a universal link.
   1. Host `https://YOUR-DOMAIN/.well-known/apple-app-site-association` listing your Team ID and `com.baci.app`, for the path `/plaid/oauth`.
   2. Build with `BACI_ASSOCIATED_DOMAIN=YOUR-DOMAIN`.
   3. Set `PLAID_REDIRECT_URI_IOS=https://YOUR-DOMAIN/plaid/oauth` on the server.
4. **Android app-to-app.** Nothing extra: the server sends `PLAID_ANDROID_PACKAGE=com.baci.app`. Register the package name in the Plaid dashboard under **Allowed Android package names**.
5. Build and test: run `eas build --profile preview --platform all`, then install on phones. Plaid Link and voice both need these builds, not Expo Go.
6. Ship: run `eas build --profile production` and then `eas submit`.

### f. Voice agent (optional)

The agent is public today. To make it private, turn on authentication in ElevenLabs and set `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` on the server. Signed-in apps then get short-lived tokens from `POST /v1/agent/token`.

---

## 3. Before inviting real users

- [ ] Plaid Production approved; `PLAID_ENV=production`; `ALLOW_SANDBOX_SHORTCUT=false`.
- [ ] Server on a paid instance (so webhooks arrive), with database backups on.
- [ ] `ENCRYPTION_KEY` backed up somewhere other than Render.
- [ ] Privacy notice and terms published and linked from the app and store listings; ICO fee paid.
- [ ] Clarified with Plaid how BACI is covered for account information services.
- [ ] Tried it yourself with your own bank in Production: connect, wait for the transactions webhook, reconnect after revoking at the bank, disconnect, delete account.

## 4. Known limits (next steps)

- **Password reset** needs an email provider (e.g. Postmark or Resend). Until then, someone who forgets their password has to create a new account.
- **Multi-factor sign-in** isn't built yet. Passkeys or one-time email codes would be a good next step.
- **Sign-in rate limiting** is per server process. Use a shared store (Redis) if you run more than one instance.
- **Savings goals** have no target yet. Home shows no goal bar until people can set one.
- **Duplicate accounts** across two connections (for example a joint account at two banks) aren't merged. Plaid's `persistent_account_id` can do this where banks support it.
