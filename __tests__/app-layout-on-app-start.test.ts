// app/_layout.tsxのonAppStart(アプリ起動時・フォアグラウンド復帰時に呼ばれる)の呼び出し順序を
// 検証する。RootLayoutコンポーネント全体(react-navigation/expo-router/gesture-handler等)は
// レンダーせず、onAppStart単体をexport経由で直接呼ぶ(@tester指摘: 「reconcileはrefillAllRemindersより
// 先に直列で実行する」という新しい不変条件がコメントでのみ担保されテストが無かった)
const mockEnsureAndroidChannel = jest.fn();
const mockPruneExpiredNotifications = jest.fn();
const mockPruneExpiredReminderScheduleSkips = jest.fn();
const mockGetPermissionState = jest.fn();
const mockReconcileNativeReminderSchedules = jest.fn();
const mockRefillAllReminders = jest.fn();
const mockSyncScheduledWorkoutNotifications = jest.fn();

jest.mock('@/db/client', () => ({ db: {}, expoDb: {} }));
jest.mock('@/db/seed', () => ({ seed: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/drizzle/migrations', () => ({}));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('@/lib/calendar/reminder-skips', () => ({
  pruneExpiredReminderScheduleSkips: (...args: unknown[]) => mockPruneExpiredReminderScheduleSkips(...args),
}));
jest.mock('@/lib/notifications/channels', () => ({
  ensureAndroidChannel: (...args: unknown[]) => mockEnsureAndroidChannel(...args),
}));
jest.mock('@/lib/notifications/permissions', () => ({
  getPermissionState: (...args: unknown[]) => mockGetPermissionState(...args),
}));
jest.mock('@/lib/notifications/scheduled-workout-scheduler', () => ({
  syncScheduledWorkoutNotifications: (...args: unknown[]) => mockSyncScheduledWorkoutNotifications(...args),
}));
jest.mock('@/lib/notifications/scheduler', () => ({
  pruneExpiredNotifications: (...args: unknown[]) => mockPruneExpiredNotifications(...args),
  reconcileNativeReminderSchedules: (...args: unknown[]) => mockReconcileNativeReminderSchedules(...args),
  refillAllReminders: (...args: unknown[]) => mockRefillAllReminders(...args),
}));
jest.mock('@/lib/notifications/tap-handler', () => ({ resolveReminderTapDestination: jest.fn() }));
jest.mock('@react-navigation/native', () => ({
  DarkTheme: {},
  DefaultTheme: {},
  ThemeProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({ useMigrations: () => ({ success: true, error: null }) }));
jest.mock('expo-drizzle-studio-plugin', () => ({ useDrizzleStudio: jest.fn() }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  useLastNotificationResponse: () => null,
  clearLastNotificationResponse: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
  Stack: Object.assign(() => null, { Screen: () => null }),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: ({ children }: { children: unknown }) => children }));
jest.mock('react-native-reanimated', () => ({}));

import { onAppStart } from '@/app/_layout';

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureAndroidChannel.mockResolvedValue(undefined);
  mockPruneExpiredNotifications.mockResolvedValue(undefined);
  mockPruneExpiredReminderScheduleSkips.mockResolvedValue(undefined);
  mockGetPermissionState.mockResolvedValue('granted');
  mockReconcileNativeReminderSchedules.mockResolvedValue(undefined);
  mockRefillAllReminders.mockResolvedValue(undefined);
  mockSyncScheduledWorkoutNotifications.mockResolvedValue(undefined);
});

describe('onAppStart', () => {
  it('権限がgrantedなら、prune→reconcileNativeReminderSchedules→(refillAllReminders, syncScheduledWorkoutNotifications)の順で呼ぶ', async () => {
    const order: string[] = [];
    mockPruneExpiredNotifications.mockImplementation(async () => {
      order.push('pruneExpiredNotifications');
    });
    mockPruneExpiredReminderScheduleSkips.mockImplementation(async () => {
      order.push('pruneExpiredReminderScheduleSkips');
    });
    mockReconcileNativeReminderSchedules.mockImplementation(async () => {
      order.push('reconcileNativeReminderSchedules');
    });
    mockRefillAllReminders.mockImplementation(async () => {
      order.push('refillAllReminders');
    });
    mockSyncScheduledWorkoutNotifications.mockImplementation(async () => {
      order.push('syncScheduledWorkoutNotifications');
    });

    await onAppStart();

    // pruneの2件は並列(順不同)、reconcileはその後、refill系2件はさらにその後(順不同)という
    // 構造だけを検証する(@planner設計: reconcileがDB状態を変え、その結果をrefillAllRemindersが
    // 見るため並列化できない、という不変条件がこのテストの主眼)
    const reconcileIndex = order.indexOf('reconcileNativeReminderSchedules');
    expect(reconcileIndex).toBeGreaterThanOrEqual(2); // prune2件の後
    expect(order.indexOf('refillAllReminders')).toBeGreaterThan(reconcileIndex);
    expect(order.indexOf('syncScheduledWorkoutNotifications')).toBeGreaterThan(reconcileIndex);
  });

  it('pruneExpiredNotifications/pruneExpiredReminderScheduleSkipsは権限の有無に関わらず常に呼ばれる', async () => {
    mockGetPermissionState.mockResolvedValue('denied');
    await onAppStart();
    expect(mockPruneExpiredNotifications).toHaveBeenCalledTimes(1);
    expect(mockPruneExpiredReminderScheduleSkips).toHaveBeenCalledTimes(1);
  });

  it('権限がgranted以外なら、reconcileNativeReminderSchedules/refillAllReminders/syncScheduledWorkoutNotificationsは呼ばれない', async () => {
    mockGetPermissionState.mockResolvedValue('denied');
    await onAppStart();
    expect(mockReconcileNativeReminderSchedules).not.toHaveBeenCalled();
    expect(mockRefillAllReminders).not.toHaveBeenCalled();
    expect(mockSyncScheduledWorkoutNotifications).not.toHaveBeenCalled();
  });

  it('多重呼び出しガード: 前回の呼び出しが完了する前に再度呼んでも、2回目は即座に何もせず返る', async () => {
    let resolvePrune!: () => void;
    mockPruneExpiredNotifications.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePrune = resolve;
      }),
    );
    const first = onAppStart();
    const second = onAppStart();
    // 1回目が進行中のため、2回目はensureAndroidChannel等を一切呼ばずに即returnする
    await Promise.resolve();
    expect(mockEnsureAndroidChannel).toHaveBeenCalledTimes(1);

    resolvePrune();
    mockPruneExpiredReminderScheduleSkips.mockResolvedValue(undefined);
    await Promise.all([first, second]);
    expect(mockEnsureAndroidChannel).toHaveBeenCalledTimes(1);
  });
});
