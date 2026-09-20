import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Divider, EmptyState, Icon, Screen, Text, radii, spacing, useTheme } from '@/design';
import { formatShortDate, toCalendarDate, todayDate } from '@/lib/date';
import { asPaise, formatMoney, formatMoneyCompact } from '@/lib/money';

import { useDashboard, type DashboardFollowUp, type DashboardTodo } from '../hooks';
import { DevTools } from './DevTools';

/**
 * Home — what needs attention today, across every feature.
 *
 * Replaces the Phase 0 foundation-check screen. The ordering is by urgency, not
 * by feature: overdue work first, then today, then the month's money, then
 * anything glanceable. A dashboard organised by feature is a menu; organised by
 * urgency it is an answer to "what should I be doing".
 *
 * Every card is a link into its tab. Nothing here is editable — a dashboard
 * that is also an editor is two screens fighting for the same space.
 */
export function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const data = useDashboard();

  const greeting = greetingFor(new Date().getHours());
  const netIsNegative = data.monthNet < 0;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text variant="caption" color="textMuted">
          {formatShortDate(todayDate()).toUpperCase()}
        </Text>
        <Text variant="title">{greeting}</Text>
      </View>

      {data.isEmpty ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="sparkles-outline"
            title="Nothing here yet"
            hint="Record an expense, capture a task, or write a note — this fills in as you use it."
          />
        </View>
      ) : null}

      {data.overdueTodos.length > 0 || data.followUps.length > 0 ? (
        <Card padding="lg" style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="alert-circle" size={17} color="negative" />
            <Text variant="heading">Needs attention</Text>
          </View>

          {data.overdueTodos.length > 0 ? (
            <Pressable onPress={() => router.push('/todos')} style={styles.section}>
              <Text variant="caption" color="textSubtle">
                {data.overdueTodos.length} OVERDUE {data.overdueTodos.length === 1 ? 'TASK' : 'TASKS'}
              </Text>
              {data.overdueTodos.slice(0, 3).map((todo) => (
                <TodoLine key={todo.id} todo={todo} overdue />
              ))}
            </Pressable>
          ) : null}

          {data.overdueTodos.length > 0 && data.followUps.length > 0 ? (
            <Divider spacingY="md" />
          ) : null}

          {data.followUps.length > 0 ? (
            <Pressable onPress={() => router.push('/jobs')} style={styles.section}>
              <Text variant="caption" color="textSubtle">
                {data.followUps.length} {data.followUps.length === 1 ? 'FOLLOW-UP' : 'FOLLOW-UPS'} DUE
              </Text>
              {data.followUps.slice(0, 3).map((item) => (
                <FollowUpLine key={item.id} item={item} />
              ))}
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      <Pressable onPress={() => router.push('/todos')}>
        <Card padding="lg" style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="checkbox-outline" size={17} color="accent" />
            <Text variant="heading">Today</Text>
            <View style={styles.spacer} />
            <Text variant="caption" color="textSubtle" numeric>
              {data.openTodos} OPEN
            </Text>
          </View>

          {data.dueToday.length === 0 ? (
            <Text variant="body" color="textMuted" style={styles.quiet}>
              {data.openTodos === 0
                ? 'No tasks captured.'
                : 'Nothing due today.'}
            </Text>
          ) : (
            <View style={styles.section}>
              {data.dueToday.slice(0, 4).map((todo) => (
                <TodoLine key={todo.id} todo={todo} />
              ))}
              {data.dueToday.length > 4 ? (
                <Text variant="caption" color="textSubtle">
                  +{data.dueToday.length - 4} more
                </Text>
              ) : null}
            </View>
          )}
        </Card>
      </Pressable>

      <Pressable onPress={() => router.push('/money')}>
        <Card padding="lg" style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="wallet-outline" size={17} color="positive" />
            <Text variant="heading">This month</Text>
          </View>

          <Text
            variant="display"
            numeric
            style={[
              styles.net,
              { color: netIsNegative ? theme.colors.negative : theme.colors.positive },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatMoney(asPaise(data.monthNet))}
          </Text>

          <View style={styles.moneyRow}>
            <MoneyStat label="IN" value={data.monthIncome} tone="positive" />
            <MoneyStat label="OUT" value={data.monthExpense} tone="negative" />
            <MoneyStat label="TODAY" value={data.spentToday} tone="muted" />
          </View>
        </Card>
      </Pressable>

      {data.activeApplications > 0 ? (
        <Pressable onPress={() => router.push('/jobs')}>
          <Card padding="lg" style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="briefcase-outline" size={17} color="accent" />
              <Text variant="heading">Job hunt</Text>
              <View style={styles.spacer} />
              <Text variant="caption" color="textSubtle" numeric>
                {data.activeApplications} ACTIVE
              </Text>
            </View>
            <Text variant="body" color="textMuted" style={styles.quiet}>
              {data.followUps.length === 0
                ? 'No follow-ups due.'
                : `${data.followUps.length} waiting on you.`}
            </Text>
          </Card>
        </Pressable>
      ) : null}

      {data.notes.length > 0 ? (
        <Card padding="lg" style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="document-text-outline" size={17} color="accent" />
            <Text variant="heading">Recent notes</Text>
          </View>

          <View style={styles.section}>
            {data.notes.map((note) => (
              <Pressable
                key={note.id}
                onPress={() => router.push(`/note/${note.id}`)}
                style={styles.noteLine}
                accessibilityRole="button"
              >
                {note.pinnedAt !== null ? (
                  <Icon name="pin" size={12} color="accent" />
                ) : (
                  <View style={[styles.bullet, { backgroundColor: theme.colors.border }]} />
                )}
                <Text variant="body" numberOfLines={1} style={styles.flex}>
                  {note.title.trim().length > 0 ? note.title : 'Untitled'}
                </Text>
                <Text variant="caption" color="textSubtle" numeric>
                  {/* The row stores an instant; the label wants a calendar day,
                      converted from LOCAL components so it cannot drift a day. */}
                  {formatShortDate(toCalendarDate(new Date(note.updatedAt)))}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}

      {__DEV__ ? <DevTools /> : null}
    </Screen>
  );
}

function greetingFor(hour: number): string {
  if (hour < 5) return 'Still up?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Winding down';
}

function TodoLine({ todo, overdue = false }: { todo: DashboardTodo; overdue?: boolean }) {
  const theme = useTheme();

  return (
    <View style={styles.line}>
      <View
        style={[
          styles.bullet,
          {
            backgroundColor:
              todo.priority === 'high' ? theme.colors.negative : theme.colors.border,
          },
        ]}
      />
      <Text variant="body" numberOfLines={1} style={styles.flex}>
        {todo.title}
      </Text>
      {overdue && todo.dueOn !== null ? (
        <Text variant="caption" color="negative" numeric>
          {formatShortDate(todo.dueOn)}
        </Text>
      ) : null}
    </View>
  );
}

function FollowUpLine({ item }: { item: DashboardFollowUp }) {
  const theme = useTheme();

  return (
    <View style={styles.line}>
      <View style={[styles.bullet, { backgroundColor: theme.colors.negative }]} />
      <Text variant="body" numberOfLines={1} style={styles.flex}>
        {item.company}
        {item.nextAction !== null ? (
          <Text variant="body" color="textMuted">
            {' — '}
            {item.nextAction}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

function MoneyStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'positive' | 'negative' | 'muted';
}) {
  const theme = useTheme();
  const color =
    tone === 'positive'
      ? theme.colors.positive
      : tone === 'negative'
        ? theme.colors.negative
        : theme.colors.textMuted;

  return (
    <View style={styles.moneyStat}>
      <Text variant="caption" color="textSubtle">
        {label}
      </Text>
      <Text variant="bodyMedium" numeric style={{ color }}>
        {formatMoneyCompact(asPaise(value))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xxs },
  emptyWrap: { paddingVertical: spacing.giant },
  card: { marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  spacer: { flex: 1 },
  section: { gap: spacing.sm, marginTop: spacing.md },
  quiet: { marginTop: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noteLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bullet: { width: 6, height: 6, borderRadius: radii.pill },
  flex: { flex: 1 },
  net: { marginTop: spacing.md },
  moneyRow: { flexDirection: 'row', gap: spacing.xxl, marginTop: spacing.md },
  moneyStat: { gap: 1 },
});
