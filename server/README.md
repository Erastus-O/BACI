# BACI API

Node 22 + [Hono](https://hono.dev) + Postgres. It holds people's accounts, consent and profile, and their bank data from Plaid, and serves the app one state object (`GET /v1/state`). Totals and affordability are computed in the app from that state. Bills, income and insights are detected here, in `src/finance.ts`.

## Run it locally

```sh
cd server
npm install
cp .env.example .env   # fill in DATABASE_URL, ENCRYPTION_KEY, PLAID_CLIENT_ID, PLAID_SECRET
set -a; . ./.env; set +a
npm run dev            # http://localhost:8080/health
```

Point the app at it with `EXPO_PUBLIC_API_URL=http://localhost:8080 npx expo start` in `mobile/`. On a phone, use your computer's LAN IP instead of `localhost`.

**Without Plaid keys:** run the stand-in Plaid and point the server at it.

```sh
node --import tsx test/fakePlaid.ts 5099
PLAID_BASE_URL=http://localhost:5099 PLAID_CLIENT_ID=x PLAID_SECRET=x ALLOW_SANDBOX_SHORTCUT=true npm run dev
```

Then use **"Use Plaid's test bank (sandbox)"** on the connect screen.

## Test

```sh
TEST_DATABASE_URL=postgres://postgres@localhost:5432/baci_test npm test   # the database is wiped
npm run typecheck
```

The end-to-end journey across the app, API and database is `mobile/e2e/live.mjs`. CI (`.github/workflows/ci.yml`) runs all of these.

## API

All routes except auth, `/health` and the webhook need `Authorization: Bearer <token>`.

| Route | What it does |
| --- | --- |
| `POST /v1/auth/signup` · `POST /v1/auth/login` · `POST /v1/auth/logout` | Accounts and sessions |
| `GET /v1/state` | Everything the app shows |
| `PATCH /v1/onboarding` · `PUT`/`DELETE /v1/consent` · `PUT /v1/profile` | Onboarding, consent (logged in `consent_events`), profile |
| `POST /v1/plaid/link-token` | Plaid Link token: new connection, or update mode with `connectionId` |
| `POST /v1/plaid/exchange` | Public token → encrypted access token, institution, accounts |
| `POST /v1/connections/:id/accounts` · `/sync` · `/reauthorised` · `DELETE /v1/connections/:id` | Choose accounts, sync, after re-auth, disconnect (revokes at Plaid) |
| `PATCH /v1/accounts/:id` · `POST /v1/insights/:id/dismiss` | Include or exclude an account; dismiss an insight |
| `DELETE /v1/me` | Delete the account and all data |
| `POST /v1/plaid/webhook` | Plaid webhooks (ES256-signed; verified) |
| `POST /v1/agent/token` | ElevenLabs conversation token for a private agent |

For deployment and every external dependency, see [`docs/LAUNCH.md`](../docs/LAUNCH.md).
