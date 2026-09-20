import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { TransactionType } from '@/db/schema';
import { Button, Icon, Sheet, Text, radii, spacing, useTheme } from '@/design';
import { addDays, todayDate, formatDayHeading, type CalendarDate } from '@/lib/date';
import { formatAmountInput, parseAmount } from '@/lib/money';

import { createTransaction, getDefaultAccountId } from '../api';
import { applyAmountKey, isSaveableAmount, type AmountKey } from '../amountInput';
import { useCategoriesByRecency } from '../hooks';
import { AmountKeypad } from './AmountKeypad';
import { CategoryPicker } from './CategoryPicker';
import { TypeToggle } from './TypeToggle';

export type AddTransactionSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Transaction entry.
 *
 * The product bet for Phase 1 is that recording an expense takes under five
 * seconds. Everything here serves that:
 *
 *  • **Amount is the only required field.** Type defaults to expense, date to
 *    today, category to the most recently used, account to the only one. The
 *    fast path is: open, tap digits, tap Save.
 *  • **Nothing is fetched on save.** The default account id is resolved when
 *    the sheet opens, so the save path is a single INSERT with no awaits in
 *    front of it.
 *  • **No navigation.** A sheet over the list, not a pushed screen — no
 *    transition to sit through in either direction.
 *  • **The list updates itself.** `useLiveQuery` is subscribed to SQLite's
 *    change events, so there is no refetch to wait for after the write.
 *
 * The note field deliberately swaps out the keypad while focused rather than
 * letting the system keyboard cover it. Two keyboards fighting for the same
 * space is the usual failure of this layout.
 */
