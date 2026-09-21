import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { WorkLog } from '@/db/schema';
import {
  Button,
  Card,
  EmptyState,
  Icon,
  Screen,
  Text,
  UndoBar,
  radii,
  spacing,
  useTheme,
  useUndoTarget,
} from '@/design';
import {
  addDays,
  formatShortDate,
  formatWeekLabel,
  todayDate,
  type CalendarDate,
} from '@/lib/date';

import {
  createWorkLog,
  restoreWorkLog,
  softDeleteWorkLog,
  updateWorkLog,
} from '../api';
import { useWorkLog } from '../hooks';
import { buildAssistantPrompt, formatWeekForSharing, type WorkLogRow } from '../summary';

/**
 * Work log — what you did, captured at the end of the day, and turned into a
 * sprint update, appraisal material or CV bullets at the end of the week.
 *
 * Two decisions shape the screen (ADR 0014):
 *
 *  • VOICE IS THE KEYBOARD'S MIC. Android's keyboard already turns speech into
 *    text, offline on most devices, in every text field. A speech-recognition
 *    module would duplicate that and need a native build. So the input is a
 *    plain multiline field, with a hint pointing at the mic.
 *
 *  • AI IS A HAND-OFF, NOT A CALL. "Summarise with AI" builds a prompt from the
 *    week and opens the share sheet, and the person chooses Gemini, ChatGPT or
 *    anything else. No API key in the app, no server, no cost — and nothing
 *    about their work leaves the phone until they pick where it goes.
 *
 * The composer sits above the list rather than inside it: a TextInput inside a
 * virtualised list's header can be re-created as the list re-renders, which
 * drops focus and the keyboard mid-sentence.
 */
export function WorkLogScreen({ composeOnMount = false }: { composeOnMount?: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const log = useWorkLog();
  const undo = useUndoTarget();

  const input = useRef<TextInput>(null);
  const today = todayDate();

  const [body, setBody] = useState('');
  const [day, setDay] = useState<CalendarDate>(today);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setBody('');
    setDay(todayDate());
    setEditingId(null);
    setError(null);
  }, []);

  const { showDay } = log;

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);

    const entry = { body, loggedOn: day };
    const result =
      editingId === null ? await createWorkLog(entry) : await updateWorkLog(editingId, entry);

    setSaving(false);

    if (!result.ok) {
      setError(result.error.message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Saving an entry for a day outside the week on screen would otherwise
    // look like it vanished.
    showDay(day);
    reset();
  }, [body, day, editingId, showDay, reset]);

  const edit = useCallback((entry: WorkLog) => {
    void Haptics.selectionAsync();
    setEditingId(entry.id);
    setBody(entry.body);
    setDay(entry.loggedOn);
    setError(null);
    input.current?.focus();
  }, []);

  const remove = useCallback(async () => {
    if (editingId === null) return;
    const id = editingId;

    const result = await softDeleteWorkLog(id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    reset();
    undo.set(id);
  }, [editingId, reset, undo]);

  const share = useCallback(
    (build: typeof formatWeekForSharing) => {
      const message = build(log.entries, log.range);
      if (message === '') return;
      void Haptics.selectionAsync();
      void Share.share({ message });
    },
    [log.entries, log.range],
  );

  const renderItem = useCallback(
    ({ item }: { item: WorkLogRow<WorkLog> }) =>
      item.kind === 'header' ? (
        <DayHeader label={item.label} count={item.count} />
      ) : (
        <EntryRow entry={item.entry} isEditing={item.entry.id === editingId} onPress={edit} />
      ),
    [editingId, edit],
  );

  // Today and yesterday cover nearly every case; the day being edited is added
  // when it is neither, so an older entry's date is never silently changed.
  const yesterday = addDays(today, -1);
  const dayChoices = [today, yesterday, ...(day !== today && day !== yesterday ? [day] : [])];
  const hasEntries = log.entries.length > 0;

  return (
    <Screen gutter="none">
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            style={styles.back}
          >
            <Icon name="chevron-back" size={22} color="accent" />
          </Pressable>
          <Text variant="title">Work log</Text>
        </View>

        <Card padding="md" style={styles.composer}>
          <View style={styles.chips}>
            {dayChoices.map((choice) => (
              <DayChip
                key={choice}
                label={choice === today ? 'Today' : choice === yesterday ? 'Yesterday' : formatShortDate(choice)}
                selected={choice === day}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setDay(choice);
                }}
              />
            ))}
          </View>

          <TextInput
            ref={input}
            value={body}
            onChangeText={setBody}
            placeholder="What did you work on?"
            placeholderTextColor={theme.colors.textSubtle}
            multiline
            // Anchor the caret to the top; Android centres it vertically in a
            // multiline field by default, which reads as broken.
            textAlignVertical="top"
            autoFocus={composeOnMount}
            style={[
              styles.input,
              { color: theme.colors.text, borderColor: theme.colors.border },
            ]}
            accessibilityLabel="Work log entry"
          />

          <View style={styles.hintRow}>
            <Icon name="mic-outline" size={14} color="textSubtle" />
            <Text variant="caption" color="textSubtle" style={styles.flex}>
              Tap the mic on your keyboard to speak it instead.
            </Text>
          </View>

          {error !== null ? (
            <Text variant="caption" color="negative" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {editingId !== null ? (
              <>
                <Pressable
                  onPress={() => void remove()}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Delete entry"
                  style={styles.iconButton}
                >
                  <Icon name="trash-outline" size={19} color="textMuted" />
                </Pressable>
                <Button label="Cancel" variant="ghost" size="sm" onPress={reset} />
              </>
            ) : null}
            <View style={styles.flex} />
            <Button
              label={editingId === null ? 'Save' : 'Update'}
              size="sm"
              onPress={() => void save()}
              loading={saving}
              disabled={saving || body.trim() === ''}
            />
          </View>
        </Card>
      </View>

      <FlashList
        data={log.rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.giant }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.weekRow}>
              <Pressable
                onPress={log.previousWeek}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Previous week"
              >
                <Icon name="chevron-back" size={20} color="textMuted" />
              </Pressable>
              <Pressable
                onPress={log.thisWeek}
                disabled={log.isCurrentWeek}
                accessibilityRole="button"
                accessibilityLabel="Back to this week"
                style={styles.weekLabel}
              >
                <Text variant="bodyMedium" numeric>
                  {formatWeekLabel(log.range)}
                </Text>
                <Text variant="caption" color="textSubtle">
                  {log.isCurrentWeek ? 'THIS WEEK' : 'TAP FOR THIS WEEK'}
                </Text>
              </Pressable>
              <Pressable
                onPress={log.nextWeek}
                disabled={log.isCurrentWeek}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Next week"
                style={log.isCurrentWeek ? styles.disabled : null}
              >
                <Icon name="chevron-forward" size={20} color="textMuted" />
              </Pressable>
            </View>

            {hasEntries ? (
              <View style={styles.shareBlock}>
                <View style={styles.shareRow}>
                  <Button
                    label="Share week"
                    variant="secondary"
                    size="sm"
                    leading={<Icon name="share-outline" size={16} color="accent" />}
                    onPress={() => share(formatWeekForSharing)}
                    style={styles.flex}
                  />
                  <Button
                    label="Summarise with AI"
                    size="sm"
                    leading={<Icon name="sparkles-outline" size={16} color="textOnAccent" />}
                    onPress={() => share(buildAssistantPrompt)}
                    style={styles.flex}
                    accessibilityHint="Opens the share sheet with a ready-made prompt. Choose Gemini or ChatGPT."
                  />
                </View>
                <Text variant="caption" color="textSubtle">
                  Opens your share sheet — pick Gemini or ChatGPT. Nothing leaves your phone
                  until you do.
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          log.isLoading ? null : (
            <View style={styles.empty}>
              <EmptyState
                icon="briefcase-outline"
                title={log.isCurrentWeek ? 'Nothing logged this week' : 'Nothing logged that week'}
                hint={
                  log.isCurrentWeek
                    ? 'A line or two each evening is enough — Friday’s summary writes itself.'
                    : undefined
                }
              />
            </View>
          )
        }
      />

      <UndoBar
        target={undo.target}
        message="Entry deleted"
        onUndo={(id) => {
          void restoreWorkLog(id);
          undo.clear();
        }}
        onExpire={undo.clear}
        bottom={insets.bottom + spacing.lg}
      />
    </Screen>
  );
}

