import React from 'react';
import { Alert } from 'react-native';
import { act, create } from 'react-test-renderer';
import { useReorderableRows } from '@/hooks/use-reorderable-rows';

// 「種目まとめて並び替え」画面3本(ルーティン下書き/トレーニング中セッション/カレンダーの予定)が
// 共有する状態管理フックの単体テスト。3画面のスクリーンテストは「どのIDをkeyに使うか」等の
// 配線を検証しているが、エラー系・競合制御・境界ガードは画面ごとに露出の仕方が違い
// (ルーティンはpersistが同期でDB書き込みが無いため失敗経路そのものが無い等)、
// 3画面の組み合わせ任せだと分岐に穴が残るため、フックの契約はここで直接押さえる

type Row = { id: number };

function makeRows(...ids: number[]): Row[] {
  return ids.map((id) => ({ id }));
}

type Harness = {
  root: ReturnType<typeof create>;
  getRows: () => Row[];
  reorder: (from: number, to: number) => void;
  move: (index: number, direction: 'up' | 'down') => void;
  rerender: (source: Row[]) => void;
};

function renderHook(options: {
  source: Row[];
  persist?: (next: Row[]) => void | Promise<void>;
  errorMessage?: string;
  logLabel?: string;
}): Harness {
  const persist = options.persist ?? (() => {});
  const errorMessage = options.errorMessage ?? 'エラーメッセージ';
  const logLabel = options.logLabel ?? '[test]';

  let api: ReturnType<typeof useReorderableRows<Row>> | undefined;
  function Probe({ source }: { source: Row[] }) {
    api = useReorderableRows<Row>({ source, persist, errorMessage, logLabel });
    return null;
  }

  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(React.createElement(Probe, { source: options.source }));
  });

  return {
    root,
    getRows: () => api!.rows,
    reorder: (from, to) => {
      act(() => {
        api!.handleReorder({ from, to } as never);
      });
    },
    move: (index, direction) => {
      act(() => {
        api!.handleMove(index, direction);
      });
    },
    rerender: (source) => {
      act(() => {
        root.update(React.createElement(Probe, { source }));
      });
    },
  };
}

