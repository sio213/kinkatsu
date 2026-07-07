import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { EXERCISE_SORT_OPTIONS, type ExerciseSortBy } from './constants';

function isExerciseSortBy(value: unknown): value is ExerciseSortBy {
  return typeof value === 'string' && (EXERCISE_SORT_OPTIONS as readonly string[]).includes(value);
}

type ExerciseSortState = {
  // 種目一覧タブで選択中の並び替え軸。デフォルトは既存の挙動（カテゴリ順→名前順）を維持する
  listSortBy: ExerciseSortBy;
  setListSortBy: (sortBy: ExerciseSortBy) => void;
  // ワークアウト中の種目追加ピッカーで選択中の並び替え軸。種目タブとは独立して保持する。
  // 既定は「よく使う順」。「最近使った順」は今のセッションで1件追加しただけでも
  // その種目が無条件で最上位に来てしまい、2件目以降を選ぶ際に邪魔になるとの指摘があったため、
  // 累積頻度で決まり単発の追加には左右されにくい「よく使う順」を既定にした
  // （excludeSessionIdによる除外と合わせて対応。hooks/use-exercise-usage-stats.ts参照）。
  // 記録が無い種目しか無ければsortByUsage側の仕様により自動的に名前順にフォールバックする。
  // 注意: persistは選択済みstate全体を保存するため、このデフォルト変更が効くのは
  // 新規インストール時のみ。既に'recent'を選んだ状態が永続化済みの既存ユーザーには
  // excludeSessionIdによる除外の方が実質的な対策になる
  pickerSortBy: ExerciseSortBy;
  setPickerSortBy: (sortBy: ExerciseSortBy) => void;
  // ワークアウト中の種目入れ替え画面で選択中の並び替え軸。picker/種目タブとは独立して保持する。
  // 既定はpickerSortByと同じ理由で「よく使う順」
  swapSortBy: ExerciseSortBy;
  setSwapSortBy: (sortBy: ExerciseSortBy) => void;
};

export const useExerciseSortStore = create<ExerciseSortState>()(
  persist(
    (set) => ({
      listSortBy: 'category',
      setListSortBy: (sortBy) => set({ listSortBy: sortBy }),
      pickerSortBy: 'frequent',
      setPickerSortBy: (sortBy) => set({ pickerSortBy: sortBy }),
      swapSortBy: 'frequent',
      setSwapSortBy: (sortBy) => set({ swapSortBy: sortBy }),
    }),
    {
      name: 'exercise-sort-preference',
      storage: createJSONStorage(() => AsyncStorage),
      // 将来EXERCISE_SORT_OPTIONSの選択肢を減らした場合、永続化済みの古い値が
      // 無効な値になっていてもクラッシュせずデフォルトにフォールバックする
      merge: (persisted, current) => {
        const p = persisted as Partial<ExerciseSortState> | undefined;
        return {
          ...current,
          listSortBy: p && isExerciseSortBy(p.listSortBy) ? p.listSortBy : current.listSortBy,
          pickerSortBy: p && isExerciseSortBy(p.pickerSortBy) ? p.pickerSortBy : current.pickerSortBy,
          swapSortBy: p && isExerciseSortBy(p.swapSortBy) ? p.swapSortBy : current.swapSortBy,
        };
      },
    },
  ),
);
