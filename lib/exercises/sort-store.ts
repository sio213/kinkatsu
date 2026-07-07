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
};

export const useExerciseSortStore = create<ExerciseSortState>()(
  persist(
    (set) => ({
      listSortBy: 'category',
      setListSortBy: (sortBy) => set({ listSortBy: sortBy }),
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
        };
      },
    },
  ),
);
