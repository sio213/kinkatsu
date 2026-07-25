/**
 * ナビゲータの宣言（Tabs.Screen / Stack.Screen の name、initialRouteName、anchor）が
 * 実際のファイル配置と一致しているかを機械的に検証する。
 *
 * これらは expo-router の型定義上ただの string なので、tsc の typedRoutes では守れない
 * （typedRoutesが検証するのは router.push('/routine') のようなhref文字列だけ）。
 * 既存の画面テストは expo-router を丸ごとモックしてコンポーネント単体をレンダーしているため、
 * 「どのナビゲータ配下にあるか」は一切通っていない。タブ構成を触るときのリグレッション網。
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, create } from 'react-test-renderer';

type CapturedScreen = { name?: string; options?: Record<string, unknown> };

const appDir = path.resolve(__dirname, '../../app');

const repoRoot = path.resolve(__dirname, '../..');

/** app/ と components/ 配下の .tsx を再帰的に集める（導線の走査用） */
function sourceFiles(): { abs: string; rel: string }[] {
  const out: { abs: string; rel: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith('.tsx')) out.push({ abs, rel: path.relative(repoRoot, abs) });
    }
  };
  walk(path.join(repoRoot, 'app'));
  walk(path.join(repoRoot, 'components'));
  return out;
}

/** name が実ルート（xxx.tsx / xxx/_layout.tsx / xxx/index.tsx）として存在するか */
function existsAsRoute(baseDir: string, name: string) {
  return (
    fs.existsSync(path.join(baseDir, `${name}.tsx`)) ||
    fs.existsSync(path.join(baseDir, name, '_layout.tsx')) ||
    fs.existsSync(path.join(baseDir, name, 'index.tsx'))
  );
}

/** Navigator/Screen を差し替えて name・options・initialRouteName だけを収集する */
function renderLayout(modulePath: string, navigatorKey: 'Tabs' | 'Stack') {
  const screens: CapturedScreen[] = [];
  let initialRouteName: string | undefined;

  const Navigator = ({
    children,
    initialRouteName: irn,
  }: {
    children?: React.ReactNode;
    initialRouteName?: string;
  }) => {
    initialRouteName = irn;
    return <>{children}</>;
  };
  const Screen = (props: CapturedScreen) => {
    screens.push(props);
    return null;
  };

  let unstableSettings: { anchor?: string } | undefined;

  jest.isolateModules(() => {
    jest.doMock('expo-router', () => ({
      [navigatorKey]: Object.assign(Navigator, { Screen }),
    }));
    jest.doMock('@/components/ui/design-icon', () => ({ DesignIcon: () => null }));
    jest.doMock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
    jest.doMock('@/components/ui/header-back-button', () => ({ HeaderBackButton: () => null }));

    const mod = require(modulePath);
    unstableSettings = mod.unstable_settings;
    // actで包まないとReactのレンダーがflushされず、Screenのpropsが収集される前に戻ってくる
    act(() => {
      create(React.createElement(mod.default));
    });
  });

  return {
    getScreens: () => screens,
    getNames: () => screens.map((s) => s.name),
    getInitialRouteName: () => initialRouteName,
    unstableSettings,
  };
}

describe('app/(tabs)/_layout.tsx の宣言と実ファイルの整合', () => {
  const tabs = renderLayout('@/app/(tabs)/_layout', 'Tabs');

  test('下部タブは4本（記録／カレンダー／種目／設定）', () => {
    expect(tabs.getNames()).toEqual(['(record)', 'calendar', '(library)', 'reminders']);
  });

  test('宣言されたnameは全て実ファイル/フォルダとして存在する（タイポ検出）', () => {
    const tabsDir = path.join(appDir, '(tabs)');
    for (const name of tabs.getNames()) {
      expect({ name, exists: existsAsRoute(tabsDir, name!) }).toEqual({ name, exists: true });
    }
  });

  test('initialRouteNameは宣言済みのScreen名のいずれかと一致する（指定漏れ・タイポ検出）', () => {
    expect(tabs.getInitialRouteName()).toBe('(record)');
    expect(tabs.getNames()).toContain(tabs.getInitialRouteName());
  });

  // 配下にStackを持つタブでheaderShownを切り忘れると、タブナビゲータのヘッダーと
  // 配下Stackのヘッダーが二重に出る
  test.each(['(record)', '(library)'])('配下にStackを持つ%sはheaderShown:false', (name) => {
    const tab = tabs.getScreens().find((s) => s.name === name);
    expect(tab?.options?.headerShown).toBe(false);
  });
});

