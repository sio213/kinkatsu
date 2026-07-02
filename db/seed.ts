import { db } from './client';
import { exercises } from './schema';
import { eq } from 'drizzle-orm';
import type { ExerciseCategory } from '@/lib/exercises/constants';

type PresetExercise = { slug: string; name: string; category: ExerciseCategory };

const PRESET_EXERCISES: PresetExercise[] = [
  // 胸
  { slug: 'bench_press', name: 'ベンチプレス', category: 'chest' },
  { slug: 'incline_bench_press', name: 'インクラインベンチプレス', category: 'chest' },
  { slug: 'decline_bench_press', name: 'デクラインベンチプレス', category: 'chest' },
  { slug: 'dumbbell_fly', name: 'ダンベルフライ', category: 'chest' },
  { slug: 'incline_dumbbell_fly', name: 'インクラインダンベルフライ', category: 'chest' },
  { slug: 'cable_crossover', name: 'ケーブルクロスオーバー', category: 'chest' },
  { slug: 'chest_press_machine', name: 'チェストプレス（マシン）', category: 'chest' },
  { slug: 'push_up', name: 'プッシュアップ', category: 'chest' },
  // 肩
  { slug: 'barbell_shoulder_press', name: 'バーベルショルダープレス', category: 'shoulder' },
  { slug: 'dumbbell_shoulder_press', name: 'ダンベルショルダープレス', category: 'shoulder' },
  { slug: 'side_raise', name: 'サイドレイズ', category: 'shoulder' },
  { slug: 'front_raise', name: 'フロントレイズ', category: 'shoulder' },
  { slug: 'rear_delt_fly', name: 'リアデルトフライ', category: 'shoulder' },
  { slug: 'face_pull', name: 'フェイスプル', category: 'shoulder' },
  { slug: 'arnold_press', name: 'アーノルドプレス', category: 'shoulder' },
  // 腕
  { slug: 'barbell_curl', name: 'バーベルカール', category: 'arm' },
  { slug: 'dumbbell_curl', name: 'ダンベルカール', category: 'arm' },
  { slug: 'hammer_curl', name: 'ハンマーカール', category: 'arm' },
  { slug: 'preacher_curl', name: 'プリーチャーカール', category: 'arm' },
  { slug: 'triceps_pushdown', name: 'トライセプスプレスダウン', category: 'arm' },
  { slug: 'triceps_extension', name: 'トライセプスエクステンション', category: 'arm' },
  { slug: 'french_press', name: 'フレンチプレス', category: 'arm' },
  { slug: 'dips', name: 'ディップス', category: 'arm' },
  // 体幹
  { slug: 'plank', name: 'プランク', category: 'core' },
  { slug: 'side_plank', name: 'サイドプランク', category: 'core' },
  // 腹筋
  { slug: 'crunch', name: 'クランチ', category: 'abs' },
  { slug: 'leg_raise', name: 'レッグレイズ', category: 'abs' },
  { slug: 'russian_twist', name: 'ロシアンツイスト', category: 'abs' },
  { slug: 'ab_wheel_rollout', name: 'アブローラー', category: 'abs' },
  { slug: 'bicycle_crunch', name: 'バイシクルクランチ', category: 'abs' },
  // 背中
  { slug: 'deadlift', name: 'デッドリフト', category: 'back' },
  { slug: 'lat_pulldown', name: 'ラットプルダウン', category: 'back' },
  { slug: 'seated_cable_row', name: 'シーテッドケーブルロウ', category: 'back' },
  { slug: 'barbell_row', name: 'バーベルロウ', category: 'back' },
  { slug: 'dumbbell_one_arm_row', name: 'ダンベルワンハンドロウ', category: 'back' },
  { slug: 'chin_up', name: 'チンニング（懸垂）', category: 'back' },
  { slug: 'pull_up', name: 'プルアップ', category: 'back' },
  { slug: 'high_row', name: 'ハイロウ', category: 'back' },
  { slug: 'back_extension', name: 'バックエクステンション', category: 'back' },
  // 有酸素
  { slug: 'running', name: 'ランニング', category: 'cardio' },
  { slug: 'walking', name: 'ウォーキング', category: 'cardio' },
  { slug: 'cycling', name: 'サイクリング', category: 'cardio' },
  { slug: 'rowing_ergometer', name: 'ロウイング（エルゴ）', category: 'cardio' },
  { slug: 'jump_rope', name: '縄跳び', category: 'cardio' },
  { slug: 'burpee', name: 'バーピー', category: 'cardio' },
  // 脚
  { slug: 'squat', name: 'スクワット', category: 'leg' },
  { slug: 'front_squat', name: 'フロントスクワット', category: 'leg' },
  { slug: 'leg_press', name: 'レッグプレス', category: 'leg' },
  { slug: 'romanian_deadlift', name: 'ルーマニアンデッドリフト', category: 'leg' },
  { slug: 'lunge', name: 'ランジ', category: 'leg' },
  { slug: 'bulgarian_split_squat', name: 'ブルガリアンスプリットスクワット', category: 'leg' },
  { slug: 'leg_curl', name: 'レッグカール', category: 'leg' },
  { slug: 'leg_extension', name: 'レッグエクステンション', category: 'leg' },
  { slug: 'calf_raise', name: 'カーフレイズ', category: 'leg' },
  { slug: 'goblet_squat', name: 'ゴブレットスクワット', category: 'leg' },
  // お尻
  { slug: 'hip_thrust', name: 'ヒップスラスト', category: 'glute' },
];

export const seed = async () => {
  console.log('🌱 Seeding start...');

  try {
    const existingPresets = await db
      .select()
      .from(exercises)
      .where(eq(exercises.source, 'preset'));
    const existingBySlug = new Map(existingPresets.map((e) => [e.slug, e]));

    const now = Date.now();
    const toInsert = PRESET_EXERCISES.filter((p) => !existingBySlug.has(p.slug));
    const toUpdate = PRESET_EXERCISES.filter((p) => {
      const existing = existingBySlug.get(p.slug);
      return existing !== undefined && existing.category !== p.category;
    });

    if (toInsert.length > 0) {
      await db
        .insert(exercises)
        .values(toInsert.map((e) => ({ ...e, source: 'preset', createdAt: now, updatedAt: now })));
    }

    for (const p of toUpdate) {
      const existing = existingBySlug.get(p.slug)!;
      await db
        .update(exercises)
        .set({ category: p.category, updatedAt: now })
        .where(eq(exercises.id, existing.id));
    }

    console.log(`✅ exercises: +${toInsert.length} inserted, ${toUpdate.length} updated`);
  } catch (e) {
    console.error('🚨 Seeding failed', e);
  }
};
