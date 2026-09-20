import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, radii, spacing, useTheme } from '@/design';

import { discardIfEmpty, setNotePinned, softDeleteNote, updateNote } from '../api';
import { useDebouncedValue, useNote } from '../hooks';
import { TagEditor } from './TagEditor';

/** Idle time before an autosave fires. */
const AUTOSAVE_MS = 600;

export type NoteEditorProps = { id: string };

type SaveState = 'idle' | 'saving' | 'saved';

/**
 * Full-screen note editor with autosave.
 *
 * A screen, not a sheet — and that is a deliberate break from Phases 1 and 2.
 * The money and todo entry flows are optimised for seconds: one required field,
 * everything defaulted, a sheet over the list. A note is written over minutes.
 * It wants the whole screen, the keyboard up, and no chrome competing with the
 * text. The "make it fast to capture" reasoning does not transfer.
 *
 * There is no Save button. The note row already exists before this screen
 * mounts (see `createNote`), so every keystroke has a row to write into and the
 * editor never has to decide between insert and update — which is where
 * duplicate-note bugs come from.
 *
 * Three things have to be right for autosave not to lose data:
 *
 *  1. **Debounced writes** — one write per pause, not one per keystroke.
 *  2. **A flush on unmount** — the last few characters typed before hitting
 *     back are still inside the debounce window and would otherwise be lost.
 *  3. **A dirty flag** — seeding the draft from the database must not itself
 *     trigger a write, or simply opening a note bumps its `updatedAt` and
 *     reorders the list.
 */
export function NoteEditor({ id }: NoteEditorProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { note, isLoading } = useNote(id);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  /** Set only by user edits, never by seeding. Gates every write. */
  const dirty = useRef(false);
  /** Mirrors the draft so the unmount flush can read it without stale closure. */
  const latest = useRef({ title: '', body: '', tags: [] as string[] });

  // Seed once. `note` is a fresh object on every committed write anywhere in
  // the app, so seeding on every change would clobber the draft mid-edit.
  useEffect(() => {
    if (seeded || note === undefined) return;
    setTitle(note.title);
    setBody(note.body);
    setTags(note.tags ?? []);
    setSeeded(true);
  }, [note, seeded]);

  useEffect(() => {
    latest.current = { title, body, tags };
  }, [title, body, tags]);

  const debouncedTitle = useDebouncedValue(title, AUTOSAVE_MS);
  const debouncedBody = useDebouncedValue(body, AUTOSAVE_MS);

  useEffect(() => {
    if (!seeded || !dirty.current) return;

    let cancelled = false;
    setSaveState('saving');

    void updateNote(id, { title: debouncedTitle, body: debouncedBody }).then(() => {
      if (!cancelled) setSaveState('saved');
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedTitle, debouncedBody, id, seeded]);

  /**
   * Flush on unmount, then discard if the note was never written to.
   *
   * The cleanup deliberately starts async work it does not await — the screen
   * is already gone, but the write still has to land. Ordering matters: flush
   * first, so `discardIfEmpty` sees the final content and cannot delete a note
   * whose only text is still sitting in the debounce window.
   */
  useEffect(() => {
    return () => {
      void (async () => {
        if (dirty.current) await updateNote(id, latest.current);
        await discardIfEmpty(id);
      })();
    };
  }, [id]);

  const handleTitle = useCallback((value: string) => {
    dirty.current = true;
    setTitle(value);
  }, []);

  const handleBody = useCallback((value: string) => {
    dirty.current = true;
    setBody(value);
  }, []);

  // Tags are a discrete action, so they save immediately rather than waiting
  // for the debounce — there is no "mid-word" state to protect.
  const handleTags = useCallback(
    async (next: string[]) => {
      dirty.current = true;
      setTags(next);
      setSaveState('saving');
      await updateNote(id, { tags: next });
      setSaveState('saved');
    },
    [id],
  );

  const handlePin = useCallback(async () => {
    if (note === undefined) return;
    void Haptics.selectionAsync();
    await setNotePinned(id, note.pinnedAt === null);
  }, [id, note]);

  const handleDelete = useCallback(async () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    // Stop the unmount flush from resurrecting content into the deleted row.
    dirty.current = false;
    await softDeleteNote(id);
    router.back();
  }, [id, router]);

  if (isLoading) {
    return <View style={[styles.root, { backgroundColor: theme.colors.bg }]} />;
  }

  const isPinned = note?.pinnedAt != null;

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.colors.bg, paddingTop: insets.top },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to notes"
          style={styles.headerButton}
        >
          <Icon name="chevron-back" size={22} color="accent" />
        </Pressable>

        <Text variant="caption" color="textSubtle" style={styles.saveState}>
          {saveState === 'saving' ? 'SAVING' : saveState === 'saved' ? 'SAVED' : ''}
        </Text>

        <Pressable
          onPress={handlePin}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={isPinned ? 'Unpin note' : 'Pin note'}
          accessibilityState={{ selected: isPinned }}
          style={styles.headerButton}
        >
          <Icon name={isPinned ? 'pin' : 'pin-outline'} size={19} color={isPinned ? 'accent' : 'textMuted'} />
        </Pressable>

        <Pressable
          onPress={handleDelete}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Delete note"
          style={styles.headerButton}
        >
          <Icon name="trash-outline" size={19} color="textMuted" />
        </Pressable>
      </View>

      <TextInput
        value={title}
        onChangeText={handleTitle}
        placeholder="Title"
        placeholderTextColor={theme.colors.textSubtle}
        style={[styles.title, { color: theme.colors.text }]}
        maxLength={200}
        accessibilityLabel="Note title"
      />

      <TagEditor tags={tags} onChange={handleTags} />

      <TextInput
        value={body}
        onChangeText={handleBody}
        placeholder="Start writing…"
        placeholderTextColor={theme.colors.textSubtle}
        multiline
        // Anchors the caret to the top of the box rather than vertically
        // centring it, which is the Android default for multiline inputs and
        // looks broken in a full-height editor.
        textAlignVertical="top"
        style={[styles.body, { color: theme.colors.text }]}
        accessibilityLabel="Note body"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  headerButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  saveState: { flex: 1, textAlign: 'center' },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.6,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  body: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});
