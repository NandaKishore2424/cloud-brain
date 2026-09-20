import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
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
import { todayDate } from '@/lib/date';

import {
  createTodo,
  moveTodo,
  rescheduleOverdue,
  restoreTodo,
  setTodoCompleted,
  softDeleteTodo,
  updateTodo,
  type TodoListItem,
  type UpdateTodoPatch,
} from '../api';
import { bucketFor, type TodoBucketKey, type TodoRow as Row } from '../grouping';
import { useCompletedTodos, useProjects, useTodos } from '../hooks';
import { FilterBar, type TodoView } from './FilterBar';
import { QuickAddBar, type QuickAddSubmission } from './QuickAddBar';
import { TodoDetailSheet } from './TodoDetailSheet';
import { TodoRow } from './TodoRow';

/**
 * The Todos tab.
 *
 * Composition root: owns view/filter state and the detail sheet, and wires the
 * reactive hooks to presentational components. Same structure as `MoneyScreen`
 * — consistency between features is worth more here than any local cleverness,
 * because it means Phase 3 has a pattern to follow rather than a decision to
 * re-make.
 *
 * Layout is a flex column rather than an absolutely positioned composer.
 * Android's `adjustResize` shrinks the window when the keyboard opens, so the
 * quick-add bar lands directly above it with no `KeyboardAvoidingView` and no
 * measuring.
 */
export type TodosScreenProps = {
  /** Focus the quick-add field on arrival. Set by `?compose=1`. */
  composeOnMount?: boolean;
};

export function TodosScreen({ composeOnMount = false }: TodosScreenProps) {
  const insets = useSafeAreaInsets();

  const [view, setView] = useState<TodoView>('open');
  const [project, setProject] = useState<string | null>(null);
  const [detail, setDetail] = useState<TodoListItem | null>(null);

  const { rows, stickyIndices, overdueCount, openCount, isEmpty, isLoading } =
    useTodos(project);
  const completed = useCompletedTodos();
  const projects = useProjects();
  const undo = useUndoTarget();

  /**
   * Bucket membership, rebuilt from the flattened rows in one pass.
   *
   * Reordering is only meaningful within a bucket — moving a task "up" past a
   * date heading would have to silently change its due date, which is not what
   * the gesture means. So moves are resolved against the bucket the task is
   * actually in.
   */
  const buckets = useMemo(() => {
    const map = new Map<TodoBucketKey, TodoListItem[]>();
    let current: TodoBucketKey | null = null;

    for (const row of rows) {
      if (row.kind === 'header') {
        current = row.bucket;
        map.set(current, []);
      } else if (current !== null) {
        map.get(current)?.push(row.item);
      }
    }

    return map;
  }, [rows]);

  const bucketFor_ = useCallback(
    (todo: TodoListItem) => buckets.get(bucketFor(todo.dueOn, todayDate())) ?? [],
    [buckets],
  );

  const handleQuickAdd = useCallback(
    async (submission: QuickAddSubmission) => {
      const result = await createTodo({
        title: submission.title,
        dueOn: submission.dueOn,
        priority: submission.priority,
        // Inherit the active filter: adding a task while looking at one project
        // almost always means it belongs to that project.
        project,
      });
      return result.ok;
    },
    [project],
  );

  const handleToggle = useCallback(async (todo: TodoListItem) => {
    await setTodoCompleted(todo.id, todo.completedAt === null);
  }, []);

  const handleDelete = useCallback(
    async (todo: TodoListItem) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setDetail(null);

      const result = await softDeleteTodo(todo.id);
      if (result.ok) undo.set(todo.id);
    },
    [undo],
  );

  const handleUndo = useCallback(
    async (id: string) => {
      undo.clear();
      void Haptics.selectionAsync();
      await restoreTodo(id);
    },
    [undo],
  );

  /**
   * Move the whole overdue pile to today.
   *
   * Triage in one tap. Rescheduling eleven tasks individually is the friction
   * that makes people abandon a todo list rather than maintain it.
   */
  const handleRescheduleOverdue = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await rescheduleOverdue(todayDate(), todayDate());
  }, []);

  const handleSave = useCallback(async (id: string, patch: UpdateTodoPatch) => {
    const result = await updateTodo(id, patch);
    return result.ok;
  }, []);

  const handleMove = useCallback(
    async (todo: TodoListItem, direction: -1 | 1) => {
      const bucket = bucketFor_(todo);
      const from = bucket.findIndex((candidate) => candidate.id === todo.id);
      if (from < 0) return;

      const to = from + direction;
      if (to < 0 || to >= bucket.length) return;

      void Haptics.selectionAsync();
      await moveTodo(
        bucket.map((item) => ({ id: item.id, sortOrder: item.sortOrder })),
        from,
        to,
      );
    },
    [bucketFor_],
  );

  const detailPosition = useMemo(() => {
    if (detail === null) return { canMoveUp: false, canMoveDown: false };
    const bucket = bucketFor_(detail);
    const index = bucket.findIndex((candidate) => candidate.id === detail.id);
    return {
      canMoveUp: index > 0,
      canMoveDown: index >= 0 && index < bucket.length - 1,
    };
  }, [detail, bucketFor_]);

  const renderOpenItem = useCallback(
    ({ item }: { item: Row<TodoListItem> }) =>
      item.kind === 'header' ? (
        <BucketHeader
          label={item.label}
          count={item.count}
          onReschedule={
            item.bucket === 'overdue' ? handleRescheduleOverdue : undefined
          }
        />
      ) : (
        <TodoRow item={item.item} onToggle={handleToggle} onOpen={setDetail} />
      ),
    [handleToggle, handleRescheduleOverdue],
  );

  const renderDoneItem = useCallback(
    ({ item }: { item: TodoListItem }) => (
      <TodoRow item={item} onToggle={handleToggle} onOpen={setDetail} />
    ),
    [handleToggle],
  );

  const listBottomPadding = spacing.giant;

  return (
    <Screen gutter="none">
      <FilterBar
        view={view}
        onViewChange={setView}
        projects={projects}
        activeProject={project}
        onProjectChange={setProject}
        openCount={openCount}
        overdueCount={overdueCount}
      />

      <View style={styles.list}>
        {view === 'open' ? (
          <FlashList
            data={rows}
            renderItem={renderOpenItem}
            keyExtractor={openKeyExtractor}
            getItemType={openItemType}
            stickyHeaderIndices={stickyIndices}
            contentContainerStyle={{ paddingBottom: listBottomPadding }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              isLoading ? null : (
                <View style={styles.empty}>
                  <EmptyState
                    icon="checkmark-done-outline"
                    title={project === null ? 'Nothing on the list' : 'Nothing in this project'}
                    hint={
                      isEmpty && project === null
                        ? 'Type below to capture your first task.'
                        : 'Clear it or pick another project.'
                    }
                  />
                </View>
              )
            }
          />
        ) : (
          <FlashList
            data={completed}
            renderItem={renderDoneItem}
            keyExtractor={doneKeyExtractor}
            contentContainerStyle={{ paddingBottom: listBottomPadding }}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              completed.length > 0 ? (
                <Text variant="caption" color="textSubtle" style={styles.doneHeader}>
                  RECENTLY COMPLETED
                </Text>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <EmptyState
                  icon="time-outline"
                  title="Nothing completed yet"
                  hint="Finished tasks show up here so you can undo a mistaken tick."
                />
              </View>
            }
          />
        )}
      </View>

      <QuickAddBar
        onSubmit={handleQuickAdd}
        activeProject={project}
        autoFocus={composeOnMount}
      />

      <UndoBar
        target={undo.target}
        message="Task deleted"
        onUndo={handleUndo}
        onExpire={undo.clear}
        bottom={insets.bottom + spacing.giant + spacing.xxl}
      />

      <TodoDetailSheet
        todo={detail}
        onClose={() => setDetail(null)}
        onSave={handleSave}
        onDelete={handleDelete}
        onMove={handleMove}
        canMoveUp={detailPosition.canMoveUp}
        canMoveDown={detailPosition.canMoveDown}
      />
    </Screen>
  );
}

