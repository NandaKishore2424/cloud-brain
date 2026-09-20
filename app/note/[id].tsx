import { useLocalSearchParams } from 'expo-router';

import { NoteEditor } from '@/features/notes/components/NoteEditor';

/**
 * Route file. Reads the id param and renders one feature component.
 *
 * Sits in the ROOT stack rather than inside `(tabs)`, so the editor pushes over
 * the tab bar and gets the full screen — a note is written, not glanced at.
 */
export default function NoteRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  if (typeof id !== 'string' || id.length === 0) return null;

  return <NoteEditor id={id} />;
}
