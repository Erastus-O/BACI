/**
 * Sandbox / dev-only controls (spec: 04b "Sandbox outcomes", 09 "Simulate", Settings prototype controls).
 * Hidden unless a build sets EXPO_PUBLIC_SANDBOX=1 (the e2e journey does, to exercise failure states).
 */
export const sandboxEnabled = process.env.EXPO_PUBLIC_SANDBOX === '1';
