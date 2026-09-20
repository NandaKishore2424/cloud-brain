import { useLocalSearchParams } from 'expo-router';

import { MoneyScreen } from '@/features/money/components/MoneyScreen';

/**
 * Route file. Thin by convention — see CLAUDE.md §3.
 *
 * `?compose=1` opens the entry sheet on arrival. The dashboard uses it to offer
 * quick capture without importing this feature's internals, which the
 * dependency rule forbids — navigation is how one feature asks another to do
 * something.
 */
export default function MoneyRoute() {
  const { compose } = useLocalSearchParams<{ compose?: string }>();

  return <MoneyScreen composeOnMount={compose === '1'} />;
}
