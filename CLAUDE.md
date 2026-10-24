# BACI

Finance intelligence agent.
- **App:** `mobile/` (Expo; see `mobile/README.md` and `mobile/AGENTS.md`).
- **API:** `server/` (Node 22, Hono, Postgres, Plaid; see `server/README.md`).
- **Going live and every external dependency:** `docs/LAUNCH.md`.

- Build contract: `docs/design/BACI_FLOW_SPEC.md`. Every artboard ID (01…10, 04a–05b, E1–E3, A1–A2, S1–S4) is a section there with its route, API, states and acceptance checks.
- Artboard sources (reference only, not runtime code): `docs/design/screens/*.dc.html` and `canvas.json`.
- Design tokens: `mobile/src/theme.ts`.
- Before finishing a change in `mobile/`: `npx tsc --noEmit`, and run `node e2e/journey.mjs` against a web export built with `EXPO_PUBLIC_SANDBOX=1 EXPO_PUBLIC_ELEVENLABS_AGENT_ID=off` (and `--clear`) when flows change. When Ask BACI or `src/agent/` changes, also run `node e2e/agent.mjs` against an export built with the agent on (`EXPO_PUBLIC_SANDBOX=1` only).
- Before finishing a change in `server/`: `npm run typecheck` and `npm test` (needs `TEST_DATABASE_URL`, a throwaway Postgres database).
- When live flows change, also run `node e2e/live.mjs`. Build first with `EXPO_PUBLIC_API_URL=http://localhost:8790` into `dist-live`, and set `TEST_DATABASE_URL`. It starts the API and a stand-in Plaid itself.
