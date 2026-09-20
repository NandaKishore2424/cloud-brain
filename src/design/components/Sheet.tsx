import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { radii, spacing } from '../tokens';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Disable drag-to-dismiss when the sheet holds unsaved input worth protecting. */
  dismissible?: boolean;
};

/** Drag distance past which releasing dismisses rather than springs back. */
const DISMISS_DISTANCE = 90;
/** Flick velocity that dismisses regardless of distance travelled. */
const DISMISS_VELOCITY = 650;

/**
 * Bottom sheet.
 *
 * Hand-built rather than pulling in a sheet library, for the same reason the
 * design system is hand-rolled (ADR 0003): this is ~120 lines and one gesture,
 * against a dependency whose Reanimated version compatibility becomes a
 * blocker at every upgrade.
 *
 * The mount lifecycle is the fiddly part. React Native's `Modal` unmounts its
 * children the instant `visible` flips false, which would cut the exit
 * animation off mid-flight. So the Modal is driven by internal `mounted` state
 * that only clears in the animation's completion callback — the sheet animates
 * out fully, then unmounts.
 */
export function Sheet({ visible, onClose, children, dismissible = true }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  const [mounted, setMounted] = useState(visible);

  /** 0 = fully off-screen, 1 = fully presented. */
  const progress = useSharedValue(0);
  /** Live finger displacement during a drag, in px. Never negative. */
  const drag = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.value = 0;
      progress.value = withSpring(1, theme.motion.enter);
    } else {
      progress.value = withTiming(0, { duration: theme.motion.fast }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [visible, progress, drag, theme.motion.enter, theme.motion.fast]);

  const panGesture = Gesture.Pan()
    .enabled(dismissible)
    // Only claim the gesture once it is clearly a vertical drag, so a
    // horizontal swipe through the category strip is not stolen by the sheet.
    .activeOffsetY(12)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      drag.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const shouldDismiss =
        event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;

      if (shouldDismiss) {
        runOnJS(onClose)();
      } else {
        drag.value = withSpring(0, theme.motion.press);
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * (1 - Math.min(drag.value / (screenHeight * 0.5), 0.6)),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          interpolate(progress.value, [0, 1], [screenHeight, 0]) + drag.value,
      },
    ],
  }));

  return (
    <Modal
      visible={mounted}
      transparent
      // Animation is owned by Reanimated; the Modal itself must not animate or
      // the two fight and the result stutters.
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View
          style={[styles.backdrop, { backgroundColor: theme.colors.scrim }, backdropStyle]}
        >
          <Pressable
            style={styles.fill}
            onPress={onClose}
            accessibilityLabel="Close"
            accessibilityRole="button"
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                paddingBottom: insets.bottom + spacing.lg,
                maxHeight: screenHeight * 0.92,
              },
              sheetStyle,
            ]}
          >
            {dismissible ? (
              <View style={styles.grabberArea}>
                <View
                  style={[styles.grabber, { backgroundColor: theme.colors.borderStrong }]}
                />
              </View>
            ) : (
              <View style={{ height: spacing.lg }} />
            )}
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  grabberArea: { alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.sm },
  grabber: { width: 36, height: 4, borderRadius: radii.pill },
});
