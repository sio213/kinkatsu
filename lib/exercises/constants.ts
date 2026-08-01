// 表示順は「胸/背中→肩→腕→脚→お尻→体幹/腹筋→有酸素→その他」。
// プッシュ/プルの代表格である胸・背中を先頭に並べ、肩・腕（アイソレーション系）、
// 下半身（脚→お尻）、コア系（体幹・腹筋は隣接）、最後に有酸素・その他という
// 実際のトレーニング分割の感覚に合わせた並び（2026-07-07 要件定義で決定）
export const EXERCISE_CATEGORIES = [
  'chest',
  'back',
  'shoulder',
  'arm',
  'leg',
  'glute',
  'core',
  'abs',
  'cardio',
  'other',
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

// カテゴリの表示ラベル（将来の多言語対応時はロケールごとのリソースに置き換える）
export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  chest: '胸',
  shoulder: '肩',
  arm: '腕',
  back: '背中',
  core: '体幹',
  abs: '腹筋',
  leg: '脚',
  glute: 'お尻',
  cardio: '有酸素',
  other: 'その他',
};

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category as ExerciseCategory] ?? category;
}

// カテゴリラベルはすべて漢字を含むため、ひらがな入力でも検索できるよう読み仮名を持たせる
// （種目名の readings.ts と同じ理由。normalizeForSearch のひらがな→カタカナ変換だけでは
// 漢字は変換されないため、素の読み仮名を別途持つ必要がある）
const CATEGORY_LABEL_READINGS: Record<ExerciseCategory, string> = {
  chest: 'むね',
  shoulder: 'かた',
  arm: 'うで',
  back: 'せなか',
  core: 'たいかん',
  abs: 'ふっきん',
  leg: 'あし',
  glute: 'おしり',
  cardio: 'ゆうさんそ',
  other: 'そのた',
};

export function getCategoryLabelReading(category: string): string | undefined {
  return CATEGORY_LABEL_READINGS[category as ExerciseCategory];
}

export const CATEGORY_ALL = '全て' as const;
export const CATEGORY_FAVORITE = '★' as const;

// 検索画面・種目追加ピッカーで共通のカテゴリチップ絞り込み一覧
export const CATEGORY_FILTER_LIST = [
  CATEGORY_ALL,
  CATEGORY_FAVORITE,
  ...EXERCISE_CATEGORIES,
] as const;

export const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  EXERCISE_CATEGORIES.map((c, i) => [c, i]),
);

// CATEGORY_ORDER[category]は未知のカテゴリ文字列に対してundefinedを返すため、
// ソート・タイブレークの際は必ずこの番兵値でフォールバックし、未知カテゴリを末尾に送る
export const UNKNOWN_CATEGORY_ORDER = EXERCISE_CATEGORIES.length;

export function isPresetExercise(exercise: { source: string }): boolean {
  return exercise.source === 'preset';
}

// 種目一覧の並び替え軸。'category' が既存の挙動（デフォルト）
export const EXERCISE_SORT_OPTIONS = ['category', 'name', 'frequent', 'recent'] as const;
export type ExerciseSortBy = (typeof EXERCISE_SORT_OPTIONS)[number];

export const EXERCISE_SORT_LABELS: Record<ExerciseSortBy, string> = {
  name: '名前順（50音）',
  category: 'カテゴリ順',
  frequent: 'よく使う順',
  recent: '最近使った順',
};

// 種目の計測方法。sets テーブルでどの列を使うかを決める
export const MEASUREMENT_TYPES = [
  'weight_reps',
  'reps',
  'time',
  'distance_time',
  'weight_time',
] as const;
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];

// 未知のmeasurementType（想定外のDB値、または種目自体が未取得でnull/undefined）でも
// 画面ごとクラッシュさせず標準の重量×回数にフォールバックする。exercise-history-picker-view.tsx・
// session-exercise-card.tsx・history-load-exercise-card.tsxで同じロジックが必要なため集約する
export function resolveMeasurementType(value: string | null | undefined): MeasurementType {
  return value != null && (MEASUREMENT_TYPES as readonly string[]).includes(value)
    ? (value as MeasurementType)
    : 'weight_reps';
}

/**
 * カスタム種目フォームの「記録する項目」の選択肢の文言（デザイン案A確定）。
 *
 * 画面に出す1行の説明は「実際に出る入力欄 — 代表的な種目」で、前半は
 * lib/workout/set-format.ts の MEASUREMENT_COLUMNS から組み立てる（単位表記を二重管理しない）。
 * ここが持つのは選択肢名と代表種目だけ。
 *
 * 選ぶ前に「結果」と「具体例」の両方が読める状態にするための説明なので、省略・折りたたみを
 * しないこと（「重量×時間と距離×時間の違いで一瞬止まる」というユーザーヒアリングの指摘への
 * 対応。2026-07-31）。表示順は MEASUREMENT_TYPES の順＝使用頻度順で、並べ替えないこと。
 */
export const MEASUREMENT_TYPE_LABELS: Record<MeasurementType, { label: string; examples: string }> = {
  weight_reps: { label: '重量×回数', examples: 'ベンチプレス、ダンベルカール' },
  reps: { label: '回数のみ', examples: '懸垂、腕立て伏せ' },
  time: { label: '時間のみ', examples: 'プランク、デッドハング' },
  distance_time: { label: '距離×時間', examples: 'ランニング、バイク' },
  weight_time: { label: '重量×時間', examples: '加重プランク、ファーマーズウォーク' },
};

/**
 * exercises.pairedWeights の種目で総重量を何倍にするか。左右で2つ。
 *
 * 定数にしているのは、同じ倍率を2箇所で掛けるため——種目詳細のグラフ（lib/exercises/progress.ts）と
 * 記録タブのセッションカード（hooks/use-workout-session.tsのSQL）。片方だけ変えると、同じ日の
 * 総重量が画面によって食い違う
 */
export const PAIRED_WEIGHT_SIDES = 2;
