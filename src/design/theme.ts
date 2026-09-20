import { useMemo } from 'react';
import { useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

import {
  darkColors,
  elevation,
  lightColors,
  motion,
  radii,
  spacing,
  typography,
  type ColorScheme,
} from './tokens';

export type ThemeName = 'light' | 'dark';

export type Theme = {
  readonly name: ThemeName;
  readonly isDark: boolean;
  readonly colors: ColorScheme;
  readonly spacing: typeof spacing;
  readonly radii: typeof radii;
  readonly typography: typeof typography;
  readonly elevation: typeof elevation;
  readonly motion: typeof motion;
};

const lightTheme: Theme = {
  name: 'light',
  isDark: false,
  colors: lightColors,
  spacing,
  radii,
  typography,
  elevation,
  motion,
};

const darkTheme: Theme = {
  name: 'dark',
  isDark: true,
  colors: darkColors,
  spacing,
  radii,
  typography,
  elevation,
  motion,
};

/**
 * The active theme, following the OS setting.
 *
 * There is no ThemeProvider and no React context here. `useColorScheme` is
 * already a subscription to the native appearance setting, and both theme
 * objects are module-level constants — so this hook returns a stable reference
 * that only changes when the OS theme actually changes. A context would add a
 * provider, a re-render cascade, and nothing else.
 */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}

/** Non-hook access, for code outside the React tree (e.g. navigation options). */
export function getTheme(name: ThemeName): Theme {
  return name === 'dark' ? darkTheme : lightTheme;
}

/* ------------------------------------------------------------------ */
/* Themed stylesheets                                                  */
/* ------------------------------------------------------------------ */

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

type StyleFactory<T extends NamedStyles> = (theme: Theme) => T;

/**
 * Per-theme stylesheet cache.
 *
 * The naive way to theme a component is to build its styles inside the render
 * body. That allocates a fresh style object on every render, which defeats
 * React Native's style-diffing and pushes new style props across the bridge
 * even when nothing changed.
 *
 * Instead the factory runs at most twice per component — once for light, once
 * for dark — and the results are cached against the factory function itself.
 * The WeakMap keying means a factory that goes out of scope takes its cache
 * with it, so this cannot leak.
 */
const styleCache = new WeakMap<
  StyleFactory<NamedStyles>,
  Partial<Record<ThemeName, NamedStyles>>
>();

export function useThemedStyles<T extends NamedStyles>(factory: StyleFactory<T>): T {
  const theme = useTheme();

  return useMemo(() => {
    const key = factory as StyleFactory<NamedStyles>;
    let entry = styleCache.get(key);

    if (!entry) {
      entry = {};
      styleCache.set(key, entry);
    }

    const cached = entry[theme.name];
    if (cached) return cached as T;

    const built = factory(theme);
    entry[theme.name] = built;
    return built;
  }, [factory, theme]);
}
