import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { TransactionType } from '@/db/schema';
import { Text, radii, useTheme } from '@/design';

export type TypeToggleProps = {
  value: TransactionType;
  onChange: (value: TransactionType) => void;
};

/**
 * Expense / Income switch.
 *
 * Two visible options rather than a dropdown, because the choice is binary and
 * a dropdown would cost a tap plus a menu animation. Expense is the default in
 * the sheet — for a salaried user, income is a handful of entries a month
 * against dozens of expenses, so the common case should need zero interaction.
 *
 * Colour carries the meaning: the selected segment adopts the semantic
 * positive/negative colour, so the sheet's whole state is legible at a glance
 * without reading the label.
 */
export function TypeToggle({ value, onChange }: TypeToggleProps) {
  const theme = useTheme();

  const handleSelect = useCallback(
    (next: TransactionType) => {
      if (next === value) return;
      void Haptics.selectionAsync();
      onChange(next);
    },
    [value, onChange],
  );

  return (
    <View style={[styles.track, { backgroundColor: theme.colors.surfaceAlt }]}>
      <Segment
        label="Expense"
        active={value === 'expense'}
        activeColor={theme.colors.negative}
        activeBackground={theme.colors.negativeSoft}
        onPress={() => handleSelect('expense')}
      />
      <Segment
        label="Income"
        active={value === 'income'}
        activeColor={theme.colors.positive}
        activeBackground={theme.colors.positiveSoft}
        onPress={() => handleSelect('income')}
      />
    </View>
  );
}

type SegmentProps = {
  label: string;
  active: boolean;
  activeColor: string;
  activeBackground: string;
  onPress: () => void;
};

function Segment({ label, active, activeColor, activeBackground, onPress }: SegmentProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.segment,
        { backgroundColor: active ? activeBackground : 'transparent' },
      ]}
    >
      <Text
        variant="bodyMedium"
        style={{ color: active ? activeColor : theme.colors.textMuted }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radii.md,
    gap: 3,
  },
  segment: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
});
