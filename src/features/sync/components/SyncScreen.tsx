import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Divider, Icon, Screen, Text, radii, spacing, useTheme } from '@/design';

import { isSyncConfigured, requestCode, resetCursors, signOut, verifyCode } from '../api';
import { useAuthSession, useSync } from '../hooks';
import { formatSyncedAt } from '../plan';

/**
 * Backup & sync.
 *
 * **This screen is a destination, not a gate.** It is reached from Home, never
 * shown on launch, and nothing anywhere else in the app waits on it. Signing in
 * turns on replication; not signing in costs nothing but replication. ADR 0004
 * is the reason, and putting sync behind a tab or a modal on first run is the
 * single easiest way to break it.
 */
export function SyncScreen() {
  const { session, isRestoring } = useAuthSession();
  const sync = useSync(session !== null);

  if (!isSyncConfigured) return <NotConfigured />;

  if (isRestoring) {
    return (
      <Screen>
        <View style={styles.centre}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <BackLink />

      <View style={styles.header}>
        <Text variant="title">Backup & sync</Text>
        <Text variant="body" color="textMuted" style={styles.lede}>
          Your data lives on this phone and works offline. Signing in keeps a
          private copy on the server, so a lost phone is not lost data.
        </Text>
      </View>

      {session === null ? (
        <SignIn />
      ) : (
        <SignedIn email={session.user.email ?? 'your account'} sync={sync} />
      )}
    </Screen>
  );
}

function BackLink() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Back to home"
      style={styles.back}
    >
      <Icon name="chevron-back" size={22} color="accent" />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Signed in                                                           */
/* ------------------------------------------------------------------ */

function SignedIn({
  email,
  sync,
}: {
  email: string;
  sync: ReturnType<typeof useSync>;
}) {
  const theme = useTheme();
  const isSyncing = sync.status === 'syncing';

  const confirmReset = () => {
    Alert.alert(
      'Reset sync?',
      'Forgets what has already been exchanged and syncs everything again from scratch. No data is deleted — on this phone or on the server.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            void resetCursors().then(() => sync.sync());
          },
        },
      ],
    );
  };

  return (
    <>
      <Card padding="lg" style={styles.card}>
        <View style={styles.statusRow}>
          <Icon
            name={
              sync.status === 'error'
                ? 'alert-circle'
                : sync.pending > 0
                  ? 'cloud-upload-outline'
                  : 'checkmark-circle'
            }
            size={19}
            color={sync.status === 'error' ? 'negative' : sync.pending > 0 ? 'warning' : 'positive'}
          />
          <View style={styles.statusText}>
            <Text variant="bodyMedium">
              {isSyncing ? 'Syncing…' : formatSyncedAt(sync.lastSyncedAt, Date.now())}
            </Text>
            <Text variant="caption" color="textMuted">
              {sync.pending === 0
                ? 'Everything on this phone is backed up'
                : `${sync.pending} ${sync.pending === 1 ? 'change' : 'changes'} waiting to upload`}
            </Text>
          </View>
        </View>

        {/* A failure is stated plainly. Sync that fails quietly is worse than
            no sync, because it is indistinguishable from sync that works. */}
        {sync.error !== null ? (
          <View style={[styles.errorBox, { backgroundColor: theme.colors.negativeSoft }]}>
            <Text variant="caption" color="negative">
              {sync.error}
            </Text>
          </View>
        ) : null}

        <Button
          label={isSyncing ? 'Syncing…' : 'Sync now'}
          onPress={sync.sync}
          loading={isSyncing}
          disabled={isSyncing}
          fullWidth
          style={styles.action}
        />
      </Card>

      <Card padding="lg" style={styles.card}>
        <Text variant="caption" color="textSubtle">
          ACCOUNT
        </Text>
        <Text variant="body" style={styles.email}>
          {email}
        </Text>

        <Divider spacingY="md" />

        <Button
          label="Sign out"
          variant="ghost"
          onPress={() => {
            void signOut();
          }}
          fullWidth
          accessibilityHint="Stops syncing. Nothing on this phone is deleted."
        />
        <Button label="Reset sync" variant="ghost" onPress={confirmReset} fullWidth />
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Sign in                                                             */
/* ------------------------------------------------------------------ */

function SignIn() {
  const theme = useTheme();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    setBusy(true);
    setError(null);
    void requestCode(email).then((result) => {
      setBusy(false);
      if (result.ok) setSent(true);
      else setError(result.error.message);
    });
  };

  const verify = () => {
    setBusy(true);
    setError(null);
    void verifyCode(email, code).then((result) => {
      setBusy(false);
      // On success the auth listener swaps this screen out; there is nothing
      // to do here.
      if (!result.ok) setError(result.error.message);
    });
  };

  return (
    <Card padding="lg" style={styles.card}>
      {sent ? (
        <>
          <Text variant="caption" color="textSubtle">
            CODE SENT TO {email.toUpperCase()}
          </Text>
          <TextInput
            value={code}
            onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={theme.colors.textSubtle}
            keyboardType="number-pad"
            // Android reads the code straight out of the SMS/email autofill
            // hint, which removes the app-switch entirely on most devices.
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
            style={[
              styles.input,
              styles.codeInput,
              { color: theme.colors.text, borderColor: theme.colors.border },
            ]}
            accessibilityLabel="Six-digit code"
          />
          <Button
            label="Verify"
            onPress={verify}
            loading={busy}
            disabled={busy || code.length !== 6}
            fullWidth
            style={styles.action}
          />
          <Button
            label="Use a different address"
            variant="ghost"
            onPress={() => {
              setSent(false);
              setCode('');
              setError(null);
            }}
            fullWidth
          />
        </>
      ) : (
        <>
          <Text variant="caption" color="textSubtle">
            EMAIL
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={theme.colors.textSubtle}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
            accessibilityLabel="Email address"
          />
          <Text variant="caption" color="textMuted">
            We send a six-digit code. No password to choose, forget or leak.
          </Text>
          <Button
            label="Send code"
            onPress={send}
            loading={busy}
            disabled={busy || email.trim().length === 0}
            fullWidth
            style={styles.action}
          />
        </>
      )}

      {error !== null ? (
        <View style={[styles.errorBox, { backgroundColor: theme.colors.negativeSoft }]}>
          <Text variant="caption" color="negative">
            {error}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Not configured                                                      */
/* ------------------------------------------------------------------ */

/**
 * A build with no Supabase credentials is a valid build, not a broken one —
 * cloning this repo and running it must work without a Supabase project.
 */
function NotConfigured() {
  return (
    <Screen>
      <BackLink />
      <View style={styles.header}>
        <Text variant="title">Backup & sync</Text>
      </View>
      <Card padding="lg">
        <View style={styles.statusRow}>
          <Icon name="cloud-offline-outline" size={19} color="textMuted" />
          <View style={styles.statusText}>
            <Text variant="bodyMedium">Not configured in this build</Text>
            <Text variant="caption" color="textMuted">
              Everything still works and stays on this phone. Add a Supabase URL
              and key to .env to enable backup.
            </Text>
          </View>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.sm, paddingRight: spacing.md },
  header: { paddingTop: spacing.lg, paddingBottom: spacing.md },
  lede: { marginTop: spacing.xs },
  card: { marginBottom: spacing.md },
  statusRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  statusText: { flex: 1, gap: 2 },
  errorBox: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  action: { marginTop: spacing.md },
  email: { marginTop: 2 },
  input: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
});