export function AddTransactionSheet({ visible, onClose }: AddTransactionSheetProps) {
  const theme = useTheme();

  const [type, setType] = useState<TransactionType>('expense');
  const [buffer, setBuffer] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [occurredOn, setOccurredOn] = useState<CalendarDate>(() => todayDate());
  const [noteFocused, setNoteFocused] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useCategoriesByRecency(type);

  // Reset on open rather than on close, so the exit animation plays against the
  // values the user just saw instead of a blank form snapping into place.
  useEffect(() => {
    if (!visible) return;

    setType('expense');
    setBuffer('');
    setCategoryId(null);
    setNote('');
    setOccurredOn(todayDate());
    setNoteFocused(false);
    setSaving(false);
    setError(null);

    // Resolved now so `handleSave` has no async work ahead of the insert.
    void getDefaultAccountId().then((result) => {
      if (result.ok) setAccountId(result.value);
      else setError(result.error.message);
    });
  }, [visible]);

  // Pre-select the most recently used category. After a few days of real use
  // this is right most of the time, which removes a tap from the common path.
  // The chip is visibly highlighted directly above the keypad, so an incorrect
  // guess is obvious before saving rather than discovered later.
  useEffect(() => {
    if (categoryId !== null) return;
    const first = categories[0];
    if (first) setCategoryId(first.id);
  }, [categories, categoryId]);

  const handleTypeChange = useCallback((next: TransactionType) => {
    setType(next);
    // Categories are scoped to one side of the ledger, so the previous
    // selection is not valid for the new type. Clearing lets the effect above
    // pick this type's most recent.
    setCategoryId(null);
  }, []);

  const handleKey = useCallback((key: AmountKey) => {
    setError(null);
    setBuffer((current) => applyAmountKey(current, key));
  }, []);

  const handleClear = useCallback(() => setBuffer(''), []);

  const canGoForward = occurredOn < todayDate();

  const handlePreviousDay = useCallback(() => {
    void Haptics.selectionAsync();
    setOccurredOn((current) => addDays(current, -1));
  }, []);

  const handleNextDay = useCallback(() => {
    if (!canGoForward) return;
    void Haptics.selectionAsync();
    setOccurredOn((current) => addDays(current, 1));
  }, [canGoForward]);

  const canSave = isSaveableAmount(buffer) && accountId !== null && !saving;

  const handleSave = useCallback(async () => {
    const parsed = parseAmount(buffer);
    if (!parsed.ok) {
      setError(parsed.error.message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (accountId === null) {
      setError('No account available to save into');
      return;
    }

    setSaving(true);
    const result = await createTransaction({
      amount: parsed.value,
      type,
      accountId,
      categoryId,
      occurredOn,
      note,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error.message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  }, [buffer, accountId, type, categoryId, occurredOn, note, onClose]);

  const amountColor = useMemo(
    () =>
      buffer === ''
        ? theme.colors.textSubtle
        : type === 'income'
          ? theme.colors.positive
          : theme.colors.text,
    [buffer, type, theme.colors],
  );

  return (
    <Sheet visible={visible} onClose={onClose} dismissible={!saving}>
      <View style={styles.body}>
        <View style={styles.padded}>
          <TypeToggle value={type} onChange={handleTypeChange} />
        </View>

        <View style={styles.amountRow}>
          <Text variant="title" style={{ color: amountColor }}>
            {'₹'}
          </Text>
          <Text
            variant="display"
            numeric
            style={{ color: amountColor }}
            numberOfLines={1}
            adjustsFontSizeToFit
            accessibilityLabel={`Amount ${formatAmountInput(buffer)} rupees`}
          >
            {formatAmountInput(buffer)}
          </Text>
        </View>

        {error !== null ? (
          <View style={styles.padded}>
            <Text variant="label" color="negative" align="center">
              {error}
            </Text>
          </View>
        ) : null}

        <CategoryPicker
          categories={categories}
          selectedId={categoryId}
          onSelect={setCategoryId}
        />

        <View style={[styles.padded, styles.metaRow]}>
          <View
            style={[
              styles.noteField,
              { backgroundColor: theme.colors.surfaceAlt, borderColor: noteFocused ? theme.colors.accent : 'transparent' },
            ]}
          >
            <Icon name="create-outline" size={15} color="textSubtle" />
            <TextInput
              value={note}
              onChangeText={setNote}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setNoteFocused(false)}
              placeholder="Note"
              placeholderTextColor={theme.colors.textSubtle}
              returnKeyType="done"
              maxLength={140}
              style={[styles.noteInput, { color: theme.colors.text }]}
            />
          </View>

          <View style={[styles.dateStepper, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Pressable
              onPress={handlePreviousDay}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              style={styles.stepperButton}
            >
              <Icon name="chevron-back" size={16} color="textMuted" />
            </Pressable>
            <Text variant="label" color="textMuted" style={styles.dateLabel}>
              {formatDayHeading(occurredOn)}
            </Text>
            <Pressable
              onPress={handleNextDay}
              disabled={!canGoForward}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Next day"
              accessibilityState={{ disabled: !canGoForward }}
              style={[styles.stepperButton, { opacity: canGoForward ? 1 : 0.3 }]}
            >
              <Icon name="chevron-forward" size={16} color="textMuted" />
            </Pressable>
          </View>
        </View>

        {/* Hidden while the note is focused so the system keyboard has the
            space, instead of overlapping a keypad the user cannot reach. */}
        {noteFocused ? null : (
          <View style={styles.padded}>
            <AmountKeypad onKey={handleKey} onClear={handleClear} />
          </View>
        )}

        <View style={styles.padded}>
          <Button
            label={saving ? 'Saving' : 'Save'}
            onPress={handleSave}
            disabled={!canSave}
            loading={saving}
            fullWidth
            size="lg"
            accessibilityHint="Records this transaction"
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingTop: spacing.xs },
  padded: { paddingHorizontal: spacing.xl },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    minHeight: 52,
  },
  metaRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  noteField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  noteInput: { flex: 1, fontSize: 15, padding: 0 },
  dateStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xs,
  },
  stepperButton: { width: 30, height: 42, alignItems: 'center', justifyContent: 'center' },
  dateLabel: { minWidth: 62, textAlign: 'center' },
});
