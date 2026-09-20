import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '../theme';
import { MIN_TOUCH_TARGET, radii, spacing } from '../tokens';
import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Rendered before the label — usually an <Icon />. */
  leading?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
};

const SIZES: Record<ButtonSize, { height: number; paddingH: number; variant: 'label' | 'bodyMedium' }> = {
  sm: { height: 36, paddingH: spacing.md, variant: 'label' },
  md: { height: MIN_TOUCH_TARGET, paddingH: spacing.xl, variant: 'bodyMedium' },
  lg: { height: 56, paddingH: spacing.xxl, variant: 'bodyMedium' },
};

/**
 * Button with press feedback driven on the UI thread.
 *
 * The scale animation uses a Reanimated shared value, so the spring runs in the
 * native worklet and stays at 60fps even when the JS thread is busy committing
 * a database write. Doing the same thing with `Animated` from react-native
 * (non-native driver) or with React state would stutter at exactly the moment
 * the user is most likely to notice — right after they tap Save.
 *
 * Haptics fire on press-IN rather than press-out. The tap should feel
 * acknowledged the instant the finger lands, not after the gesture resolves.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leading,
  fullWidth = false,
  style,
  accessibilityHint,
}: ButtonProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const isInert = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (isInert) return;
    scale.value = withSpring(0.97, theme.motion.press);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isInert, scale, theme.motion.press]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, theme.motion.press);
  }, [scale, theme.motion.press]);

  const sizeSpec = SIZES[size];
  const palette = resolvePalette(variant, theme);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isInert, busy: loading }}
      accessibilityHint={accessibilityHint}
      disabled={isInert}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.base,
        {
          height: sizeSpec.height,
          paddingHorizontal: sizeSpec.paddingH,
          backgroundColor: palette.background,
          borderColor: palette.border,
          borderWidth: palette.border === 'transparent' ? 0 : StyleSheet.hairlineWidth * 2,
          opacity: isInert ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.label} />
      ) : (
        <View style={styles.content}>
          {leading}
          <Text variant={sizeSpec.variant} style={{ color: palette.label }}>
            {label}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

function resolvePalette(variant: ButtonVariant, theme: ReturnType<typeof useTheme>) {
  switch (variant) {
    case 'primary':
      return {
        background: theme.colors.accent,
        label: theme.colors.textOnAccent,
        border: 'transparent',
      };
    case 'secondary':
      return {
        background: theme.colors.surface,
        label: theme.colors.text,
        border: theme.colors.border,
      };
    case 'ghost':
      return {
        background: 'transparent',
        label: theme.colors.accent,
        border: 'transparent',
      };
    case 'danger':
      return {
        background: theme.colors.negativeSoft,
        label: theme.colors.negative,
        border: 'transparent',
      };
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
