import type { ApplicationStatus } from '@/db/schema';
import type { CalendarDate } from '@/lib/date';

/**
 * Pipeline stage logic.
 *
 * Pure and generic over the row shape, so it is testable without a database —
 * same pattern as `todos/grouping.ts`.
 */

/**
 * Display order: furthest along first.
 *
 * Deliberately NOT chronological order through the funnel. When you open this
 * screen you want to see the offer and the onsite, not scroll past thirty
 * applications that went nowhere. Closed outcomes sink to the bottom.
 */
export const STATUS_ORDER: readonly ApplicationStatus[] = [
  'offer',
  'onsite',
  'tech',
  'screen',
  'applied',
  'rejected',
  'ghosted',
];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  screen: 'Screening',
  tech: 'Tech round',
  onsite: 'Onsite',
  offer: 'Offer',
  rejected: 'Rejected',
  ghosted: 'Ghosted',
};

/** Colour token per stage. Closed outcomes are muted, not alarming. */
export const STATUS_TOKENS: Record<ApplicationStatus, 'positive' | 'accent' | 'warning' | 'textSubtle'> = {
  offer: 'positive',
  onsite: 'accent',
  tech: 'accent',
  screen: 'accent',
  applied: 'warning',
  rejected: 'textSubtle',
  ghosted: 'textSubtle',
};

/** Stages still in play. The others are terminal. */
const ACTIVE: ReadonlySet<ApplicationStatus> = new Set<ApplicationStatus>([
  'applied',
  'screen',
  'tech',
  'onsite',
  'offer',
]);

export function isActive(status: ApplicationStatus): boolean {
  return ACTIVE.has(status);
}

/** The next stage forward, or null at a terminal stage. */
export function advanceStatus(status: ApplicationStatus): ApplicationStatus | null {
  const forward: Partial<Record<ApplicationStatus, ApplicationStatus>> = {
    applied: 'screen',
    screen: 'tech',
    tech: 'onsite',
    onsite: 'offer',
  };
  return forward[status] ?? null;
}

export type Pipelineable = {
  readonly id: string;
  readonly status: ApplicationStatus;
  readonly appliedOn: CalendarDate;
  readonly nextActionOn: CalendarDate | null;
};

/**
 * An application needing attention: an active stage with a next action due
 * today or overdue.
 *
 * Terminal stages are excluded regardless of their date. Chasing a company
 * that already rejected you is not a follow-up.
 */
export function needsFollowUp(item: Pipelineable, today: CalendarDate): boolean {
  if (!isActive(item.status)) return false;
  if (item.nextActionOn === null) return false;
  return item.nextActionOn <= today;
}

export type PipelineRow<T> =
  | { kind: 'header'; status: ApplicationStatus; label: string; count: number }
  | { kind: 'item'; item: T };

export type GroupedPipeline<T> = {
  rows: PipelineRow<T>[];
  stickyIndices: number[];
  activeCount: number;
  followUpCount: number;
};

/**
 * Group by stage and flatten to header/item rows.
 *
 * Within a stage, most recently applied first — a stale application is less
 * interesting than a fresh one at the same point in the funnel. Ties break on
 * id so the order is total and rows cannot swap between renders.
 */
export function groupByStatus<T extends Pipelineable>(
  items: readonly T[],
  today: CalendarDate,
): GroupedPipeline<T> {
  const buckets = new Map<ApplicationStatus, T[]>();
  let activeCount = 0;
  let followUpCount = 0;

  for (const item of items) {
    if (isActive(item.status)) activeCount += 1;
    if (needsFollowUp(item, today)) followUpCount += 1;

    const existing = buckets.get(item.status);
    if (existing) existing.push(item);
    else buckets.set(item.status, [item]);
  }

  const rows: PipelineRow<T>[] = [];
  const stickyIndices: number[] = [];

  for (const status of STATUS_ORDER) {
    const group = buckets.get(status);
    if (!group || group.length === 0) continue;

    group.sort(compareByRecency);

    stickyIndices.push(rows.length);
    rows.push({
      kind: 'header',
      status,
      label: STATUS_LABELS[status],
      count: group.length,
    });

    for (const item of group) rows.push({ kind: 'item', item });
  }

  return { rows, stickyIndices, activeCount, followUpCount };
}

function compareByRecency<T extends Pipelineable>(a: T, b: T): number {
  if (a.appliedOn !== b.appliedOn) return a.appliedOn < b.appliedOn ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
