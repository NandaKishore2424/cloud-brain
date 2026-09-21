import { useLocalSearchParams } from 'expo-router';

import { WorkLogScreen } from '@/features/worklog/components';

/**
 * Route file. Thin by convention — see CLAUDE.md §3.
 *
 * `?compose=1` focuses the entry field on arrival, so "Work" on Home lands
 * with the keyboard — and its mic — already up.
 */
export default function WorkLogRoute() {
  const { compose } = useLocalSearchParams<{ compose?: string }>();

  return <WorkLogScreen composeOnMount={compose === '1'} />;
}
