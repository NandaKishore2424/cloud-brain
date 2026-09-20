import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Screen, Text, radii, spacing } from '@/design';

type Props = {
  children: ReactNode;
  /** Where in the tree this boundary sits. Included in the log line. */
  label: string;
};

type State = {
  error: Error | null;
  /** Bumped on reset to force the subtree to remount rather than re-render. */
  attempt: number;
};

/**
 * Catches render errors and offers a way back.
 *
 * Without one of these, a single bad render unmounts the entire tree and leaves
 * a white screen with no route out but force-quitting the app. React has no
 * hook equivalent — `componentDidCatch` only exists on class components — so
 * this is the one class in the codebase, and that is worth a comment rather
 * than looking like an oversight.
 *
 * **What makes recovery honest here is local-first.** The data lives in SQLite
 * and was committed before the render that failed; a UI crash cannot lose it.
 * So "try again" is a real offer, not a hopeful one: remounting the subtree
 * re-reads from a database that is still intact. In a server-backed app the
 * same button would be a guess about whether an in-flight mutation landed.
 *
 * Resetting bumps `attempt`, which is used as a `key`. Clearing the error alone
 * would re-render the same subtree with the same props and, if the cause is
 * deterministic, immediately throw again — a loop that looks like a frozen
 * button. Remounting at least gives effects and derived state a fresh start.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The only reporting this app has. A crash reporter would go here; until
    // then a dev-console line with the component stack is what makes an
    // otherwise-silent failure diagnosable.
    if (__DEV__) {
      console.error(
        `[ErrorBoundary:${this.props.label}]`,
        error,
        info.componentStack,
      );
    }
  }

  private readonly handleReset = (): void => {
    this.setState((previous) => ({ error: null, attempt: previous.attempt + 1 }));
  };

  render(): ReactNode {
    const { error, attempt } = this.state;
    const { children, label } = this.props;

    if (error === null) {
      return <View key={attempt} style={styles.fill}>{children}</View>;
    }

    return (
      <Screen scroll>
        <View style={styles.body}>
          <Text variant="title">Something broke</Text>

          <Text variant="body" color="textMuted">
            This screen hit an error it could not render. Your data is safe — it
            is stored on the device and was saved before this happened.
          </Text>

          <Button label="Try again" onPress={this.handleReset} size="lg" fullWidth />

          {__DEV__ ? (
            <View style={styles.debug}>
              <Text variant="caption" color="textSubtle">
                {label.toUpperCase()} · DEV ONLY
              </Text>
              <ScrollView style={styles.trace} nestedScrollEnabled>
                <Text variant="label" color="negative">
                  {error.message}
                </Text>
                {error.stack !== undefined ? (
                  <Text variant="caption" color="textSubtle">
                    {error.stack}
                  </Text>
                ) : null}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Screen>
    );
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.giant },
  debug: { gap: spacing.sm, marginTop: spacing.xl },
  trace: { maxHeight: 260, borderRadius: radii.md },
});
