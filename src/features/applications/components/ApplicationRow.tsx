import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text, spacing, useTheme } from '@/design';
import { daysAgo, formatShortDate, todayDate } from '@/lib/date';
import { asPaise, formatMoneyCompact } from '@/lib/money';

import type { ApplicationListItem } from '../api';
import { needsFollowUp } from '../pipeline';

export type ApplicationRowProps = {
  item: ApplicationListItem;
  onOpen: (id: string) => void;
  onLongPress: (item: ApplicationListItem) => void;
};

export const ApplicationRow = memo(function ApplicationRow({
  item,
  onOpen,
  onLongPress,
}: ApplicationRowProps) {
  const theme = useTheme();

  const today = todayDate();
  const followUp = needsFollowUp(item, today);
  const age = daysAgo(item.appliedOn);

  return (
    <Pressable
      onPress={() => onOpen(item.id)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`${item.role} at ${item.company}`}
      accessibilityHint="Opens the application. Hold for options."
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent' },
      ]}
    >
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text variant="bodyMedium" numberOfLines={1} style={styles.company}>
            {item.company}
          </Text>
          {followUp ? (
            <View style={[styles.flag, { backgroundColor: theme.colors.negativeSoft }]}>
              <Icon name="alarm-outline" size={11} color="negative" />
              <Text variant="caption" style={{ color: theme.colors.negative }}>
                FOLLOW UP
              </Text>
            </View>
          ) : null}
        </View>

        <Text variant="body" color="textMuted" numberOfLines={1}>
          {item.role}
        </Text>

        <View style={styles.meta}>
          <Text variant="caption" color="textSubtle" numeric>
            {/* Age matters more than the date itself — "applied 34 days ago"
                is the number that tells you whether to chase it. */}
            {age === 0 ? 'Applied today' : `${age}d ago`}
          </Text>

          {item.source !== null ? (
            <>
              <Text variant="caption" color="textSubtle">
                ·
              </Text>
              <Text variant="caption" color="textSubtle" numberOfLines={1}>
                {item.source}
              </Text>
            </>
          ) : null}

          {item.salaryMax !== null ? (
            <>
              <Text variant="caption" color="textSubtle">
                ·
              </Text>
              <Text variant="caption" color="textSubtle" numeric>
                {item.salaryMin !== null
                  ? `${formatMoneyCompact(asPaise(item.salaryMin))}–${formatMoneyCompact(asPaise(item.salaryMax))}`
                  : formatMoneyCompact(asPaise(item.salaryMax))}
              </Text>
            </>
          ) : null}
        </View>

        {item.nextActionOn !== null && item.nextAction !== null ? (
          <View style={styles.nextAction}>
            <Icon
              name="arrow-forward-circle-outline"
              size={12}
              color={followUp ? 'negative' : 'textSubtle'}
            />
            <Text
              variant="caption"
              color={followUp ? 'negative' : 'textSubtle'}
              numberOfLines={1}
            >
              {item.nextAction} · {formatShortDate(item.nextActionOn)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  main: { gap: spacing.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  company: { flex: 1 },
  flag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  nextAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
