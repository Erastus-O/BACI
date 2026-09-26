import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, NativeSyntheticEvent, Platform, Pressable, ScrollView, Text, TextInput, TextInputKeyPressEventData, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Body, Display, Muted, Row } from '../../components/ui';
import { Icon, IconName } from '../../components/Icon';
import { AffordabilityCard, QuickReply } from '../../components/AffordabilityCard';
import { ChatItem, useAgentChat } from '../../agent/AgentChat';
import { money } from '../../lib/format';
import { colors, fonts } from '../../theme';

// A1 Ask BACI — /chat (A2 clarify turns and 10 affordability cards render in the log)
export default function Chat() {
  const chat = useAgentChat();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [draft, setDraft] = useState('');
  const scroll = useRef<ScrollView>(null);
  const sentQ = useRef<string | null>(null);
  const lastUserIndex = chat.items.map((i) => i.kind).lastIndexOf('user');
  const inCall = chat.mode === 'voice' && (chat.status === 'connected' || chat.status === 'connecting');

  // ?q= sends once on load, then the parameter is cleared.
  useEffect(() => {
    if (q && sentQ.current !== q) {
      sentQ.current = q;
      chat.send(q);
      router.setParams({ q: undefined });
    }
  }, [q, chat]);

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [chat.items.length, chat.thinking]);

  const submit = async (text = draft) => {
    if (!text.trim()) return;
    const before = draft;
    setDraft('');
    const ok = await chat.send(text);
    if (!ok && text === before) setDraft(before); // send error: restore the text
  };

  // Web: Enter sends, Shift+Enter adds a new line.
  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData & { shiftKey?: boolean }>) => {
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingTop: 12, paddingBottom: 10, paddingHorizontal: 16, flexDirection: 'row', gap: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkleSm" size={16} color="#FFFFFF" strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Display accessibilityRole="header" style={{ fontSize: 20 }}>
              Ask BACI
            </Display>
            <Muted style={{ fontSize: 12, lineHeight: 16 }}>Answers use your connected accounts. Information, not regulated advice.</Muted>
          </View>
          <StatusPill />
        </View>

        {inCall ? <VoicePanel /> : null}

        <ScrollView
          ref={scroll}
          accessibilityRole={Platform.OS === 'web' ? ('log' as never) : undefined}
          aria-live="polite"
          contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {chat.items.map((item, i) => (
            // Quick replies and follow-ups only on turns after the user's last message.
            <Turn key={item.id} item={item} latest={i > lastUserIndex} onReply={(t) => submit(t)} />
          ))}
          {chat.thinking ? (
            <Row gap={8}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Muted style={{ fontSize: 13 }}>{chat.status === 'connecting' ? 'Connecting to BACI…' : 'Checking your accounts…'}</Muted>
            </Row>
          ) : null}
          {chat.error ? <Banner tone="danger">{chat.error}</Banner> : null}
          {!chat.configured && chat.items.length <= 1 ? (
            <Muted style={{ fontSize: 12.5 }}>Voice agent is off in this build — answers are worked out on this device.</Muted>
          ) : null}
        </ScrollView>

        <View style={{ paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: colors.border }}>
          <TextInput
            accessibilityLabel="Message BACI"
            value={draft}
            onChangeText={setDraft}
            onKeyPress={onKeyPress}
            onSubmitEditing={Platform.OS === 'web' ? undefined : () => submit()}
            multiline={Platform.OS === 'web'}
            returnKeyType="send"
            submitBehavior={Platform.OS === 'web' ? undefined : 'submit'}
            placeholder="e.g. Can I afford a £900 phone?"
            placeholderTextColor={colors.muted}
            style={{ flex: 1, minHeight: 48, maxHeight: 120, borderWidth: 1, borderColor: colors.control, borderRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 13, fontFamily: fonts.body, fontSize: 16, color: colors.ink }}
          />
          {draft.trim() ? (
            <RoundButton label="Send" icon="send" onPress={() => submit()} />
          ) : inCall ? (
            <RoundButton label="End voice call" icon="phoneOff" onPress={chat.endSession} tone="danger" />
          ) : (
            <RoundButton label="Talk to BACI" icon="mic" onPress={chat.startCall} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Turn({ item, latest, onReply }: { item: ChatItem; latest: boolean; onReply: (t: string) => void }) {
  switch (item.kind) {
    case 'user':
      return (
        <View style={{ alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderBottomRightRadius: 6 }}>
          <Text style={{ color: '#FFFFFF', fontFamily: fonts.body, fontSize: 15, lineHeight: 21 }}>{item.text}</Text>
        </View>
      );
    case 'agent':
      return (
        <View style={{ gap: 8 }}>
          <View
            accessibilityRole={item.error ? 'alert' : undefined}
            style={{ alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: colors.surface, borderWidth: item.error ? 1.5 : 1, borderColor: item.error ? colors.dangerFg : colors.border, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderBottomLeftRadius: 6 }}
          >
            <Body>{item.text}</Body>
          </View>
          {item.quickReplies && latest ? (
            <View accessibilityLabel="Suggested questions" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {item.quickReplies.map((q) => (
                <QuickReply key={q} label={q} onPress={() => onReply(q)} />
              ))}
            </View>
          ) : null}
        </View>
      );
    case 'snapshot': {
      const s = item.snap;
      const has = (k: (typeof s.connectedKinds)[number]) => s.connectedKinds.includes(k);
      const tiles: [string, number | null, boolean][] = [
        ['Current accounts', s.availableCurrent, true],
        ['Savings', s.savings, has('savings')],
        ['Cards owed', s.creditOwed, has('credit')],
        ['Loans owed', s.loansOwed, has('loan')],
      ];
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxWidth: '92%' }}>
          {tiles.map(([label, v, connected]) => (
            <View key={label} style={{ flexBasis: '46%', flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 }}>
              <Muted style={{ fontSize: 12.5 }}>{label}</Muted>
              <Text style={{ fontFamily: v === null || !connected ? fonts.semibold : fonts.bold, fontSize: v === null || !connected ? 14 : 18, color: v === null || !connected ? colors.muted : colors.ink }}>{v === null ? 'Not shared' : connected ? money(v, true) : 'None connected'}</Text>
            </View>
          ))}
        </View>
      );
    }
    case 'commitments':
      return (
        <View style={{ maxWidth: '92%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, gap: 6 }}>
          {item.items.map((b) => (
            <Row key={b.label} style={{ justifyContent: 'space-between' }}>
              <Row gap={0}>
                <Muted style={{ fontSize: 12.5, width: 48 }}>{b.date}</Muted>
                <Body style={{ fontSize: 14 }}>{b.label}</Body>
              </Row>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>{money(b.amount)}</Text>
            </Row>
          ))}
        </View>
      );
    case 'impact':
      return <AffordabilityCard result={item.result} followUps={latest ? item.followUps : []} onFollowUp={onReply} />;
    case 'notice':
      return (
        <Banner tone={item.tone} icon={item.tone === 'warn' ? 'clock' : undefined}>
          <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: item.tone === 'danger' ? colors.dangerInk : item.tone === 'warn' ? colors.warnInk : colors.infoInk }}>
            {item.text}{' '}
            <Text accessibilityRole="link" onPress={() => router.navigate(item.tone === 'info' ? '/settings/permissions' : '/accounts')} style={{ fontFamily: fonts.bold, textDecorationLine: 'underline' }}>
              {item.tone === 'info' ? 'Permissions' : 'Refresh'}
            </Text>
          </Text>
        </Banner>
      );
    case 'system':
      return <Muted style={{ fontSize: 12.5, textAlign: 'center' }}>{item.text}</Muted>;
  }
}

