# BACI mobile — prototype

Expo (React Native) prototype of **BACI, the finance intelligence agent**. It is built from the BACI Design canvas, follows the flow contract in [`docs/design/BACI_FLOW_SPEC.md`](../docs/design/BACI_FLOW_SPEC.md), and has a built-in **ElevenLabs voice + text agent** in *Ask BACI*.

- Expo SDK 57 · React Native 0.86 · Expo Router · TypeScript
- Runs on iOS and Android (development build) and in the browser (`expo start --web`)
- Uses sandbox data only. Bank names are the fictional institutions from the design.

## Run it

```bash
cd mobile
npm install
cp .env.example .env          # add your ElevenLabs agent ID (optional, see below)

npm run web                   # quickest: browser, voice works through the browser mic
npx expo run:ios              # or run:android: development build with native voice
```

Voice on a phone needs a **development build**. It won't run in Expo Go, because the ElevenLabs React Native SDK uses LiveKit's native WebRTC. `npx expo run:ios|android` builds one locally. `npx eas-cli@latest build --profile development` builds one in the cloud. The config plugins (`@livekit/react-native-expo-plugin` and `@config-plugins/react-native-webrtc`) plus the microphone permissions are already in `app.json`.

To start from the finished product instead of onboarding, tap **Explore with sample data** on the welcome screen. It loads four banks and seven accounts, matching the Home and Accounts artboards.

## ElevenLabs agent

`src/agent/` connects *Ask BACI* to your ElevenLabs Conversational AI agent through `@elevenlabs/react-native`:

| | |
|---|---|
| **Voice** | Mic button in Ask BACI, or *Talk to BACI* on Home. WebRTC session with a live transcript, a speaking/listening orb, and mute and end controls. The call keeps running while you switch tabs. |
| **Text** | Typing opens a text-only session with the same agent. |
| **Context** | On connect, the app sends the user's financial snapshot as a contextual update. It sends it again whenever accounts or consent change. |
| **Figures** | When a message names a price, the app runs `calculatePurchaseImpact`, shows the affordability card, and passes the figures to the agent so its answer matches the card. |

### 1. Point the app at your agent

Public agent: set `EXPO_PUBLIC_ELEVENLABS_AGENT_ID` in `mobile/.env`.

Private agent (authentication on): keep the API key off the phone. Run the included token server and point the app at it:

```bash
ELEVENLABS_API_KEY=sk_... ELEVENLABS_AGENT_ID=agent_... npm run token-server
# mobile/.env
EXPO_PUBLIC_BACI_TOKEN_URL=http://<your-computer-LAN-IP>:8787
```

The server exposes `/conversation-token` for voice over WebRTC and `/signed-url` for text over WebSocket.

### 2. Configure the agent in the ElevenLabs dashboard

**Security → Overrides:** allow *Text only* (`conversation.text_only`) so typed chats can use the agent. Voice works without it.

**Tools → add these as Client tools.** They run on the device against the same consent-checked service as the rest of the app:

| Name | Parameters | Returns / does |
|---|---|---|
| `get_financial_snapshot` | — | Balances, debts, bills, income and coverage notes. Also shows the snapshot tiles in the chat. |
| `get_upcoming_bills` | — | The next 30 days of bills and repayments. Also shows the list. |
| `check_affordability` | `amount` (number, required), `item` (string), `on_finance` (boolean), `months` (number), `apr` (number) | Verdict, figures, options and assumptions. Also shows the affordability card. |
| `navigate_to_screen` | `screen`: `home` · `chat` · `accounts` · `settings` · `permissions` · `add_account` | Opens that screen. |

**System prompt:** suggested rules, taken from spec A2:

> You are BACI, a UK personal finance information agent. Only use figures from BACI tools or BACI context updates. Never estimate or invent numbers. If a purchase has no price, ask "How much does the {item} cost?" and make no tool call until you have it. For finance, ask for the number of months and the APR. If the user doesn't know the APR, use 0% and say clearly that the real cost will be higher. If a tool says data couldn't be retrieved, say: "I couldn't retrieve your live financial data just now, so I won't guess at the numbers," and offer to try again. If a tool says permission is missing, say so and point to Settings › Data permissions. Debts are never cash. Give options, not advice: BACI provides information, not regulated financial advice.

