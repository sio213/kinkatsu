import type { Exercise } from '@/db/schema';
import { isPresetExercise } from './constants';

export type AliasEntry = {
  text: string;
  // 別名に漢字を含む場合のみ、ひらがな入力でも検索できるよう読み仮名を持たせる
  reading?: string;
};

// カタカナ表記の正式名と日本語の俗称・和名が競合する種目のみ登録する。
// バーベル・ダンベル・マシン系の種目は和名の競合がないため対象外。
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
};

export function getAliases(exercise: Exercise): AliasEntry[] {
  if (!isPresetExercise(exercise) || !exercise.slug) return [];
  return ALIASES[exercise.slug] ?? [];
}
