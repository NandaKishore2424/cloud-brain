import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, radii, spacing, useTheme } from '@/design';

import type { ProjectSummary } from '../hooks';

export type TodoView = 'open' | 'done';

export type FilterBarProps = {
  view: TodoView;
  onViewChange: (view: TodoView) => void;
  projects: readonly ProjectSummary[];
  activeProject: string | null;
  onProjectChange: (project: string | null) => void;
  openCount: number;
  overdueCount: number;
};

/**
 * View switch and project filter.
 *
 * The project row is only rendered when projects exist. Showing an "All" chip
 * on its own, with nothing to filter between, is chrome that teaches the user
 * nothing and costs a row of vertical space on every screen.
 */
export function FilterBar({
  view,
  onViewChange,
  projects,
  activeProject,
  onProjectChange,
  openCount,
  overdueCount,
}: FilterBarProps) {
  const theme = useTheme();

  const handleView = useCallback(
    (next: TodoView) => {
      if (next === view) return;
      void Haptics.selectionAsync();
      onViewChange(next);
    },
    [view, onViewChange],
  );

  const handleProject = useCallback(
    (next: string | null) => {
      void Haptics.selectionAsync();
      onProjectChange(next);
    },
    [onProjectChange],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.segments, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Segment
          label="Open"
          badge={openCount > 0 ? String(openCount) : null}
          active={view === 'open'}
          onPress={() => handleView('open')}
        />
        <Segment label="Done" active={view === 'done'} onPress={() => handleView('done')} />
      </View>

      {overdueCount > 0 && view === 'open' ? (
        <View style={[styles.overdue, { backgroundColor: theme.colors.negativeSoft }]}>
          <Text variant="caption" style={{ color: theme.colors.negative }}>
            {overdueCount} OVERDUE
          </Text>
        </View>
      ) : null}

      {projects.length > 0 && view === 'open' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.projects}
        >
          <ProjectChip
            label="All"
            active={activeProject === null}
            onPress={() => handleProject(null)}
          />
          {projects.map((entry) => (
            <ProjectChip
              key={entry.project}
              label={entry.project}
              count={entry.count}
              active={activeProject === entry.project}
              onPress={() => handleProject(entry.project)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

type SegmentProps = {
  label: string;
  badge?: string | null;
  active: boolean;
  onPress: () => void;
};

function Segment({ label, badge = null, active, onPress }: SegmentProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[
        styles.segment,
        { backgroundColor: active ? theme.colors.surface : 'transparent' },
      ]}
    >
      <Text
        variant="bodyMedium"
        style={{ color: active ? theme.colors.text : theme.colors.textMuted }}
      >
        {label}
      </Text>
      {badge !== null ? (
        <Text variant="caption" color="textSubtle" numeric>
          {badge}
        </Text>
      ) : null}
    </Pressable>
  );
}

type ProjectChipProps = {
  label: string;
  count?: number;
  active: boolean;
  onPress: () => void;
};

function ProjectChip({ label, count, active, onPress }: ProjectChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.projectChip,
        {
          backgroundColor: active ? theme.colors.accentSoft : theme.colors.surfaceAlt,
          borderColor: active ? theme.colors.accent : 'transparent',
        },
      ]}
    >
      <Text
        variant="label"
        numberOfLines={1}
        style={{ color: active ? theme.colors.accent : theme.colors.textMuted }}
      >
        {label}
      </Text>
      {count !== undefined ? (
        <Text variant="caption" color="textSubtle" numeric>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingBottom: spacing.sm },
  segments: {
    flexDirection: 'row',
    padding: 3,
    gap: 3,
    borderRadius: radii.md,
    marginHorizontal: spacing.lg,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 36,
    borderRadius: radii.sm,
  },
  overdue: {
    alignSelf: 'flex-start',
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  projects: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  projectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radii.pill,
    borderWidth: 1,
    maxWidth: 180,
  },
});
