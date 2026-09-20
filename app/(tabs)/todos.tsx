import { EmptyState, Screen } from '@/design';

export default function TodosScreen() {
  return (
    <Screen>
      <EmptyState
        icon="checkbox-outline"
        title="Todos"
        hint="Phase 2 builds this: tasks with projects, priorities and due dates."
      />
    </Screen>
  );
}
