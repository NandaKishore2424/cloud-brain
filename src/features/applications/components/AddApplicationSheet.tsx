import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, Sheet, Text, radii, spacing, useTheme } from '@/design';
import { parseAmount, type Paise } from '@/lib/money';

import { createApplication } from '../api';

export type AddApplicationSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * New application entry.
 *
 * Two required fields — company and role — and nothing else. Same
 * defaults-first principle as the money and todo flows (ADR 0007): applied date
 * defaults to today, status to `applied`, and everything else is added later
 * from the detail screen if it turns out to matter.
 *
 * Salary is optional and entered in **rupees**, parsed to paise on save through
 * the same `parseAmount` the ledger uses, so the integer-paise invariant holds
 * here too.
 */
export function AddApplicationSheet({ visible, onClose }: AddApplicationSheetProps) {
  const theme = useTheme();
  const companyRef = useRef<TextInput>(null);

  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [source, setSource] = useState('');
  const [location, setLocation] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCompany('');
    setRole('');
    setSource('');
    setLocation('');
    setSalaryMin('');
    setSalaryMax('');
    setSaving(false);
    setError(null);
  }, [visible]);

  const canSave =
    company.trim().length > 0 && role.trim().length > 0 && !saving;

  const handleSave = async () => {
    // Optional salary: blank is fine, but anything typed must be valid rather
    // than silently dropped.
    let min: Paise | null = null;
    let max: Paise | null = null;

    if (salaryMin.trim().length > 0) {
      const parsed = parseAmount(salaryMin);
      if (!parsed.ok) return setError(`Minimum salary: ${parsed.error.message}`);
      min = parsed.value;
    }
    if (salaryMax.trim().length > 0) {
      const parsed = parseAmount(salaryMax);
      if (!parsed.ok) return setError(`Maximum salary: ${parsed.error.message}`);
      max = parsed.value;
    }
    if (min !== null && max !== null && min > max) {
      return setError('Minimum salary is above the maximum');
    }

    setSaving(true);
    const result = await createApplication({
      company,
      role,
      source,
      location,
      salaryMin: min,
      salaryMax: max,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error.message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} dismissible={!saving}>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text variant="heading">New application</Text>

        <Field label="COMPANY">
          <TextInput
            ref={companyRef}
            value={company}
            onChangeText={setCompany}
            placeholder="Where"
            placeholderTextColor={theme.colors.textSubtle}
            autoFocus
            maxLength={80}
            style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt }]}
            accessibilityLabel="Company"
          />
        </Field>

        <Field label="ROLE">
          <TextInput
            value={role}
            onChangeText={setRole}
            placeholder="What position"
            placeholderTextColor={theme.colors.textSubtle}
            maxLength={80}
            style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt }]}
            accessibilityLabel="Role"
          />
        </Field>

        <View style={styles.pair}>
          <Field label="SOURCE" style={styles.half}>
            <TextInput
              value={source}
              onChangeText={setSource}
              placeholder="Referral, LinkedIn"
              placeholderTextColor={theme.colors.textSubtle}
              maxLength={40}
              style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt }]}
              accessibilityLabel="Source"
            />
          </Field>
          <Field label="LOCATION" style={styles.half}>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Remote, Chennai"
              placeholderTextColor={theme.colors.textSubtle}
              maxLength={40}
              style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt }]}
              accessibilityLabel="Location"
            />
          </Field>
        </View>

        <View style={styles.pair}>
          <Field label="SALARY FROM (₹)" style={styles.half}>
            <TextInput
              value={salaryMin}
              onChangeText={setSalaryMin}
              placeholder="Optional"
              placeholderTextColor={theme.colors.textSubtle}
              keyboardType="numeric"
              maxLength={12}
              style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt }]}
              accessibilityLabel="Minimum salary in rupees"
            />
          </Field>
          <Field label="TO (₹)" style={styles.half}>
            <TextInput
              value={salaryMax}
              onChangeText={setSalaryMax}
              placeholder="Optional"
              placeholderTextColor={theme.colors.textSubtle}
              keyboardType="numeric"
              maxLength={12}
              style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt }]}
              accessibilityLabel="Maximum salary in rupees"
            />
          </Field>
        </View>

        {error !== null ? (
          <Text variant="label" color="negative">
            {error}
          </Text>
        ) : null}

        <Button
          label={saving ? 'Saving' : 'Add application'}
          onPress={handleSave}
          disabled={!canSave}
          loading={saving}
          fullWidth
          size="lg"
        />
      </ScrollView>
    </Sheet>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text variant="caption" color="textSubtle">
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.lg },
  field: { gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  input: {
    fontSize: 15,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
});