function RoundButton({ label, icon, onPress, tone = 'primary' }: { label: string; icon: IconName; onPress: () => void; tone?: 'primary' | 'danger' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: tone === 'danger' ? colors.dangerFg : colors.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
    >
      <Icon name={icon} size={20} color="#FFFFFF" />
    </Pressable>
  );
}

function StatusPill() {
  const { status, mode } = useAgentChat();
  const label = status === 'connected' ? (mode === 'voice' ? 'On call' : 'Online') : status === 'connecting' ? 'Connecting' : null;
  if (!label) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: colors.successBg }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.successFg }} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.successFg }}>{label}</Text>
    </View>
  );
}

/** Live voice call: animated orb, speaking/listening state, mute and hang up. */
function VoicePanel() {
  const { status, isSpeaking, isMuted, setMuted, endSession } = useAgentChat();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const d = isSpeaking ? 500 : 1400;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: d, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0, duration: d, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isSpeaking, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, isSpeaking ? 1.18 : 1.06] });
  const label = status === 'connecting' ? 'Connecting…' : isMuted ? 'Muted' : isSpeaking ? 'BACI is speaking' : 'Listening…';

  return (
    <View accessibilityLiveRegion="polite" style={{ paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ width: 112, height: 112, borderRadius: 56, borderWidth: 1.5, borderColor: colors.ringOuter, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }}>
          {status === 'connecting' ? <ActivityIndicator color="#FFFFFF" /> : <Icon name={isSpeaking ? 'waveform' : 'mic'} size={34} color="#FFFFFF" />}
        </Animated.View>
      </View>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{label}</Text>
      <Row gap={16}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          accessibilityState={{ selected: isMuted }}
          onPress={() => setMuted(!isMuted)}
          style={{ height: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.control, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: isMuted ? colors.hairline : colors.surface }}
        >
          <Icon name={isMuted ? 'micOff' : 'mic'} size={18} color={colors.ink} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End voice call"
          onPress={endSession}
          style={{ height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.dangerFg, flexDirection: 'row', gap: 6, alignItems: 'center' }}
        >
          <Icon name="phoneOff" size={18} color="#FFFFFF" />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: '#FFFFFF' }}>End</Text>
        </Pressable>
      </Row>
    </View>
  );
}
