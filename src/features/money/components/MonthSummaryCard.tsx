import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Divider, Icon, Text, radii, spacing, useTheme } from '@/design';
import { asPaise, formatMoney } from '@/lib/money';

import type { MonthSummary } from '../api';
import type { MonthNavigation } from '../hooks';

export type MonthSummaryCardProps = {
  navigation: MonthNavigation;
  summary: MonthSummary;
};

/**
 * Month header: which month, and what it came to.
 *
 * Net is the headline rather than total spend, because "did I end the month up
 * or down" is the question this app exists to answer. Income and expense sit
 * below it as the breakdown, not as co-equal figures.
 *
 * Net is coloured by sign, and the leading symbol is the typographic minus
 * (U+2212) supplied by `formatMoney` rather than a hyphen, so it keeps digit
 * width and the figure stays optically centred.
 */
export function MonthSummaryCard({ navigation, summary }: MonthSummaryCardProps) {
  const theme = useTheme();
  const { label, isCurrentMonth, goToPrevious, goToNext, goToCurrent } = navigation;

  const netIsNegative = summary.net < 0;
  const netColor = netIsNegative ? theme.colors.negative : theme.colors.positive;

  return (
    <Card padding="lg" style={styles.card}>
      <View style={styles.monthRow}>
        <Pressable
          onPress={goToPrevious}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={styles.arrow}
        >
          <Icon name="chevron-back" size={18} color="textMuted" />
        </Pressable>

        <Pressable
          onPress={goToCurrent}
          disabled={isCurrentMonth}
          accessibilityRole="button"
          accessibilityLabel={`${label}. Tap to return to the current month`}
          style={styles.monthLabel}
        >
          <Text variant="label" color="textMuted">
            {label.toUpperCase()}
          </Text>
        </Pressable>

        <Pressable
          onPress={goToNext}
          // Forward navigation is allowed — future-dated entries are legitimate
          // — but there is nothing useful past the current month in practice,
          // so the affordance is dimmed rather than removed.
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={[styles.arrow, { opacity: isCurrentMonth ? 0.3 : 1 }]}
        >
          <Icon name="chevron-forward" size={18} color="textMuted" />
        </Pressable>
      </View>

      <View style={styles.netBlock}>
        <Text
          variant="display"
          numeric
          align="center"
          style={{ color: netColor }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatMoney(asPaise(summary.net), { signed: false })}
        </Text>
        <Text variant="caption" color="textSubtle" align="center">
          {netIsNegative ? 'NET — SPENT MORE THAN EARNED' : 'NET THIS MONTH'}
        </Text>
      </View>

      <Divider spacingY="md" />

      <View style={styles.splitRow}>
        <Totals
          icon="arrow-down-circle"
          label="Income"
          value={summary.income}
          color={theme.colors.positive}
        />
        <View style={[styles.splitDivider, { backgroundColor: theme.colors.border }]} />
        <Totals
          icon="arrow-up-circle"
          label="Spent"
          value={summary.expense}
          color={theme.colors.negative}
        />
      </View>
    </Card>
  );
}

type TotalsProps = {
  icon: 'arrow-down-circle' | 'arrow-up-circle';
  label: string;
  value: number;
  color: string;
};

function Totals({ icon, label, value, color }: TotalsProps) {
  return (
    <View style={styles.totals}>
      <View style={styles.totalsLabel}>
        <Icon name={icon} size={13} color={icon === 'arrow-down-circle' ? 'positive' : 'negative'} />
        <Text variant="caption" color="textSubtle">
          {label.toUpperCase()}
        </Text>
      </View>
      <Text variant="heading" numeric style={{ color }} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(asPaise(value))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  monthLabel: { flex: 1, alignItems: 'center' },
  netBlock: { marginTop: spacing.md, gap: spacing.xxs },
  splitRow: { flexDirection: 'row', alignItems: 'center' },
  splitDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: spacing.xs },
  totals: { flex: 1, gap: spacing.xxs, paddingHorizontal: spacing.sm },
  totalsLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
