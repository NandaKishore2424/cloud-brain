import { useLocalSearchParams } from 'expo-router';

import { ApplicationDetailScreen } from '@/features/applications/components/ApplicationDetailScreen';

/** Route file. Sits in the root stack so it takes the full screen. */
export default function ApplicationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  if (typeof id !== 'string' || id.length === 0) return null;

  return <ApplicationDetailScreen id={id} />;
}
