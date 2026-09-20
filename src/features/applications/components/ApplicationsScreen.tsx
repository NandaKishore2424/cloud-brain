import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ApplicationStatus } from '@/db/schema';
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
  restoreApplication,
  softDeleteApplication,
  type ApplicationListItem,
} from '../api';
import { useApplications } from '../hooks';
import { STATUS_TOKENS, type PipelineRow } from '../pipeline';
import { AddApplicationSheet } from './AddApplicationSheet';
import { ApplicationRow } from './ApplicationRow';

type Row = PipelineRow<ApplicationListItem>;

/**
 * The Jobs tab.
 *
 * Composition root, same shape as the other three features.
 *
 * Stages are ordered furthest-along first rather than chronologically through
 * the funnel — when you open this you want the offer and the onsite, not thirty
 * applications that went nowhere. Closed outcomes are hidden by default.
 */
export function ApplicationsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [showClosed, setShowClosed] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [actionsFor, setActionsFor] = useState<ApplicationListItem | null>(null);

  const { rows, stickyIndices, activeCount, followUpCount, total, isLoading } =
    useApplications(showClosed);
  const undo = useUndoTarget();

  const handleOpen = useCallback(
    (id: string) => router.push(`/application/${id}`),
    [router],
  );

  const handleDelete = useCallback(
    async (item: ApplicationListItem) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setActionsFor(null);

      const result = await softDeleteApplication(item.id);
      if (result.ok) undo.set(item.id);
    },
    [undo],
  );

  const handleUndo = useCallback(
    async (id: string) => {
      undo.clear();
      void Haptics.selectionAsync();
      await restoreApplication(id);
    },
    [undo],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) =>
      item.kind === 'header' ? (
        <StageHeader label={item.label} count={item.count} status={item.status} />
      ) : (
        <ApplicationRow
          item={item.item}
          onOpen={handleOpen}
          onLongPress={setActionsFor}
        />
      ),
    [handleOpen],
  );

  return (
    <Screen gutter="none">
      <View style={styles.summary}>
        <View style={styles.counts}>
          <Stat label="ACTIVE" value={activeCount} />
          <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
          <Stat label="TOTAL" value={total} />
          <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
          <Stat label="FOLLOW UP" value={followUpCount} tone={followUpCount > 0 ? 'negative' : undefined} />
        </View>

        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            setShowClosed((current) => !current);
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: showClosed }}
          style={[
            styles.toggle,
            {
              backgroundColor: showClosed ? theme.colors.accentSoft : theme.colors.surfaceAlt,
              borderColor: showClosed ? theme.colors.accent : 'transparent',
            },
          ]}
        >
          <Icon
            name={showClosed ? 'eye-outline' : 'eye-off-outline'}
            size={13}
            color={showClosed ? 'accent' : 'textMuted'}
          />
          <Text
            variant="caption"
            style={{ color: showClosed ? theme.colors.accent : theme.colors.textMuted }}
          >
            CLOSED
          </Text>
        </Pressable>
      </View>

      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        stickyHeaderIndices={stickyIndices}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.giant * 2 }}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={RowSeparator}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <EmptyState
                icon="briefcase-outline"
                title={total === 0 ? 'No applications yet' : 'Nothing active'}
                hint={
                  total === 0
                    ? 'Tap + when you send your first one.'
                    : 'Everything is closed. Toggle CLOSED to see them.'
                }
              />
            </View>
          )
        }
      />

      <UndoBar
        target={undo.target}
        message="Application deleted"
        onUndo={handleUndo}
        onExpire={undo.clear}
        bottom={insets.bottom + spacing.lg}
        right={spacing.giant + spacing.xxl}
      />

      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setSheetVisible(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Add application"
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

      <AddApplicationSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
      />

      <Sheet visible={actionsFor !== null} onClose={() => setActionsFor(null)}>
        <View style={styles.actions}>
          <Text variant="heading" numberOfLines={1}>
            {actionsFor?.company}
          </Text>
          <Divider spacingY="sm" />
          <Pressable
            onPress={() => actionsFor && handleDelete(actionsFor)}
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
    </Screen>
  );
}

function keyExtractor(row: Row): string {
  return row.kind === 'header' ? `h:${row.status}` : row.item.id;
}

function getItemType(row: Row): string {
  return row.kind;
}

function RowSeparator() {
  return <Divider inset="lg" />;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'negative';
}) {
  const theme = useTheme();
  return (
    <View style={styles.stat}>
      <Text
        variant="heading"
        numeric
        style={tone === 'negative' ? { color: theme.colors.negative } : undefined}
      >
        {value}
      </Text>
      <Text variant="caption" color="textSubtle">
        {label}
      </Text>
    </View>
  );
}

function StageHeader({
  label,
  count,
  status,
}: {
  label: string;
  count: number;
  status: ApplicationStatus;
}) {
  const theme = useTheme();
  const token = STATUS_TOKENS[status];

  return (
    <View style={[styles.stageHeader, { backgroundColor: theme.colors.bg }]}>
      <View style={styles.stageLabel}>
        <View style={[styles.dot, { backgroundColor: theme.colors[token] }]} />
        <Text variant="caption" style={{ color: theme.colors[token] }}>
          {label.toUpperCase()}
        </Text>
      </View>
      <Text variant="caption" color="textSubtle" numeric>
        {count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  counts: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 },
  stat: { alignItems: 'flex-start', gap: 1 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 26 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  stageLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: radii.pill },
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
