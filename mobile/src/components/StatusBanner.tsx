import { StyleSheet, Text, View } from 'react-native';
import type { Status } from '../useChat';
import { colors } from '../theme';

const BANNERS: Record<Status, { text: string; bg: string; fg: string }> = {
  bot: { text: '🤖 Talking to AI assistant', bg: colors.botBg, fg: colors.brandDark },
  waiting: { text: '⏳ Waiting for an agent', bg: colors.waitingBg, fg: colors.waiting },
  human: { text: '👤 Talking to Agent', bg: colors.humanBg, fg: colors.human },
};

export function StatusBanner({ status }: { status: Status }) {
  const b = BANNERS[status];
  return (
    <View style={[styles.banner, { backgroundColor: b.bg }]}>
      <Text style={[styles.text, { color: b.fg }]}>{b.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingVertical: 8, alignItems: 'center' },
  text: { fontSize: 14, fontWeight: '600' },
});
