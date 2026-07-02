import { db } from './client';
import { exercises } from './schema';
import { eq } from 'drizzle-orm';
import type { ExerciseCategory } from '@/lib/exercises/constants';

type PresetExercise = { slug: string; name: string; category: ExerciseCategory };

const PRESET_EXERCISES: PresetExercise[] = [
  // 胸
  { slug: 'bench_press', name: 'ベンチプレス', category: '胸' },
  { slug: 'incline_bench_press', name: 'インクラインベンチプレス', category: '胸' },
  { slug: 'decline_bench_press', name: 'デクラインベンチプレス', category: '胸' },
  { slug: 'dumbbell_fly', name: 'ダンベルフライ', category: '胸' },
  { slug: 'incline_dumbbell_fly', name: 'インクラインダンベルフライ', category: '胸' },
  { slug: 'cable_crossover', name: 'ケーブルクロスオーバー', category: '胸' },
  { slug: 'chest_press_machine', name: 'チェストプレス（マシン）', category: '胸' },
  { slug: 'push_up', name: 'プッシュアップ', category: '胸' },
  // 肩
  { slug: 'barbell_shoulder_press', name: 'バーベルショルダープレス', category: '肩' },
  { slug: 'dumbbell_shoulder_press', name: 'ダンベルショルダープレス', category: '肩' },
  { slug: 'side_raise', name: 'サイドレイズ', category: '肩' },
  { slug: 'front_raise', name: 'フロントレイズ', category: '肩' },
  { slug: 'rear_delt_fly', name: 'リアデルトフライ', category: '肩' },
  { slug: 'face_pull', name: 'フェイスプル', category: '肩' },
  { slug: 'arnold_press', name: 'アーノルドプレス', category: '肩' },
  // 腕
  { slug: 'barbell_curl', name: 'バーベルカール', category: '腕' },
  { slug: 'dumbbell_curl', name: 'ダンベルカール', category: '腕' },
  { slug: 'hammer_curl', name: 'ハンマーカール', category: '腕' },
  { slug: 'preacher_curl', name: 'プリーチャーカール', category: '腕' },
  { slug: 'triceps_pushdown', name: 'トライセプスプレスダウン', category: '腕' },
  { slug: 'triceps_extension', name: 'トライセプスエクステンション', category: '腕' },
  { slug: 'french_press', name: 'フレンチプレス', category: '腕' },
  { slug: 'dips', name: 'ディップス', category: '腕' },
  // 体幹
  { slug: 'plank', name: 'プランク', category: '体幹' },
  { slug: 'side_plank', name: 'サイドプランク', category: '体幹' },
  // 腹筋
  { slug: 'crunch', name: 'クランチ', category: '腹筋' },
  { slug: 'leg_raise', name: 'レッグレイズ', category: '腹筋' },
  { slug: 'russian_twist', name: 'ロシアンツイスト', category: '腹筋' },
  { slug: 'ab_wheel_rollout', name: 'アブローラー', category: '腹筋' },
  { slug: 'bicycle_crunch', name: 'バイシクルクランチ', category: '腹筋' },
  // 背中
  { slug: 'deadlift', name: 'デッドリフト', category: '背中' },
  { slug: 'lat_pulldown', name: 'ラットプルダウン', category: '背中' },
  { slug: 'seated_cable_row', name: 'シーテッドケーブルロウ', category: '背中' },
  { slug: 'barbell_row', name: 'バーベルロウ', category: '背中' },
  { slug: 'dumbbell_one_arm_row', name: 'ダンベルワンハンドロウ', category: '背中' },
  { slug: 'chin_up', name: 'チンニング（懸垂）', category: '背中' },
  { slug: 'pull_up', name: 'プルアップ', category: '背中' },
  { slug: 'high_row', name: 'ハイロウ', category: '背中' },
  { slug: 'back_extension', name: 'バックエクステンション', category: '背中' },
  // 有酸素
  { slug: 'running', name: 'ランニング', category: '有酸素' },
  { slug: 'walking', name: 'ウォーキング', category: '有酸素' },
  { slug: 'cycling', name: 'サイクリング', category: '有酸素' },
  { slug: 'rowing_ergometer', name: 'ロウイング（エルゴ）', category: '有酸素' },
  { slug: 'jump_rope', name: '縄跳び', category: '有酸素' },
  { slug: 'burpee', name: 'バーピー', category: '有酸素' },
  // 脚
  { slug: 'squat', name: 'スクワット', category: '脚' },
  { slug: 'front_squat', name: 'フロントスクワット', category: '脚' },
  { slug: 'leg_press', name: 'レッグプレス', category: '脚' },
  { slug: 'romanian_deadlift', name: 'ルーマニアンデッドリフト', category: '脚' },
  { slug: 'lunge', name: 'ランジ', category: '脚' },
  { slug: 'bulgarian_split_squat', name: 'ブルガリアンスプリットスクワット', category: '脚' },
  { slug: 'leg_curl', name: 'レッグカール', category: '脚' },
  { slug: 'leg_extension', name: 'レッグエクステンション', category: '脚' },
  { slug: 'calf_raise', name: 'カーフレイズ', category: '脚' },
  { slug: 'goblet_squat', name: 'ゴブレットスクワット', category: '脚' },
  // お尻
  { slug: 'hip_thrust', name: 'ヒップスラスト', category: 'お尻' },
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
