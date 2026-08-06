import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type RoutineSavePromptState = {
  /**
   * 完了サマリーの「ルーティンとして保存」カードを、ユーザーが「今後表示しない」で閉じたか。
   *
   * 端末ごとに1つだけ持つ（セッション単位でも「N回まで」でもない）。ルーティンを一生作らない
   * タイプのユーザー——その日の体調で種目を決める人・種目をまだ探索中の人——に、トレーニングを
   * 終えるたび毎回勧誘が出るのを防ぐのが目的で、1回閉じたら二度と出さない。
   * ボタンの文言を「今はしない」ではなく「今後表示しない」にしているのはこのため
   * （効果が永続なのに一時的な文言を当てると、押した人が損をする）。
   *
   * カード自体はルーティンを1件でも持っていれば出ないため、このフラグが効くのは
   * 「ルーティンを作らないまま閉じた人」だけ。⋮メニューの「ルーティンとして保存」は残るので、
   * 閉じた後に気が変わってもそこから辿れる。
   */
  dismissed: boolean;
  dismiss: () => void;
  /**
   * AsyncStorageからの復元が終わったか。persistの復元は非同期で、ストア生成直後の
   * 最初のレンダーは必ずdismissed=falseから始まる。この画面はサマリーに着地する瞬間に
   * 初めて読み込まれるため復元が間に合わないことがあり、待たずに描くと
   * 「今後表示しない」を押したはずのユーザーにカードが数フレーム差し込まれる
   * （useLiveQueryのdata初期値[]と同じ性質の穴。@reviewer指摘）
   */
  hydrated: boolean;
  setHydrated: () => void;
};

export const useRoutineSavePromptStore = create<RoutineSavePromptState>()(
  persist(
    (set) => ({
      dismissed: false,
      dismiss: () => set({ dismissed: true }),
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'routine-save-prompt',
      storage: createJSONStorage(() => AsyncStorage),
      // 復元の成否に関わらず立てる（失敗しても「まだ閉じていない」で描き始めてよい。
      // 待ち続けるとカードが永久に出ない方に倒れる）
      onRehydrateStorage: () => (state) => state?.setHydrated(),
      // hydratedは永続化しない。次回起動時もfalseから始まって復元完了で立つ
      partialize: (state) => ({ dismissed: state.dismissed }),
      // 永続化済みの値が壊れていても（旧バージョンの形など）「まだ閉じていない」に
      // フォールバックする。閉じたはずのカードが再び出る方が、出るべきカードが永久に
      // 出ないより取り返しがつく
      merge: (persisted, current) => {
        const p = persisted as Partial<RoutineSavePromptState> | undefined;
        return { ...current, dismissed: p?.dismissed === true };
      },
    },
  ),
);
