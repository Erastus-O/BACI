import { ReactNode, useEffect, useState } from 'react';
import { Platform, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaFrameContext, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors, fonts } from '../theme';

// iPhone 15 Pro, in points.
const SCREEN = { width: 393, height: 852 };
const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };
const BEZEL = 12;
const RADIUS = 55;

/**
 * Web only: on a wide screen, shows the app inside an iPhone so the prototype reads as a
 * phone app. The app gets iPhone safe-area insets, so screens and the tab bar sit around the
 * Dynamic Island and home indicator as they would on a device. On phones and narrow windows,
 * and on iOS/Android, the app renders as normal.
 */
export function DeviceFrame({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const framed = Platform.OS === 'web' && width >= 560 && height >= 560;
  if (!framed) return <>{children}</>;

  const outerW = SCREEN.width + BEZEL * 2;
  const outerH = SCREEN.height + BEZEL * 2;
  const scale = Math.min(1, (height - 48) / outerH, (width - 48) / outerW);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6E2D9' }}>
      {/* The transform also makes this the containing block for position:fixed (dialogs stay on the phone). */}
      <View
        style={{
          width: outerW,
          height: outerH,
          transform: [{ scale }],
          borderRadius: RADIUS + BEZEL,
          backgroundColor: '#1C1C1E',
          padding: BEZEL,
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 40,
          shadowOffset: { width: 0, height: 24 },
          borderWidth: 2,
          borderColor: '#46464A',
        }}
      >
        <SideButtons />
        <View style={{ flex: 1, borderRadius: RADIUS, overflow: 'hidden', backgroundColor: colors.ground }}>
          <SafeAreaFrameContext.Provider value={{ x: 0, y: 0, ...SCREEN }}>
            <SafeAreaInsetsContext.Provider value={INSETS}>{children}</SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
          <StatusBarOverlay />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 8, left: (SCREEN.width - 134) / 2, width: 134, height: 5, borderRadius: 3, backgroundColor: colors.ink }} />
        </View>
      </View>
    </View>
  );
}

function StatusBarOverlay() {
  const [time, setTime] = useState(clock);
  useEffect(() => {
    const t = setInterval(() => setTime(clock()), 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 54, flexDirection: 'row', alignItems: 'center', paddingTop: 6 }}
    >
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: colors.ink }}>{time}</Text>
      </View>
      {/* Dynamic Island */}
      <View style={{ width: 126, height: 37, borderRadius: 19, backgroundColor: '#000' }} />
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
        <Svg width={18} height={12} viewBox="0 0 18 12">
          <Rect x={0} y={8} width={3} height={4} rx={1} fill={colors.ink} />
          <Rect x={5} y={5.5} width={3} height={6.5} rx={1} fill={colors.ink} />
          <Rect x={10} y={3} width={3} height={9} rx={1} fill={colors.ink} />
          <Rect x={15} y={0} width={3} height={12} rx={1} fill={colors.ink} />
        </Svg>
        <Svg width={16} height={12} viewBox="0 0 16 12">
          <Path d="M8 2.6c2.4 0 4.6.9 6.2 2.5l1.3-1.3A10.6 10.6 0 008 .7C5.1.7 2.5 1.8.5 3.8l1.3 1.3A8.7 8.7 0 018 2.6z" fill={colors.ink} />
          <Path d="M8 6.2c1.4 0 2.7.5 3.7 1.5L13 6.4a7 7 0 00-10 0l1.3 1.3A5.2 5.2 0 018 6.2z" fill={colors.ink} />
          <Path d="M8 9.6c.5 0 .9.2 1.3.5L8 11.5 6.7 10.1c.4-.3.8-.5 1.3-.5z" fill={colors.ink} />
        </Svg>
        <Svg width={27} height={13} viewBox="0 0 27 13">
          <Rect x={0.5} y={0.5} width={23} height={12} rx={3.5} stroke={colors.ink} strokeOpacity={0.4} fill="none" />
          <Rect x={2} y={2} width={17} height={9} rx={2} fill={colors.ink} />
          <Path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2z" fill={colors.ink} fillOpacity={0.45} />
        </Svg>
      </View>
    </View>
  );
}

function SideButtons() {
  const btn = (side: 'left' | 'right', top: number, h: number) => (
    <View key={`${side}${top}`} style={{ position: 'absolute', [side]: -5, top, width: 4, height: h, borderRadius: 2, backgroundColor: '#3A3A3C' }} />
  );
  return (
    <>
      {btn('left', 120, 32)}
      {btn('left', 180, 62)}
      {btn('left', 256, 62)}
      {btn('right', 210, 96)}
    </>
  );
}

function clock() {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
