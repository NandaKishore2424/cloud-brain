import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, Icon, Screen, Text, radii, spacing, useTheme } from '@/design';
import { asPaise, formatMoney } from '@/lib/money';

import { restoreTransaction, softDeleteTransaction, type TransactionListItem } from '../api';
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

/** How long the undo affordance stays on screen after a delete. */
const UNDO_WINDOW_MS = 6000;

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
export function MoneyScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const navigation = useMonthNavigation();
  const { rows, stickyIndices, isEmpty, isLoading } = useTransactions(navigation.range);
  const summary = useMonthSummary(navigation.range);
  const breakdown = useCategoryBreakdown(navigation.range);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [undoId, setUndoId] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearUndoTimer = useCallback(() => {
    if (undoTimer.current !== null) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
  }, []);

  useEffect(() => clearUndoTimer, [clearUndoTimer]);

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

      const result = await softDeleteTransaction(item.id);
      if (!result.ok) return;

      clearUndoTimer();
      setUndoId(item.id);
      undoTimer.current = setTimeout(() => setUndoId(null), UNDO_WINDOW_MS);
    },
    [clearUndoTimer],
  );

  const handleUndo = useCallback(async () => {
    if (undoId === null) return;
    clearUndoTimer();
    const id = undoId;
    setUndoId(null);
    void Haptics.selectionAsync();
    await restoreTransaction(id);
  }, [undoId, clearUndoTimer]);

  const openSheet = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => setSheetVisible(false), []);

  const renderItem = useCallback(
    ({ item }: { item: LedgerRow }) =>
      item.kind === 'header' ? (
        <DayHeader label={item.label} dayNet={item.dayNet} />
      ) : (
        <TransactionRow item={item.item} onLongPress={handleDelete} />
      ),
    [handleDelete],
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

      {undoId !== null ? (
        <Animated.View
          entering={FadeInDown.duration(theme.motion.fast)}
          exiting={FadeOutDown.duration(theme.motion.fast)}
          style={[
            styles.undoBar,
            {
              bottom: insets.bottom + spacing.lg,
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
            theme.elevation.high,
          ]}
        >
          <Text variant="body" color="textMuted">
            Transaction deleted
          </Text>
          <Pressable onPress={handleUndo} hitSlop={10} accessibilityRole="button">
            <Text variant="bodyMedium" style={{ color: theme.colors.accent }}>
              Undo
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}

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

      <AddTransactionSheet visible={sheetVisible} onClose={closeSheet} />
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
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.giant + spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    height: 48,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
