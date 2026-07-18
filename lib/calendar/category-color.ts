// カレンダー機能専用のカテゴリ色。
//
// EXERCISE_CATEGORIES（10種）をそのまま7色に割り当てるとカレンダー上で色が多すぎて
// 判別しづらくなるため、見た目が近い部位同士を1色にまとめて表示する
// （フィルターチップ等の絞り込みは10種のまま。色分けだけがこの7グループ単位になる）。
//
// 実際の色値はconstants/theme.tsのColors（category*）を参照する。legGluteの色は
// 元デザイン案では#2563EB（Colors.accentと同値）だったが、アプリ全体で「選択中/操作可能」を
// 意味するaccentと衝突し、塗りつぶされたセルを誤って操作可能な要素と誤認しやすくなるため、
// 別の色相（teal）に差し替えている。
import { Colors } from '@/constants/theme';
import type { ExerciseCategory } from '@/lib/exercises/constants';

export const CALENDAR_COLOR_GROUPS = ['chest', 'back', 'legGlute', 'absCore', 'shoulder', 'arm', 'cardioOther'] as const;
export type CalendarColorGroup = (typeof CALENDAR_COLOR_GROUPS)[number];

export const CALENDAR_COLOR_GROUP_LABELS: Record<CalendarColorGroup, string> = {
  chest: '胸',
  back: '背中',
  legGlute: '脚・お尻',
  absCore: '腹筋・体幹',
  shoulder: '肩',
  arm: '腕',
  cardioOther: '有酸素・他',
};

// 表示順は EXERCISE_CATEGORIES（胸/背中/肩/腕/脚/お尻/体幹/腹筋/有酸素/その他）とは
// 異なり、デザイン案の凡例順（胸/背中/脚・お尻/腹筋・体幹/肩/腕/有酸素・他）に合わせている。
// 圧縮後の新しい並びとしてデザイン案側で確定した順序のため、既存カテゴリ順への統一はしない
export const CALENDAR_COLOR_GROUP_COLORS: Record<CalendarColorGroup, string> = {
  chest: Colors.categoryChest,
  back: Colors.categoryBack,
  legGlute: Colors.categoryLegGlute,
  absCore: Colors.categoryAbsCore,
  shoulder: Colors.categoryShoulder,
  arm: Colors.categoryArm,
  cardioOther: Colors.categoryCardioOther,
};

const CATEGORY_TO_COLOR_GROUP: Record<ExerciseCategory, CalendarColorGroup> = {
  chest: 'chest',
  back: 'back',
  leg: 'legGlute',
  glute: 'legGlute',
  core: 'absCore',
  abs: 'absCore',
  shoulder: 'shoulder',
  arm: 'arm',
  cardio: 'cardioOther',
  other: 'cardioOther',
};

// 未知のカテゴリ文字列（レガシーデータ等）はcardioOtherのグレーにフォールバックする
export function getCalendarColorGroup(category: string): CalendarColorGroup {
  return CATEGORY_TO_COLOR_GROUP[category as ExerciseCategory] ?? 'cardioOther';
}

export function getCalendarCategoryColor(category: string): string {
  return CALENDAR_COLOR_GROUP_COLORS[getCalendarColorGroup(category)];
}

// カラー凡例（横一列表示）用に、表示順で色とラベルをまとめたリスト
export const CALENDAR_COLOR_LEGEND = CALENDAR_COLOR_GROUPS.map((group) => ({
  group,
  label: CALENDAR_COLOR_GROUP_LABELS[group],
  color: CALENDAR_COLOR_GROUP_COLORS[group],
}));
