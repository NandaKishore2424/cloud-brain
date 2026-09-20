import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { spacing } from '../tokens';

export type ScreenProps = {
  children: React.ReactNode;
  /** Wrap content in a ScrollView. Never use with a FlashList inside. */
  scroll?: boolean;
  /** Horizontal gutter. Set to 'none' for edge-to-edge lists. */
  gutter?: keyof typeof spacing;
  /** Apply the top safe-area inset. Off when a navigation header already does. */
  topInset?: boolean;
  contentContainerStyle?: ViewStyle;
  style?: ViewStyle;
};

/**
 * Root container for every screen.
 *
 * Owns three things that are easy to get subtly wrong per-screen: the
 * background colour, safe-area insets, and the status bar content style.
 *
 * The status bar is set from the theme rather than hardcoded — on a dark
 * background the clock and battery must render light, and getting this wrong
 * produces the classic "invisible status bar" that looks like a rendering bug.
 */
export function Screen({
  children,
  scroll = false,
  gutter = 'lg',
  topInset = true,
  contentContainerStyle,
  style,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = {
    paddingHorizontal: spacing[gutter],
    paddingTop: topInset ? insets.top : 0,
  };

  const background = { backgroundColor: theme.colors.bg };

  return (
    <View style={[styles.root, background, style]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            padding,
            // Clear the tab bar so the last row is never trapped behind it.
            { paddingBottom: insets.bottom + spacing.giant },
            contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, padding, contentContainerStyle]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
});
