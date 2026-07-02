import { db } from './client';
import { exercises } from './schema';
import { eq } from 'drizzle-orm';
import type { ExerciseCategory } from '@/lib/exercises/constants';

type PresetExercise = { name: string; category: ExerciseCategory };

const PRESET_EXERCISES: PresetExercise[] = [
  // 胸
  { name: 'ベンチプレス', category: '胸' },
  { name: 'インクラインベンチプレス', category: '胸' },
  { name: 'デクラインベンチプレス', category: '胸' },
  { name: 'ダンベルフライ', category: '胸' },
  { name: 'インクラインダンベルフライ', category: '胸' },
  { name: 'ケーブルクロスオーバー', category: '胸' },
  { name: 'チェストプレス（マシン）', category: '胸' },
  { name: 'プッシュアップ', category: '胸' },
  // 肩
  { name: 'バーベルショルダープレス', category: '肩' },
  { name: 'ダンベルショルダープレス', category: '肩' },
  { name: 'サイドレイズ', category: '肩' },
  { name: 'フロントレイズ', category: '肩' },
  { name: 'リアデルトフライ', category: '肩' },
  { name: 'フェイスプル', category: '肩' },
  { name: 'アーノルドプレス', category: '肩' },
  // 腕
  { name: 'バーベルカール', category: '腕' },
  { name: 'ダンベルカール', category: '腕' },
  { name: 'ハンマーカール', category: '腕' },
  { name: 'プリーチャーカール', category: '腕' },
  { name: 'トライセプスプレスダウン', category: '腕' },
  { name: 'トライセプスエクステンション', category: '腕' },
  { name: 'フレンチプレス', category: '腕' },
  { name: 'ディップス', category: '腕' },
  // 体幹
  { name: 'プランク', category: '体幹' },
  { name: 'サイドプランク', category: '体幹' },
  // 腹筋
  { name: 'クランチ', category: '腹筋' },
  { name: 'レッグレイズ', category: '腹筋' },
  { name: 'ロシアンツイスト', category: '腹筋' },
  { name: 'アブローラー', category: '腹筋' },
  { name: 'バイシクルクランチ', category: '腹筋' },
  // 背中
  { name: 'デッドリフト', category: '背中' },
  { name: 'ラットプルダウン', category: '背中' },
  { name: 'シーテッドケーブルロウ', category: '背中' },
  { name: 'バーベルロウ', category: '背中' },
  { name: 'ダンベルワンハンドロウ', category: '背中' },
  { name: 'チンニング（懸垂）', category: '背中' },
  { name: 'プルアップ', category: '背中' },
  { name: 'ハイロウ', category: '背中' },
  { name: 'バックエクステンション', category: '背中' },
  // 有酸素
  { name: 'ランニング', category: '有酸素' },
  { name: 'ウォーキング', category: '有酸素' },
  { name: 'サイクリング', category: '有酸素' },
  { name: 'ロウイング（エルゴ）', category: '有酸素' },
  { name: '縄跳び', category: '有酸素' },
  { name: 'バーピー', category: '有酸素' },
  // 脚
  { name: 'スクワット', category: '脚' },
  { name: 'フロントスクワット', category: '脚' },
  { name: 'レッグプレス', category: '脚' },
  { name: 'ルーマニアンデッドリフト', category: '脚' },
  { name: 'ランジ', category: '脚' },
  { name: 'ブルガリアンスプリットスクワット', category: '脚' },
  { name: 'レッグカール', category: '脚' },
  { name: 'レッグエクステンション', category: '脚' },
  { name: 'カーフレイズ', category: '脚' },
  { name: 'ゴブレットスクワット', category: '脚' },
  // お尻
  { name: 'ヒップスラスト', category: 'お尻' },
];

export const seed = async () => {
  console.log('🌱 Seeding start...');

  try {
    const existingPresets = await db
      .select()
      .from(exercises)
      .where(eq(exercises.source, 'preset'));
    const existingByName = new Map(existingPresets.map((e) => [e.name, e]));

    const now = Date.now();
    const toInsert = PRESET_EXERCISES.filter((p) => !existingByName.has(p.name));
    const toUpdate = PRESET_EXERCISES.filter((p) => {
      const existing = existingByName.get(p.name);
      return existing !== undefined && existing.category !== p.category;
    });

    if (toInsert.length > 0) {
      await db
        .insert(exercises)
        .values(toInsert.map((e) => ({ ...e, source: 'preset', createdAt: now, updatedAt: now })));
    }

    for (const p of toUpdate) {
      const existing = existingByName.get(p.name)!;
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
