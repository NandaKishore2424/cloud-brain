import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Divider,
  EmptyState,
  Icon,
  Screen,
  Sheet,
  Text,
  UndoBar,
  radii,
  spacing,
  useTheme,
  useUndoTarget,
} from '@/design';
import { asPaise, formatMoney } from '@/lib/money';

import {
  repeatTransaction,
  restoreTransaction,
  softDeleteTransaction,
  type TransactionListItem,
} from '../api';
import {
  useCategoryBreakdown,
  useMonthNavigation,
  useMonthSummary,
  useTransactions,
  type LedgerRow,
} from '../hooks';
import { AddTransactionSheet } from './AddTransactionSheet';
import { CategoryBreakdownCard } from './CategoryBreakdownCard';
import { MonthSummaryCard } from './MonthSummaryCard';
import { TransactionRow } from './TransactionRow';

/**
 * The Money tab.
 *
 * Composition root for the feature: owns the month selection and the sheet's
 * open state, and wires the reactive hooks to presentational components.
 *
 * One scroll container, not several. The summary and breakdown are the list's
 * `ListHeaderComponent` rather than siblings in a ScrollView wrapping the list
 * — nesting a virtualised list inside a ScrollView defeats virtualisation
 * entirely, because the outer view gives the inner one unbounded height and
 * every row renders at once.
 */
export type MoneyScreenProps = {
  /** Open the entry sheet on arrival. Set by `?compose=1` from the dashboard. */
  composeOnMount?: boolean;
};

