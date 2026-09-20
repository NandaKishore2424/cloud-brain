import { useLocalSearchParams } from 'expo-router';

import { TodosScreen } from '@/features/todos/components/TodosScreen';

/**
 * Route file. Thin by convention — see CLAUDE.md §3.
 *
 * `?compose=1` focuses the quick-add field on arrival, so capture from the
 * dashboard lands with the keyboard already up.
 */
export default function TodosRoute() {
  const { compose } = useLocalSearchParams<{ compose?: string }>();

  return <TodosScreen composeOnMount={compose === '1'} />;
}
