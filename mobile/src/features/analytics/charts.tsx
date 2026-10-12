import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { money } from '../../lib/format';
import { methodColour, methods, MonthStat, PayMethod } from '../../lib/analytics';
import { colors, fonts } from '../../theme';

// Charts for the Analytics tab. Thin marks, 4px rounded data ends, 2px surface gaps,
// recessive grid, text in ink tokens (never the series colour), status colours only for state.

/** A bar with only its data end (the top) rounded. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function niceStep(max: number) {
  for (const s of [100, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000]) if (max / s <= 4) return s;
  return Math.ceil(max / 4 / 10000) * 10000;
}

const short = (n: number) => (n >= 1000 ? `£${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : `£${Math.round(n)}`);

/** Monthly spending bars, with the ceiling (dashed) and the stable range (band). Tap a month to select it. */
export function SpendBars({
  months,
  ceiling,
  stable,
  byMethod,
  selected,
  onSelect,
  height = 210,
}: {
  months: MonthStat[];
  ceiling: number | null;
  stable: { low: number; high: number } | null;
  byMethod: boolean;
  selected: string | null;
  onSelect: (key: string | null) => void;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const axisW = 38;
  const top = 18;
  const bottom = 22;
  const plotW = Math.max(0, width - axisW);
  const plotH = height - top - bottom;
  const max = Math.max(1, ...months.map((m) => m.spend), (ceiling ?? 0) * 1.08);
  const step = niceStep(max);
  const yMax = Math.ceil(max / step) * step;
  const y = (v: number) => top + plotH - (v / yMax) * plotH;
  const slot = months.length ? plotW / months.length : 0;
  const barW = Math.min(26, slot * 0.58);
  const ticks = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, i) => i * step);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height} accessible={false}>
            {stable ? <Rect x={axisW} y={y(stable.high)} width={plotW} height={Math.max(0, y(stable.low) - y(stable.high))} fill="rgba(99,227,160,0.09)" /> : null}
            {ticks.map((t) => (
              <G key={t}>
                <Line x1={axisW} x2={width} y1={y(t)} y2={y(t)} stroke={colors.hairline} strokeWidth={1} />
                <SvgText x={0} y={y(t) + 4} fill={colors.muted} fontSize={10.5} fontFamily={fonts.body}>
                  {short(t)}
                </SvgText>
              </G>
            ))}
            {months.map((m, i) => {
              const x = axisW + i * slot + (slot - barW) / 2;
              const over = ceiling !== null && m.spend > ceiling;
              const dim = selected !== null && selected !== m.key;
              const opacity = dim ? 0.35 : m.partial ? 0.6 : 1;
              let segs: { colour: string; value: number }[];
              if (byMethod) segs = methods.map((k) => ({ colour: methodColour[k], value: m.byMethod[k] })).filter((s) => s.value > 0);
              else segs = [{ colour: over ? colors.dangerFg : colors.primary, value: m.spend }];
              let base = m.spend;
              return (
                <G key={m.key} opacity={opacity}>
                  {[...segs].reverse().map((s, j) => {
                    // Draw from the top down; 2px surface gap between stacked segments.
                    const yTop = y(base);
                    const h = Math.max(0, y(base - s.value) - yTop - (j < segs.length - 1 ? 2 : 0));
                    base -= s.value;
                    if (h <= 0.5) return null;
                    return j === 0 ? <Path key={s.colour} d={topRounded(x, yTop, barW, h, 4)} fill={s.colour} /> : <Rect key={s.colour} x={x} y={yTop} width={barW} height={h} fill={s.colour} />;
                  })}
                  {over ? (
                    <G>
                      <Circle cx={x + barW / 2} cy={y(m.spend) - 9} r={6} fill={colors.dangerFg} />
                      <SvgText x={x + barW / 2} y={y(m.spend) - 5.5} fill={colors.onCta} fontSize={10} fontFamily={fonts.bold} textAnchor="middle">
                        !
                      </SvgText>
                    </G>
                  ) : null}
                  <SvgText x={x + barW / 2} y={height - 6} fill={selected === m.key ? colors.ink : colors.muted} fontSize={10.5} fontFamily={selected === m.key ? fonts.semibold : fonts.body} textAnchor="middle">
                    {months.length > 8 ? m.label.charAt(0) : m.label}
                  </SvgText>
                </G>
              );
            })}
            {ceiling !== null ? (
              <G>
                <Line x1={axisW} x2={width} y1={y(ceiling)} y2={y(ceiling)} stroke={colors.dangerFg} strokeWidth={1.5} strokeDasharray="5 4" />
              </G>
            ) : null}
          </Svg>
          {/* Hit targets: the whole column, wider than the bar. */}
          <View style={{ position: 'absolute', left: axisW, top: 0, bottom: 0, right: 0, flexDirection: 'row' }}>
            {months.map((m) => (
              <Pressable
                key={m.key}
                accessibilityRole="button"
                accessibilityLabel={`${m.label} ${m.year}: ${money(m.spend)}${m.partial ? ' so far' : ''}${ceiling !== null && m.spend > ceiling ? ', over your ceiling' : ''}`}
                accessibilityState={{ selected: selected === m.key }}
                onPress={() => onSelect(selected === m.key ? null : m.key)}
                style={{ flex: 1 }}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Legend: a mark beside ink-coloured text. */
export function LegendItem({ colour, label, dashed, band }: { colour: string; label: string; dashed?: boolean; band?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {dashed ? (
        <Svg width={16} height={6}>
          <Line x1={0} x2={16} y1={3} y2={3} stroke={colour} strokeWidth={1.5} strokeDasharray="4 3" />
        </Svg>
      ) : (
        <View style={{ width: band ? 14 : 10, height: 10, borderRadius: band ? 2 : 3, backgroundColor: colour }} />
      )}
      <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft }}>{label}</Text>
    </View>
  );
}

/** A ring split by share, 2px gaps between segments. */
export function Donut({ parts, size = 132, stroke = 16, children }: { parts: { key: PayMethod; amount: number }[]; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.amount, 0);
  const gap = parts.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }} accessible={false}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.track} strokeWidth={stroke} fill="none" />
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {total > 0
            ? parts.map((p) => {
                const len = (p.amount / total) * c;
                const el = (
                  <Circle
                    key={p.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={methodColour[p.key]}
                    strokeWidth={stroke}
                    fill="none"
                    strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return el;
              })
            : null}
        </G>
      </Svg>
      {children}
    </View>
  );
}

