import type { ReminderInput } from '@/lib/notifications/types';
import { buildEditInput } from '@/lib/notifications/validation';
import type { RoutineDetail, RoutineInput } from '@/lib/routines/db';
import type { HistorySetValues, SessionHistoryCard } from '@/lib/workout/history';
import { hasAnyValue } from '@/lib/workout/set-values';
import { z } from 'zod';

const draftSetSchema = z.object({
  weight: z.number().nullable(),
  reps: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  distanceMeters: z.number().nullable(),
});

// フォーム内部で持ち回る種目1件分の表示用データ。DB保存に必要なexerciseId/setsに加え、
// 一覧行の表示（サムネイル・名前・カテゴリ・代表セット）に必要な情報も含める
const draftExerciseSchema = z.object({
  exerciseId: z.number(),
  name: z.string(),
  category: z.string(),
  measurementType: z.string(),
  source: z.string(),
  slug: z.string().nullable(),
  sets: z.array(draftSetSchema),
});

export type DraftExercise = z.infer<typeof draftExerciseSchema>;

// exercises/reminder(Enabled)は種目追加ピッカー・リマインダー設定画面・ドラフトストア経由での
// みでしか変化せず、ユーザーが直接この画面で編集するフィールドではないため、
// エラーメッセージは各1点のみで十分
export const routineFormSchema = z
  .object({
    name: z.string().trim().min(1, 'ルーティン名を入力してください'),
    exercises: z.array(draftExerciseSchema).min(1, '種目を1つ以上追加してください'),
    reminderEnabled: z.boolean(),
    // ReminderForm(reminderFormSchema)側で入力内容自体は検証済みのため、ここでは
    // 「ONなのに未設定(null)のまま保存しようとしていないか」だけをrefineで見る
    reminder: z.custom<ReminderInput>().nullable(),
  })
  .refine((v) => !v.reminderEnabled || v.reminder != null, {
    message: '通知タイミングを設定してください',
    path: ['reminder'],
  });

export type RoutineFormValues = z.infer<typeof routineFormSchema>;

export function toRoutineInput(values: RoutineFormValues): RoutineInput {
  return {
    name: values.name,
    exercises: values.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets,
    })),
  };
}

// 編集フォームの初期値読み込み用。getRoutineDetail()のDB行（リマインダー）を
// フォーム/ドラフトストアが扱う形に変換する。紐づくリマインダーが無ければトグルOFFにする。
// routineFormSchemaのrefine(「ONなのに未設定は保存不可」)により、保存済みの既存ルーティンで
// reminderが無い(=行自体が作られていない)のは必ず直前の保存時にトグルOFFだった場合のみ
// (ON+未設定のまま保存されることは無い)。ここをtrue(新規作成時と同じ既定)にすると、
// 「OFFにして保存したのに次に開くとONになっている」というバグになる(新規作成時の既定ONは
// draft-store.tsのreset()側で持つため、この関数は新規作成時には呼ばれず影響しない)
export function toDraftReminder(detail: RoutineDetail): { enabled: boolean; reminder: ReminderInput | null } {
  if (!detail.reminder) return { enabled: false, reminder: null };
  return { enabled: detail.reminder.enabled, reminder: buildEditInput(detail.reminder) };
}

// HistorySetValues[](✓確定・未確定を問わない実測値)からDraftExercise['sets']への変換。
// 値が1つも無い行(セット追加だけして未入力のまま終えた等)はhasAnyValueで除外する
// (絞り込まないと余分な空セットが混入する)。historyCardsToDraftExercises・
// app/routine/history-picker.tsxのrunLoadで共用する
export function historySetsToDraftSets(sets: HistorySetValues[]): DraftExercise['sets'] {
  return sets.filter(hasAnyValue).map((s) => ({
    weight: s.weight,
    reps: s.reps,
    durationSeconds: s.durationSeconds,
    distanceMeters: s.distanceMeters,
  }));
}

// ヘッダー⋮「過去の記録から読み込む」(app/routine/session-history-load.tsx)用。選ばれた
// 過去セッションのカード群(SessionHistoryCard、DBのworkoutSessionExercises+setsから取得した実データ)を
// 下書きストアのaddExercisesにそのまま渡せるDraftExercise[]へ変換する
export function historyCardsToDraftExercises(cards: SessionHistoryCard[]): DraftExercise[] {
  return cards.map((c) => ({
    exerciseId: c.exerciseId,
    name: c.name,
    category: c.category,
    measurementType: c.measurementType,
    source: c.source,
    slug: c.slug,
    sets: historySetsToDraftSets(c.sets),
  }));
}

// 編集フォームの初期値読み込み用。getRoutineDetail()のDB行（種目メタ情報+セット）を
// フォーム/ドラフトストアが扱うDraftExercise[]に変換する
export function toDraftExercises(detail: RoutineDetail): DraftExercise[] {
  return detail.exercises.map((e) => ({
    exerciseId: e.exerciseId,
    name: e.name,
    category: e.category,
    measurementType: e.measurementType,
    source: e.source,
    slug: e.slug,
    sets: e.sets.map((s) => ({
      weight: s.weight,
      reps: s.reps,
      durationSeconds: s.durationSeconds,
      distanceMeters: s.distanceMeters,
    })),
  }));
}
