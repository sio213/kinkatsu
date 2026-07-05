import type { Exercise } from '@/db/schema';
import { isPresetExercise } from './constants';

export type AliasEntry = {
  text: string;
  // 別名に漢字を含む場合のみ、ひらがな入力でも検索できるよう読み仮名を持たせる
  reading?: string;
};

// 正式名（カタカナ表記）とは別に実際に検索されうる語のみ登録する。
// - 日本語の俗称・和名: カタカナ表記と競合する種目のみ（バーベル・ダンベル・マシン系は和名の競合がないため対象外）
// - 英字の略称・イニシャル: パワーリフティング/SNS界隈で定着しているもののみ（読み仮名は不要）
const ALIASES: Record<string, AliasEntry[]> = {
  push_up: [
    { text: '腕立て伏せ', reading: 'うでたてふせ' },
    { text: '腕立て', reading: 'うでたて' },
  ],
  crunch: [{ text: '腹筋', reading: 'ふっきん' }],
  sit_up: [{ text: '上体起こし', reading: 'じょうたいおこし' }],
  glute_bridge: [{ text: 'ヒップリフト' }],
  calf_raise: [
    { text: 'かかと上げ', reading: 'かかとあげ' },
    { text: 'つま先立ち', reading: 'つまさきだち' },
  ],
  jump_rope: [{ text: 'ジャンプロープ' }],
  swimming: [{ text: 'スイミング' }],
  plank: [{ text: 'フロントブリッジ' }],
  wall_sit: [
    { text: '空気椅子', reading: 'くうきいす' },
    { text: '空気イス', reading: 'くうきいす' },
  ],
  high_knees: [{ text: '腿上げ', reading: 'ももあげ' }],
  bear_crawl: [{ text: '熊歩き', reading: 'くまあるき' }],
  downward_dog: [{ text: '下向き犬のポーズ', reading: 'したむきいぬのぽーず' }],
  leg_raise: [{ text: '足上げ腹筋', reading: 'あしあげふっきん' }],
  // 「肩すくめ」はバーベル/ダンベルの器具差を区別しない動作の俗称のため、両方のバリエーションに登録する
  shrug: [{ text: '肩すくめ', reading: 'かたすくめ' }],
  dumbbell_shrug: [{ text: '肩すくめ', reading: 'かたすくめ' }],
  walking: [{ text: '散歩', reading: 'さんぽ' }],
  cycling: [{ text: '自転車', reading: 'じてんしゃ' }],
  bench_press: [{ text: 'BP' }],
  squat: [{ text: 'SQ' }],
  deadlift: [{ text: 'DL' }],
  romanian_deadlift: [{ text: 'RDL' }],
  overhead_squat: [{ text: 'OHS' }],
  // OHPは立位のバーベルショルダープレスを指す用語のため、座位のバリエーション（seated_barbell_shoulder_press）には登録しない
  barbell_shoulder_press: [{ text: 'OHP' }],
};

export function getAliases(exercise: Exercise): AliasEntry[] {
  if (!isPresetExercise(exercise) || !exercise.slug) return [];
  return ALIASES[exercise.slug] ?? [];
}
