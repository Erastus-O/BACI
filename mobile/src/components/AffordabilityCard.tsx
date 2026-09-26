import { Pressable, Text, View } from 'react-native';
import type { PurchaseImpact, Verdict } from '../services/api';
import { colors, fonts } from '../theme';
import { Body, Eyebrow, Strong, toneOf, Tone } from './ui';
import { Icon } from './Icon';

const verdictTone: Record<Verdict, Tone> = { affordable: 'success', tight: 'warn', not_recommended: 'danger', not_enough_data: 'neutral' };

/**
 * 10 "Can I afford this?" card. Figures come only from calculatePurchaseImpact.
 * Order: verdict · short answer · why · impact · chart (+ text alternative) · flags ·
 * options · assumptions & coverage · follow-up chips.
 */
export function AffordabilityCard({ result, followUps = [], onFollowUp }: { result: PurchaseImpact; followUps?: string[]; onFollowUp?: (q: string) => void }) {
  const tone = toneOf(verdictTone[result.verdict]);
  const chart = result.chart;
  const scale = chart ? Math.max(chart.buffer * 4, chart.lowest, 1) : 1;
  const barPct = chart ? Math.max(0, Math.min(100, (chart.lowest / scale) * 100)) : 0;
  const bufferPct = chart ? Math.min(100, (chart.buffer / scale) * 100) : 0;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, overflow: 'hidden' }}>
        <View accessibilityRole="summary" style={{ backgroundColor: tone.bg, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Icon name={result.verdict === 'affordable' ? 'check' : result.verdict === 'not_enough_data' ? 'info' : 'warn'} size={22} color={tone.fg} />
          <View style={{ flex: 1, gap: 4 }}>
            <Strong style={{ fontFamily: fonts.bold }}>{result.headline}</Strong>
            <Body style={{ fontSize: 14, lineHeight: 20 }}>{result.summary}</Body>
          </View>
        </View>

        {result.why.length ? (
          <Section title="Why">
            {result.why.map((w) => (
              <Body key={w} style={{ fontSize: 14, lineHeight: 21 }}>
                • {w}
              </Body>
            ))}
          </Section>
        ) : null}

        {result.rows.length ? (
          <Section title="Financial impact">
            {result.rows.map((r) => (
              <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border, borderStyle: 'dashed' }}>
                <Body style={{ fontSize: 14, color: colors.inkSoft, flex: 1 }}>{r.label}</Body>
                <Strong style={{ fontSize: 14, color: r.negative ? colors.dangerFg : colors.ink, textAlign: 'right', flexShrink: 1 }}>{r.value}</Strong>
              </View>
            ))}
            {chart ? (
              <>
                <View accessibilityRole="image" accessibilityLabel={chart.alt} style={{ height: 10, borderRadius: 999, backgroundColor: colors.track, marginTop: 10 }}>
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barPct}%`, borderRadius: 999, backgroundColor: chart.lowest < chart.buffer ? colors.dangerFg : colors.successFg }} />
                  <View style={{ position: 'absolute', left: `${bufferPct}%`, top: -3, bottom: -3, width: 2, backgroundColor: colors.ink }} />
                </View>
                <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>Bar: lowest projected balance · line: your buffer. {chart.alt}</Text>
              </>
            ) : null}
          </Section>
        ) : null}

        {result.flags.length ? (
          <View style={{ paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {result.flags.map((f) => (
              <View key={f} style={{ flexDirection: 'row', gap: 4, alignItems: 'center', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: colors.warnBg }}>
                <Icon name="warn" size={12} color={colors.warnFg} strokeWidth={2.2} />
                <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.warnFg }}>{f}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {result.options.length ? (
          <Section title="Options">
            {result.options.map((o) => (
              <View key={o.title} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Body style={{ fontSize: 14 }}>
                  <Text style={{ fontFamily: fonts.bold }}>{o.title}</Text> {o.body}
                </Body>
              </View>
            ))}
            <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>These are options, not advice — the decision is yours.</Text>
          </Section>
        ) : null}

        <View style={{ paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 }}>
          <Strong style={{ fontSize: 13 }}>Assumptions &amp; data ({result.coverage})</Strong>
          {result.assumptions.map((a) => (
            <Text key={a} style={{ fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.inkSoft }}>
              • {a}
            </Text>
          ))}
        </View>
      </View>

      {followUps.length && onFollowUp ? (
        <View accessibilityLabel="Follow-up questions" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {followUps.map((q) => (
            <QuickReply key={q} label={q} onPress={() => onFollowUp(q)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function QuickReply({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.control, backgroundColor: pressed ? colors.hairline : colors.surface, justifyContent: 'center' })}
    >
      <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.ink }}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 }}>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </View>
  );
}
