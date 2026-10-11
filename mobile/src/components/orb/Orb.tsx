import { OrbImage } from './OrbImage';
import type { OrbProps } from './types';

export type { OrbProps, OrbState } from './types';

/** iOS/Android: the baked orb. The web version (Orb.web.tsx) renders the live shader. */
export function Orb(props: OrbProps) {
  return <OrbImage {...props} />;
}