/** The health score as a progress ring. */
export function ScoreRing({ score, colour, size = 128, stroke = 11 }: { score: number; colour: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }} accessible={false}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colour}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(Math.max(0, Math.min(100, score)) / 100) * c} ${c}`}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={{ fontFamily: fonts.display, fontSize: 38, lineHeight: 42, color: colors.ink, letterSpacing: -1 }}>{score}</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>out of 100</Text>
    </View>
  );
}

/** Horizontal gauge: stable band, caution, over the ceiling, with markers. */
export function RangeGauge({
  stable,
  ceiling,
  markers,
}: {
  stable: { low: number; high: number };
  ceiling: number;
  markers: { value: number; label: string }[];
}) {
  const [width, setWidth] = useState(0);
  const max = Math.max(ceiling * 1.18, ...markers.map((m) => m.value * 1.05));
  const x = (v: number) => (Math.max(0, Math.min(v, max)) / max) * width;
  const H = 12;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 34 + markers.length * 18 }}>
      {width > 0 ? (
        <Svg width={width} height={34 + markers.length * 18} accessible={false}>
          <Rect x={0} y={8} width={width} height={H} rx={4} fill={colors.track} />
          <Rect x={x(stable.low)} y={8} width={Math.max(0, x(stable.high) - x(stable.low) - 2)} height={H} fill={colors.successFg} opacity={0.75} />
          <Rect x={x(stable.high)} y={8} width={Math.max(0, x(ceiling) - x(stable.high) - 2)} height={H} fill={colors.warnFg} opacity={0.75} />
          <Path d={`M${x(ceiling)},8H${width - 4}Q${width},8 ${width},12V${8 + H - 4}Q${width},${8 + H} ${width - 4},${8 + H}H${x(ceiling)}Z`} fill={colors.dangerFg} opacity={0.75} />
          {markers.map((m, i) => {
            const mx = x(m.value);
            const ly = 38 + i * 18;
            const anchor = mx < width * 0.2 ? 'start' : mx > width * 0.8 ? 'end' : 'middle';
            return (
              <G key={m.label}>
                <Line x1={mx} x2={mx} y1={4} y2={8 + H + 4} stroke={colors.ink} strokeWidth={2} />
                <Circle cx={mx} cy={4} r={3} fill={i === 0 ? colors.ink : colors.ground} stroke={colors.ink} strokeWidth={1.5} />
                <SvgText x={mx} y={ly} fill={colors.inkSoft} fontSize={11} fontFamily={fonts.semibold} textAnchor={anchor}>
                  {m.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
