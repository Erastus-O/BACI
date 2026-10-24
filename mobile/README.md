# BACI mobile

Expo (React Native) app for **BACI, the finance intelligence agent**. It is built from the BACI Design canvas, follows the flow contract in [`docs/design/BACI_FLOW_SPEC.md`](../docs/design/BACI_FLOW_SPEC.md), and has a built-in **ElevenLabs voice + text agent** in *Ask BACI*.

- Expo SDK 57 · React Native 0.86 · Expo Router · TypeScript
- Runs on iOS and Android (development build) and in the browser (`expo start --web`)
- **Two modes:**
  - **Live:** with `EXPO_PUBLIC_API_URL` set, people create an account and connect their real banks through Plaid. Data comes from the BACI API in [`server/`](../server/README.md).
  - **Demo:** without it, or through **Explore with sample data**, everything runs on this device with the design's sandbox banks.
- Taking it live, with every dependency, is covered in [`docs/LAUNCH.md`](../docs/LAUNCH.md).

## Run it

```bash
cd mobile
npm install
cp .env.example .env          # optional: the BACI agent is already the default

npm run web                   # quickest: browser, voice works through the browser mic
npx expo run:ios              # or run:android: development build with native voice
```

**With real accounts and banks:** start the API (see [`server/README.md`](../server/README.md)), then run `EXPO_PUBLIC_API_URL=http://localhost:8080 npm run web`. On a phone, use your computer's LAN IP instead of `localhost`.

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

The **BACI** agent (`agent_8601m3f031tgf81ajvvcd0xdezab`, public) is built in as the default, so nothing needs configuring.
- To use a different public agent, set `EXPO_PUBLIC_ELEVENLABS_AGENT_ID` in `mobile/.env`.
- To turn the agent off and use only on-device answers (offline demos, e2e), set `EXPO_PUBLIC_ELEVENLABS_AGENT_ID=off`.
- Env values are inlined into the bundle and cached, so restart with `npx expo start --clear` after changing `.env`.

If a typed message doesn't get a reply, BACI answers it on the device and says why. This covers a connection error, no connection within 12 seconds, the agent ending the conversation, and no reply within 20 seconds. If a voice call is ended by the agent, the reason is shown.

Private agent (authentication on): keep the API key off the phone. Run the included token server and point the app at it:

```bash
ELEVENLABS_API_KEY=sk_... ELEVENLABS_AGENT_ID=agent_... npm run token-server
# mobile/.env
EXPO_PUBLIC_BACI_TOKEN_URL=http://<your-computer-LAN-IP>:8787
```

The server exposes `/conversation-token` for voice over WebRTC and `/signed-url` for text over WebSocket.

### 2. Turn on the agent capabilities the app uses

`npm run configure-agent` does this through the ElevenLabs API. It's safe to re-run, and nothing is duplicated. It:
- creates the four client tools below and attaches them to the agent, keeping any tools it already has;
- allows the *Text only* override;
- adds the app's hosts (`erastus-o.github.io`, `localhost`) to the agent's website allowlist, but only if an allowlist is in use;
- with `--prompt`, appends the rules below to the agent's prompt, once.

```bash
ELEVENLABS_API_KEY=sk_... npm run configure-agent -- --dry-run   # show what would change
ELEVENLABS_API_KEY=sk_... npm run configure-agent -- --prompt    # apply
```

The deploy workflow runs it for you when the repository has an `ELEVENLABS_API_KEY` secret (see **Deploy** below).

To do it by hand instead, in the ElevenLabs dashboard:

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

With the agent off, *Ask BACI* still works on-device (`src/agent/orchestrator.ts`). It answers balance, bills and affordability questions, and it asks for a missing price or finance term instead of guessing. Open-ended questions need the agent.

## Deploy

`.github/workflows/deploy-web.yml` publishes the web app to **https://erastus-o.github.io/BACI/** on every push to `main`, with the ElevenLabs agent on. You can also run it from the repo's **Actions** tab.
- **Build and publish:** it typechecks, builds with `EXPO_BASE_URL=/BACI`, and pushes the site to the `gh-pages` branch. GitHub Pages serves it from there. If Pages isn't on yet, set **Settings → Pages → Source** to *Deploy from a branch*, then choose `gh-pages` and `/ (root)`.
- **Agent setup:** add a repository secret `ELEVENLABS_API_KEY` (Settings → Secrets and variables → Actions) and the same run also turns on the agent capabilities. Without the secret, that job is skipped.
- **Another agent:** to point the site at a different agent, set a repository *variable* `ELEVENLABS_AGENT_ID`.

In the deployed web app, voice works through the browser's microphone over HTTPS. Phones need a native build (see **Run it**).

## Real banks (Plaid)

In live mode, **Choose your bank** opens Plaid Link, which lists every supported UK bank with its logo. The person approves read-only access in their bank's app (Open Banking app-to-app) or on its website, then comes back to choose which accounts BACI can use (04c → 05b).
- **Plaid Link:** iOS and Android use Plaid's native SDK (`react-native-plaid-link-sdk`), which needs a development build, like voice does. Web uses Link JS. A bank's OAuth return lands on `/oauth`, which finishes the session.
- **Reconnect (E3):** opens Link in update mode, so the person confirms access at their bank again.
- **The server:** exchanges the token, encrypts it, imports up to 12 months of transactions, and detects bills, income, everyday spending and duplicate subscriptions. New transactions arrive by Plaid webhook.
- **Testing:** with `ALLOW_SANDBOX_SHORTCUT=true` on a sandbox server, **Use Plaid's test bank (sandbox)** connects without the Link UI.

