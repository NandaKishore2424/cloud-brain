import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ApplicationStatus } from '@/db/schema';
import { Card, Divider, Icon, Text, radii, spacing, useTheme } from '@/design';
import {
  addDays,
  formatDayHeading,
  formatShortDate,
  todayDate,
  type CalendarDate,
} from '@/lib/date';
import { asPaise, formatMoney } from '@/lib/money';

import {
  addApplicationEvent,
  setApplicationStatus,
  updateApplication,
  type TimelineEvent,
} from '../api';
import { useApplication } from '../hooks';
import { STATUS_LABELS, STATUS_ORDER, STATUS_TOKENS, advanceStatus } from '../pipeline';

export type ApplicationDetailScreenProps = { id: string };

type NextActionOption = { label: string; value: CalendarDate | null };

/** Relative presets rather than a date picker — these cover almost every
 *  real follow-up, and a picker is three taps for the same result. */
const NEXT_ACTION_OPTIONS = (today: CalendarDate): NextActionOption[] => [
  { label: 'None', value: null },
  { label: 'Today', value: today },
  { label: 'In 3 days', value: addDays(today, 3) },
  { label: 'Next week', value: addDays(today, 7) },
];

/**
 * One application: stage, details, and its timeline.
 *
 * A full-screen route rather than a sheet, for the same reason as the note
 * editor — this is read and worked through, not captured in seconds.
 *
 * Changing the stage writes a timeline event automatically, so the history is a
 * by-product of using the tracker rather than something maintained by hand.
 * That is the whole point of the feature: six months later, "when did they
 * first reply" is a query, not a memory.
 */
