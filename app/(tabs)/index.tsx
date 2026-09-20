import { isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { sqlite } from '@/db/client';
import { db } from '@/db/client';
import { accounts, categories, notes, todos, transactions } from '@/db/schema';
import {
  clearNotes,
  clearTodos,
  clearTransactions,
  seedDemoData,
  seedDemoNotes,
  seedDemoTodos,
} from '@/db/seed';
import { Button, Card, Divider, Icon, Screen, Text, spacing, useTheme } from '@/design';
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

      {__DEV__ ? <DevTools /> : null}
    </Screen>
  );
}

/**
 * Dev-only data controls.
 *
 * Gated on `__DEV__`, which Metro replaces with a literal `false` in a
 * production build — so the whole block, and the import of the seeding module
 * it pulls in, is removed by dead-code elimination rather than merely hidden.
 *
 * Seeding is never automatic. An app that invents financial records on launch
 * is worse than an empty one, because you cannot tell your data from its data.
 */
function DevTools() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const transactionRows = useLiveQuery(
    db.select({ id: transactions.id }).from(transactions),
  );
  const todoRows = useLiveQuery(db.select({ id: todos.id }).from(todos));
  const noteRows = useLiveQuery(db.select({ id: notes.id }).from(notes));

  const transactionCount = transactionRows.data?.length ?? 0;
  const todoCount = todoRows.data?.length ?? 0;
  const noteCount = noteRows.data?.length ?? 0;
  const count = transactionCount + todoCount + noteCount;

  const handleSeed = async () => {
    setBusy(true);
    const money = await seedDemoData({ months: 3 });
    const tasks = await seedDemoTodos();
    const written = await seedDemoNotes();
    setBusy(false);

    if (!money.ok) return setStatus(money.error.message);
    if (!tasks.ok) return setStatus(tasks.error.message);
    if (!written.ok) return setStatus(written.error.message);

    setStatus(
      `Inserted ${money.value.inserted} transactions, ${tasks.value.inserted} tasks ` +
        `and ${written.value.inserted} notes`,
    );
  };

  const handleClear = async () => {
    setBusy(true);
    const money = await clearTransactions();
    const tasks = await clearTodos();
    const written = await clearNotes();
    setBusy(false);

    if (!money.ok) return setStatus(money.error.message);
    if (!tasks.ok) return setStatus(tasks.error.message);
    if (!written.ok) return setStatus(written.error.message);

    setStatus(
      `Removed ${money.value} transactions, ${tasks.value} tasks and ${written.value} notes`,
    );
  };

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Icon name="flask-outline" size={18} color="warning" />
        <Text variant="heading">Dev tools</Text>
      </View>
      <Text variant="body" color="textMuted" style={styles.cardIntro}>
        Stripped from release builds. {transactionCount} transaction
        {transactionCount === 1 ? '' : 's'}, {todoCount} task
        {todoCount === 1 ? '' : 's'} and {noteCount} note
        {noteCount === 1 ? '' : 's'} stored.
      </Text>

      <Divider spacingY="lg" />

      <View style={styles.devActions}>
        <Button label="Seed demo data" onPress={handleSeed} disabled={busy} size="sm" />
        <Button
          label="Clear all"
          onPress={handleClear}
          disabled={busy || count === 0}
          variant="danger"
          size="sm"
        />
      </View>

      {status !== null ? (
        <Text variant="label" color="textMuted" style={styles.devStatus}>
          {status}
        </Text>
      ) : null}
    </Card>
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
  devActions: { flexDirection: 'row', gap: spacing.sm },
  devStatus: { marginTop: spacing.md },
});
