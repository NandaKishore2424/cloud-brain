import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Divider,
  EmptyState,
  Icon,
  Screen,
  Sheet,
  Text,
  UndoBar,
  radii,
  spacing,
  useTheme,
  useUndoTarget,
} from '@/design';

import {
  createNote,
  restoreNote,
  setNotePinned,
  softDeleteNote,
  type NoteListItem,
} from '../api';
import { useDebouncedValue, useNotes } from '../hooks';
import { NoteRow } from './NoteRow';
import { SearchBar } from './SearchBar';

/** Time input must settle before a search query runs. */
const SEARCH_DEBOUNCE_MS = 220;

type ListRow =
  | { kind: 'header'; label: string }
  | { kind: 'item'; item: NoteListItem };

/**
 * The Notes tab.
 *
 * Composition root, same shape as `MoneyScreen` and `TodosScreen`.
 *
 * Creating a note inserts an empty row **first** and then navigates to the
 * editor, so the editor always has a real id to autosave into rather than
 * deciding between insert and update on every keystroke. Abandoning an empty
 * note removes it on exit — see `discardIfEmpty`.
 */
export function NotesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [actionsFor, setActionsFor] = useState<NoteListItem | null>(null);

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const { pinned, rest, total, isLoading } = useNotes(debouncedSearch);
  const undo = useUndoTarget();

  const isSearching = search.trim().length > 0;

  /**
   * Flatten into header/item rows.
   *
   * Section headings are suppressed while searching: results are ranked by
   * relevance to what was typed, and splitting them under "Pinned" and "All"
   * hides the best match below a heading.
   */
  const rows = useMemo<ListRow[]>(() => {
    if (isSearching) return rest.concat(pinned).map((item) => ({ kind: 'item', item }));

    const out: ListRow[] = [];
    if (pinned.length > 0) {
      out.push({ kind: 'header', label: 'PINNED' });
      for (const item of pinned) out.push({ kind: 'item', item });
    }
    if (rest.length > 0) {
      if (pinned.length > 0) out.push({ kind: 'header', label: 'ALL NOTES' });
      for (const item of rest) out.push({ kind: 'item', item });
    }
    return out;
  }, [pinned, rest, isSearching]);

  const stickyIndices = useMemo(
    () =>
      rows.flatMap((row, index) => (row.kind === 'header' ? [index] : [])),
    [rows],
  );

  const handleCreate = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await createNote();
    if (result.ok) router.push(`/note/${result.value}`);
  }, [router]);

  const handleOpen = useCallback(
    (id: string) => router.push(`/note/${id}`),
    [router],
  );

  const handleTogglePin = useCallback(async (note: NoteListItem) => {
    void Haptics.selectionAsync();
    setActionsFor(null);
    await setNotePinned(note.id, note.pinnedAt === null);
  }, []);

  const handleDelete = useCallback(
    async (note: NoteListItem) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setActionsFor(null);

      const result = await softDeleteNote(note.id);
      if (result.ok) undo.set(note.id);
    },
    [undo],
  );

  const handleUndo = useCallback(
    async (id: string) => {
      undo.clear();
      void Haptics.selectionAsync();
      await restoreNote(id);
    },
    [undo],
  );

  const renderItem = useCallback(
    ({ item }: { item: ListRow }) =>
      item.kind === 'header' ? (
        <SectionHeader label={item.label} />
      ) : (
        <NoteRow item={item.item} onOpen={handleOpen} onLongPress={setActionsFor} />
      ),
    [handleOpen],
  );

  return (
    <Screen gutter="none">
      <SearchBar
        value={search}
        onChange={setSearch}
        pending={search !== debouncedSearch}
        resultCount={total}
      />

      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        stickyHeaderIndices={stickyIndices}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.giant * 2 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={NoteSeparator}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <EmptyState
                icon={isSearching ? 'search-outline' : 'document-text-outline'}
                title={isSearching ? 'No matches' : 'No notes yet'}
                hint={
                  isSearching
                    ? 'Try a shorter term, or a word from the body.'
                    : 'Tap + to start writing.'
                }
              />
            </View>
          )
        }
      />

      <UndoBar
        target={undo.target}
        message="Note deleted"
        onUndo={handleUndo}
        onExpire={undo.clear}
        bottom={insets.bottom + spacing.lg}
        right={spacing.giant + spacing.xxl}
      />

      <Pressable
        onPress={handleCreate}
        accessibilityRole="button"
        accessibilityLabel="New note"
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: insets.bottom + spacing.lg,
            backgroundColor: theme.colors.accent,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          },
          theme.elevation.high,
        ]}
      >
        <Icon name="add" size={26} color="textOnAccent" />
      </Pressable>

      <NoteActionsSheet
        note={actionsFor}
        onClose={() => setActionsFor(null)}
        onTogglePin={handleTogglePin}
        onDelete={handleDelete}
      />
    </Screen>
  );
}

function keyExtractor(row: ListRow): string {
  return row.kind === 'header' ? `h:${row.label}` : row.item.id;
}

function getItemType(row: ListRow): string {
  return row.kind;
}

function NoteSeparator() {
  return <Divider inset="lg" />;
}

function SectionHeader({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.sectionHeader, { backgroundColor: theme.colors.bg }]}>
      <Text variant="caption" color="textSubtle">
        {label}
      </Text>
    </View>
  );
}

type NoteActionsSheetProps = {
  note: NoteListItem | null;
  onClose: () => void;
  onTogglePin: (note: NoteListItem) => void;
  onDelete: (note: NoteListItem) => void;
};

function NoteActionsSheet({
  note,
  onClose,
  onTogglePin,
  onDelete,
}: NoteActionsSheetProps) {
  const theme = useTheme();
  const isPinned = note?.pinnedAt !== null && note !== null;

  return (
    <Sheet visible={note !== null} onClose={onClose}>
      <View style={styles.actions}>
        <Text variant="heading" numberOfLines={1}>
          {note?.title.trim() || 'Untitled'}
        </Text>

        <Divider spacingY="sm" />

        <Pressable
          onPress={() => note && onTogglePin(note)}
          accessibilityRole="button"
          style={[styles.action, { backgroundColor: theme.colors.surfaceAlt }]}
        >
          <Icon name={isPinned ? 'pin-outline' : 'pin'} size={17} color="accent" />
          <Text variant="body">{isPinned ? 'Unpin' : 'Pin to top'}</Text>
        </Pressable>

        <Pressable
          onPress={() => note && onDelete(note)}
          accessibilityRole="button"
          style={[styles.action, { backgroundColor: theme.colors.negativeSoft }]}
        >
          <Icon name="trash-outline" size={17} color="negative" />
          <Text variant="body" style={{ color: theme.colors.negative }}>
            Delete
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  empty: { paddingTop: spacing.giant, minHeight: 240 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
  },
});
