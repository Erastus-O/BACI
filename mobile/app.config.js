// Extends app.json. EXPO_BASE_URL serves the web build from a sub-path,
// e.g. GitHub Pages at https://<user>.github.io/BACI/ (see .github/workflows/deploy-web.yml).
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL;
  if (!baseUrl) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
