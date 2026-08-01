import { z } from 'zod';
import { EXERCISE_CATEGORIES, MEASUREMENT_TYPES } from './constants';

export const exerciseSchema = z.object({
  name: z.string().trim().min(1, '種目名を入力してください'),
  category: z.enum(EXERCISE_CATEGORIES, {
    message: 'カテゴリを選択してください',
  }),
  // 「記録する項目」。フォームでは常に何かが選ばれている状態にする（新規作成の初期値は
  // 重量×回数、編集は既存値をresolveMeasurementTypeで丸めたもの）ため、未選択のエラー文言は
  // 持たない。.default()は付けないこと——入力側がoptionalになるとzodResolverの型が
  // useForm<ExerciseFormValues>（出力型）と噛み合わなくなる
  measurementType: z.enum(MEASUREMENT_TYPES),
  note: z
    .string()
    .trim()
    .transform((v) => v || null)
    .nullable(),
  favorite: z.boolean(),
  formPoints: z
    .array(z.string())
    .transform((points) => points.map((p) => p.trim()).filter((p) => p.length > 0)),
});

export type ExerciseFormValues = z.infer<typeof exerciseSchema>;
