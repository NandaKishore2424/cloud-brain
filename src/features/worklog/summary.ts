import {
  formatDayHeading,
  formatWeekLabel,
  formatWeekday,
  type CalendarDate,
  type DateRange,
} from '@/lib/date';

/**
 * Turning a week of entries into something useful — with no I/O, so every rule
 * here is tested by `npm run test` without a device.
 *
 * Two outputs, for two audiences:
 *
 *  • `formatWeekForSharing` — plain text for a standup, a sprint review, or a
 *    message to a manager. Chronological, because that is how a week is told.
 *  • `buildAssistantPrompt` — the same text wrapped in instructions for an AI
 *    assistant, which the person pastes into Gemini or ChatGPT themselves.
 *    See ADR 0014 for why the app hands the text over rather than calling a
 *    model directly.
 */

/** The fields a summary needs. Structural, so tests need not build full rows. */
export type LogEntry = {
  readonly id: string;
  readonly loggedOn: CalendarDate;
  readonly body: string;
  readonly createdAt: number;
};

export type DayGroup<T extends LogEntry = LogEntry> = {
  readonly date: CalendarDate;
  readonly entries: readonly T[];
};

/**
 * Entries grouped by day.
 *
 * Within a day, entries stay in the order they were written — the order the
 * day actually happened. Across days, `order` decides: the screen shows the
 * newest day first (today is what you are looking for), while shared text runs
 * oldest first (a week is read Monday to Friday).
 */
export function groupByDay<T extends LogEntry>(
  entries: readonly T[],
  order: 'newest' | 'oldest',
): DayGroup<T>[] {
  const byDay = new Map<CalendarDate, T[]>();

  for (const entry of entries) {
    const bucket = byDay.get(entry.loggedOn);
    if (bucket === undefined) byDay.set(entry.loggedOn, [entry]);
    else bucket.push(entry);
  }

  const days = [...byDay.keys()].sort();
  if (order === 'newest') days.reverse();

  return days.map((date) => ({
    date,
    entries: [...(byDay.get(date) ?? [])].sort((a, b) => a.createdAt - b.createdAt),
  }));
}

/* ------------------------------------------------------------------ */
/* List rows                                                           */
/* ------------------------------------------------------------------ */

export type WorkLogRow<T extends LogEntry = LogEntry> =
  | Readonly<{ kind: 'header'; date: CalendarDate; label: string; count: number }>
  | Readonly<{ kind: 'entry'; entry: T }>;

/**
 * Flatten groups into the header/entry rows FlashList renders.
 *
 * One flat list with a `kind` discriminator rather than nested lists, so the
 * whole week virtualises as one scroll and `getItemType` can keep headers and
 * entries in separate recycling pools — same shape as the money ledger.
 */
export function toRows<T extends LogEntry>(entries: readonly T[]): WorkLogRow<T>[] {
  const rows: WorkLogRow<T>[] = [];

  for (const group of groupByDay(entries, 'newest')) {
    rows.push({
      kind: 'header',
      date: group.date,
      label: formatDayHeading(group.date),
      count: group.entries.length,
    });
    for (const entry of group.entries) rows.push({ kind: 'entry', entry });
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

/**
 * Tidy an entry as captured.
 *
 * Voice dictation is the main input, and dictation leaves debris: trailing
 * spaces, runs of blank lines where the speaker paused. Trimmed and collapsed
 * here rather than at display time so what is stored is what was meant.
 */
export function normaliseBody(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * One entry as bullet lines.
 *
 * A multi-line entry keeps its lines, indented under one bullet, so a dictated
 * paragraph does not turn into several unrelated-looking bullets.
 */
function bullet(body: string): string {
  const [first = '', ...rest] = body.split('\n').filter((line) => line.trim() !== '');
  return [`• ${first.trim()}`, ...rest.map((line) => `  ${line.trim()}`)].join('\n');
}

/** Plain-text week, oldest day first. Empty string for an empty week. */
export function formatWeekForSharing(entries: readonly LogEntry[], range: DateRange): string {
  const groups = groupByDay(entries, 'oldest');
  if (groups.length === 0) return '';

  const days = groups.map(
    (group) =>
      `${formatWeekday(group.date)}\n${group.entries.map((entry) => bullet(entry.body)).join('\n')}`,
  );

  return `Work log — ${formatWeekLabel(range)}\n\n${days.join('\n\n')}`;
}

/**
 * The week, wrapped in instructions for an AI assistant.
 *
 * The instructions do two jobs that matter more than the formatting:
 *
 *  • "Using ONLY what is in the log" — an appraisal is exactly where an
 *    invented metric does damage. Models embellish by default; this asks them
 *    not to, and asks for a visible [add result] placeholder instead of a
 *    plausible-sounding guess.
 *  • Three outputs for three real uses — this week's standup, the appraisal
 *    months from now, and the CV at the next job switch. That is the reason the
 *    log exists at all.
 */
export function buildAssistantPrompt(entries: readonly LogEntry[], range: DateRange): string {
  const log = formatWeekForSharing(entries, range);
  if (log === '') return '';

  return [
    `Below is my work log for the week of ${formatWeekLabel(range)}. I'm a software engineer.`,
    '',
    'Using ONLY what is in the log — do not invent projects, numbers or outcomes:',
    '',
    '1. Sprint update — 3 to 6 bullets grouped by theme, for a standup or sprint review.',
    '2. Achievements — the 1 to 3 most significant items in STAR form (Situation, Task, Action, Result), for a performance appraisal. Where the log does not state a result or a metric, write [add result] rather than guessing.',
    '3. CV bullets — 2 or 3 one-line bullets, each starting with a strong verb.',
    '',
    log,
  ].join('\n');
}
