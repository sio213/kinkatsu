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
  // 編集開始時に既存ルーティンのリマインダー設定を読み込む。新規作成時はこれを呼ばず、
  // reset()の既定値(reminderEnabled: true, reminder: null)をそのまま使う
  hydrateReminder: (state: { enabled: boolean; reminder: ReminderInput | null }) => void;
  addExercises: (exercises: DraftExercise[]) => void;
  removeExerciseAt: (index: number) => void;
  // テンプレートセット編集画面の⋮メニュー「上へ移動」「下へ移動」。DBのswapExerciseOrder
  // （orderIndexを持つ行同士の入れ替え）と違い、配列そのものの並び順が順序を表すため、
  // 隣接する2要素をそのまま入れ替える。範囲外(先頭で上へ/末尾で下へ)は何もしない
  // （呼び出し側のExerciseCardMenuがisFirst/isLastでボタン自体を無効化する前提の防御）
  moveExerciseAt: (index: number, direction: 'up' | 'down') => void;
  // テンプレートセット編集画面の⋮メニュー「種目を入れ替え」。既存の種目メタ情報・セットを
  // まとめて別の種目のものに差し替える（DBのreplaceSessionExerciseと同じ「丸ごと置き換え」の
  // 考え方だが、こちらはDBではなく下書き配列を直接書き換える）
  replaceExerciseAt: (index: number, exercise: DraftExercise) => void;
  // ヘッダー⋮「種目を並び替え」から開く専用画面(app/routine/exercise-reorder.tsx)。ドラッグする
  // たびに配列全体を書き換える。moveExerciseAt(隣接1件だけの入れ替え)と違い、任意の位置へ
  // 動かした結果の並び順そのものを丸ごと差し替える。要素の追加・削除は行わない前提
  reorderExercises: (exercises: DraftExercise[]) => void;
  // テンプレートセット編集画面でのセット追加・削除・値変更をまとめて反映する
  // （setNumberは配列の並び順から導出するため、DraftExercise側に別途保持しない）
  updateExerciseSets: (index: number, sets: DraftExercise['sets']) => void;
  // ⋮メニューの「過去の記録から読み込む」専用。updateExerciseSetsと処理自体は同じだが、
  // RoutineTemplateExerciseCard側で「このカード自身の追加/削除/値編集を経ない、外部からの
  // 丸ごと差し替え」であることを検知できるようlastSetsReplacement(index+token)を別途更新する。
  // カード側は行ごとの安定id(DBのset.idに相当するもの)を持たずローカルなrowKeysで代用しているため、
  // この検知が無いと、既存のRoutineTemplateSetRowインスタンス(propsをマウント時にしか
  // 取り込まない設計)が使い回されて読み込んだ新しい値が画面に反映されないバグになる
  loadSetsIntoExerciseAt: (index: number, sets: DraftExercise['sets']) => void;
  lastSetsReplacement: { index: number; token: number } | null;
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
  moveExerciseAt: (index, direction) =>
    set((state) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= state.exercises.length) return state;
      const exercises = [...state.exercises];
      [exercises[index], exercises[targetIndex]] = [exercises[targetIndex], exercises[index]];
      return { exercises };
    }),
  replaceExerciseAt: (index, exercise) =>
    set((state) => ({
      exercises: state.exercises.map((e, i) => (i === index ? exercise : e)),
    })),
  reorderExercises: (exercises) => set({ exercises }),
  updateExerciseSets: (index, sets) =>
    set((state) => ({
      exercises: state.exercises.map((e, i) => (i === index ? { ...e, sets } : e)),
    })),
  lastSetsReplacement: null,
  loadSetsIntoExerciseAt: (index, sets) =>
    set((state) => ({
      exercises: state.exercises.map((e, i) => (i === index ? { ...e, sets } : e)),
      // Date.now()だけだと同一ミリ秒内の連続呼び出しで値が衝突しうるため、Math.random()を足して
      // 「前回と同じトークンではない」ことをカード側が確実に検知できるようにする
      lastSetsReplacement: { index, token: Date.now() + Math.random() },
    })),
  setReminderEnabled: (enabled) => set({ reminderEnabled: enabled }),
  setReminder: (reminder) => set({ reminder }),
  reset: () => set({ exercises: [], reminderEnabled: true, reminder: null, lastSetsReplacement: null }),
}));