export function MoneyScreen({ composeOnMount = false }: MoneyScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const navigation = useMonthNavigation();
  const { rows, stickyIndices, isEmpty, isLoading } = useTransactions(navigation.range);
  const summary = useMonthSummary(navigation.range);
  const breakdown = useCategoryBreakdown(navigation.range);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [actionsFor, setActionsFor] = useState<TransactionListItem | null>(null);
  const [editing, setEditing] = useState<TransactionListItem | null>(null);
  const undo = useUndoTarget();

  /**
   * Delete immediately, then offer undo.
   *
   * No confirmation dialog: the undo window is the safety net, and it is a
   * better one. A modal costs a tap on every intentional delete to guard
   * against the rare accident, and people learn to dismiss it without reading.
   * Undo costs nothing unless something actually went wrong.
   *
   * Safe to do eagerly because the delete is a tombstone, not a destructive
   * write — `restoreTransaction` simply clears it.
   */
  const handleDelete = useCallback(
    async (item: TransactionListItem) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setActionsFor(null);

      const result = await softDeleteTransaction(item.id);
      if (result.ok) undo.set(item.id);
    },
    [undo],
  );

  /**
   * Copy a past transaction onto today.
   *
   * The fastest possible path for a recurring expense: the fare you paid
   * yesterday, the same subscription, the same lunch. Faster even than the
   * entry sheet, because nothing has to be chosen at all.
   */
  const handleEdit = useCallback((item: TransactionListItem) => {
    setActionsFor(null);
    setEditing(item);
    setSheetVisible(true);
  }, []);

  const handleRepeat = useCallback(async (item: TransactionListItem) => {
    setActionsFor(null);
    const result = await repeatTransaction(item.id);
    void Haptics.notificationAsync(
      result.ok
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );
  }, []);

  const handleUndo = useCallback(
    async (id: string) => {
      undo.clear();
      void Haptics.selectionAsync();
      await restoreTransaction(id);
    },
    [undo],
  );

  /**
   * Honour `?compose=1` exactly once.
   *
   * The param stays in the URL after navigation, so without the ref the sheet
   * would reopen every time this tab regains focus — including immediately
   * after the user dismisses it.
   */
  const composeHandled = useRef(false);
  useEffect(() => {
    if (!composeOnMount || composeHandled.current) return;
    composeHandled.current = true;
    setEditing(null);
    setSheetVisible(true);
  }, [composeOnMount]);

  const openSheet = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditing(null);
    setSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
    // Cleared after closing rather than before, so the sheet's exit animation
    // plays against the values the user was just looking at.
    setEditing(null);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: LedgerRow }) =>
      item.kind === 'header' ? (
        <DayHeader label={item.label} dayNet={item.dayNet} />
      ) : (
        <TransactionRow item={item.item} onLongPress={setActionsFor} />
      ),
    [],
  );

  return (
    <Screen gutter="none">
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        // Lets FlashList maintain separate recycling pools per row shape.
        // Without it, a header can be recycled into a transaction row and the
        // layout thrashes as it re-measures.
        getItemType={getItemType}
        stickyHeaderIndices={stickyIndices}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.giant * 2 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <MonthSummaryCard navigation={navigation} summary={summary} />
            <CategoryBreakdownCard breakdown={breakdown} />
            {!isEmpty ? (
              <Text variant="caption" color="textSubtle" style={styles.sectionLabel}>
                TRANSACTIONS
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <EmptyState
                icon="receipt-outline"
                title="Nothing recorded yet"
                hint={
                  navigation.isCurrentMonth
                    ? 'Tap + to record your first transaction this month.'
                    : 'No transactions in this month.'
                }
              />
            </View>
          )
        }
      />

      <UndoBar
        target={undo.target}
        message="Transaction deleted"
        onUndo={handleUndo}
        onExpire={undo.clear}
        bottom={insets.bottom + spacing.lg}
        right={spacing.giant + spacing.xxl}
      />

      <Pressable
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: insets.bottom + spacing.lg,
            backgroundColor: theme.colors.accent,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          },
          theme.elevation.high,
        ]}
      >
        <Icon name="add" size={26} color="textOnAccent" />
      </Pressable>

      <AddTransactionSheet
        visible={sheetVisible}
        onClose={closeSheet}
        editing={editing}
      />

      {/* Long-press opens a menu rather than deleting outright, which also
          makes this consistent with Notes and Jobs. Delete still costs one
          extra tap than before, and Undo remains the safety net. */}
      <Sheet visible={actionsFor !== null} onClose={() => setActionsFor(null)}>
        <View style={styles.actions}>
          <Text variant="heading" numberOfLines={1}>
            {actionsFor?.categoryName ?? 'Uncategorised'}
          </Text>
          <Text variant="body" color="textMuted" numeric>
            {actionsFor === null ? '' : formatMoney(asPaise(actionsFor.amount))}
          </Text>

          <Divider spacingY="sm" />

          <Pressable
            onPress={() => actionsFor && handleEdit(actionsFor)}
            accessibilityRole="button"
            style={[styles.action, { backgroundColor: theme.colors.surfaceAlt }]}
          >
            <Icon name="create-outline" size={17} color="textMuted" />
            <Text variant="body">Edit</Text>
          </Pressable>

          <Pressable
            onPress={() => actionsFor && handleRepeat(actionsFor)}
            accessibilityRole="button"
            style={[styles.action, { backgroundColor: theme.colors.accentSoft }]}
          >
            <Icon name="repeat" size={17} color="accent" />
            <Text variant="body" style={{ color: theme.colors.accent }}>
              Repeat today
            </Text>
          </Pressable>

          <Pressable
            onPress={() => actionsFor && handleDelete(actionsFor)}
            accessibilityRole="button"
            style={[styles.action, { backgroundColor: theme.colors.negativeSoft }]}
          >
            <Icon name="trash-outline" size={17} color="negative" />
            <Text variant="body" style={{ color: theme.colors.negative }}>
              Delete
            </Text>
          </Pressable>
        </View>
      </Sheet>
    </Screen>
  );
}

function keyExtractor(row: LedgerRow): string {
  return row.kind === 'header' ? `h:${row.date}` : row.item.id;
}

function getItemType(row: LedgerRow): string {
  return row.kind;
}

function DayHeader({ label, dayNet }: { label: string; dayNet: number }) {
  const theme = useTheme();

  return (
    <View style={[styles.dayHeader, { backgroundColor: theme.colors.bg }]}>
      <Text variant="caption" color="textSubtle">
        {label.toUpperCase()}
      </Text>
      <Text variant="caption" color={dayNet < 0 ? 'textSubtle' : 'positive'} numeric>
        {formatMoney(asPaise(dayNet), { signed: dayNet > 0 })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  sectionLabel: { marginTop: spacing.sm, marginBottom: spacing.xs, paddingHorizontal: spacing.xs },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  empty: { paddingTop: spacing.giant, minHeight: 240 },
  actions: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
