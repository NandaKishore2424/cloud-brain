import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { radii, spacing } from '../tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  /** One line. Say what to do next, not that the list is empty. */
  hint?: string;
  action?: React.ReactNode;
};

/**
 * Shown when a list has no rows.
 *
 * An empty list with nothing in it reads as a broken screen. The hint should
 * describe the next action ("Tap + to record your first expense"), not restate
 * the obvious ("No transactions").
 */
export function EmptyState({ icon, title, hint, action }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.root}>
      <View style={[styles.badge, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Icon name={icon} size={26} color="textSubtle" />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {hint ? (
        <Text variant="body" color="textMuted" align="center" style={styles.hint}>
          {hint}
        </Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radii.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  hint: { maxWidth: 280 },
  action: { marginTop: spacing.lg },
});
