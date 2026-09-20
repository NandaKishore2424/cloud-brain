import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  applicationEvents,
  applications,
  type Application,
  type ApplicationEvent,
  type ApplicationEventKind,
  type ApplicationStatus,
} from '@/db/schema';
import { nowTimestamp, todayDate, type CalendarDate } from '@/lib/date';
import { newId } from '@/lib/id';
import type { Paise } from '@/lib/money';
import { attempt, err, ok, type Result } from '@/lib/result';

import { STATUS_LABELS } from '../pipeline';

/**
 * Job application data access. The only place application SQL is written.
 *
 * Same two-shape split as the other features: unexecuted query builders for
 * `useLiveQuery`, and mutations returning `Result<T>`.
 */

export type ApplicationListItem = Application;
export type TimelineEvent = ApplicationEvent;

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** Every live application. Grouping into stages happens in `pipeline.ts`. */
export function allApplications() {
  return db
    .select()
    .from(applications)
    .where(isNull(applications.deletedAt))
    .orderBy(desc(applications.appliedOn));
}

export function applicationById(id: string) {
  return db.select().from(applications).where(eq(applications.id, id)).limit(1);
}

/** Timeline for one application, oldest first — it reads as a history. */
export function eventsForApplication(applicationId: string) {
  return db
    .select()
    .from(applicationEvents)
    .where(
      and(
        eq(applicationEvents.applicationId, applicationId),
        isNull(applicationEvents.deletedAt),
      ),
    )
    .orderBy(asc(applicationEvents.happenedOn), asc(applicationEvents.createdAt));
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export type CreateApplicationInput = {
  company: string;
  role: string;
  source?: string | null;
  location?: string | null;
  appliedOn?: CalendarDate;
  salaryMin?: Paise | null;
  salaryMax?: Paise | null;
  contact?: string | null;
  notes?: string | null;
};

/**
 * Create an application and open its timeline with an `applied` event.
 *
 * Both writes share a transaction: an application whose timeline does not start
 * with the day you applied is a gap you cannot reconstruct later, so it must
 * not be possible for the row to exist without it.
 */
export async function createApplication(
  input: CreateApplicationInput,
): Promise<Result<string>> {
  const company = input.company.trim();
  const role = input.role.trim();

  if (company.length === 0) return err('VALIDATION', 'Which company is this for?');
  if (role.length === 0) return err('VALIDATION', 'What role is it?');

  const id = newId();
  const now = nowTimestamp();
  const appliedOn = input.appliedOn ?? todayDate();

  const result = await attempt('DB_WRITE', 'Could not save that application', () =>
    db.transaction(async (tx) => {
      await tx.insert(applications).values({
        id,
        company,
        role,
        source: normalise(input.source),
        location: normalise(input.location),
        appliedOn,
        status: 'applied',
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        contact: normalise(input.contact),
        notes: normalise(input.notes),
        nextAction: null,
        nextActionOn: null,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(applicationEvents).values({
        id: newId(),
        applicationId: id,
        kind: 'applied',
        happenedOn: appliedOn,
        note: `Applied for ${role}`,
        createdAt: now,
        updatedAt: now,
      });

      return id;
    }),
  );

  return result.ok ? ok(id) : result;
}

export type UpdateApplicationPatch = Partial<
  Omit<CreateApplicationInput, 'appliedOn'>
> & {
  appliedOn?: CalendarDate;
  nextAction?: string | null;
  nextActionOn?: CalendarDate | null;
};

export async function updateApplication(
  id: string,
  patch: UpdateApplicationPatch,
): Promise<Result<void>> {
  if (patch.company !== undefined && patch.company.trim().length === 0) {
    return err('VALIDATION', 'Which company is this for?');
  }
  if (patch.role !== undefined && patch.role.trim().length === 0) {
    return err('VALIDATION', 'What role is it?');
  }

  const result = await attempt('DB_WRITE', 'Could not update that application', () =>
    db
      .update(applications)
      .set({
        ...(patch.company !== undefined ? { company: patch.company.trim() } : null),
        ...(patch.role !== undefined ? { role: patch.role.trim() } : null),
        ...(patch.source !== undefined ? { source: normalise(patch.source) } : null),
        ...(patch.location !== undefined ? { location: normalise(patch.location) } : null),
        ...(patch.appliedOn !== undefined ? { appliedOn: patch.appliedOn } : null),
        ...(patch.salaryMin !== undefined ? { salaryMin: patch.salaryMin } : null),
        ...(patch.salaryMax !== undefined ? { salaryMax: patch.salaryMax } : null),
        ...(patch.contact !== undefined ? { contact: normalise(patch.contact) } : null),
        ...(patch.notes !== undefined ? { notes: normalise(patch.notes) } : null),
        ...(patch.nextAction !== undefined
          ? { nextAction: normalise(patch.nextAction) }
          : null),
        ...(patch.nextActionOn !== undefined ? { nextActionOn: patch.nextActionOn } : null),
        updatedAt: nowTimestamp(),
      })
      .where(eq(applications.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

/**
 * Move an application to a new stage, recording the change on its timeline.
 *
 * The event is what makes the tracker worth keeping: six months later "when did
 * they first reply" is a query rather than a memory. Writing it automatically
 * means the history is a by-product of using the app, not a chore.
 *
 * Both writes share a transaction — a status that moved without a timeline
 * entry is exactly the gap this feature exists to prevent.
 */
export async function setApplicationStatus(
  id: string,
  status: ApplicationStatus,
  options: { happenedOn?: CalendarDate; note?: string | null } = {},
): Promise<Result<void>> {
  const now = nowTimestamp();
  const happenedOn = options.happenedOn ?? todayDate();

  const result = await attempt('DB_WRITE', 'Could not update that stage', () =>
    db.transaction(async (tx) => {
      await tx
        .update(applications)
        .set({ status, updatedAt: now })
        .where(eq(applications.id, id));

      await tx.insert(applicationEvents).values({
        id: newId(),
        applicationId: id,
        kind: 'status_change',
        happenedOn,
        note: options.note ?? `Moved to ${STATUS_LABELS[status]}`,
        createdAt: now,
        updatedAt: now,
      });
    }),
  );

  return result.ok ? ok(undefined) : result;
}

export async function addApplicationEvent(
  applicationId: string,
  kind: ApplicationEventKind,
  note: string,
  happenedOn?: CalendarDate,
): Promise<Result<string>> {
  const trimmed = note.trim();
  if (trimmed.length === 0) return err('VALIDATION', 'Write something first');

  const id = newId();
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not add that entry', () =>
    db.insert(applicationEvents).values({
      id,
      applicationId,
      kind,
      happenedOn: happenedOn ?? todayDate(),
      note: trimmed,
      createdAt: now,
      updatedAt: now,
    }),
  );

  return result.ok ? ok(id) : result;
}

export async function softDeleteApplication(id: string): Promise<Result<void>> {
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not delete that application', () =>
    db
      .update(applications)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(applications.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

export async function restoreApplication(id: string): Promise<Result<void>> {
  const result = await attempt('DB_WRITE', 'Could not restore that application', () =>
    db
      .update(applications)
      .set({ deletedAt: null, updatedAt: nowTimestamp() })
      .where(eq(applications.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

export async function getApplication(id: string): Promise<Result<Application>> {
  const result = await attempt('DB_READ', 'Could not load that application', () =>
    db.select().from(applications).where(eq(applications.id, id)).limit(1),
  );

  if (!result.ok) return result;

  const row = result.value[0];
  if (!row) return err('NOT_FOUND', 'That application no longer exists');
  return ok(row);
}

function normalise(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
