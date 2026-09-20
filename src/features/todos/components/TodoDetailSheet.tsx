import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import type { TodoPriority } from '@/db/schema';
import { Button, Divider, Icon, Sheet, Text, radii, spacing, useTheme } from '@/design';
import { addDays, formatDayHeading, todayDate, type CalendarDate } from '@/lib/date';

import type { TodoListItem, UpdateTodoPatch } from '../api';

export type TodoDetailSheetProps = {
  /** The task being edited, or null when the sheet is closed. */
  todo: TodoListItem | null;
  onClose: () => void;
  onSave: (id: string, patch: UpdateTodoPatch) => Promise<boolean>;
  onDelete: (todo: TodoListItem) => void;
  onMove: (todo: TodoListItem, direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

const PRIORITIES: readonly { value: TodoPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

/**
 * Task detail and edit.
 *
 * Explicit Save rather than saving on every change. A mixed model — toggles
 * applying instantly while text needs confirming — is the confusing option,
 * and silently persisting every keystroke makes "I opened this to look at it"
 * indistinguishable from "I meant to change it".
 *
 * Local draft state is seeded from the todo whenever the sheet opens, so
 * dismissing without saving genuinely discards the edit.
 */
export function TodoDetailSheet({
  todo,
  onClose,
  onSave,
  onDelete,
  onMove,
  canMoveUp,
  canMoveDown,
}: TodoDetailSheetProps) {
  const theme = useTheme();

  const [title, setTitle] = useState('');
  const [project, setProject] = useState('');
  const [details, setDetails] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('normal');
  const [dueOn, setDueOn] = useState<CalendarDate | null>(null);
  const [saving, setSaving] = useState(false);

  // Keyed on id rather than on the todo object: `useLiveQuery` hands back a new
  // object on every committed write anywhere in the app, so depending on the
  // object would reset the draft mid-edit whenever an unrelated row changed.
  useEffect(() => {
    if (todo === null) return;
    setTitle(todo.title);
    setProject(todo.project ?? '');
    setDetails(todo.details ?? '');
    setPriority(todo.priority);
    setDueOn(todo.dueOn);
    setSaving(false);
  }, [todo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (todo === null) return;
    setSaving(true);
    const saved = await onSave(todo.id, { title, project, details, priority, dueOn });
    setSaving(false);
    if (saved) onClose();
  };

  const today = todayDate();
  const canSave = title.trim().length > 0 && !saving;

  return (
    <Sheet visible={todo !== null} onClose={onClose} dismissible={!saving}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Field label="TASK">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What needs doing?"
            placeholderTextColor={theme.colors.textSubtle}
            multiline
            maxLength={200}
            style={[styles.titleInput, { color: theme.colors.text }]}
            accessibilityLabel="Task title"
          />
        </Field>

        <Field label="DUE">
          <View style={styles.chipRow}>
            <SelectChip label="None" active={dueOn === null} onPress={() => setDueOn(null)} />
            <SelectChip
              label="Today"
              active={dueOn === today}
              onPress={() => setDueOn(today)}
            />
            <SelectChip
              label="Tomorrow"
              active={dueOn === addDays(today, 1)}
              onPress={() => setDueOn(addDays(today, 1))}
            />
          </View>

          {dueOn !== null ? (
            <View style={[styles.stepper, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Pressable
                onPress={() => setDueOn(addDays(dueOn, -1))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Earlier by one day"
                style={styles.stepperButton}
              >
                <Icon name="chevron-back" size={16} color="textMuted" />
              </Pressable>
              <Text variant="label" color="textMuted" style={styles.stepperLabel}>
                {formatDayHeading(dueOn)}
              </Text>
              <Pressable
                onPress={() => setDueOn(addDays(dueOn, 1))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Later by one day"
                style={styles.stepperButton}
              >
                <Icon name="chevron-forward" size={16} color="textMuted" />
              </Pressable>
            </View>
          ) : null}
        </Field>

        <Field label="PRIORITY">
          <View style={styles.chipRow}>
            {PRIORITIES.map((option) => (
              <SelectChip
                key={option.value}
                label={option.label}
                active={priority === option.value}
                tone={option.value === 'high' ? 'negative' : 'accent'}
                onPress={() => setPriority(option.value)}
              />
            ))}
          </View>
        </Field>

        <Field label="PROJECT">
          <TextInput
            value={project}
            onChangeText={setProject}
            placeholder="None"
            placeholderTextColor={theme.colors.textSubtle}
            maxLength={60}
            style={[styles.lineInput, { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt }]}
            accessibilityLabel="Project"
          />
        </Field>

        <Field label="NOTES">
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Anything worth remembering"
            placeholderTextColor={theme.colors.textSubtle}
            multiline
            maxLength={2000}
            style={[
              styles.multilineInput,
              { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt },
            ]}
            accessibilityLabel="Notes"
          />
        </Field>

        <Divider spacingY="sm" />

        <View style={styles.actionRow}>
          <SmallAction
            icon="arrow-up"
            label="Move up"
            disabled={!canMoveUp}
            onPress={() => todo && onMove(todo, -1)}
          />
          <SmallAction
            icon="arrow-down"
            label="Move down"
            disabled={!canMoveDown}
            onPress={() => todo && onMove(todo, 1)}
          />
          <SmallAction
            icon="trash-outline"
            label="Delete"
            tone="negative"
            onPress={() => todo && onDelete(todo)}
          />
        </View>

        <Button
          label={saving ? 'Saving' : 'Save'}
          onPress={handleSave}
          disabled={!canSave}
          loading={saving}
          fullWidth
          size="lg"
          style={styles.save}
        />
      </ScrollView>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="caption" color="textSubtle">
        {label}
      </Text>
      {children}
    </View>
  );
}

type SelectChipProps = {
  label: string;
  active: boolean;
  tone?: 'accent' | 'negative';
  onPress: () => void;
};

function SelectChip({ label, active, tone = 'accent', onPress }: SelectChipProps) {
  const theme = useTheme();
  const color = tone === 'negative' ? theme.colors.negative : theme.colors.accent;
  const background =
    tone === 'negative' ? theme.colors.negativeSoft : theme.colors.accentSoft;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.selectChip,
        {
          backgroundColor: active ? background : theme.colors.surfaceAlt,
          borderColor: active ? color : 'transparent',
        },
      ]}
    >
      <Text variant="label" style={{ color: active ? color : theme.colors.textMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

type SmallActionProps = {
  icon: 'arrow-up' | 'arrow-down' | 'trash-outline';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'negative';
};

function SmallAction({
  icon,
  label,
  onPress,
  disabled = false,
  tone = 'default',
}: SmallActionProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[
        styles.smallAction,
        {
          backgroundColor:
            tone === 'negative' ? theme.colors.negativeSoft : theme.colors.surfaceAlt,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Icon name={icon} size={15} color={tone === 'negative' ? 'negative' : 'textMuted'} />
      <Text
        variant="label"
        style={{
          color: tone === 'negative' ? theme.colors.negative : theme.colors.textMuted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: '100%' },
  body: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.lg },
  field: { gap: spacing.sm },
  titleInput: { fontSize: 19, lineHeight: 25, padding: 0, minHeight: 28 },
  lineInput: {
    fontSize: 15,
    height: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  multilineInput: {
    fontSize: 15,
    minHeight: 76,
    padding: spacing.md,
    borderRadius: radii.md,
    textAlignVertical: 'top',
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  selectChip: {
    paddingHorizontal: spacing.lg,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: 38,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xs,
  },
  stepperButton: { width: 32, height: 38, alignItems: 'center', justifyContent: 'center' },
  stepperLabel: { minWidth: 76, textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  smallAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 40,
    borderRadius: radii.md,
  },
  save: { marginTop: spacing.xs },
});
