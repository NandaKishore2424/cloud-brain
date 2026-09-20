import { StyleSheet, View } from 'react-native';

import type { ApplicationStatus } from '@/db/schema';
import { Text, radii, spacing, useTheme } from '@/design';

import { STATUS_LABELS, STATUS_TOKENS } from '../pipeline';

export type StatusBadgeProps = { status: ApplicationStatus };

export function StatusBadge({ status }: StatusBadgeProps) {
  const theme = useTheme();
  const token = STATUS_TOKENS[status];

  return (
    <View style={[styles.badge, { backgroundColor: theme.colors.surfaceAlt }]}>
      <View style={[styles.dot, { backgroundColor: theme.colors[token] }]} />
      <Text variant="caption" style={{ color: theme.colors[token] }}>
        {STATUS_LABELS[status].toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
  },
  dot: { width: 5, height: 5, borderRadius: radii.pill },
});