**Demo mode** keeps the simulated journey: the picker of sandbox banks (or Plaid's directory baked in by `npm run banks`), the "Opening {Bank}…" handoff, the bank app with Face ID, and the website fallback.

## Design system

BACI uses dark navy glass, after the Revolut onboarding and Conceptzilla banking references. All tokens live in `src/theme.ts`; shared components in `src/components/ui.tsx` use them, so change the look there, not in screens.

| Token group | What it's for |
| --- | --- |
| **Ground** | `Backdrop` draws `assets/backdrop.jpg`: a royal-blue glow at the top fading to near-black, with fine grain. `colors.ground` is the fallback. |
| **Glass** | `glass`: translucent fill (`surface`, 7% white), a light edge (`glassEdge`), and a 24px backdrop blur on web. Used by cards, chips, back buttons and chat bubbles. `glassBar` is darker glass for the tab bar and chat composer; `sheet` is opaque navy for dialogs; `surfaceRaised` is for pressed and selected states. |
| **Text** | `ink` (white) for headings and values, `inkSoft` for secondary text, `muted` for captions and hints. |
| **Actions** | Main action: white pill (`cta`) with dark text (`onCta`). Secondary: raised glass pill. Accent blue (`primary`) for links, progress, checkboxes, toggles and the user's chat bubbles. Selected chips turn white. |
| **Status** | `success`, `warn`, `danger` and `info` each have a tinted glass background (`*Bg`) and light text (`*Fg`, `*Ink`). |
| **Type** | Instrument Sans throughout. `type.hero` (40), `h1` (30), `h2` (22): bold with tight letter-spacing. `body` (15/21), `small`, `label` and `eyebrow` (uppercase, tracked). |
| **Shape** | `radius`: `sm` 10, `md` 14 (banners, inputs), `lg` 20 (cards), `sheet` 28 (dialogs), `pill` (buttons and chips). Spacing in `space` (4/8/12/16/24). |
| **Orb** | The blue glass orb is BACI's avatar and voice indicator (see below). |

The demo's simulated bank sign-in page (04b) is the exception: it stays white in the bank's own colours, because it stands in for the bank's site, not BACI's.

## The orb

BACI's orb (`src/components/orb/`) is a glassy blue sphere with smoke inside. It appears on Welcome, Home, Ask BACI and the onboarding headers.
- **Web:** `Orb.web.tsx` renders the shader in `orbShader.ts` live with WebGL. The light follows your pointer, dragging spins the smoke with inertia, and a tap (or Enter) sends a ripple. Small orbs and browsers without WebGL use the image version.
- **iOS/Android:** `OrbImage.tsx` animates `assets/orb.png`. It turns slowly, breathes, spins when dragged and ripples on tap.
- **During a voice call:** the orb follows the agent's state (`orbState`, `orbLevel` from `AgentChat`). It breathes while listening and swells with BACI's voice while speaking. On Ask BACI, tap the large orb to start a call.
- **Re-baking the image** after shader changes: `node scripts/bake-orb.mjs` (uses Playwright and Chromium).

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
| AN | `/analytics` | `src/app/(tabs)/analytics.tsx`, `src/features/analytics/charts.tsx`, `src/lib/analytics.ts` |
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

**Dev-only controls** (sandbox outcomes on 04b, Simulate on 09, prototype controls in Settings) are hidden unless the build sets `EXPO_PUBLIC_SANDBOX=1`.
- 04b: *Sandbox outcomes* (one account fails · link expires · bank not responding).
- 09: *Simulate* (stale · re-auth · provider error · restore).
- Settings: *Live data unavailable*, which previews A2's "won't guess" reply.

## Checks

```bash
npx tsc --noEmit                              # typecheck
EXPO_PUBLIC_ELEVENLABS_AGENT_ID=off npx expo export --clear --platform web   # build → dist/ (e2e expects on-device answers)
npm i -D playwright && node e2e/journey.mjs   # spec §6 acceptance walk-through + design figures
```

`e2e/journey.mjs` runs spec §6 steps 1–9 at 390×844 and saves screenshots. It adds two more checks:
- Sample data gives design 10's figures for a £1,200 laptop: tight, lowest point £426.07, −£73.93 against the buffer.
- A2's refusal to guess when live data is unavailable.

`e2e/agent.mjs` runs Ask BACI against a fake ElevenLabs agent (build with the agent on: `EXPO_PUBLIC_SANDBOX=1 npx expo export --platform web --clear --output-dir dist-agent`). It checks that a typed question always gets an answer:
- **Agent replies:** its answer is shown.
- **Agent drops the conversation:** BACI answers on the device and shows the reason ElevenLabs gave, for example a text-only override that isn't allowed.
- **Agent says nothing:** after 20 seconds, BACI answers on the device.

## Known gaps

- **Demo mode doesn't persist:** sample data lives in memory, so reloading starts over. Live mode is stored on the server.
- **Not built yet:** password reset (needs an email provider) and multi-factor sign-in. See `docs/LAUNCH.md` § Known limits.
- **05a sync isn't in the background yet:** it runs in the foreground. Afterwards, new transactions arrive by webhook and appear the next time the app opens.
- **Unreconciled design:** like the design itself, the screens haven't been checked against Figma. The PRD/FRD weren't available here, so where the spec and the FRD might disagree, the spec was followed.
