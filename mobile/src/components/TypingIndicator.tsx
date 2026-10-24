import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

function Dot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        Animated.delay(600 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, v]);
  return <Animated.View style={[styles.dot, { opacity: v }]} />;
}

export function TypingIndicator({ who }: { who: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{who}</Text>
      <View style={styles.bubble}>
        <Dot delay={0} />
        <Dot delay={200} />
        <Dot delay={400} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', marginVertical: 4 },
  label: { fontSize: 11, color: colors.muted, marginBottom: 2, marginLeft: 6 },
  bubble: {
    flexDirection: 'row',
    gap: 5,
    backgroundColor: colors.bubbleOther,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted },
});
