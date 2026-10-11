import * as SecureStore from 'expo-secure-store';

// iOS/Android: the session token lives in the Keychain / Keystore.
const KEY = 'baci.session';

export const tokenStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token: string) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