function keyExtractor(row: WorkLogRow<WorkLog>): string {
  return row.kind === 'header' ? `h:${row.date}` : row.entry.id;
}

function getItemType(row: WorkLogRow<WorkLog>): string {
  return row.kind;
}

function DayChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
        },
      ]}
    >
      <Text variant="label" style={{ color: selected ? theme.colors.accent : theme.colors.textMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

function DayHeader({ label, count }: { label: string; count: number }) {
  const theme = useTheme();

  return (
    <View style={[styles.dayHeader, { backgroundColor: theme.colors.bg }]}>
      <Text variant="caption" color="textSubtle">
        {label.toUpperCase()}
      </Text>
      <Text variant="caption" color="textSubtle" numeric>
        {count}
      </Text>
    </View>
  );
}

function EntryRow({
  entry,
  isEditing,
  onPress,
}: {
  entry: WorkLog;
  isEditing: boolean;
  onPress: (entry: WorkLog) => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => onPress(entry)}
      accessibilityRole="button"
      accessibilityHint="Edit this entry"
      style={({ pressed }) => [
        styles.entry,
        {
          backgroundColor: isEditing || pressed ? theme.colors.accentSoft : theme.colors.surface,
          borderColor: isEditing ? theme.colors.accent : theme.colors.border,
        },
      ]}
    >
      <Text variant="body">{entry.body}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { paddingHorizontal: spacing.lg },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  back: { paddingVertical: spacing.xs, paddingRight: spacing.xs },
  composer: { marginBottom: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    minHeight: 88,
    maxHeight: 180,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  error: { marginTop: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  iconButton: { padding: spacing.xs },
  listHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weekLabel: { flex: 1, alignItems: 'center', gap: 1 },
  disabled: { opacity: 0.3 },
  shareBlock: { gap: spacing.xs },
  shareRow: { flexDirection: 'row', gap: spacing.sm },
  empty: { paddingVertical: spacing.giant },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  entry: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
