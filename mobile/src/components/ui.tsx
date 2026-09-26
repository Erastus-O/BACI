import { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, fonts, radius } from '../theme';
import { Icon, IconName } from './Icon';

// ---------- Layout ----------

export function Screen({
  children,
  scroll = true,
  footer,
  padded = true,
  edges = ['top', 'bottom'],
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  const body = padded ? styles.screenBody : undefined;
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={[body, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[body, { flex: 1 }]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Stack({ gap = 12, style, children }: { gap?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Row({ gap = 12, style, children }: { gap?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.hairline }} />;
}

// ---------- Type ----------

export function H1({ children, style, ...rest }: TextProps & { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={[styles.h1, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Display({ children, style, ...rest }: TextProps & { children: ReactNode }) {
  return (
    <Text style={[styles.display, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Body({ children, style, ...rest }: TextProps & { children: ReactNode }) {
  return (
    <Text style={[styles.body, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Muted({ children, style, ...rest }: TextProps & { children: ReactNode }) {
  return (
    <Text style={[styles.muted, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: TextProps['style'] }) {
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
}

export function Strong({ children, style }: { children: ReactNode; style?: TextProps['style'] }) {
  return <Text style={[styles.strong, style]}>{children}</Text>;
}

// ---------- Controls ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  iconRight,
  disabled,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'lg' | 'md';
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'lg' ? styles.buttonLg : styles.buttonMd,
        { backgroundColor: disabled ? colors.disabled : pressed ? v.pressed : v.bg, borderColor: v.border, borderWidth: v.border ? 1 : 0 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={disabled ? colors.inkSoft : v.fg} strokeWidth={2} /> : null}
      <Text style={[styles.buttonLabel, { color: disabled ? colors.inkSoft : v.fg, fontSize: size === 'lg' ? 16 : 14 }]}>{label}</Text>
      {iconRight ? <Icon name={iconRight} size={18} color={v.fg} strokeWidth={2} /> : null}
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, { bg: string; pressed: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: '#FFFFFF' },
  secondary: { bg: colors.surface, pressed: colors.hairline, fg: colors.ink, border: colors.control },
  ghost: { bg: 'transparent', pressed: colors.hairline, fg: colors.primary },
  danger: { bg: 'transparent', pressed: colors.dangerBg, fg: colors.dangerFg },
};

export function BackButton({ onPress, label = 'Back' }: { onPress?: () => void; label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
      style={styles.back}
      hitSlop={4}
    >
      <Icon name="back" color={colors.ink} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : null]}
    >
      <Text style={{ fontFamily: fonts.body, fontSize: 14, color: selected ? '#FFFFFF' : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.segmented}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o)}
            style={[styles.segment, on ? styles.segmentOn : null]}
          >
            <Text style={{ fontFamily: on ? fonts.semibold : fonts.body, fontSize: 14, color: colors.ink }}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onChange}
      trackColor={{ true: colors.primary, false: colors.control }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={colors.control}
    />
  );
}

export function Checkbox({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <View
      style={[
        styles.checkbox,
        checked ? { backgroundColor: colors.primary, borderColor: colors.primary } : null,
        disabled ? { opacity: 0.5 } : null,
      ]}
    >
      {checked ? <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} /> : null}
    </View>
  );
}

// ---------- Status ----------

export type Tone = 'success' | 'warn' | 'danger' | 'info' | 'neutral';

const toneColors: Record<Tone, { bg: string; fg: string; ink: string }> = {
  success: { bg: colors.successBg, fg: colors.successFg, ink: colors.successFg },
  warn: { bg: colors.warnBg, fg: colors.warnFg, ink: colors.warnInk },
  danger: { bg: colors.dangerBg, fg: colors.dangerFg, ink: colors.dangerInk },
  info: { bg: colors.infoBg, fg: colors.infoFg, ink: colors.infoInk },
  neutral: { bg: colors.hairline, fg: colors.inkSoft, ink: colors.inkSoft },
};

export function toneOf(t: Tone) {
  return toneColors[t];
}

export function Badge({ tone, label, icon }: { tone: Tone; label: string; icon?: IconName }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      {icon ? <Icon name={icon} size={13} color={c.fg} strokeWidth={2.3} /> : null}
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: c.fg }}>{label}</Text>
    </View>
  );
}

export function Banner({ tone, icon, children }: { tone: Tone; icon?: IconName; children: ReactNode }) {
  const c = toneColors[tone];
  return (
    <View accessibilityRole={tone === 'danger' || tone === 'warn' ? 'alert' : undefined} style={[styles.banner, { backgroundColor: c.bg }]}>
      <Icon name={icon ?? (tone === 'warn' || tone === 'danger' ? 'warn' : 'info')} size={18} color={c.ink} />
      <View style={{ flex: 1 }}>
        {typeof children === 'string' ? <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: c.ink }}>{children}</Text> : children}
      </View>
    </View>
  );
}

export function StepBar({ step, total = 5 }: { step: number; total?: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}
      accessibilityValue={{ min: 0, max: total, now: step }}
      style={{ flexDirection: 'row', gap: 6 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 4, backgroundColor: i < step ? colors.primary : colors.border }} />
      ))}
    </View>
  );
}

export function BankMark({ initial, colour, size = 40 }: { initial: string; colour: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: colour, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: size * 0.42 }}>{initial}</Text>
    </View>
  );
}

export function IconTile({ name, size = 40 }: { name: IconName; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={size / 2} color={colors.primary} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  screenBody: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20, gap: 16 },
  footer: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8, gap: 8, backgroundColor: colors.ground },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 16 },
  h1: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.ink },
  display: { fontFamily: fonts.display, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  muted: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.muted },
  strong: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 12.5, letterSpacing: 0.75, textTransform: 'uppercase', color: colors.muted },
  button: { borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  buttonLg: { height: 52 },
  buttonMd: { height: 44 },
  buttonLabel: { fontFamily: fonts.semibold },
  back: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.control, backgroundColor: colors.surface, justifyContent: 'center' },
  segmented: { flexDirection: 'row', gap: 4, backgroundColor: colors.hairline, borderRadius: 12, padding: 4 },
  segment: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.control, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingLeft: 7, paddingRight: 9, borderRadius: radius.pill, alignSelf: 'flex-start' },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.sm },
});

// ---------- States ----------

export function Skeleton({ height = 64, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ height, borderRadius: radius.lg, backgroundColor: colors.hairline }, style]} />;
}

export function Loading({ label }: { label: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ gap: 10 }}>
      <Muted style={{ fontSize: 14 }}>{label}</Muted>
      <Skeleton />
      <Skeleton height={48} />
      <Skeleton height={48} />
    </View>
  );
}

export function ErrorBanner({ error, onRetry }: { error: Error | null | undefined; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <Banner tone="danger">
      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.dangerInk }}>
          {error.message || 'Something went wrong. Check your connection and try again.'}
        </Text>
        {onRetry ? (
          <Pressable accessibilityRole="button" onPress={onRetry} style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.dangerInk, textDecorationLine: 'underline' }}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
    </Banner>
  );
}

/** Modal confirmation (S3 Disconnect and friends). */
export function Dialog({ visible, title, children, onRequestClose }: { visible: boolean; title: string; children: ReactNode; onRequestClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(22,24,29,0.45)', justifyContent: 'center', padding: 16 }}>
        <View accessibilityViewIsModal accessibilityLabel={title} style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 24, gap: 14 }}>
          <Display accessibilityRole="header" style={{ fontSize: 24, lineHeight: 29 }}>
            {title}
          </Display>
          {children}
        </View>
      </View>
    </Modal>
  );
}
