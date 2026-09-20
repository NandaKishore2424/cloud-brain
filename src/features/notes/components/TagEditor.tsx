import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon, Text, radii, spacing, useTheme } from '@/design';

import { normaliseTags } from '../tags';

export type TagEditorProps = {
  tags: readonly string[];
  onChange: (tags: string[]) => void;
};

/** Characters that commit the tag being typed. */
const COMMIT_CHARS = /[,\s]$/;

/**
 * Inline tag entry.
 *
 * Committing on space or comma rather than on a dedicated button: tags are
 * typed in the flow of writing, and reaching for a button between each one
 * breaks that. Backspace on an empty field removes the last tag, which is the
 * behaviour every tag input people have used already has.
 *
 * Normalisation (trim, lowercase, de-duplicate) runs through the same
 * `normaliseTags` the data layer uses, so what is displayed is exactly what is
 * stored — no drift between the chip shown and the row written.
 */
export function TagEditor({ tags, onChange }: TagEditorProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');

  const commit = useCallback(
    (raw: string) => {
      const next = normaliseTags([...tags, raw]);
      setDraft('');
      if (next.length !== tags.length) onChange(next);
    },
    [tags, onChange],
  );

  const handleChange = useCallback(
    (value: string) => {
      if (COMMIT_CHARS.test(value)) {
        const candidate = value.slice(0, -1);
        if (candidate.trim().length > 0) commit(candidate);
        else setDraft('');
        return;
      }
      setDraft(value);
    },
    [commit],
  );

  const handleKeyPress = useCallback(
    (key: string) => {
      if (key !== 'Backspace' || draft.length > 0 || tags.length === 0) return;
      onChange(tags.slice(0, -1));
    },
    [draft, tags, onChange],
  );

  const remove = useCallback(
    (tag: string) => onChange(tags.filter((candidate) => candidate !== tag)),
    [tags, onChange],
  );

  return (
    <View style={styles.container}>
      <Icon name="pricetag-outline" size={13} color="textSubtle" />

      {tags.map((tag) => (
        <Pressable
          key={tag}
          onPress={() => remove(tag)}
          accessibilityRole="button"
          accessibilityLabel={`Remove tag ${tag}`}
          style={[styles.chip, { backgroundColor: theme.colors.accentSoft }]}
        >
          <Text variant="caption" style={{ color: theme.colors.accent }}>
            {tag}
          </Text>
          <Icon name="close" size={11} color="accent" />
        </Pressable>
      ))}

      <TextInput
        value={draft}
        onChangeText={handleChange}
        onKeyPress={(event) => handleKeyPress(event.nativeEvent.key)}
        onBlur={() => draft.trim().length > 0 && commit(draft)}
        onSubmitEditing={() => draft.trim().length > 0 && commit(draft)}
        placeholder={tags.length === 0 ? 'Add tags' : ''}
        placeholderTextColor={theme.colors.textSubtle}
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={false}
        maxLength={30}
        style={[styles.input, { color: theme.colors.text }]}
        accessibilityLabel="Add a tag"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 26,
    borderRadius: radii.sm,
  },
  input: { minWidth: 90, flex: 1, fontSize: 13, padding: 0, height: 26 },
});
