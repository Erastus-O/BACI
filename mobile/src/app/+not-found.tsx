import { Redirect } from 'expo-router';

/** Unknown paths (old links, hosted previews served under another path) go back to the entry redirect. */
export default function NotFound() {
  return <Redirect href="/" />;
}
