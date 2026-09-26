import { useLocalSearchParams } from 'expo-router';
import type { OnboardingStep } from '../services/api';

/** Screens 04–05b and E1 run in two contexts (spec §1 "Flow parameter"). */
export type Flow = 'onboarding' | 'accounts';

export function useFlow(): Flow {
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  return flow === 'accounts' ? 'accounts' : 'onboarding';
}

export const pickerPath = (flow: Flow) => (flow === 'accounts' ? '/accounts/add' : '/onboarding/connect');
export const exitPath = (flow: Flow) => (flow === 'accounts' ? '/accounts' : '/onboarding/accounts');

/** Where each onboarding step lives. Product routes redirect here until step === 'done'. */
export const stepRoute: Record<OnboardingStep, string> = {
  welcome: '/welcome',
  consent: '/onboarding/consent',
  profile: '/onboarding/profile',
  connect: '/onboarding/connect',
  accounts: '/onboarding/accounts',
  first_insight: '/onboarding/insight',
  done: '/home',
};

// Session cache of discovered accounts, as the spec keeps in sessionStorage (baci:discovered:{id}).
const discoveredCache = new Map<string, unknown>();
export const discoveredKey = (id: string) => `baci:discovered:${id}`;
export const cacheDiscovered = (id: string, v: unknown) => discoveredCache.set(discoveredKey(id), v);
export const readDiscovered = <T,>(id: string) => discoveredCache.get(discoveredKey(id)) as T | undefined;
