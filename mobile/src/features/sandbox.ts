/**
 * Sandbox / dev-only controls (spec: 04b "Sandbox outcomes", 09 "Simulate").
 * On by default in this prototype because all banks are sandbox data.
 * Set EXPO_PUBLIC_SANDBOX=0 to hide them, e.g. for a stakeholder demo build.
 */
export const sandboxEnabled = process.env.EXPO_PUBLIC_SANDBOX !== '0';