Without an agent ID, *Ask BACI* still works on-device (`src/agent/orchestrator.ts`). It answers balance, bills and affordability questions, and it asks for a missing price or finance term instead of guessing. Open-ended questions need the agent.

## How it maps to the spec

Routes mirror the spec. Each screen has the artboard ID in a comment at the top.

| ID | Route | File |
|---|---|---|
| 01 | `/welcome` | `src/app/welcome.tsx` |
| 02 · 03 | `/onboarding/consent` · `/onboarding/profile` | `src/app/onboarding/` |
| 04 | `/onboarding/connect` · `/accounts/add` (`?flow=`) | `src/features/InstitutionPicker.tsx` |
| 04a · 04b | `/connect/before/:institutionId` · `/connect/authorise/:connectionId` | `src/app/connect/` |
| 04c · 05 · 05a · 05b/E2 | `/connect/:id/found` · `select` · `sync` · `done` | `src/app/connect/[id]/` |
| E1 | `/connect/failed?reason=&institution=&name=&flow=[&reconnect=]` | `src/app/connect/failed.tsx` |
| E3 | `/accounts/reconnect/:connectionId` | `src/app/accounts/reconnect/` |
| 06 · 07 | `/onboarding/accounts` · `/onboarding/insight` | `src/app/onboarding/` |
| 08 · S4 | `/home` (revoked state) | `src/app/(tabs)/home.tsx` |
| A1 · A2 · 10 | `/chat` (`?q=`) | `src/app/(tabs)/chat.tsx`, `src/agent/`, `src/components/AffordabilityCard.tsx` |
| 09 · S3 | `/accounts` (+ disconnect dialog) | `src/app/(tabs)/accounts.tsx`, `src/features/DisconnectDialog.tsx` |
| S1 · S2 | `/settings` · `/settings/permissions` | `src/app/(tabs)/settings.tsx`, `src/app/settings/permissions.tsx` |

**Guards:**
- Nothing after 02 works without consent.
- Product tabs redirect to the current onboarding step until it's `done`.
- Connecting a bank needs consent.
- Every financial read and every agent tool checks consent (`src/services/api.ts`).

**Server stand-in:** `src/services/api.ts` is an in-memory version of the spec's API. Each function is named after its endpoint (`patchOnboarding`, `putConsent`, `postConnection`, `authorise`, `sync`, `getSummary`, `getSnapshot`, `calculatePurchaseImpact`, …) and adds a little latency, so busy and error states are real.
- **Replacing it:** swap the function bodies for `fetch` calls when the backend exists.
- **Server rules it already enforces:** a failed *new* connection is deleted, and a failed re-authorisation stays `reauth_required`.

**Dev-only controls:** turn them off with `EXPO_PUBLIC_SANDBOX=0`.
- 04b: *Sandbox outcomes* (one account fails · link expires · bank not responding).
- 09: *Simulate* (stale · re-auth · provider error · restore).
- Settings: *Live data unavailable*, which previews A2's "won't guess" reply.

## Checks

```bash
npx tsc --noEmit                              # typecheck
npx expo export --platform web                # build → dist/
npm i -D playwright && node e2e/journey.mjs   # spec §6 acceptance walk-through + design figures
```

`e2e/journey.mjs` runs spec §6 steps 1–9 at 390×844 and saves screenshots. It adds two more checks:
- Sample data gives design 10's figures for a £1,200 laptop: tight, lowest point £426.07, −£73.93 against the buffer.
- A2's refusal to guess when live data is unavailable.

## Known gaps

- **Data doesn't persist:** everything is in memory, so reloading the app starts over.
- **No real Open Banking:** spec §5.5–5.7 (Open Banking adapter, Postgres and KMS, identity provider) belong to the backend and aren't part of this prototype.
- **05a sync isn't in the background yet:** it runs in the foreground with the "carry on" hint (spec §5.1).
- **Unreconciled design:** like the design itself, the screens haven't been checked against Figma. The PRD/FRD weren't available here, so where the spec and the FRD might disagree, the spec was followed.
