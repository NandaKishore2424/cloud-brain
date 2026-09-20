import { addDays, type CalendarDate } from '@/lib/date';

/**
 * Date bucketing for the todo list.
 *
 * Pure, and generic over the row shape — it constrains only the three fields it
 * reads. That keeps it decoupled from the database row and unit-testable with
 * object literals, no fixtures and no mocking of "today".
 *
 * On sort order within a bucket: `sortOrder` is the sole key, and **priority
 * deliberately does not participate**. Sorting by priority and then by manual
 * order means a drag only shuffles an item within its priority band, which
 * looks broken to the person who just dragged it. Explicit user intent should
 * beat an inferred attribute, so priority is a visual marker for scanning
 * rather than a sort key.
 */

export type TodoBucketKey = 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'someday';

/** Display order of buckets. Most urgent first; undated work sinks to the end. */
export const BUCKET_ORDER: readonly TodoBucketKey[] = [
  'overdue',
  'today',
  'tomorrow',
  'upcoming',
  'someday',
];

export const BUCKET_LABELS: Record<TodoBucketKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  upcoming: 'Upcoming',
  someday: 'Someday',
};

/** Minimum shape `groupTodos` needs. Anything with these fields can be grouped. */
export type Groupable = {
  readonly id: string;
  readonly dueOn: CalendarDate | null;
  readonly sortOrder: number;
};

export function bucketFor(dueOn: CalendarDate | null, today: CalendarDate): TodoBucketKey {
  if (dueOn === null) return 'someday';

  // String comparison is valid chronological comparison for zero-padded
  // 'YYYY-MM-DD' — the same property the SQL date-range queries rely on.
  if (dueOn < today) return 'overdue';
  if (dueOn === today) return 'today';
  if (dueOn === addDays(today, 1)) return 'tomorrow';
  return 'upcoming';
}

export type TodoRow<T> =
  | { kind: 'header'; bucket: TodoBucketKey; label: string; count: number }
  | { kind: 'item'; item: T };

export type GroupedTodos<T> = {
  rows: TodoRow<T>[];
  stickyIndices: number[];
  /** Number of items in the overdue bucket — drives the tab badge. */
  overdueCount: number;
};

/**
 * Group todos into date buckets and flatten to header/item rows for FlashList.
 *
 * Empty buckets are omitted entirely rather than rendered with a zero count —
 * a list of five headings with nothing under them communicates less than the
 * two headings that have work in them.
 */
export function groupTodos<T extends Groupable>(
  todos: readonly T[],
  today: CalendarDate,
): GroupedTodos<T> {
  const buckets = new Map<TodoBucketKey, T[]>();

  for (const todo of todos) {
    const key = bucketFor(todo.dueOn, today);
    const existing = buckets.get(key);
    if (existing) existing.push(todo);
    else buckets.set(key, [todo]);
  }

  const rows: TodoRow<T>[] = [];
  const stickyIndices: number[] = [];

  for (const bucket of BUCKET_ORDER) {
    const items = buckets.get(bucket);
    if (!items || items.length === 0) continue;

    items.sort(compareBySortOrder);

    stickyIndices.push(rows.length);
    rows.push({
      kind: 'header',
      bucket,
      label: BUCKET_LABELS[bucket],
      count: items.length,
    });

    for (const item of items) rows.push({ kind: 'item', item });
  }

  return {
    rows,
    stickyIndices,
    overdueCount: buckets.get('overdue')?.length ?? 0,
  };
}

/**
 * Ties break on id so the order is total and stable.
 *
 * Without the tiebreak, two todos sharing a `sortOrder` — possible after a
 * Phase 4 sync merges concurrent inserts from two devices — could swap places
 * between renders, making rows appear to jitter.
 */
function compareBySortOrder<T extends Groupable>(a: T, b: T): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