describe('app/(tabs)/(record)/_layout.tsx の宣言と実ファイルの整合', () => {
  const recordStack = renderLayout('@/app/(tabs)/(record)/_layout', 'Stack');
  const recordDir = path.join(appDir, '(tabs)', '(record)');

  test('記録タブ配下はindex（記録）とroutine（ルーティン一覧）の2画面', () => {
    expect(recordStack.getNames()).toEqual(['index', 'routine']);
  });

  test('宣言されたnameは全て実ファイルとして存在する', () => {
    for (const name of recordStack.getNames()) {
      expect({ name, exists: existsAsRoute(recordDir, name!) }).toEqual({ name, exists: true });
    }
  });

  // anchorが無いと kinkatsu:///routine で直接起動したときにindexが下に積まれず戻れなくなる。
  // 実機でしか気づけない類の抜けなのでテストで固定する
  test('ディープリンク時の戻る導線のためanchorがindexに設定されている', () => {
    expect(recordStack.unstableSettings?.anchor).toBe('index');
  });
});

describe('app/(tabs)/(library)/_layout.tsx の宣言と実ファイルの整合', () => {
  const libraryStack = renderLayout('@/app/(tabs)/(library)/_layout', 'Stack');
  const libraryDir = path.join(appDir, '(tabs)', '(library)');

  test('種目タブ配下は一覧と詳細の2画面', () => {
    expect(libraryStack.getNames()).toEqual(['exercises/index', 'exercises/[id]']);
  });

  test('宣言されたnameは全て実ファイルとして存在する', () => {
    for (const name of libraryStack.getNames()) {
      expect({ name, exists: existsAsRoute(libraryDir, name!) }).toEqual({ name, exists: true });
    }
  });

  test('ディープリンク時の戻る導線のためanchorが一覧に設定されている', () => {
    expect(libraryStack.unstableSettings?.anchor).toBe('exercises/index');
  });
});

describe('種目詳細は2箇所からマウントされる（来歴でタブバーを出し分けるため）', () => {
  test('タブ配下版とルートStack版の両方の経路が存在し、実体は共有コンポーネント', () => {
    const inTab = path.join(appDir, '(tabs)', '(library)', 'exercises', '[id].tsx');
    const inRoot = path.join(appDir, 'exercise', '[id].tsx');
    expect({ inTab: fs.existsSync(inTab), inRoot: fs.existsSync(inRoot) }).toEqual({
      inTab: true,
      inRoot: true,
    });

    // どちらもコンポーネントを描画するだけの薄いルートであること（画面本体の二重管理を防ぐ）
    const shared = 'components/exercises/exercise-detail-screen';
    for (const file of [inTab, inRoot]) {
      expect({ file, usesShared: fs.readFileSync(file, 'utf8').includes(shared) }).toEqual({
        file,
        usesShared: true,
      });
    }
  });

  // 導線は今後も増えるので対象ファイルを列挙せず全走査する。`/exercise/` と `/exercises/` は
  // 1文字しか違わず、取り違えても型チェックもテストも通ってしまう（編集フローの途中で
  // タブバーが復活するという静かな不具合になる）。その取り違えをここで検出する
  test('タブ配下版(/exercises/[id])へ遷移するのは種目タブの一覧カードだけ', () => {
    const tabRouteCallers = sourceFiles().filter((f) =>
      /push\w*\(\s*`\/exercises\/\$\{/.test(fs.readFileSync(f.abs, 'utf8')),
    );
    expect(tabRouteCallers.map((f) => f.rel)).toEqual(['components/exercises/exercise-card.tsx']);
  });

  test('それ以外の導線はすべてルートStack版(/exercise/[id])を使っている', () => {
    const rootRouteCallers = sourceFiles().filter((f) =>
      /push\w*\(\s*`\/exercise\/\$\{/.test(fs.readFileSync(f.abs, 'utf8')),
    );
    // 少なくとも「トレーニング中・ルーティン編集・予定編集・種目入れ替え・各種ピッカーのⓘ」が該当する。
    // 件数は増減しうるので下限だけ固定し、種目タブの一覧カードが混ざっていないことを確かめる
    expect(rootRouteCallers.length).toBeGreaterThanOrEqual(8);
    expect(rootRouteCallers.map((f) => f.rel)).not.toContain(
      'components/exercises/exercise-card.tsx',
    );
  });
});

describe('ルーティン関連画面の置き場所（CLAUDE.md「ナビゲーション・タブバーの表示範囲」）', () => {
  test('一覧は閲覧画面なのでタブ配下、作成・編集フローはルートStackに残っている', () => {
    expect(fs.existsSync(path.join(appDir, '(tabs)', '(record)', 'routine.tsx'))).toBe(true);
    // 旧配置が残っていると /routine の解決先が衝突する
    expect(fs.existsSync(path.join(appDir, 'routine', 'index.tsx'))).toBe(false);

    for (const editFlow of ['new.tsx', 'exercise-picker.tsx', 'exercise-edit.tsx']) {
      expect({ editFlow, inRootStack: fs.existsSync(path.join(appDir, 'routine', editFlow)) }).toEqual({
        editFlow,
        inRootStack: true,
      });
    }
  });
});
