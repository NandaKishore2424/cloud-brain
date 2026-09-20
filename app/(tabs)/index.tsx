import { isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { sqlite } from '@/db/client';
import { db } from '@/db/client';
import { accounts, categories } from '@/db/schema';
import { Card, Divider, Icon, Screen, Text, spacing, useTheme } from '@/design';
import { formatDayHeading, todayDate } from '@/lib/date';
import { asPaise, formatMoney, formatMoneyCompact } from '@/lib/money';

/**
 * Phase 0 — foundation check.
 *
 * This screen exists to prove the whole stack is wired correctly on a real
 * device: fonts render, the theme responds to the OS, migrations ran, seed data
 * landed, and Drizzle's reactive query layer returns rows. Phase 1 replaces it
 * with the real dashboard.
 */
export default function HomeScreen() {
  const categoryRows = useLiveQuery(
    db.select().from(categories).where(isNull(categories.deletedAt)),
  );
  const accountRows = useLiveQuery(
    db.select().from(accounts).where(isNull(accounts.deletedAt)),
  );

  const schemaVersion = useSchemaVersion();

  const incomeCount = categoryRows.data?.filter((c) => c.kind === 'income').length ?? 0;
  const expenseCount = categoryRows.data?.filter((c) => c.kind === 'expense').length ?? 0;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text variant="caption" color="textMuted">
          {formatDayHeading(todayDate()).toUpperCase()}
        </Text>
        <Text variant="title">Cloud Brain</Text>
      </View>

      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Icon name="construct-outline" size={18} color="accent" />
          <Text variant="heading">Foundation check</Text>
        </View>
        <Text variant="body" color="textMuted" style={styles.cardIntro}>
          Everything below is read live from the on-device database.
        </Text>

        <Divider spacingY="lg" />

        <CheckRow
          label="Schema version"
          value={schemaVersion === null ? '…' : `v${schemaVersion}`}
          ok={schemaVersion !== null && schemaVersion > 0}
        />
        <CheckRow
          label="Accounts seeded"
          value={String(accountRows.data?.length ?? 0)}
          ok={(accountRows.data?.length ?? 0) > 0}
        />
        <CheckRow
          label="Expense categories"
          value={String(expenseCount)}
          ok={expenseCount > 0}
        />
        <CheckRow
          label="Income categories"
          value={String(incomeCount)}
          ok={incomeCount > 0}
        />
        <CheckRow
          label="Reactive queries"
          value={categoryRows.error ? 'error' : 'live'}
          ok={!categoryRows.error}
        />
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Icon name="cash-outline" size={18} color="positive" />
          <Text variant="heading">Money formatting</Text>
        </View>
        <Text variant="body" color="textMuted" style={styles.cardIntro}>
          Integer paise in, Indian digit grouping out.
        </Text>

        <Divider spacingY="lg" />

        <SampleRow paise={4200} />
        <SampleRow paise={123456} />
        <SampleRow paise={1_23_45_678} />
        <SampleRow paise={-89900} />
      </Card>
    </Screen>
  );
}

function CheckRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Icon
          name={ok ? 'checkmark-circle' : 'alert-circle'}
          size={16}
          color={ok ? 'positive' : 'negative'}
        />
        <Text variant="body">{label}</Text>
      </View>
      <Text variant="bodyMedium" color="textMuted" numeric>
        {value}
      </Text>
    </View>
  );
}

function SampleRow({ paise }: { paise: number }) {
  const theme = useTheme();
  const value = asPaise(paise);
  return (
    <View style={styles.row}>
      <Text variant="body" color="textMuted" numeric>
        {paise}
      </Text>
      <View style={styles.sampleRight}>
        <Text
          variant="bodyMedium"
          numeric
          style={{ color: paise < 0 ? theme.colors.negative : theme.colors.text }}
        >
          {formatMoney(value)}
        </Text>
        <Text variant="caption" color="textSubtle" numeric>
          {formatMoneyCompact(value)}
        </Text>
      </View>
    </View>
  );
}

/** Reads PRAGMA user_version once, to display what the migrator settled on. */
function useSchemaVersion(): number | null {
  const [version, setVersion] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void sqlite
      .getFirstAsync<{ user_version: number }>('PRAGMA user_version;')
      .then((row) => {
        if (!cancelled) setVersion(row?.user_version ?? 0);
      })
      .catch(() => {
        if (!cancelled) setVersion(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xxs },
  card: { marginBottom: spacing.lg },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardIntro: { marginTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sampleRight: { alignItems: 'flex-end' },
});
