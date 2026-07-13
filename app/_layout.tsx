import { Colors, headerOptions, Typography } from '@/constants/theme';
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
import { resolveReminderTapRoute } from '@/lib/notifications/tap-handler';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import {
  AppState,
  type AppStateStatus,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
  const router = useRouter();
  const { success, error: migrationError } = useMigrations(db, migrations);
  // DBをブラウザから閲覧できるようにする
  //　http://192.168.8.135:8081/_expo/plugins/expo-drizzle-studio-plugin
  useDrizzleStudio(__DEV__ ? expoDb : null);

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!success) return;
    seed().catch(() => {});
    onAppStart().catch(() => {});

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current !== 'active' && next === 'active') {
        onAppStart().catch(() => {});
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [success]);

  // 通知タップ → 記録タブへ遷移。cold start／background／foregroundのいずれのタップも
  // useLastNotificationResponseが横断して拾うため、リスナーの手動組み合わせは不要。
  useEffect(() => {
    if (!success || !lastNotificationResponse) return;
    const route = resolveReminderTapRoute(lastNotificationResponse);
    // タブの切り替えを伴うため、replace/dismissToではなくnavigateを使う。
    // navigateは「対象ルートが既にスタック内にあればそこまで戻る」動作なので、
    // workout/[id]・exercise-picker等の下層画面が積まれていても記録タブまで
    // 正しく畳まれ、かつ(tabs)グループ内のタブ切り替え（index⇔reminders）も
    // 効く。dismissToはスタックのpopのみを行いタブ切り替えには効かなかった
    // （実機検証済み）。replaceは下層画面が残ったままになるため使わない。
    if (route) router.navigate(route);
    // ネイティブの繰り返し通知（daily/weekly/monthly）は毎回発火してもrequest.identifierが
    // 同一のため、useLastNotificationResponseの内部dedupがidentifier一致を理由に
    // 2回目以降のタップを無視してしまう。処理後にclearしてstateをリセットすることで、
    // 同じリマインダーの次回タップも新規レスポンスとして検知できるようにする。
    Notifications.clearLastNotificationResponse();
  }, [success, lastNotificationResponse, router]);

  if (migrationError) {
    console.error('[migration error]', migrationError);
    return (
      <View style={migrationStyles.container}>
        <Text style={migrationStyles.title}>起動に失敗しました</Text>
        <Text style={migrationStyles.body}>
          アプリを再起動してください。{'\n'}
          改善しない場合はアプリを再インストールしてください。
        </Text>
      </View>
    );
  }

  if (!success) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={headerOptions}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="exercise/[id]" options={{ title: '' }} />
        <Stack.Screen
          name="exercise/edit/[id]"
          options={{ title: '種目を編集' }}
        />
        <Stack.Screen name="exercise/new" options={{ title: '種目を作成' }} />
        <Stack.Screen name="routine/index" options={{ title: 'ルーティン' }} />
        <Stack.Screen name="routine/new" options={{ title: 'ルーティンを作成' }} />
        <Stack.Screen name="routine/edit/[id]" options={{ title: 'ルーティンを編集' }} />
        <Stack.Screen name="routine/exercise-picker" options={{ title: '種目を追加' }} />
        <Stack.Screen name="routine/exercise-edit" options={{ title: '種目を編集' }} />
        <Stack.Screen name="routine/reminder" options={{ title: 'リマインダー設定' }} />
        <Stack.Screen name="workout/[id]" options={{ title: '' }} />
        <Stack.Screen
          name="workout/exercise-picker"
          options={{ title: '種目を追加' }}
        />
        <Stack.Screen
          name="workout/exercise-swap"
          options={{ title: '種目を入れ替え' }}
        />
        <Stack.Screen
          name="workout/history-picker"
          options={{ title: '過去の記録から読み込み' }}
        />
        {/* デザイン上、単一種目版のhistory-pickerと同じヘッダー文言（過去の記録から読み込み）を使う */}
        <Stack.Screen
          name="workout/session-history-picker"
          options={{ title: '過去の記録から読み込み' }}
        />
        {/* ヘッダーは選んだ過去セッションの日付（例:「7月3日（木）」）を動的に表示するため、
            画面側でStack.Screen optionsを上書きする（workout/[id]と同じ方針） */}
        <Stack.Screen name="workout/session-history-load" options={{ title: '' }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', title: 'Modal' }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

const migrationStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  title: { ...Typography.navTitle, color: Colors.danger },
  body: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
