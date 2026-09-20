import * as Haptics from 'expo-haptics';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Icon, Text, radii, spacing, useTheme } from '@/design';

import type { AmountKey } from '../amountInput';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const KEY_ROWS: readonly (readonly AmountKey[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'backspace'],
];

export type AmountKeypadProps = {
  onKey: (key: AmountKey) => void;
  onClear: () => void;
};

/**
 * Custom numeric keypad.
 *
 * Deliberately not the system keyboard, for four reasons that together decide
 * whether the five-second entry target is reachable:
 *
 *  1. **No open animation.** Android's keyboard takes 200–300ms to slide in and
 *     reflows the layout when it does. This renders with the sheet, already
 *     there.
 *  2. **Bigger targets.** The system numeric keyboard gives digits roughly
 *     their alphabetic-key size. These keys are a third of the screen width
 *     each, so entry tolerates being done one-handed without looking.
 *  3. **No layout fight.** No KeyboardAvoidingView, no scroll-into-view, no
 *     insets shifting under the sheet.
 *  4. **Exact input rules.** `numeric` on a TextInput still admits `-`, `+`,
 *     `e` and multiple separators depending on the OEM keyboard. Here the only
 *     reachable characters are the twelve defined above.
 *
 * Long-press on backspace clears the whole amount — the recovery path for
 * mistyping without eleven taps.
 */
export function AmountKeypad({ onKey, onClear }: AmountKeypadProps) {
  return (
    <View style={styles.pad}>
      {KEY_ROWS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((key) => (
            <KeypadKey key={key} value={key} onKey={onKey} onClear={onClear} />
          ))}
        </View>
      ))}
    </View>
  );
}

type KeypadKeyProps = {
  value: AmountKey;
  onKey: (key: AmountKey) => void;
  onClear: () => void;
};

/**
 * Memoised: a keypress changes the parent's amount state, which would otherwise
 * re-render all twelve keys. They never change, so they should never re-render.
 * `onKey` and `onClear` are stable callbacks from the parent for this to hold.
 */
const KeypadKey = memo(function KeypadKey({ value, onKey, onClear }: KeypadKeyProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.93, theme.motion.press);
    // Fires on press-IN so the key feels acknowledged as the finger lands,
    // not after it lifts. At typing speed that difference is the whole feel.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [scale, theme.motion.press]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, theme.motion.press);
  }, [scale, theme.motion.press]);

  const handlePress = useCallback(() => onKey(value), [onKey, value]);

  const handleLongPress = useCallback(() => {
    if (value !== 'backspace') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClear();
  }, [value, onClear]);

  const isBackspace = value === 'backspace';

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={isBackspace ? 'Delete last digit' : value}
      accessibilityHint={isBackspace ? 'Hold to clear the amount' : undefined}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={handleLongPress}
      delayLongPress={350}
      android_disableSound
      style={[styles.key, animatedStyle]}
    >
      {isBackspace ? (
        <Icon name="backspace-outline" size={22} color="textMuted" />
      ) : (
        <Text variant="title" numeric style={{ color: theme.colors.text }}>
          {value}
        </Text>
      )}
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  pad: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.xs },
  key: {
    flex: 1,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
});
