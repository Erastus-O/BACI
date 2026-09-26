# BACI

Finance intelligence agent. The mobile prototype lives in `mobile/` (Expo, see `mobile/README.md` and `mobile/AGENTS.md`).

- Build contract: `docs/design/BACI_FLOW_SPEC.md`. Every artboard ID (01…10, 04a–05b, E1–E3, A1–A2, S1–S4) is a section there with its route, API, states and acceptance checks.
- Artboard sources (reference only, not runtime code): `docs/design/screens/*.dc.html` and `canvas.json`.
- Design tokens: `mobile/src/theme.ts`.
- Before finishing a change in `mobile/`: `npx tsc --noEmit`, and run `node e2e/journey.mjs` against a web export when flows change.
