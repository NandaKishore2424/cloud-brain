import { EmptyState, Screen } from '@/design';

export default function MoneyScreen() {
  return (
    <Screen>
      <EmptyState
        icon="wallet-outline"
        title="Money"
        hint="Phase 1 builds this: accounts, categories and a sub-five-second expense entry flow."
      />
    </Screen>
  );
}
