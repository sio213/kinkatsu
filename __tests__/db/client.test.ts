// db/client.ts のトップレベル副作用（PRAGMA foreign_keys = ON）を検証する。
// このテストが無いと、sets/workoutSessionExercisesのrestrict/cascadeが実際に効くための
// 前提条件であるこの1行が将来のリファクタで誤って消えても、既存テストは全てdb/client.ts
// 自体をモックしているため誰も気づけない。
const mockExecSync = jest.fn();

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({ execSync: mockExecSync })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => ({})),
}));

describe('db/client', () => {
  it('DB接続直後にPRAGMA foreign_keys = ONを実行する', () => {
    require('@/db/client');
    expect(mockExecSync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON;');
  });
});
