import { db } from './client';
import { exercises } from './schema';
import { eq } from 'drizzle-orm';

type PresetExercise = { name: string; category: string };

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
  { name: 'クランチ', category: '体幹' },
  { name: 'プランク', category: '体幹' },
  { name: 'レッグレイズ', category: '体幹' },
  { name: 'ロシアンツイスト', category: '体幹' },
  { name: 'アブローラー', category: '体幹' },
  { name: 'サイドプランク', category: '体幹' },
  { name: 'バイシクルクランチ', category: '体幹' },
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
  { name: 'ヒップスラスト', category: '脚' },
  { name: 'ゴブレットスクワット', category: '脚' },
];

export const seed = async () => {
  console.log('🌱 Seeding start...');

  const existing = await db
    .select()
    .from(exercises)
    .where(eq(exercises.source, 'preset'))
    .limit(1);

  if (existing.length > 0) {
    console.log('⏭️  Seeding Skipped');
    return;
  }

  const now = Date.now();
  const inserted = await db
    .insert(exercises)
    .values(PRESET_EXERCISES.map((e) => ({ ...e, source: 'preset', createdAt: now, updatedAt: now })))
    .returning();

  console.log(`✅ exercises: ${inserted.length} rows`);
};
