/** What BACI is doing; drives how lively the orb is. */
export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'connecting';

export type OrbProps = {
  size: number;
  state?: OrbState;
  /** Live audio level 0..1 (e.g. the agent's output volume), polled every frame. */
  level?: () => number;
  /** Tap handler. Taps always ripple the orb. */
  onPress?: () => void;
  /** Drag to spin, pointer to move the light, tap to ripple. Default true. */
  interactive?: boolean;
  accessibilityLabel?: string;
};

/** Base liveliness per state, before the audio level is added. */
export const stateEnergy: Record<OrbState, number> = {
  idle: 0,
  listening: 0.18,
  thinking: 0.35,
  connecting: 0.3,
  speaking: 0.45,
};
