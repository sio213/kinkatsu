// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
// useLiveQuery はhook呼び出し順に消費するキュー
// updatedAt/errorは、解決済みかどうかを見るフック（useSessionFinishCounts）のテストでのみ渡す
var mockLiveQueryQueue: { data: unknown; updatedAt?: Date; error?: Error }[];
// 各useLiveQuery呼び出しに渡されたdeps引数を呼び出し順に記録する。drizzle-orm/expo-sqliteの
// useLiveQueryはdepsが変化したときだけクエリを張り直す仕様（デフォルト[]＝マウント時の1回きり）のため、
// sessionId/routineIdの変化を追従させるにはdepsへ明示的に渡す必要がある（実機で再現・特定した不具合）。
// useResumeWorkoutSummaryがこれを正しく渡しているかの回帰テストに使う
var mockLiveQueryDepsCalls: unknown[][];

jest.mock('@/db/client', () => {
  const chain = {
    orderBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
  };
  return {
    db: {
      select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) }),
      selectDistinct: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) }),
    },
  };
});

jest.mock('@/db/schema', () => ({
  workoutSessions: { id: 'id', startedAt: 'startedAt', endedAt: 'endedAt', routineId: 'routineId' },
  sets: {
    id: 'id',
    sessionId: 'sessionId',
    weight: 'weight',
    reps: 'reps',
    workoutSessionExerciseId: 'workoutSessionExerciseId',
    setNumber: 'setNumber',
    completedAt: 'completedAt',
  },
  exercises: { id: 'id' },
  workoutSessionExercises: {
    id: 'id',
    sessionId: 'sessionId',
    exerciseId: 'exerciseId',
    orderIndex: 'orderIndex',
  },
  routines: { id: 'id', name: 'name' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  desc: jest.fn((col) => ({ col, dir: 'desc' })),
  and: jest.fn((...conds) => ({ conds })),
  ne: jest.fn((col, val) => ({ col, val, op: 'ne' })),
  isNotNull: jest.fn((col) => ({ col, op: 'isNotNull' })),
  sql: Object.assign(
    jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    { raw: jest.fn() },
  ),
  getTableColumns: jest.fn(() => ({})),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn((_query: unknown, deps: unknown[] = []) => {
    mockLiveQueryDepsCalls.push(deps);
    return mockLiveQueryQueue.shift() ?? { data: undefined };
  }),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  useExercisesWithHistory,
  useResumeWorkoutSummary,
  useSessionExercises,
  useSessionFinishCounts,
  useSessionSets,
  useSessionStats,
  useWorkoutSession,
  useWorkoutSessions,
} from '@/hooks/use-workout-session';

function makeHarness<T>(hook: () => T) {
  let captured: T;
  function Harness() {
    captured = hook();
    return null;
  }
  return () => {
    act(() => {
      create(React.createElement(Harness));
    });
    return captured!;
  };
}

beforeEach(() => {
  mockLiveQueryQueue = [];
  mockLiveQueryDepsCalls = [];
  jest.clearAllMocks();
});

describe('useWorkoutSessions', () => {
  const mount = makeHarness(useWorkoutSessions);

  it('sessionsがundefinedのとき空配列を返す', () => {
    mockLiveQueryQueue = [{ data: undefined }];
    const { sessions } = mount();
    expect(sessions).toEqual([]);
  });

  it('endedAtがnullのセッションをactiveSessionとして検出する', () => {
    const inProgress = { id: 5, startedAt: 100, endedAt: null };
    const finished = { id: 4, startedAt: 0, endedAt: 60_000 };
    mockLiveQueryQueue = [{ data: [inProgress, finished] }];
    const { activeSession } = mount();
    expect(activeSession).toEqual(inProgress);
  });

  it('endedAtがnullのセッションが複数件ある場合、配列先頭（startedAt降順の最新）をactiveSessionとする', () => {
    const newer = { id: 6, startedAt: 200, endedAt: null };
    const older = { id: 5, startedAt: 100, endedAt: null };
    mockLiveQueryQueue = [{ data: [newer, older] }];
    const { activeSession } = mount();
    expect(activeSession).toEqual(newer);
  });

  it('進行中セッションが無ければactiveSessionはnull', () => {
    const finished = { id: 4, startedAt: 0, endedAt: 60_000 };
    mockLiveQueryQueue = [{ data: [finished] }];
    const { activeSession } = mount();
    expect(activeSession).toBeNull();
  });
});

describe('useWorkoutSession', () => {
  const mountSingle = makeHarness(() => useWorkoutSession(1));

  // dataは解決前から[]で来るため、loadedの判定にdataは使えない（updatedAt/errorで見る）。
  // 完了サマリー画面はloadedを「セッションが削除された」の判定に使い、trueなら画面を畳むので、
  // 未解決をloaded=trueと誤判定すると開いた瞬間に閉じてしまう
  it('未解決（updatedAt/errorとも無し）のとき loaded=false', () => {
    mockLiveQueryQueue = [{ data: [] }];
    const { session, loaded } = mountSingle();
    expect(session).toBeUndefined();
    expect(loaded).toBe(false);
  });

  it('解決済みで0件のとき loaded=true・sessionはundefined（見つからない）', () => {
    mockLiveQueryQueue = [{ data: [], updatedAt: new Date() }];
    const { session, loaded } = mountSingle();
    expect(session).toBeUndefined();
    expect(loaded).toBe(true);
  });

  it('data=[session] のときそのセッションを返す', () => {
    const fake = { id: 1, startedAt: 0, endedAt: null };
    mockLiveQueryQueue = [{ data: [fake], updatedAt: new Date() }];
    const { session, loaded } = mountSingle();
    expect(session).toBe(fake);
    expect(loaded).toBe(true);
  });

  // 取得に失敗したまま「未解決」扱いにすると、削除済みセッションを永久に検知できなくなる
  it('errorが入っている場合も loaded=true', () => {
    mockLiveQueryQueue = [{ data: [], error: new Error('fail') }];
    const { loaded } = mountSingle();
    expect(loaded).toBe(true);
  });
});

describe('useSessionStats', () => {
  const mount = makeHarness(useSessionStats);

  it('dataがundefinedのとき空のMapを返す', () => {
    mockLiveQueryQueue = [{ data: undefined }];
    const result = mount();
    expect(result.size).toBe(0);
  });

  it('SQL側で集計済みの行をsessionIdをキーにしたMapに変換する', () => {
    mockLiveQueryQueue = [
      {
        data: [
          { sessionId: 1, setCount: 3, totalVolume: 1520 },
          { sessionId: 2, setCount: 1, totalVolume: 240 },
        ],
      },
    ];
    const result = mount();
    expect(result.get(1)).toEqual({ setCount: 3, totalVolume: 1520 });
    expect(result.get(2)).toEqual({ setCount: 1, totalVolume: 240 });
    expect(result.get(3)).toBeUndefined();
  });
});

describe('useSessionFinishCounts', () => {
  const mount = makeHarness(() => useSessionFinishCounts(1));

  // 未解決の間はdataが空配列（undefinedではない）で来るため、両カウントが0になる。
  // このとき破棄側に倒れないよう、呼び出し側はloadedを見る必要がある
  it('未解決（updatedAt/errorとも無し）のときloadedがfalseになる', () => {
    mockLiveQueryQueue = [{ data: [] }];
    expect(mount()).toEqual({ completedSetCount: 0, valuedSetCount: 0, loaded: false });
  });

  it('集計行の件数をそのまま返す', () => {
    mockLiveQueryQueue = [{ data: [{ completedSetCount: 4, valuedSetCount: 6 }], updatedAt: new Date() }];
    expect(mount()).toEqual({ completedSetCount: 4, valuedSetCount: 6, loaded: true });
  });

  // セットが1件も無いセッションではSUMがnullを返すため、0へのフォールバックが必要になる
  it('集計行の値がnullのとき0を返す', () => {
    mockLiveQueryQueue = [
      { data: [{ completedSetCount: null, valuedSetCount: null }], updatedAt: new Date() },
    ];
    expect(mount()).toEqual({ completedSetCount: 0, valuedSetCount: 0, loaded: true });
  });

  // クエリが失敗したまま「未解決」扱いにすると終了操作が永久に破棄側へ倒れないため、
  // errorも解決済みとして扱う（use-exercise-record-count.tsと同じ方針）
  it('errorが入っている場合もloadedはtrueになる', () => {
    mockLiveQueryQueue = [{ data: [], error: new Error('fail') }];
    expect(mount()).toEqual({ completedSetCount: 0, valuedSetCount: 0, loaded: true });
  });
});

describe('useExercisesWithHistory', () => {
  const mount = makeHarness(() => useExercisesWithHistory(1));

  it('dataがundefinedのとき空Setを返す', () => {
    mockLiveQueryQueue = [{ data: undefined }];
    expect(mount()).toEqual(new Set());
  });

  it('SQL側で絞り込み済みのexerciseIdをSetにする（重複除去はselectDistinct側の責務）', () => {
    mockLiveQueryQueue = [{ data: [{ exerciseId: 10 }, { exerciseId: 20 }] }];
    expect(mount()).toEqual(new Set([10, 20]));
  });

  it('dataが空配列なら空Set', () => {
    mockLiveQueryQueue = [{ data: [] }];
    expect(mount()).toEqual(new Set());
  });
});

describe('useSessionExercises', () => {
  const mount = makeHarness(() => useSessionExercises(1));

  it('dataがundefinedのとき空配列を返す', () => {
    mockLiveQueryQueue = [{ data: undefined }];
    expect(mount()).toEqual([]);
  });

  it('orderIndex付きの種目一覧をそのまま返す', () => {
    const rows = [
      { id: 10, name: 'ベンチプレス', orderIndex: 0 },
      { id: 11, name: 'スクワット', orderIndex: 1 },
    ];
    mockLiveQueryQueue = [{ data: rows }];
    expect(mount()).toEqual(rows);
  });
});

describe('useSessionSets', () => {
  const mount = makeHarness(() => useSessionSets(1));

  it('dataがundefinedのとき空のMapを返す', () => {
    mockLiveQueryQueue = [{ data: undefined }];
    const result = mount();
    expect(result.size).toBe(0);
  });

  it('workoutSessionExerciseId（カード単位）ごとにグルーピングする', () => {
    // 同じ種目(exerciseId:10)を2枚のカードとして追加した場合でも、
    // workoutSessionExerciseIdが違えばセットは混ざらない
    const setA1 = { id: 1, exerciseId: 10, workoutSessionExerciseId: 100, setNumber: 1 };
    const setA2 = { id: 2, exerciseId: 10, workoutSessionExerciseId: 100, setNumber: 2 };
    const setB1 = { id: 3, exerciseId: 10, workoutSessionExerciseId: 200, setNumber: 1 };
    mockLiveQueryQueue = [{ data: [setA1, setA2, setB1] }];
    const result = mount();
    expect(result.get(100)).toEqual([setA1, setA2]);
    expect(result.get(200)).toEqual([setB1]);
    expect(result.get(300)).toBeUndefined();
  });

  it('liveQueryのdataの参照が変わらなければ、再レンダーしても同じMap参照を返す（SessionExerciseCardのmemoが毎秒の経過時間更新で無効化されないため）', () => {
    const rows = [{ id: 1, exerciseId: 10, workoutSessionExerciseId: 100, setNumber: 1 }];
    const captured: Map<number, unknown>[] = [];
    let triggerRerender!: () => void;

    function Harness() {
      const [, forceUpdate] = React.useReducer((c: number) => c + 1, 0);
      triggerRerender = () => forceUpdate();
      captured.push(useSessionSets(1));
      return null;
    }

    mockLiveQueryQueue = [{ data: rows }, { data: rows }];
    act(() => {
      create(React.createElement(Harness));
    });
    act(() => {
      triggerRerender();
    });

    expect(captured).toHaveLength(2);
    expect(captured[0]).toBe(captured[1]);
  });
});

describe('useResumeWorkoutSummary', () => {
  const manualSession = { id: 1, routineId: null, startedAt: 0, endedAt: null } as Parameters<
    typeof useResumeWorkoutSummary
  >[0];
  const routineSession = { id: 2, routineId: 10, startedAt: 0, endedAt: null } as Parameters<
    typeof useResumeWorkoutSummary
  >[0];

  function mountSummary(session: Parameters<typeof useResumeWorkoutSummary>[0]) {
    return makeHarness(() => useResumeWorkoutSummary(session))();
  }

  it('session=nullのときすべて0・routineNameはnull', () => {
    mockLiveQueryQueue = [{ data: undefined }, { data: undefined }, { data: undefined }];
    expect(mountSummary(null)).toEqual({
      completedExerciseCount: 0,
      totalExerciseCount: 0,
      completedSetCount: 0,
      routineName: null,
    });
  });

  // sessionId/routineIdはactiveSession（呼び出し元のuseWorkoutSessions自身のuseLiveQueryが
  // 非同期に解決する）由来のため、マウント直後は-1のプレースホルダーで後続のレンダーから実際の値になる。
  // useLiveQueryの第2引数(deps)にこれらを渡さないと、-1で張ったクエリのまま実際の値が来ても
  // クエリが張り直されず空データに固定されてしまう不具合が実機で見つかったため、
  // ここで確実にdepsへ渡っていることを回帰テストとして固定する
  it('sessionId/routineIdをuseLiveQueryのdepsに渡す（渡さないとactiveSession確定後もクエリが空のまま固定される不具合の回帰防止）', () => {
    mockLiveQueryQueue = [{ data: [] }, { data: [] }, { data: [] }];
    mountSummary(routineSession);
    expect(mockLiveQueryDepsCalls).toEqual([[2], [2], [10]]);
  });

  it('種目0件（exerciseIdRowsが空配列）', () => {
    mockLiveQueryQueue = [{ data: [] }, { data: undefined }, { data: undefined }];
    const result = mountSummary(manualSession);
    expect(result.totalExerciseCount).toBe(0);
    expect(result.completedExerciseCount).toBe(0);
    expect(result.completedSetCount).toBe(0);
  });

  // setsの集計をworkoutSessionExercisesにleftJoinする実装だと、useLiveQueryの書き込み監視が
  // クエリのfrom()テーブル(workoutSessionExercises)しか見ないため、セット✓確定(setsへの書き込み)
  // では再フェッチされず画面に戻っても反映されない不具合があった（実機で再現・特定）。
  // setsテーブル単体のクエリに分けてJS側で突き合わせているため、ここではその2クエリの結果を
  // 個別に渡してテストする
  it('totalSets>0かつcompletedSets===totalSetsの種目のみ完了扱いにする（useSessionExerciseCollapseと同じ基準）', () => {
    mockLiveQueryQueue = [
      {
        data: [{ sessionExerciseId: 1 }, { sessionExerciseId: 2 }, { sessionExerciseId: 3 }],
      },
      {
        data: [
          { sessionExerciseId: 1, totalSets: 3, completedSets: 3 }, // 完了
          { sessionExerciseId: 2, totalSets: 3, completedSets: 2 }, // 一部完了
          // sessionExerciseId:3はsetsに1件も無いためsetAggRowsに現れない
          // （セット未追加の種目。totalSets=0扱いになり完了カウントに含めない）
        ],
      },
      { data: undefined },
    ];
    const result = mountSummary(manualSession);
    expect(result.completedExerciseCount).toBe(1);
    expect(result.totalExerciseCount).toBe(3);
    expect(result.completedSetCount).toBe(5);
  });

  it('routineId有り・ルーティン名が解決できる場合はroutineNameを返す', () => {
    mockLiveQueryQueue = [
      { data: [{ sessionExerciseId: 1 }] },
      { data: [{ sessionExerciseId: 1, totalSets: 1, completedSets: 1 }] },
      { data: [{ name: '胸の日' }] },
    ];
    expect(mountSummary(routineSession).routineName).toBe('胸の日');
  });

  it('routineId有りだがルーティンが見つからない（削除済み等）場合はnullにフォールバックする', () => {
    mockLiveQueryQueue = [
      { data: [{ sessionExerciseId: 1 }] },
      { data: [{ sessionExerciseId: 1, totalSets: 1, completedSets: 1 }] },
      { data: [] },
    ];
    expect(mountSummary(routineSession).routineName).toBeNull();
  });

  it('routineId=null（手動開始）の場合、routineRows側に何か返っていてもroutineNameは必ずnull', () => {
    // sessionId/routineIdのフォールバック値(-1)が誤って別セッションの行にヒットするような実装ミスを
    // 検知するため、あえてroutineRowsに値を入れた状態でテストする
    mockLiveQueryQueue = [{ data: [] }, { data: [] }, { data: [{ name: '無関係なルーティン' }] }];
    expect(mountSummary(manualSession).routineName).toBeNull();
  });
});
