import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type PromptDismissState = {
  /**
   * 完了サマリーの勧誘カードを、ユーザーが「今後表示しない」で閉じたか。端末ごとに1つ。
   *
   * 「今はしない」ではなく「今後表示しない」という文言なのは、効果が永続だから
   * （一時的な文言を当てると押した人が損をする）。
   */
  dismissed: boolean;
  dismiss: () => void;
  // 「今後表示しない」の撤回。実際にその機能を使ったときに呼ぶ
  restore: () => void;
  /**
   * AsyncStorageからの復元が終わったか。persistの復元は非同期で、ストア生成直後の
   * 最初のレンダーは必ずdismissed=falseから始まる。サマリーは着地する瞬間に初めて
   * 読み込まれるため復元が間に合わないことがあり、待たずに描くと
   * 「今後表示しない」を押したはずのユーザーにカードが数フレーム差し込まれる
   * （useLiveQueryのdata初期値[]と同じ性質の穴）
   */
  hydrated: boolean;
  setHydrated: () => void;
};

/**
 * 完了サマリーの勧誘カード（「ルーティンとして保存」「ルーティンを更新」）の
 * 「今後表示しない」フラグを永続化するストアを作る。
 *
 * カードごとに**別のキー**で持つこと。共有すると、保存を断った人が後でルーティンを作ったときに
 * 更新カードも見られなくなる（逆も同様）。
 */
export function createPromptDismissStore(name: string) {
  return create<PromptDismissState>()(
    persist(
      (set) => ({
        dismissed: false,
        dismiss: () => set({ dismissed: true }),
        restore: () => set({ dismissed: false }),
        hydrated: false,
        setHydrated: () => set({ hydrated: true }),
      }),
      {
        name,
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
          const p = persisted as Partial<PromptDismissState> | undefined;
          return { ...current, dismissed: p?.dismissed === true };
        },
      },
    ),
  );
}
