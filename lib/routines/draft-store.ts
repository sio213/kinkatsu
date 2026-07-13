import type { DraftExercise } from '@/lib/routines/validation';
import { create } from 'zustand';

type RoutineDraftState = {
  // ルーティンフォーム(名前+種目一覧+保存)⇔種目追加ピッカー⇔テンプレートセット編集画面を
  // 行き来する間、種目一覧を画面をまたいで保持するためのメモリ上の下書き（永続化はしない）。
  // 名前(name)はルーティンフォーム画面から出ないフィールドのためreact-hook-form側だけで持ち、
  // ここには含めない
  exercises: DraftExercise[];
  // 編集開始時に既存ルーティンの種目一覧を読み込む。新規作成時は空配列で呼ぶ
  hydrate: (exercises: DraftExercise[]) => void;
  addExercises: (exercises: DraftExercise[]) => void;
  removeExerciseAt: (index: number) => void;
  // テンプレートセット編集画面でのセット追加・削除・値変更をまとめて反映する
  // （setNumberは配列の並び順から導出するため、DraftExercise側に別途保持しない）
  updateExerciseSets: (index: number, sets: DraftExercise['sets']) => void;
  reset: () => void;
};

export const useRoutineDraftStore = create<RoutineDraftState>((set) => ({
  exercises: [],
  hydrate: (exercises) => set({ exercises }),
  addExercises: (newExercises) => set((state) => ({ exercises: [...state.exercises, ...newExercises] })),
  removeExerciseAt: (index) => set((state) => ({ exercises: state.exercises.filter((_, i) => i !== index) })),
  updateExerciseSets: (index, sets) =>
    set((state) => ({
      exercises: state.exercises.map((e, i) => (i === index ? { ...e, sets } : e)),
    })),
  reset: () => set({ exercises: [] }),
}));
