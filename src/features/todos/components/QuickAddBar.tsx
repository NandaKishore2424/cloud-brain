import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { TodoPriority } from '@/db/schema';
import { Icon, Text, radii, spacing, useTheme } from '@/design';
import { addDays, todayDate, type CalendarDate } from '@/lib/date';

export type QuickAddSubmission = {
  title: string;
  dueOn: CalendarDate | null;
  priority: TodoPriority;
};

export type QuickAddBarProps = {
  onSubmit: (submission: QuickAddSubmission) => Promise<boolean>;
  /** Active project filter. New tasks inherit it. */
  activeProject: string | null;
};

/**
 * Always-visible composer, pinned below the list.
 *
 * Same principle as the money keypad: **title is the only required field.**
 * Everything else has a default, and the quick chips are there for the cases
 * where the default is wrong — not as a form to fill in.
 *
 * It stays on screen rather than hiding behind a button, because the cost of
 * capturing a task has to be lower than the cost of deciding to capture it. A
 * task you have to open something to record is a task that stays in your head.
 *
 * Positioned in normal flow rather than absolutely. Android's `adjustResize`
 * shrinks the window when the keyboard opens, so a flex layout puts this
 * directly above the keyboard with no `KeyboardAvoidingView` and no measuring.
 */
export function QuickAddBar({ onSubmit, activeProject }: QuickAddBarProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);

  const [title, setTitle] = useState('');
  const [focused, setFocused] = useState(false);
  const [dueOn, setDueOn] = useState<CalendarDate | null>(null);
  const [priority, setPriority] = useState<TodoPriority>('normal');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = title.trim().length > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    const saved = await onSubmit({ title, dueOn, priority });
    setSubmitting(false);

    if (!saved) return;

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Clear the title but KEEP due date and priority. Tasks get captured in
    // runs — three things due tomorrow, in one sitting — so resetting the
    // modifiers after each save would mean re-picking them every time.
    setTitle('');

    // Keep focus so the next task can be typed immediately. This is what makes
    // capturing a list of five things one continuous action instead of five.
    inputRef.current?.focus();
  }, [canSubmit, onSubmit, title, dueOn, priority]);

  const toggleDue = useCallback((value: CalendarDate | null) => {
    void Haptics.selectionAsync();
    setDueOn((current) => (current === value ? null : value));
  }, []);

  const togglePriority = useCallback(() => {
    void Haptics.selectionAsync();
    setPriority((current) => (current === 'high' ? 'normal' : 'high'));
  }, []);

  const today = todayDate();
  const tomorrow = addDays(today, 1);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
      ]}
    >
      {focused ? (
        <View style={styles.chips}>
          <QuickChip
            label="Today"
            icon="today-outline"
            active={dueOn === today}
            onPress={() => toggleDue(today)}
          />
          <QuickChip
            label="Tomorrow"
            icon="arrow-forward-outline"
            active={dueOn === tomorrow}
            onPress={() => toggleDue(tomorrow)}
          />
          <QuickChip
            label="High"
            icon="flag-outline"
            active={priority === 'high'}
            tone="negative"
            onPress={togglePriority}
          />
          {activeProject !== null ? (
            <View style={[styles.inherited, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Icon name="folder-outline" size={12} color="textSubtle" />
              <Text variant="caption" color="textSubtle" numberOfLines={1}>
                {activeProject}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <View
          style={[
            styles.field,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: focused ? theme.colors.accent : 'transparent',
            },
          ]}
        >
          <Icon name="add" size={18} color={focused ? 'accent' : 'textSubtle'} />
          <TextInput
            ref={inputRef}
            value={title}
            onChangeText={setTitle}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Add a task"
            placeholderTextColor={theme.colors.textSubtle}
            returnKeyType="done"
            // Keeps the keyboard up after submitting so consecutive tasks can
            // be typed without re-tapping the field.
            submitBehavior="submit"
            onSubmitEditing={handleSubmit}
            maxLength={200}
            style={[styles.input, { color: theme.colors.text }]}
            accessibilityLabel="New task title"
          />
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Add task"
          accessibilityState={{ disabled: !canSubmit }}
          style={({ pressed }) => [
            styles.send,
            {
              backgroundColor: canSubmit ? theme.colors.accent : theme.colors.surfaceAlt,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Icon
            name="arrow-up"
            size={18}
            color={canSubmit ? 'textOnAccent' : 'textSubtle'}
          />
        </Pressable>
      </View>
    </View>
  );
}

type QuickChipProps = {
  label: string;
  icon: 'today-outline' | 'arrow-forward-outline' | 'flag-outline';
  active: boolean;
  tone?: 'accent' | 'negative';
  onPress: () => void;
};

function QuickChip({ label, icon, active, tone = 'accent', onPress }: QuickChipProps) {
  const theme = useTheme();
  const activeColor = tone === 'negative' ? theme.colors.negative : theme.colors.accent;
  const activeBackground =
    tone === 'negative' ? theme.colors.negativeSoft : theme.colors.accentSoft;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        {
          backgroundColor: active ? activeBackground : theme.colors.surfaceAlt,
          borderColor: active ? activeColor : 'transparent',
        },
      ]}
    >
      <Icon name={icon} size={12} color={active ? (tone === 'negative' ? 'negative' : 'accent') : 'textMuted'} />
      <Text
        variant="caption"
        style={{ color: active ? activeColor : theme.colors.textMuted }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  inherited: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radii.pill,
    maxWidth: 140,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 15, padding: 0 },
  send: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
