import { Redirect } from 'expo-router';
import { stepRoute } from '../features/flow';
import { peek } from '../services/api';
import { useServerVersion } from '../services/useQuery';

/** Entry: send the user to wherever onboarding left off. */
export default function Index() {
  useServerVersion();
  return <Redirect href={stepRoute[peek.step()]} />;
}
