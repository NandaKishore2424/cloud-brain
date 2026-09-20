import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text, radii, spacing, useTheme } from '@/design';
import { formatShortDate, toCalendarDate } from '@/lib/date';

import type { NoteListItem } from '../api';
import { buildPreview } from '../tags';

export type NoteRowProps = {
  item: NoteListItem;
  onOpen: (id: string) => void;
  onLongPress: (item: NoteListItem) => void;
};

export const NoteRow = memo(function NoteRow({
  item,
  onOpen,
  onLongPress,
}: NoteRowProps) {
  const theme = useTheme();

  const title = item.title.trim();
  const preview = buildPreview(item.body);
  const isPinned = item.pinnedAt !== null;

  return (
    <Pressable
      onPress={() => onOpen(item.id)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={title.length > 0 ? title : 'Untitled note'}
      accessibilityHint="Opens the note. Hold for options."
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent' },
      ]}
    >
      <View style={styles.header}>
        <Text
          variant="bodyMedium"
          numberOfLines={1}
          color={title.length > 0 ? 'text' : 'textSubtle'}
          style={styles.title}
        >
          {title.length > 0 ? title : 'Untitled'}
        </Text>

        {isPinned ? <Icon name="pin" size={13} color="accent" /> : null}

        <Text variant="caption" color="textSubtle" numeric>
          {formatShortDate(toCalendarDate(new Date(item.updatedAt)))}
        </Text>
      </View>

      {preview.length > 0 ? (
        <Text variant="body" color="textMuted" numberOfLines={2}>
          {preview}
        </Text>
      ) : null}

      {item.tags.length > 0 ? (
        <View style={styles.tags}>
          {item.tags.slice(0, 4).map((tag) => (
            <View
              key={tag}
              style={[styles.tag, { backgroundColor: theme.colors.surfaceAlt }]}
            >
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {tag}
              </Text>
            </View>
          ))}
          {item.tags.length > 4 ? (
            <Text variant="caption" color="textSubtle">
              +{item.tags.length - 4}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    maxWidth: 140,
  },
});
