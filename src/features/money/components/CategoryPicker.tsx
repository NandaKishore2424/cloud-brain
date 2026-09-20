import * as Haptics from 'expo-haptics';
import { memo, useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Text, radii, spacing, useTheme, type IconName } from '@/design';

import type { PickerCategory } from '../hooks';

export type CategoryPickerProps = {
  categories: readonly PickerCategory[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

/**
 * Horizontal category strip, most-recently-used first.
 *
 * Horizontal rather than a grid or a modal picker because it costs no vertical
 * space — the keypad needs all of it — and because the ordering means the
 * target is almost always already on screen. Opening a separate picker screen
 * would add a navigation transition to a flow measured in seconds.
 *
 * The ordering comes from the query (see `categoriesByRecency`), so after a
 * week of use the first two or three chips cover most entries and selection
 * becomes a single tap with no scrolling at all.
 */
export function CategoryPicker({ categories, selectedId, onSelect }: CategoryPickerProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      keyboardShouldPersistTaps="handled"
    >
      {categories.map((category) => (
        <CategoryChip
          key={category.id}
          category={category}
          selected={category.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </ScrollView>
  );
}

type CategoryChipProps = {
  category: PickerCategory;
  selected: boolean;
  onSelect: (id: string) => void;
};

const CategoryChip = memo(function CategoryChip({
  category,
  selected,
  onSelect,
}: CategoryChipProps) {
  const theme = useTheme();

  const handlePress = useCallback(() => {
    void Haptics.selectionAsync();
    onSelect(category.id);
  }, [category.id, onSelect]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={category.name}
      onPress={handlePress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surfaceAlt,
          borderColor: selected ? theme.colors.accent : 'transparent',
        },
      ]}
    >
      <Icon
        name={category.icon as IconName}
        size={15}
        color={selected ? 'accent' : 'textMuted'}
      />
      <Text
        variant="label"
        style={{ color: selected ? theme.colors.accent : theme.colors.textMuted }}
        numberOfLines={1}
      >
        {category.name}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  strip: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 38,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
});

export const CategoryPickerStyles = StyleSheet.create({
  placeholder: { paddingHorizontal: spacing.xl },
});

/** Shown while the category query is still resolving on first open. */
export function CategoryPickerSkeleton() {
  const theme = useTheme();
  return (
    <View style={[styles.strip, CategoryPickerStyles.placeholder, { flexDirection: 'row' }]}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[styles.chip, { backgroundColor: theme.colors.surfaceAlt, width: 96 }]}
        />
      ))}
    </View>
  );
}
