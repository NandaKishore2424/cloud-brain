import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { useTheme } from '../theme';
import { radii, spacing } from '../tokens';
import { Text } from './Text';

/** How long the affordance stays on screen. */
export const UNDO_WINDOW_MS = 6000;

export type UndoBarProps = {
  /** Non-null shows the bar. The value is passed back to `onUndo`. */
  target: string | null;
  message: string;
  onUndo: (target: string) => void;
  onExpire: () => void;
  /** Distance from the bottom of the screen, in px. */
  bottom: number;
  /** Right inset, to clear a floating action button. */
  right?: number;
};

/**
 * Transient undo affordance shown after a destructive action.
 *
 * Exists so that deletes can be immediate rather than gated behind a
 * confirmation dialog. A confirm taxes every intentional delete to guard
 * against the rare accidental one, and people learn to dismiss them without
 * reading — so it stops protecting anything. Undo costs nothing unless
 * something actually went wrong.
 *
 * This is only a safe trade because deletes in this app are tombstones, not
 * destructive writes: restoring is clearing a column, not recreating a row.
 */
export function UndoBar({
  target,
  message,
  onUndo,
  onExpire,
  bottom,
  right = spacing.lg,
}: UndoBarProps) {
  const theme = useTheme();

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    clear();
    if (target === null) return;

    timer.current = setTimeout(onExpire, UNDO_WINDOW_MS);
    // Clearing on unmount as well as on change prevents the expiry firing into
    // an unmounted screen after a tab switch.
    return clear;
  }, [target, onExpire, clear]);

  if (target === null) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(theme.motion.fast)}
      exiting={FadeOutDown.duration(theme.motion.fast)}
      style={[
        styles.bar,
        {
          bottom,
          right,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        theme.elevation.high,
      ]}
    >
      <Text variant="body" color="textMuted" numberOfLines={1} style={styles.message}>
        {message}
      </Text>
      <Pressable
        onPress={() => onUndo(target)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Undo"
      >
        <Text variant="bodyMedium" style={{ color: theme.colors.accent }}>
          Undo
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * State for a pending undo.
 *
 * Bundled with the component because the two always travel together, and
 * because it keeps the "clear the target" and "expire the target" paths in one
 * place rather than duplicated per screen.
 */
export function useUndoTarget(): {
  target: string | null;
  set: (id: string) => void;
  clear: () => void;
} {
  const [target, setTarget] = useState<string | null>(null);

  return {
    target,
    set: useCallback((id: string) => setTarget(id), []),
    clear: useCallback(() => setTarget(null), []),
  };
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    height: 48,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  message: { flex: 1 },
});
