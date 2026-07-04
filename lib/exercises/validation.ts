import { z } from 'zod';
import { EXERCISE_CATEGORIES } from './constants';

export const exerciseSchema = z.object({
  name: z.string().trim().min(1, '種目名を入力してください'),
  category: z.enum(EXERCISE_CATEGORIES, {
    message: 'カテゴリを選択してください',
  }),
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
