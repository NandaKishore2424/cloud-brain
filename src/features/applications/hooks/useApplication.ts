import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import {
  applicationById,
  eventsForApplication,
  type ApplicationListItem,
  type TimelineEvent,
} from '../api';

export type ApplicationDetail = {
  application: ApplicationListItem | undefined;
  events: TimelineEvent[];
  isLoading: boolean;
};

/** One application plus its timeline, reactively. */
export function useApplication(id: string): ApplicationDetail {
  const applicationQuery = useMemo(() => applicationById(id), [id]);
  const eventsQuery = useMemo(() => eventsForApplication(id), [id]);

  const application = useLiveQuery(applicationQuery, [applicationQuery]);
  const events = useLiveQuery(eventsQuery, [eventsQuery]);

  return {
    application: application.data?.[0],
    events: events.data ?? [],
    isLoading: application.updatedAt === undefined,
  };
}
