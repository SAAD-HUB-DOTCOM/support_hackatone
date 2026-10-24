import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useChat } from './src/useChat';
import { MessageBubble } from './src/components/MessageBubble';
import { TypingIndicator } from './src/components/TypingIndicator';
import { StatusBanner } from './src/components/StatusBanner';
import { colors } from './src/theme';

const QUICK_REPLIES = ['Delivery time?', 'Return policy', 'Talk to a person'];

function ChatScreen() {
  const { messages, status, isTyping, connected, send } = useChat();
  const [draft, setDraft] = useState('');
  const list = useRef<FlatList>(null);

  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, isTyping]);

  const submit = (text: string) => {
    if (!text.trim()) return;
    send(text);
    setDraft('');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Karachi Kart Support</Text>
        <View style={styles.conn}>
          <View style={[styles.dot, { backgroundColor: connected ? '#34D399' : colors.offline }]} />
          <Text style={styles.connText}>{connected ? 'Online' : 'Connecting…'}</Text>
        </View>
      </View>
      <StatusBanner status={status} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={list}
          style={styles.flex}
          contentContainerStyle={styles.list}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Assalam-o-Alaikum! 👋</Text>
              <Text style={styles.emptyText}>
                Ask about delivery, payments, returns or anything else. English, Urdu or Roman
                Urdu — sab chalega!
              </Text>
            </View>
          }
          ListFooterComponent={
            isTyping ? <TypingIndicator who={status === 'bot' ? 'AI Assistant' : 'Agent'} /> : undefined
          }
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsBar}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          {QUICK_REPLIES.map((q) => (
            <Pressable key={q} style={styles.chip} onPress={() => submit(q)}>
              <Text style={styles.chipText}>{q}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message…"
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => submit(draft)}
            returnKeyType="send"
            multiline
          />
          <Pressable
            style={[styles.sendBtn, !draft.trim() && styles.sendBtnOff]}
            onPress={() => submit(draft)}
            disabled={!draft.trim()}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ChatScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.brand },
  header: {
    backgroundColor: colors.brand,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: '#fff', fontSize: 19, fontWeight: '700' },
  conn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  connText: { color: '#fff', fontSize: 13 },
  list: { padding: 12, flexGrow: 1, backgroundColor: colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  chipsBar: { flexGrow: 0, backgroundColor: colors.bg },
  chips: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.brandDark, fontSize: 14, fontWeight: '500' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    gap: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    color: colors.text,
  },
  sendBtn: {
    backgroundColor: colors.brand,
    borderRadius: 21,
    paddingHorizontal: 18,
    height: 42,
    justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.5 },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
