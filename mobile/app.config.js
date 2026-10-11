// Extends app.json.
// - EXPO_BASE_URL serves the web build from a sub-path, e.g. GitHub Pages at
//   https://<user>.github.io/BACI/ (see .github/workflows/deploy-web.yml).
// - BACI_ASSOCIATED_DOMAIN (e.g. baci.app) turns on iOS universal links, which Plaid needs to
//   return people to the app after approving in their bank's app (PLAID_REDIRECT_URI_IOS).
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL;
  const domain = process.env.BACI_ASSOCIATED_DOMAIN;
  return {
    ...config,
    experiments: { ...config.experiments, ...(baseUrl ? { baseUrl } : {}) },
    ios: { ...config.ios, ...(domain ? { associatedDomains: [`applinks:${domain}`] } : {}) },
  };
};
