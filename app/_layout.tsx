import { db, expoDb } from '@/db/client';
import { seed } from '@/db/seed';
import migrations from '@/drizzle/migrations';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ensureAndroidChannel } from '@/lib/notifications/channels';
import { getPermissionState } from '@/lib/notifications/permissions';
import {
  pruneExpiredNotifications,
  refillAllReminders,
} from '@/lib/notifications/scheduler';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import 'react-native-reanimated';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const unstable_settings = {
  anchor: '(tabs)',
};

let appStarting = false;
async function onAppStart() {
  if (appStarting) return;
  appStarting = true;
  try {
    await ensureAndroidChannel();
    await pruneExpiredNotifications();
    const state = await getPermissionState();
    if (state === 'granted') await refillAllReminders();
  } finally {
    appStarting = false;
  }
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { success } = useMigrations(db, migrations);
  // DBをブラウザから閲覧できるようにする
  //　http://192.168.8.135:8081/_expo/plugins/expo-drizzle-studio-plugin
  useDrizzleStudio(__DEV__ ? expoDb : null);

  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!success) return;
    seed();
    onAppStart().catch(() => {});

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current !== 'active' && next === 'active') {
        onAppStart().catch(() => {});
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [success]);

  if (!success) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', title: 'Modal' }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
