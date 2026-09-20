/**
 * Fonts are imported from their individual weight subpaths, NOT from the
 * '@expo-google-fonts/inter' root.
 *
 * The root index re-exports all eighteen Inter variants, each a `require()` of
 * a ~340KB .ttf. Metro follows every one of those requires, so a single root
 * import silently adds roughly 6MB of fonts to the bundle — for sixteen weights
 * the app never renders. Importing per weight brings in only these four.
 */
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useDatabaseBootstrap } from '@/db/bootstrap';
import { Button, Screen, Text, useTheme } from '@/design';
import { spacing } from '@/design';

// Hold the native splash screen until fonts AND the database are ready, so the
// app never flashes an unstyled or empty frame on cold start.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const database = useDatabaseBootstrap();

  const fontsSettled = fontsLoaded || fontError !== null;
  const databaseSettled = database.status !== 'pending';
  const settled = fontsSettled && databaseSettled;

  useEffect(() => {
    if (settled) void SplashScreen.hideAsync();
  }, [settled]);

  if (!settled) return null;

  if (database.status === 'failed') {
    return (
      <SafeAreaProvider>
        <DatabaseFailure message={database.error.message} />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          {/* The note editor lives in the root stack rather than inside the
              tabs, so it pushes over the tab bar and takes the full screen. */}
          <Stack.Screen
            name="note/[id]"
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="application/[id]"
            options={{ animation: 'slide_from_right' }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Terminal state. If migrations fail the app has no usable storage, so there is
 * nothing to degrade gracefully into — say so plainly and offer the one action
 * that actually helps.
 */
function DatabaseFailure({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <Screen>
      <View style={styles.failure}>
        <Text variant="title">Storage unavailable</Text>
        <Text variant="body" color="textMuted" align="center">
          {message}
        </Text>
        <Text variant="caption" color="textSubtle" align="center">
          Reinstalling the app will rebuild the local database. Any unsynced data
          will be lost.
        </Text>
        <Button
          label="Reload"
          variant="secondary"
          onPress={() => {
            // Re-mounting is the only recovery available from inside the app.
            void SplashScreen.hideAsync();
          }}
          style={{ marginTop: theme.spacing.lg }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  failure: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
});
