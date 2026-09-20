import { isNull } from 'drizzle-orm';

import { addDays, nowTimestamp, todayDate, type CalendarDate } from '@/lib/date';
import { newId } from '@/lib/id';
import { fromRupees } from '@/lib/money';
import { ORDER_GAP } from '@/lib/ordering';
import { attempt, type Result } from '@/lib/result';

import { db } from './client';
import {
  accounts,
  applicationEvents,
  applications,
  categories,
  notes,
  todos,
  transactions,
  type ApplicationStatus,
  type TodoPriority,
} from './schema';

/**
 * Development seed data.
 *
 * NEVER called automatically. An app that invents financial records on launch
 * is worse than an empty one — you cannot tell your data from its data. This
 * runs only from an explicit dev-only control.
 *
 * The amounts and frequencies are shaped after a real Indian salaried month:
 * one large salary credit, rent as the dominant expense, food and transport as
 * frequent small ones. Uniformly random data would make the category breakdown
 * look plausible while hiding exactly the layout problems it needs to surface —
 * one bar dominating, long category names, a month that runs at a loss.
 */

type SeedSpec = {
  categoryName: string;
  type: 'income' | 'expense';
  /** Inclusive rupee range. */
  min: number;
  max: number;
  /** Roughly how many times this occurs per month. */
  perMonth: number;
  notes: readonly string[];
};

const SPECS: readonly SeedSpec[] = [
  { categoryName: 'Salary', type: 'income', min: 78000, max: 78000, perMonth: 1, notes: ['Monthly salary'] },
  { categoryName: 'Freelance', type: 'income', min: 6000, max: 18000, perMonth: 1, notes: ['Side project', 'Consulting hours'] },
  { categoryName: 'Rent', type: 'expense', min: 22000, max: 22000, perMonth: 1, notes: ['Flat rent'] },
  { categoryName: 'Groceries', type: 'expense', min: 400, max: 2600, perMonth: 5, notes: ['BigBasket', 'Weekly run', 'Vegetables'] },
  { categoryName: 'Food & Dining', type: 'expense', min: 150, max: 1400, perMonth: 9, notes: ['Lunch', 'Swiggy', 'Team dinner', 'Coffee'] },
  { categoryName: 'Transport', type: 'expense', min: 40, max: 600, perMonth: 11, notes: ['Metro', 'Auto', 'Uber', 'Petrol'] },
  { categoryName: 'Utilities', type: 'expense', min: 600, max: 3200, perMonth: 3, notes: ['Electricity', 'Broadband', 'Water'] },
  { categoryName: 'Subscriptions', type: 'expense', min: 149, max: 999, perMonth: 3, notes: ['Spotify', 'iCloud', 'Netflix'] },
  { categoryName: 'Shopping', type: 'expense', min: 500, max: 5500, perMonth: 2, notes: ['Amazon', 'Clothes'] },
  { categoryName: 'Health', type: 'expense', min: 300, max: 2800, perMonth: 1, notes: ['Pharmacy', 'Consultation'] },
  { categoryName: 'Entertainment', type: 'expense', min: 250, max: 1800, perMonth: 2, notes: ['Cinema', 'Concert'] },
];

/**
 * Mulberry32 — a small seeded PRNG.
 *
 * Deterministic on purpose: the same seed produces the same ledger every time,
 * so a layout bug found while scrolling can actually be reproduced. `Math.random`
 * would make every run a different dataset.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SeedOptions = {
  /** How many months back to generate, including the current one. */
  months?: number;
  seed?: number;
};

export type SeedReport = { inserted: number; months: number };

