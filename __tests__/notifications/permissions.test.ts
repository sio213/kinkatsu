// expo-notifications が返す status 文字列を、アプリ内で使う3値（granted / denied /
// undetermined）に畳む層。expo側は provisional など他の値も返しうるので、その落とし先まで固定する。
/* eslint-disable no-var */
var mockGetPermissionsAsync: jest.Mock;
var mockRequestPermissionsAsync: jest.Mock;
var mockOpenSettings: jest.Mock;

jest.mock('expo-notifications', () => {
  mockGetPermissionsAsync = jest.fn();
  mockRequestPermissionsAsync = jest.fn();
  return {
    getPermissionsAsync: mockGetPermissionsAsync,
    requestPermissionsAsync: mockRequestPermissionsAsync,
  };
});

jest.mock('expo-linking', () => {
  mockOpenSettings = jest.fn(async () => undefined);
  return { openSettings: mockOpenSettings };
});

import { ensurePermission, getPermissionState, openSettings } from '@/lib/notifications/permissions';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getPermissionState', () => {
  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['undetermined', 'undetermined'],
    // expo が返しうるその他の値は「まだ決まっていない」に寄せる（許可済み扱いにしない）
    ['provisional', 'undetermined'],
  ])('expo の status=%s を %s として返す', async (status, expected) => {
    mockGetPermissionsAsync.mockResolvedValue({ status });

    await expect(getPermissionState()).resolves.toBe(expected);
  });
});

describe('ensurePermission', () => {
  it('すでに許可済みならダイアログを出さずに granted を返す', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });

    await expect(ensurePermission()).resolves.toBe('granted');
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('すでに拒否済みならダイアログを出さずに denied を返す（OSが二度目を出さないため）', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'denied' });

    await expect(ensurePermission()).resolves.toBe('denied');
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('未決定のときだけ許可ダイアログを出し、その結果を返す', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });

    await expect(ensurePermission()).resolves.toBe('granted');
    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('ダイアログで拒否されたら denied を返す', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });

    await expect(ensurePermission()).resolves.toBe('denied');
  });

  it('ダイアログの結果が granted / denied 以外なら undetermined のままにする', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'provisional' });

    await expect(ensurePermission()).resolves.toBe('undetermined');
  });
});

describe('openSettings', () => {
  it('OSの設定画面を開く', async () => {
    await openSettings();

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });
});
