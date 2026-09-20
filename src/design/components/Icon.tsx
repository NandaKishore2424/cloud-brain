import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '../theme';
import type { ColorScheme } from '../tokens';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type IconProps = {
  name: IconName;
  size?: number;
  color?: keyof ColorScheme;
};

/**
 * Icon wrapper.
 *
 * Exists so that icon colours come from theme tokens rather than hex strings
 * scattered through feature code, and so the icon set is swappable from one
 * file. Ionicons is bundled with Expo — no extra font download, no network
 * fetch, no flash of missing glyphs on first launch.
 */
export function Icon({ name, size = 20, color = 'text' }: IconProps) {
  const theme = useTheme();
  return <Ionicons name={name} size={size} color={theme.colors[color]} />;
}