// persist内のPromiseチェーン(catch節のAlert・setRows)が解決するまで待つ
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function ids(rows: Row[]) {
  return rows.map((r) => r.id);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('sourceの取り込み(seed)', () => {
  test('sourceが最初から1件以上あれば即座にrowsへ取り込まれる', () => {
    const harness = renderHook({ source: makeRows(1, 2, 3) });
    expect(ids(harness.getRows())).toEqual([1, 2, 3]);
  });

  test('sourceが0件のうちはrowsも0件で、後から非空になった時点で取り込まれる', () => {
    const harness = renderHook({ source: [] });
    expect(harness.getRows()).toEqual([]);

    harness.rerender(makeRows(1, 2));

    expect(ids(harness.getRows())).toEqual([1, 2]);
  });

  test('一度取り込んだ後にsourceが変わってもrowsは追従しない(ドラッグ中の競合防止)', () => {
    const harness = renderHook({ source: makeRows(1, 2) });

    harness.rerender(makeRows(1, 2, 3));

    expect(ids(harness.getRows())).toEqual([1, 2]);
  });
});

describe('handleReorder', () => {
  test('fromとtoの位置で並びが入れ替わり、その並びでpersistが呼ばれる', () => {
    const persist = jest.fn();
    const harness = renderHook({ source: makeRows(1, 2, 3), persist });

    harness.reorder(0, 2);

    expect(ids(harness.getRows())).toEqual([2, 3, 1]);
    expect(ids(persist.mock.calls[0][0])).toEqual([2, 3, 1]);
  });

  test('from===toでは並びが変化しない', () => {
    const harness = renderHook({ source: makeRows(1, 2, 3) });

    harness.reorder(1, 1);

    expect(ids(harness.getRows())).toEqual([1, 2, 3]);
  });
});

describe('handleMove(支援技術からの隣接1件移動)', () => {
  test('中間の要素は上へも下へも移動できる', () => {
    const harness = renderHook({ source: makeRows(1, 2, 3) });

    harness.move(1, 'up');
    expect(ids(harness.getRows())).toEqual([2, 1, 3]);

    harness.move(1, 'down');
    expect(ids(harness.getRows())).toEqual([2, 3, 1]);
  });

  // UI側は先頭/末尾でaccessibilityAction自体を出さないため通常は到達しないが、
  // フック単体の契約として境界を越える呼び出しを無視することを保証する
  test('先頭要素をupで呼んでも並びが変化せずpersistも呼ばれない', () => {
    const persist = jest.fn();
    const harness = renderHook({ source: makeRows(1, 2, 3), persist });

    harness.move(0, 'up');

    expect(ids(harness.getRows())).toEqual([1, 2, 3]);
    expect(persist).not.toHaveBeenCalled();
  });

  test('末尾要素をdownで呼んでも並びが変化せずpersistも呼ばれない', () => {
    const persist = jest.fn();
    const harness = renderHook({ source: makeRows(1, 2, 3), persist });

    harness.move(2, 'down');

    expect(ids(harness.getRows())).toEqual([1, 2, 3]);
    expect(persist).not.toHaveBeenCalled();
  });

  test('要素が0件でもクラッシュしない', () => {
    const harness = renderHook({ source: [] });

    expect(() => harness.move(0, 'down')).not.toThrow();
    expect(harness.getRows()).toEqual([]);
  });
});

describe('persistの成否', () => {
  test('persistが同期でvoidを返す場合、確定した並びのまま巻き戻らない(ルーティン下書きの経路)', async () => {
    const persist = jest.fn<void, [Row[]]>(() => undefined);
    const harness = renderHook({ source: makeRows(1, 2), persist });

    harness.reorder(0, 1);
    await flush();

    expect(ids(harness.getRows())).toEqual([2, 1]);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test('persistが非同期でresolveする場合も巻き戻らない(DB書き込みの経路)', async () => {
    const persist = jest.fn(async () => {});
    const harness = renderHook({ source: makeRows(1, 2), persist });

    harness.reorder(0, 1);
    await flush();

    expect(ids(harness.getRows())).toEqual([2, 1]);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test('persistがrejectするとAlertを出し直前の並びへ巻き戻す', async () => {
    const persist = jest.fn(async () => {
      throw new Error('db error');
    });
    const harness = renderHook({ source: makeRows(1, 2), persist, errorMessage: '並び順を変更できませんでした。' });

    harness.reorder(0, 1);
    await flush();

    expect(Alert.alert).toHaveBeenCalledWith('エラー', '並び順を変更できませんでした。');
    expect(ids(harness.getRows())).toEqual([1, 2]);
  });

  // 同期persist(ドラフトストア更新)は現状throwし得ないが、await前の同期throwも
  // 同じcatchで拾えることをフックの契約として保証しておく
  test('persistが同期でthrowした場合もAlertを出し巻き戻す', async () => {
    const persist = jest.fn(() => {
      throw new Error('sync error');
    });
    const harness = renderHook({ source: makeRows(1, 2), persist });

    harness.reorder(0, 1);
    await flush();

    expect(Alert.alert).toHaveBeenCalled();
    expect(ids(harness.getRows())).toEqual([1, 2]);
  });

  test('失敗時のconsole.errorにはlogLabelが付く', async () => {
    const persist = jest.fn(async () => {
      throw new Error('db error');
    });
    const harness = renderHook({ source: makeRows(1, 2), persist, logLabel: '[reorder something]' });

    harness.reorder(0, 1);
    await flush();

    expect(console.error).toHaveBeenCalledWith('[reorder something]', expect.any(Error));
  });
});

describe('連続操作の競合制御', () => {
  test('古い操作の失敗による巻き戻しは、後から成功した新しい操作の結果を上書きしない', async () => {
    let rejectFirst!: (e: Error) => void;
    const persist = jest
      .fn<Promise<void>, [Row[]]>()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectFirst = reject)))
      .mockImplementationOnce(async () => {});
    const harness = renderHook({ source: makeRows(1, 2, 3), persist });

    harness.reorder(0, 2);
    harness.reorder(0, 1);

    await act(async () => {
      rejectFirst(new Error('stale failure'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ids(harness.getRows())).toEqual([3, 2, 1]);
  });

  test('巻き戻し先は初期の並びではなく、直前に成功した操作後の並びになる', async () => {
    const persist = jest
      .fn<Promise<void>, [Row[]]>()
      .mockImplementationOnce(async () => {})
      .mockImplementationOnce(async () => {
        throw new Error('db error');
      });
    const harness = renderHook({ source: makeRows(1, 2, 3), persist });

    // 1回目は成功して [2, 1, 3] が確定する
    harness.reorder(0, 1);
    await flush();
    expect(ids(harness.getRows())).toEqual([2, 1, 3]);

    // 2回目は失敗するため、初期の [1, 2, 3] ではなく1回目成功後の [2, 1, 3] へ戻る
    harness.reorder(1, 2);
    await flush();

    expect(Alert.alert).toHaveBeenCalled();
    expect(ids(harness.getRows())).toEqual([2, 1, 3]);
  });
});