export async function seedDemoData(
  options: SeedOptions = {},
): Promise<Result<SeedReport>> {
  const { months = 3, seed = 20260920 } = options;

  return attempt('DB_WRITE', 'Could not seed demo data', async () => {
    const random = createRandom(seed);

    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(isNull(accounts.deletedAt))
      .limit(1);

    if (!account) throw new Error('No account to seed into');

    const categoryRows = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(isNull(categories.deletedAt));

    const byName = new Map(categoryRows.map((row) => [row.name, row.id]));
    const today = todayDate();
    const now = nowTimestamp();

    const rows: (typeof transactions.$inferInsert)[] = [];

    for (let monthOffset = 0; monthOffset < months; monthOffset += 1) {
      for (const spec of SPECS) {
        const categoryId = byName.get(spec.categoryName);
        if (categoryId === undefined) continue;

        for (let i = 0; i < spec.perMonth; i += 1) {
          // Spread within the month, then step back whole months. Using day
          // offsets rather than calendar months keeps every generated date
          // real without month-length special cases.
          const dayWithinMonth = Math.floor(random() * 28);
          const occurredOn: CalendarDate = addDays(
            today,
            -(monthOffset * 30 + dayWithinMonth),
          );

          const rupees =
            spec.min === spec.max
              ? spec.min
              : Math.round(spec.min + random() * (spec.max - spec.min));

          const note = spec.notes[Math.floor(random() * spec.notes.length)] ?? null;

          rows.push({
            id: newId(),
            accountId: account.id,
            categoryId,
            amount: fromRupees(rupees),
            type: spec.type,
            note,
            occurredOn,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    // One transaction rather than ~120 round-trips. Chunked because SQLite caps
    // a statement at 999 bound variables and each row binds nine of them.
    await db.transaction(async (tx) => {
      const CHUNK = 100;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx.insert(transactions).values(rows.slice(i, i + CHUNK));
      }
    });

    return { inserted: rows.length, months };
  });
}

/* ------------------------------------------------------------------ */
/* Todos                                                               */
/* ------------------------------------------------------------------ */

type SeedTodo = {
  title: string;
  project: string | null;
  priority: TodoPriority;
  /** Days from today. Negative is overdue, null is someday. */
  dueOffset: number | null;
  done?: boolean;
};

/**
 * Chosen to populate every bucket — overdue, today, tomorrow, upcoming and
 * someday — plus two projects and a completed item. Seed data whose only job is
 * to look plausible hides the layout cases that actually break: a long title
 * wrapping to two lines, an empty bucket, a high-priority marker next to a
 * normal one.
 */
const SEED_TODOS: readonly SeedTodo[] = [
  { title: 'Reply to the recruiter about the Thursday slot', project: 'job-hunt', priority: 'high', dueOffset: -2 },
  { title: 'Renew bike insurance', project: null, priority: 'high', dueOffset: -1 },
  { title: 'Write up the payment webhook retry fix', project: 'payments', priority: 'normal', dueOffset: 0 },
  { title: 'Review the auth refactor PR', project: 'payments', priority: 'normal', dueOffset: 0 },
  { title: 'Standup notes for the sprint review', project: 'payments', priority: 'low', dueOffset: 1 },
  { title: 'Book dentist appointment', project: null, priority: 'normal', dueOffset: 3 },
  { title: 'Rewrite the resume summary section with this quarter numbers', project: 'job-hunt', priority: 'normal', dueOffset: 6 },
  { title: 'Read up on SQLite WAL checkpointing', project: null, priority: 'low', dueOffset: null },
  { title: 'Try the new profiler build', project: null, priority: 'low', dueOffset: null },
  { title: 'File the Q2 reimbursement', project: null, priority: 'normal', dueOffset: -4, done: true },
];

export type TodoSeedReport = { inserted: number };

export async function seedDemoTodos(): Promise<Result<TodoSeedReport>> {
  return attempt('DB_WRITE', 'Could not seed demo tasks', async () => {
    const today = todayDate();
    const now = nowTimestamp();

    const rows = SEED_TODOS.map((spec, index) => ({
      id: newId(),
      title: spec.title,
      details: null,
      project: spec.project,
      priority: spec.priority,
      dueOn: spec.dueOffset === null ? null : addDays(today, spec.dueOffset),
      // Spaced at ORDER_GAP so the seeded list starts in the same shape the
      // ordering scheme would have produced organically.
      sortOrder: index * ORDER_GAP,
      completedAt: spec.done === true ? now - 86_400_000 : null,
      createdAt: now,
      updatedAt: now,
    }));

    await db.insert(todos).values(rows);
    return { inserted: rows.length };
  });
}

export async function clearTodos(): Promise<Result<number>> {
  return attempt('DB_WRITE', 'Could not clear tasks', async () => {
    const existing = await db.select({ id: todos.id }).from(todos);
    await db.delete(todos);
    return existing.length;
  });
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

type SeedNote = {
  title: string;
  body: string;
  tags: string[];
  /** Days ago this was last edited. Drives list ordering. */
  editedDaysAgo: number;
  pinned?: boolean;
};

/**
 * Deliberately varied in shape, not just in content: one pinned, one untitled,
 * one with no body, one long enough to truncate in the preview, one with many
 * tags. Seed data that is uniformly "normal" makes a list look correct while
 * hiding every layout case that actually breaks.
 */
const SEED_NOTES: readonly SeedNote[] = [
  {
    title: 'Payment webhook retry \u2014 root cause',
    body: 'Duplicate charges traced to a race in the idempotency check. Two workers read the key before either wrote it, so both proceeded. Fix: SETNX in Redis with the request id, TTL 24h, and fall through to the existing row on collision. Worth writing up properly for the sprint review \u2014 it is the kind of thing that reads well in an appraisal because the impact is concrete: prevented duplicate charges on retry.',
    tags: ['payments', 'incident', 'redis'],
    editedDaysAgo: 0,
    pinned: true,
  },
  {
    title: 'Interview prep \u2014 talking points',
    body: 'Local-first architecture: SQLite is the source of truth, server is a sync target. Lead with the latency argument, then volunteer the cost (two replicas that both accept writes = distributed systems problem).',
    tags: ['job-hunt', 'interview'],
    editedDaysAgo: 1,
  },
  {
    title: '',
    body: 'Random thought: the brag document idea only works if capture is frictionless. If it takes more than a minute at the end of the day it will not happen.',
    tags: [],
    editedDaysAgo: 2,
  },
  {
    title: 'Books to read',
    body: 'Designing Data-Intensive Applications \u2014 chapter 5 on replication.\nSQLite internals docs.\nThe Rust book, eventually.',
    tags: ['reading'],
    editedDaysAgo: 4,
  },
  {
    title: 'Standup \u2014 nothing to add today',
    body: '',
    tags: ['payments'],
    editedDaysAgo: 6,
  },
  {
    title: 'Flat renewal checklist',
    body: 'Agreement expires end of quarter. Need: police verification, two months deposit adjustment, confirm maintenance is still included.',
    tags: ['personal', 'admin', 'rent', 'urgent'],
    editedDaysAgo: 11,
  },
];

export type NoteSeedReport = { inserted: number };

export async function seedDemoNotes(): Promise<Result<NoteSeedReport>> {
  return attempt('DB_WRITE', 'Could not seed demo notes', async () => {
    const now = nowTimestamp();
    const DAY_MS = 86_400_000;

    const rows = SEED_NOTES.map((spec) => {
      const editedAt = now - spec.editedDaysAgo * DAY_MS;
      return {
        id: newId(),
        title: spec.title,
        body: spec.body,
        tags: spec.tags,
        pinnedAt: spec.pinned === true ? now : null,
        createdAt: editedAt,
        updatedAt: editedAt,
      };
    });

    await db.insert(notes).values(rows);
    return { inserted: rows.length };
  });
}

export async function clearNotes(): Promise<Result<number>> {
  return attempt('DB_WRITE', 'Could not clear notes', async () => {
    const existing = await db.select({ id: notes.id }).from(notes);
    await db.delete(notes);
    return existing.length;
  });
}

/* ------------------------------------------------------------------ */
/* Job applications                                                    */
/* ------------------------------------------------------------------ */

type SeedApplication = {
  company: string;
  role: string;
  source: string | null;
  location: string | null;
  status: ApplicationStatus;
  appliedDaysAgo: number;
  salaryMin: number | null;
  salaryMax: number | null;
  nextAction: string | null;
  /** Days from today. Negative means an overdue follow-up. */
  nextActionOffset: number | null;
};

/**
 * Covers every stage that matters plus both terminal outcomes, and includes one
 * overdue follow-up so the FOLLOW UP counter and the row flag are visible
 * without waiting for a date to pass.
 */
const SEED_APPLICATIONS: readonly SeedApplication[] = [
  { company: 'Recurse Systems', role: 'Senior Backend Engineer', source: 'Referral', location: 'Remote', status: 'offer', appliedDaysAgo: 41, salaryMin: 3200000, salaryMax: 4000000, nextAction: 'Respond to the offer', nextActionOffset: 2 },
  { company: 'Northwind Labs', role: 'Platform Engineer', source: 'LinkedIn', location: 'Bengaluru', status: 'onsite', appliedDaysAgo: 28, salaryMin: 2800000, salaryMax: 3600000, nextAction: 'Send thank-you note', nextActionOffset: -1 },
  { company: 'Halcyon', role: 'Backend Engineer II', source: 'Careers page', location: 'Hybrid, Chennai', status: 'tech', appliedDaysAgo: 19, salaryMin: 2400000, salaryMax: 3000000, nextAction: 'Prep system design round', nextActionOffset: 3 },
  { company: 'Tessellate', role: 'Full Stack Engineer', source: 'Referral', location: 'Remote', status: 'screen', appliedDaysAgo: 12, salaryMin: null, salaryMax: 2800000, nextAction: 'Confirm recruiter call', nextActionOffset: 0 },
  { company: 'Bluewater', role: 'Software Engineer', source: 'LinkedIn', location: 'Pune', status: 'applied', appliedDaysAgo: 7, salaryMin: null, salaryMax: null, nextAction: 'Follow up if no reply', nextActionOffset: 4 },
  { company: 'Ironbark', role: 'Backend Engineer', source: 'Job board', location: 'Remote', status: 'applied', appliedDaysAgo: 3, salaryMin: null, salaryMax: null, nextAction: null, nextActionOffset: null },
  { company: 'Vantage Point', role: 'Senior Engineer', source: 'Job board', location: 'Mumbai', status: 'rejected', appliedDaysAgo: 55, salaryMin: null, salaryMax: null, nextAction: null, nextActionOffset: null },
  { company: 'Meridian', role: 'Backend Engineer', source: 'LinkedIn', location: 'Remote', status: 'ghosted', appliedDaysAgo: 68, salaryMin: null, salaryMax: null, nextAction: null, nextActionOffset: null },
];

export type ApplicationSeedReport = { inserted: number; events: number };

export async function seedDemoApplications(): Promise<Result<ApplicationSeedReport>> {
  return attempt('DB_WRITE', 'Could not seed demo applications', async () => {
    const today = todayDate();
    const now = nowTimestamp();

    const appRows: (typeof applications.$inferInsert)[] = [];
    const eventRows: (typeof applicationEvents.$inferInsert)[] = [];

    for (const spec of SEED_APPLICATIONS) {
      const id = newId();
      const appliedOn = addDays(today, -spec.appliedDaysAgo);

      appRows.push({
        id,
        company: spec.company,
        role: spec.role,
        source: spec.source,
        location: spec.location,
        appliedOn,
        status: spec.status,
        salaryMin: spec.salaryMin === null ? null : fromRupees(spec.salaryMin),
        salaryMax: spec.salaryMax === null ? null : fromRupees(spec.salaryMax),
        contact: null,
        notes: null,
        nextAction: spec.nextAction,
        nextActionOn:
          spec.nextActionOffset === null ? null : addDays(today, spec.nextActionOffset),
        createdAt: now,
        updatedAt: now,
      });

      // Every application opens with the day it was sent, mirroring what
      // createApplication does, so seeded timelines look like real ones.
      eventRows.push({
        id: newId(),
        applicationId: id,
        kind: 'applied',
        happenedOn: appliedOn,
        note: `Applied for ${spec.role}`,
        createdAt: now,
        updatedAt: now,
      });

      if (spec.status !== 'applied') {
        eventRows.push({
          id: newId(),
          applicationId: id,
          kind: 'status_change',
          happenedOn: addDays(today, -Math.floor(spec.appliedDaysAgo / 2)),
          note: `Moved to ${spec.status}`,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await db.transaction(async (tx) => {
      await tx.insert(applications).values(appRows);
      await tx.insert(applicationEvents).values(eventRows);
    });

    return { inserted: appRows.length, events: eventRows.length };
  });
}

export async function clearApplications(): Promise<Result<number>> {
  return attempt('DB_WRITE', 'Could not clear applications', async () => {
    const existing = await db.select({ id: applications.id }).from(applications);
    // Events first: the foreign key is ON DELETE CASCADE, but deleting the
    // children explicitly keeps this correct even if that clause ever changes.
    await db.delete(applicationEvents);
    await db.delete(applications);
    return existing.length;
  });
}

/**
 * Removes every transaction, leaving accounts and categories intact.
 *
 * A genuine hard delete, unlike `softDeleteTransaction`. That is correct here
 * precisely because this is a dev tool: seeded rows are not real records, so
 * there is nothing a tombstone would need to tell another replica about.
 */
export async function clearTransactions(): Promise<Result<number>> {
  return attempt('DB_WRITE', 'Could not clear transactions', async () => {
    const existing = await db.select({ id: transactions.id }).from(transactions);
    await db.delete(transactions);
    return existing.length;
  });
}
