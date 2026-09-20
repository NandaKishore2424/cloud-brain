import { EmptyState, Screen } from '@/design';

export default function NotesScreen() {
  return (
    <Screen>
      <EmptyState
        icon="document-text-outline"
        title="Notes"
        hint="Phase 3 builds this: tagged notes with full-text search."
      />
    </Screen>
  );
}
