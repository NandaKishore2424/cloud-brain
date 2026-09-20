import * as Haptics from 'expo-haptics';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { TodoPriority } from '@/db/schema';
import { Icon, Text, radii, spacing, useTheme, type ColorScheme } from '@/design';
import { formatShortDate, todayDate, type CalendarDate } from '@/lib/date';

import type { TodoListItem } from '../api';

export type TodoRowProps = {
  item: TodoListItem;
  onToggle: (item: TodoListItem) => void;
  onOpen: (item: TodoListItem) => void;
};

/**
 * One task.
 *
 * The checkbox is a nested Pressable inside the row's Pressable. Tapping it
 * completes the task; tapping anywhere else opens the detail sheet. Two
 * distinct targets rather than one gesture with a mode, because "tick it off"
 * is by far the most frequent action and must not cost a second decision.
 *
 * Toggling is deliberately NOT a swipe. A swipe on a row that also scrolls
 * needs a direction threshold, which means either an accidental completion
 * while scrolling or a swipe that has to travel far enough to feel slow. A
 * checkbox is unambiguous and hits in one tap.
 */
export const TodoRow = memo(function TodoRow({ item, onToggle, onOpen }: TodoRowProps) {
  const theme = useTheme();

  const isDone = item.completedAt !== null;
  const scale = useSharedValue(1);

  const animatedCheckbox = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleToggle = useCallback(() => {
    // Overshoot then settle. The task is about to leave the list, so this is
    // the only acknowledgement the user gets that the tap registered on the
    // right row.
    scale.value = withSequence(
      withTiming(0.82, { duration: 90 }),
      withSpring(1, theme.motion.press),
    );
    void Haptics.impactAsync(
      isDone ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
    );
    onToggle(item);
  }, [isDone, item, onToggle, scale, theme.motion.press]);

  const handleOpen = useCallback(() => onOpen(item), [item, onOpen]);

  const dueTint = resolveDueTint(item.dueOn, isDone);
  const priorityTint = PRIORITY_TINT[item.priority];

  return (
    <Pressable
      onPress={handleOpen}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      accessibilityHint="Opens task details"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent' },
      ]}
    >
      <Pressable
        onPress={handleToggle}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDone }}
        accessibilityLabel={isDone ? 'Mark as not done' : 'Mark as done'}
      >
        <Animated.View
          style={[
            styles.checkbox,
            {
              borderColor: isDone
                ? theme.colors.positive
                : priorityTint === null
                  ? theme.colors.borderStrong
                  : theme.colors[priorityTint],
              backgroundColor: isDone ? theme.colors.positive : 'transparent',
            },
            animatedCheckbox,
          ]}
        >
          {isDone ? <Icon name="checkmark" size={14} color="textOnAccent" /> : null}
        </Animated.View>
      </Pressable>

      <View style={styles.body}>
        <Text
          variant="body"
          numberOfLines={2}
          color={isDone ? 'textSubtle' : 'text'}
          style={isDone ? styles.doneTitle : undefined}
        >
          {item.title}
        </Text>

        {item.project !== null || item.dueOn !== null ? (
          <View style={styles.meta}>
            {item.project !== null ? (
              <View style={[styles.projectChip, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {item.project}
                </Text>
              </View>
            ) : null}

            {item.dueOn !== null ? (
              <View style={styles.due}>
                <Icon name="calendar-outline" size={11} color={dueTint} />
                <Text variant="caption" color={dueTint} numeric>
                  {formatShortDate(item.dueOn)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const PRIORITY_TINT: Record<TodoPriority, keyof ColorScheme | null> = {
  high: 'negative',
  normal: null,
  low: null,
};

/**
 * Overdue dates are tinted negative; everything else stays muted.
 *
 * Completed tasks never show as overdue — a task finished late is finished, and
 * colouring it red is scolding the user for work they have already done.
 */
function resolveDueTint(dueOn: CalendarDate | null, isDone: boolean): keyof ColorScheme {
  if (dueOn === null || isDone) return 'textSubtle';
  return dueOn < todayDate() ? 'negative' : 'textMuted';
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Nudged down so the circle is optically centred on the first line of text
    // rather than sitting slightly above it.
    marginTop: 1,
  },
  body: { flex: 1, gap: spacing.xs },
  doneTitle: { textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  projectChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    maxWidth: 160,
  },
  due: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
