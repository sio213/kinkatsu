import type { ReminderInput } from '@/lib/notifications/types';
import type { DraftExercise } from '@/lib/routines/validation';
import { create } from 'zustand';

type RoutineDraftState = {
  // ルーティンフォーム(名前+種目一覧+保存)⇔種目追加ピッカー⇔テンプレートセット編集画面⇔
  // リマインダー設定画面を行き来する間、内容を画面をまたいで保持するためのメモリ上の下書き
  // （永続化はしない）。名前(name)はルーティンフォーム画面から出ないフィールドのため
  // react-hook-form側だけで持ち、ここには含めない
  exercises: DraftExercise[];
  // リマインダートグルのON/OFF。新規作成時はデフォルトON(reminder未設定でも見せるが、
  // ON+未設定のまま保存しようとするとバリデーションエラーになる)
  reminderEnabled: boolean;
  // 実際に設定されたリマインダーの内容。「設定済みかどうか」はこれがnullかどうかで判定する。
  // トグルOFFにしても設定内容は保持する(再度ONにしたときに入力し直させないため)
  reminder: ReminderInput | null;
  // 編集開始時に既存ルーティンの種目一覧を読み込む。新規作成時は空配列で呼ぶ
  hydrate: (exercises: DraftExercise[]) => void;
  // 編集開始時に既存ルーティンのリマインダー設定を読み込む。新規作成時は
  // {enabled: true, reminder: null}で呼ぶ(デフォルトON・未設定)
  hydrateReminder: (state: { enabled: boolean; reminder: ReminderInput | null }) => void;
  addExercises: (exercises: DraftExercise[]) => void;
  removeExerciseAt: (index: number) => void;
  // テンプレートセット編集画面でのセット追加・削除・値変更をまとめて反映する
  // （setNumberは配列の並び順から導出するため、DraftExercise側に別途保持しない）
  updateExerciseSets: (index: number, sets: DraftExercise['sets']) => void;
  setReminderEnabled: (enabled: boolean) => void;
  setReminder: (reminder: ReminderInput) => void;
  reset: () => void;
};

export const useRoutineDraftStore = create<RoutineDraftState>((set) => ({
  exercises: [],
  reminderEnabled: true,
  reminder: null,
  hydrate: (exercises) => set({ exercises }),
  hydrateReminder: ({ enabled, reminder }) => set({ reminderEnabled: enabled, reminder }),
  addExercises: (newExercises) => set((state) => ({ exercises: [...state.exercises, ...newExercises] })),
  removeExerciseAt: (index) => set((state) => ({ exercises: state.exercises.filter((_, i) => i !== index) })),
  updateExerciseSets: (index, sets) =>
    set((state) => ({
      exercises: state.exercises.map((e, i) => (i === index ? { ...e, sets } : e)),
    })),
  setReminderEnabled: (enabled) => set({ reminderEnabled: enabled }),
  setReminder: (reminder) => set({ reminder }),
  reset: () => set({ exercises: [], reminderEnabled: true, reminder: null }),
}));
