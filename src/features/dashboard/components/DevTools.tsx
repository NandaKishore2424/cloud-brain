import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { db, sqlite } from '@/db/client';
import { applications, notes, todos, transactions } from '@/db/schema';
import {
  clearApplications,
  clearNotes,
  clearTodos,
  clearTransactions,
  seedDemoApplications,
  seedDemoData,
  seedDemoNotes,
  seedDemoTodos,
} from '@/db/seed';
import { Button, Card, Divider, Icon, Text, spacing } from '@/design';
import { useEffect } from 'react';

/**
 * Dev-only data controls.
 *
 * Gated on `__DEV__` at the call site, which Metro replaces with a literal
 * `false` in a production build — so this component and the seeding module it
 * imports are removed by dead-code elimination rather than merely hidden.
 *
 * Seeding is never automatic. An app that invents financial records on launch
 * is worse than an empty one, because you cannot tell your data from its data.
 */
export function DevTools() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const schemaVersion = useSchemaVersion();

  const transactionRows = useLiveQuery(
    db.select({ id: transactions.id }).from(transactions),
  );
  const todoRows = useLiveQuery(db.select({ id: todos.id }).from(todos));
  const noteRows = useLiveQuery(db.select({ id: notes.id }).from(notes));
  const appRows = useLiveQuery(db.select({ id: applications.id }).from(applications));

  const counts = {
    transactions: transactionRows.data?.length ?? 0,
    todos: todoRows.data?.length ?? 0,
    notes: noteRows.data?.length ?? 0,
    applications: appRows.data?.length ?? 0,
  };
  const total =
    counts.transactions + counts.todos + counts.notes + counts.applications;

  const handleSeed = async () => {
    setBusy(true);
    const results = await Promise.all([
      seedDemoData({ months: 3 }),
      seedDemoTodos(),
      seedDemoNotes(),
      seedDemoApplications(),
    ]);
    setBusy(false);

    const failure = results.find((result) => !result.ok);
    setStatus(
      failure && !failure.ok ? failure.error.message : 'Seeded all four features',
    );
  };

  const handleClear = async () => {
    setBusy(true);
    const results = await Promise.all([
      clearTransactions(),
      clearTodos(),
      clearNotes(),
      clearApplications(),
    ]);
    setBusy(false);

    const failure = results.find((result) => !result.ok);
    setStatus(failure && !failure.ok ? failure.error.message : 'Cleared all data');
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Icon name="flask-outline" size={17} color="warning" />
        <Text variant="heading">Dev tools</Text>
        <View style={styles.spacer} />
        <Text variant="caption" color="textSubtle" numeric>
          SCHEMA v{schemaVersion ?? '…'}
        </Text>
      </View>

      <Text variant="body" color="textMuted" style={styles.intro}>
        Stripped from release builds. {counts.transactions} transactions,{' '}
        {counts.todos} tasks, {counts.notes} notes, {counts.applications}{' '}
        applications.
      </Text>

      <Divider spacingY="lg" />

      <View style={styles.actions}>
        <Button label="Seed demo data" onPress={handleSeed} disabled={busy} size="sm" />
        <Button
          label="Clear all"
          onPress={handleClear}
          disabled={busy || total === 0}
          variant="danger"
          size="sm"
        />
      </View>

      {status !== null ? (
        <Text variant="label" color="textMuted" style={styles.status}>
          {status}
        </Text>
      ) : null}
    </Card>
  );
}

/** Reads PRAGMA user_version once, to show what the migrator settled on. */
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
  card: { marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  spacer: { flex: 1 },
  intro: { marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm },
  status: { marginTop: spacing.md },
});
