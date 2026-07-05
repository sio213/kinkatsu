import type { Exercise } from '@/db/schema';
import { isPresetExercise } from './constants';

// 種目名に漢字を含むもののみ読み仮名を登録する。純カタカナ名は
// normalizeForSearch のひらがな→カタカナ変換だけで検索にヒットするため不要。
const READINGS: Record<string, string> = {
  kneeling_push_up: 'ひざつきプッシュアップ',
  weighted_push_up: 'かじゅうプッシュアップ',
  one_arm_push_up: 'かたうでプッシュアップ',
  weighted_plank: 'かじゅうプランク',
  weighted_sit_up: 'かじゅうシットアップ',
  weighted_dips: 'かじゅうディップス',
  weighted_bench_dip: 'かじゅうベンチディップス',
  weighted_decline_sit_up: 'かじゅうデクラインシットアップ',
  weighted_hanging_knee_raise: 'かじゅうハンギングニーレイズ',
  weighted_back_extension: 'かじゅうバックエクステンション',
  weighted_sissy_squat: 'かじゅうシシースクワット',
  chin_up: 'ちんにんぐけんすい',
  weighted_chin_up: 'かじゅうちんにんぐけんすい',
  pull_up: 'ぷるあっぷけんすい',
  weighted_pull_up: 'かじゅうぷるあっぷけんすい',
  wide_grip_pull_up: 'わいどぐりっぷけんすい',
  close_grip_pull_up: 'くろーずぐりっぷけんすい',
  neutral_grip_pull_up: 'にゅーとらるぐりっぷけんすい',
  negative_pull_up: 'ねがてぃぶけんすい',
  jump_rope: 'なわとび',
  swimming: 'すいえい',
  sled_push: 'そりおしぷっしゅすれっど',
  broad_jump: 'たちはばとび',
  adductor_machine: 'あだくたーましんないてんきんましん',
  abductor_machine: 'あぶだくたーましんがいてんきんましん',
  tibialis_raise: 'てぃびありすれいずすねあげ',
  hip_flexor_stretch: 'こかんせつくっきんすとれっち',
  shoulder_stretch: 'かたすとれっち',
  quad_stretch: 'だいたいしとうきんすとれっち',
  chest_stretch: 'むねすとれっち',
  spinal_twist_stretch: 'せきちゅうついすとすとれっち',
  pigeon_pose: 'はとのぽーず',
  yoga_sun_salutation: 'たいようれいはい',
};

export function getReading(exercise: Exercise): string | undefined {
  if (!isPresetExercise(exercise) || !exercise.slug) return undefined;
  return READINGS[exercise.slug];
}
