import { StyleSheet, Text, View } from 'react-native';
import type { Message } from '../useChat';
import { colors } from '../theme';

const LABELS = { bot: 'AI Assistant', agent: 'Agent' } as const;
const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function MessageBubble({ message }: { message: Message }) {
  if (message.from === 'system') {
    return <Text style={styles.system}>{message.text}</Text>;
  }
  const mine = message.from === 'me';
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
      {!mine && <Text style={styles.label}>{LABELS[message.from as keyof typeof LABELS]}</Text>}
      <View style={[styles.bubble, mine ? styles.mine : styles.other]}>
        <Text style={[styles.text, mine && styles.textMine]}>{message.text}</Text>
        <Text style={[styles.time, mine && styles.timeMine]}>{time(message.at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginVertical: 4, maxWidth: '82%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  label: { fontSize: 11, color: colors.muted, marginBottom: 2, marginLeft: 6 },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  mine: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  other: { backgroundColor: colors.bubbleOther, borderBottomLeftRadius: 4 },
  text: { fontSize: 16, lineHeight: 22, color: colors.text },
  textMine: { color: '#fff' },
  time: { fontSize: 10, color: colors.muted, marginTop: 3, alignSelf: 'flex-end' },
  timeMine: { color: 'rgba(255,255,255,0.8)' },
  system: {
    alignSelf: 'center',
    textAlign: 'center',
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.muted,
    marginVertical: 10,
    paddingHorizontal: 24,
  },
});
