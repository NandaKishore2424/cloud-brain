import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon, radii, spacing, useTheme } from '@/design';

export type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  /** True while the debounce has not yet settled — shows the query is pending. */
  pending: boolean;
  resultCount: number;
};

export function SearchBar({ value, onChange, pending, resultCount }: SearchBarProps) {
  const theme = useTheme();
  const hasValue = value.length > 0;

  return (
    <View style={styles.container}>
      <View style={[styles.field, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Icon
          name={pending ? 'hourglass-outline' : 'search-outline'}
          size={16}
          color="textSubtle"
        />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Search notes"
          placeholderTextColor={theme.colors.textSubtle}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          style={[styles.input, { color: theme.colors.text }]}
          accessibilityLabel="Search notes"
          accessibilityHint={
            hasValue ? `${resultCount} matching notes` : undefined
          }
        />
        {hasValue ? (
          <Pressable
            onPress={() => onChange('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Icon name="close-circle" size={16} color="textSubtle" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  input: { flex: 1, fontSize: 15, padding: 0 },
});
