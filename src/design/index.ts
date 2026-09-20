/**
 * Design system barrel.
 *
 * Feature code imports from '@/design' and nothing deeper. That keeps the
 * internal file layout of the design system free to change without a
 * project-wide find-and-replace, and it makes an accidental import of a
 * raw react-native primitive obvious in review.
 */

export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './components/Button';
export { Card, type CardProps } from './components/Card';
export { Divider, type DividerProps } from './components/Divider';
export { EmptyState, type EmptyStateProps } from './components/EmptyState';
export { Icon, type IconName, type IconProps } from './components/Icon';
export { Screen, type ScreenProps } from './components/Screen';
export { Sheet, type SheetProps } from './components/Sheet';
export { Text, type TextColor, type TextProps } from './components/Text';
export {
  UNDO_WINDOW_MS,
  UndoBar,
  useUndoTarget,
  type UndoBarProps,
} from './components/UndoBar';

export { getTheme, useTheme, useThemedStyles, type Theme, type ThemeName } from './theme';
export {
  elevation,
  fontFamily,
  hitSlop,
  MIN_TOUCH_TARGET,
  motion,
  radii,
  spacing,
  typography,
  type ColorScheme,
  type SpacingKey,
  type TypographyVariant,
} from './tokens';