export function ApplicationDetailScreen({ id }: ApplicationDetailScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { application, events, isLoading } = useApplication(id);

  const [nextAction, setNextAction] = useState('');
  const [nextActionOn, setNextActionOn] = useState<CalendarDate | null>(null);
  const [entry, setEntry] = useState('');
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || application === undefined) return;
    setNextAction(application.nextAction ?? '');
    setNextActionOn(application.nextActionOn);
    setSeeded(true);
  }, [application, seeded]);

  const handleStatus = useCallback(
    async (status: ApplicationStatus) => {
      if (application === undefined || application.status === status) return;
      void Haptics.selectionAsync();
      await setApplicationStatus(id, status);
    },
    [application, id],
  );

  const handleSaveNextAction = useCallback(async () => {
    await updateApplication(id, { nextAction, nextActionOn });
    void Haptics.selectionAsync();
  }, [id, nextAction, nextActionOn]);

  const handleAddEntry = useCallback(async () => {
    if (entry.trim().length === 0) return;
    const result = await addApplicationEvent(id, 'note', entry);
    if (result.ok) {
      setEntry('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [entry, id]);

  if (isLoading || application === undefined) {
    return <View style={[styles.root, { backgroundColor: theme.colors.bg }]} />;
  }

  const next = advanceStatus(application.status);
  const today = todayDate();

  return (
    <View
      style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to applications"
          style={styles.headerButton}
        >
          <Icon name="chevron-back" size={22} color="accent" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + spacing.giant },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <Text variant="title" numberOfLines={2}>
            {application.company}
          </Text>
          <Text variant="body" color="textMuted">
            {application.role}
          </Text>
          <Text variant="caption" color="textSubtle">
            APPLIED {formatShortDate(application.appliedOn).toUpperCase()}
            {application.location !== null ? ` · ${application.location.toUpperCase()}` : ''}
            {application.source !== null ? ` · ${application.source.toUpperCase()}` : ''}
          </Text>
        </View>

        {/* Quick advance is the common case — most stage changes are forward
            by one, so it gets a single tap instead of finding the chip. */}
        {next !== null ? (
          <Pressable
            onPress={() => handleStatus(next)}
            accessibilityRole="button"
            style={[styles.advance, { backgroundColor: theme.colors.accentSoft }]}
          >
            <Icon name="arrow-forward-circle" size={18} color="accent" />
            <Text variant="bodyMedium" style={{ color: theme.colors.accent }}>
              Move to {STATUS_LABELS[next]}
            </Text>
          </Pressable>
        ) : null}

        <Card padding="lg">
          <Text variant="caption" color="textSubtle">
            STAGE
          </Text>
          <View style={styles.statusGrid}>
            {STATUS_ORDER.map((status) => {
              const active = application.status === status;
              const token = STATUS_TOKENS[status];
              return (
                <Pressable
                  key={status}
                  onPress={() => handleStatus(status)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.statusChip,
                    {
                      backgroundColor: active
                        ? theme.colors.accentSoft
                        : theme.colors.surfaceAlt,
                      borderColor: active ? theme.colors.accent : 'transparent',
                    },
                  ]}
                >
                  <View style={[styles.dot, { backgroundColor: theme.colors[token] }]} />
                  <Text
                    variant="label"
                    style={{
                      color: active ? theme.colors.accent : theme.colors.textMuted,
                    }}
                  >
                    {STATUS_LABELS[status]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card padding="lg">
          <Text variant="caption" color="textSubtle">
            NEXT ACTION
          </Text>
          <TextInput
            value={nextAction}
            onChangeText={setNextAction}
            onBlur={handleSaveNextAction}
            placeholder="Follow up, send thank-you note…"
            placeholderTextColor={theme.colors.textSubtle}
            maxLength={120}
            style={[
              styles.input,
              { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt },
            ]}
            accessibilityLabel="Next action"
          />

          <View style={styles.dateRow}>
            {NEXT_ACTION_OPTIONS(today).map((option) => {
              const active = nextActionOn === option.value;
              return (
                <Pressable
                  key={option.label}
                  onPress={() => {
                    setNextActionOn(option.value);
                    void updateApplication(id, {
                      nextAction,
                      nextActionOn: option.value,
                    });
                    void Haptics.selectionAsync();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.dateChip,
                    {
                      backgroundColor: active
                        ? theme.colors.accentSoft
                        : theme.colors.surfaceAlt,
                      borderColor: active ? theme.colors.accent : 'transparent',
                    },
                  ]}
                >
                  <Text
                    variant="caption"
                    style={{
                      color: active ? theme.colors.accent : theme.colors.textMuted,
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {nextActionOn !== null ? (
            <Text variant="caption" color="textSubtle" style={styles.dueHint}>
              Due {formatDayHeading(nextActionOn)}
            </Text>
          ) : null}
        </Card>

        {application.salaryMax !== null || application.salaryMin !== null ? (
          <Card padding="lg">
            <Text variant="caption" color="textSubtle">
              SALARY RANGE
            </Text>
            <Text variant="heading" numeric style={styles.salary}>
              {application.salaryMin !== null
                ? formatMoney(asPaise(application.salaryMin))
                : '?'}
              {' – '}
              {application.salaryMax !== null
                ? formatMoney(asPaise(application.salaryMax))
                : '?'}
            </Text>
          </Card>
        ) : null}

        <Card padding="lg">
          <Text variant="caption" color="textSubtle">
            TIMELINE
          </Text>

          <View style={styles.timeline}>
            {events.map((event, index) => (
              <TimelineRow
                key={event.id}
                event={event}
                isLast={index === events.length - 1}
              />
            ))}
          </View>

          <Divider spacingY="md" />

          <View style={styles.entryRow}>
            <TextInput
              value={entry}
              onChangeText={setEntry}
              placeholder="Add an entry"
              placeholderTextColor={theme.colors.textSubtle}
              maxLength={200}
              onSubmitEditing={handleAddEntry}
              returnKeyType="done"
              style={[
                styles.entryInput,
                { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt },
              ]}
              accessibilityLabel="New timeline entry"
            />
            <Pressable
              onPress={handleAddEntry}
              disabled={entry.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel="Add entry"
              style={[
                styles.entryButton,
                {
                  backgroundColor:
                    entry.trim().length > 0
                      ? theme.colors.accent
                      : theme.colors.surfaceAlt,
                },
              ]}
            >
              <Icon
                name="arrow-up"
                size={16}
                color={entry.trim().length > 0 ? 'textOnAccent' : 'textSubtle'}
              />
            </Pressable>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

function TimelineRow({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const theme = useTheme();

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineGutter}>
        <View style={[styles.timelineDot, { backgroundColor: theme.colors.accent }]} />
        {!isLast ? (
          <View style={[styles.timelineLine, { backgroundColor: theme.colors.border }]} />
        ) : null}
      </View>

      <View style={styles.timelineBody}>
        <Text variant="body" numberOfLines={3}>
          {event.note ?? STATUS_LABELS.applied}
        </Text>
        <Text variant="caption" color="textSubtle" numeric>
          {formatShortDate(event.happenedOn)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
  titleBlock: { gap: spacing.xxs, paddingBottom: spacing.xs },
  advance: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radii.md,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: radii.pill },
  input: {
    fontSize: 15,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.md,
  },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  dateChip: {
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueHint: { marginTop: spacing.sm },
  salary: { marginTop: spacing.xs },
  timeline: { marginTop: spacing.md },
  timelineRow: { flexDirection: 'row', gap: spacing.md },
  timelineGutter: { alignItems: 'center', width: 10 },
  timelineDot: { width: 8, height: 8, borderRadius: radii.pill, marginTop: 5 },
  timelineLine: { width: StyleSheet.hairlineWidth, flex: 1, marginVertical: 2 },
  timelineBody: { flex: 1, paddingBottom: spacing.md, gap: 1 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  entryInput: {
    flex: 1,
    fontSize: 15,
    height: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  entryButton: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
