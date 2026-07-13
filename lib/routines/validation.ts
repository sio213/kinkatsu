import type { ReminderInput } from '@/lib/notifications/types';
import { buildEditInput } from '@/lib/notifications/validation';
import type { RoutineDetail, RoutineInput } from '@/lib/routines/db';
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
    message: 'リマインダーを設定してください',
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
// フォーム/ドラフトストアが扱う形に変換する。紐づくリマインダーが無ければ、新規作成時と
// 同じ既定(トグルON・未設定)にする
export function toDraftReminder(detail: RoutineDetail): { enabled: boolean; reminder: ReminderInput | null } {
  if (!detail.reminder) return { enabled: true, reminder: null };
  return { enabled: detail.reminder.enabled, reminder: buildEditInput(detail.reminder) };
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
