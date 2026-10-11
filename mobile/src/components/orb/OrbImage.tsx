import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder, Pressable, View } from 'react-native';
import { OrbProps, stateEnergy } from './types';

const orbImage = require('../../../assets/orb.png');

/**
 * The orb from a baked image (assets/orb.png): used on iOS/Android, for small avatars,
 * and on web when WebGL isn't available. It slowly turns and breathes, spins when dragged,
 * ripples when tapped, and swells with `level` while BACI speaks.
 */
export function OrbImage({ size, state = 'idle', level, onPress, interactive = true, accessibilityLabel }: OrbProps) {
  const spin = useRef(new Animated.Value(0)).current; // free-running turn, degrees
  const drag = useRef(new Animated.Value(0)).current; // added by dragging, degrees
  const breathe = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const swell = useRef(new Animated.Value(1)).current;
  const dragBase = useRef(0);
  const dragNow = useRef(0);
  const energy = stateEnergy[state];

  useEffect(() => {
    const id = drag.addListener(({ value }) => (dragNow.current = value));
    return () => drag.removeListener(id);
  }, [drag]);

  useEffect(() => {
    const turn = Animated.loop(Animated.timing(spin, { toValue: 360, duration: 60000 / (1 + energy * 3), easing: Easing.linear, useNativeDriver: true }));
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2600 - energy * 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2600 - energy * 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    spin.setValue(0);
    turn.start();
    breath.start();
    return () => {
      turn.stop();
      breath.stop();
    };
  }, [energy, spin, breathe]);

  // Follow the live audio level.
  useEffect(() => {
    if (!level) return;
    let raf = 0;
    const tick = () => {
      swell.setValue(1 + Math.min(1, level()) * 0.08);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [level, swell]);

  const ripple = () => {
    pulse.setValue(1);
    Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => interactive && Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          drag.stopAnimation();
          dragBase.current = dragNow.current;
        },
        onPanResponderMove: (_, g) => drag.setValue(dragBase.current + g.dx * 0.8),
        onPanResponderRelease: (_, g) => {
          Animated.decay(drag, { velocity: g.vx * 0.8, deceleration: 0.995, useNativeDriver: true }).start();
        },
      }),
    [drag, interactive],
  );

  const rotate = Animated.add(spin, drag).interpolate({ inputRange: [-3600, 3600], outputRange: ['-3600deg', '3600deg'] });
  const scale = Animated.multiply(
    Animated.multiply(swell, breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02 + energy * 0.03] })),
    pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
  );

  const body = (
    <Animated.View style={{ width: size, height: size, transform: [{ scale }] }} {...(interactive ? pan.panHandlers : {})}>
      <Animated.Image source={orbImage} style={{ width: size, height: size, transform: [{ rotate }] }} />
      {interactive ? (
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: 'rgba(200,245,215,0.9)', opacity: pulse, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1.15, 0.8] }) }] }}
        />
      ) : null}
    </Animated.View>
  );

  if (!interactive) {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={accessibilityLabel ?? 'BACI'}
      onPress={() => {
        ripple();
        onPress?.();
      }}
      style={{ width: size, height: size }}
    >
      {body}
    </Pressable>
  );
}
