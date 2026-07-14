const mockGetPermissionState = jest.fn();
jest.mock('@/lib/notifications/permissions', () => ({
  getPermissionState: (...args: unknown[]) => mockGetPermissionState(...args),
}));

import { usePermissionState } from '@/hooks/use-permission-state';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';

// AppStateはjest-expoのpreset内でモック済みだが、addEventListener('change', ...)の
// リスナーを直接呼び出せるよう、登録されたリスナーを捕まえておく
let changeListener: ((state: string) => void) | undefined;

function Harness({ onChange }: { onChange: (value: ReturnType<typeof usePermissionState>) => void }) {
  const result = usePermissionState();
  onChange(result);
  return null;
}

let currentInstance: ReturnType<typeof create> | undefined;

async function render() {
  const results: ReturnType<typeof usePermissionState>[] = [];
  await act(async () => {
    currentInstance = create(<Harness onChange={(r) => results.push(r)} />);
  });
  return results;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPermissionState.mockResolvedValue('undetermined');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    changeListener = listener as (state: string) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
  changeListener = undefined;
});

test('マウント時にgetPermissionStateを1回呼び、結果を反映する', async () => {
  mockGetPermissionState.mockResolvedValue('granted');
  const results = await render();

  expect(mockGetPermissionState).toHaveBeenCalledTimes(1);
  expect(results.at(-1)?.[0]).toBe('granted');
});

test('バックグラウンドからフォアグラウンドに戻ると再取得する(OS設定変更の即時反映)', async () => {
  mockGetPermissionState.mockResolvedValueOnce('denied');
  await render();
  expect(mockGetPermissionState).toHaveBeenCalledTimes(1);

  mockGetPermissionState.mockResolvedValueOnce('granted');
  await act(async () => {
    changeListener?.('background');
  });
  await act(async () => {
    changeListener?.('active');
  });

  expect(mockGetPermissionState).toHaveBeenCalledTimes(2);
});

test('activeからactiveへの遷移(フォーカスは維持されたまま)では再取得しない', async () => {
  await render();
  // AppState.currentStateのjestモック上の初期値がactiveとは限らないため、まず一度
  // 'active'を発火させてappState.current(フックの内部ref)を確実にactiveへ揃えてから、
  // その後のカウントだけをリセットして検証する
  await act(async () => {
    changeListener?.('active');
  });
  mockGetPermissionState.mockClear();

  await act(async () => {
    changeListener?.('active');
  });

  expect(mockGetPermissionState).not.toHaveBeenCalled();
});

test('2つ目の戻り値のsetterで手動に状態を更新できる(ensurePermission後の即時反映用)', async () => {
  const results = await render();
  const [, setPermState] = results.at(-1)!;

  await act(async () => {
    setPermState('granted');
  });

  const latest = results.at(-1)!;
  expect(latest[0]).toBe('granted');
});