function openKeyExtractor(row: Row<TodoListItem>): string {
  return row.kind === 'header' ? `h:${row.bucket}` : row.item.id;
}

function openItemType(row: Row<TodoListItem>): string {
  return row.kind;
}

function doneKeyExtractor(item: TodoListItem): string {
  return item.id;
}

function BucketHeader({
  label,
  count,
  onReschedule,
}: {
  label: string;
  count: number;
  /** Present only on the overdue bucket. */
  onReschedule?: () => void;
}) {
  const theme = useTheme();
  const isOverdue = onReschedule !== undefined;

  return (
    <View style={[styles.bucketHeader, { backgroundColor: theme.colors.bg }]}>
      <Text variant="caption" color={isOverdue ? 'negative' : 'textSubtle'}>
        {label.toUpperCase()}
      </Text>

      <View style={styles.bucketRight}>
        {onReschedule !== undefined ? (
          <Pressable
            onPress={onReschedule}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Move ${count} overdue ${count === 1 ? 'task' : 'tasks'} to today`}
            style={[styles.reschedule, { backgroundColor: theme.colors.negativeSoft }]}
          >
            <Icon name="today-outline" size={11} color="negative" />
            <Text variant="caption" style={{ color: theme.colors.negative }}>
              MOVE TO TODAY
            </Text>
          </Pressable>
        ) : null}

        <Text variant="caption" color="textSubtle" numeric>
          {count}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  bucketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bucketRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reschedule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  doneHeader: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  empty: { paddingTop: spacing.xxxl, minHeight: 240 },
});
