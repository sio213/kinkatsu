import type { Reminder } from '@/db/schema';
import { formatKindSummary } from '@/lib/notifications/format';

// カテゴリタグの最大表示数。これを超えたら先頭からこの件数だけ表示し、残りは「+N」にまとめる
export const MAX_VISIBLE_CATEGORIES = 3;

export type CategorySummary = {
  visible: string[];
  overflowCount: number;
};

// ルーティンカードのカテゴリタグ表示。種目追加順で重複除去済みのcategories配列を受け取り、
// 4つ以上なら先頭3つ+overflowCountにする（並び順は呼び出し側=種目追加順のまま維持する）
export function summarizeCategories(categories: string[]): CategorySummary {
  if (categories.length <= MAX_VISIBLE_CATEGORIES) {
    return { visible: categories, overflowCount: 0 };
  }
  return {
    visible: categories.slice(0, MAX_VISIBLE_CATEGORIES),
    overflowCount: categories.length - MAX_VISIBLE_CATEGORIES,
  };
}

export type RoutineScheduleDisplay = {
  label: string;
  // falseなら「リマインダーなし」相当のオフ表示（グレー+event_busyアイコン）
  active: boolean;
};

// ルーティンカードのスケジュール行。reminderが無い、またはトグルOFF(enabled:false)なら
// 「リマインダーなし」扱いにする（OFFのリマインダーは実際には発火しないため、一覧では
// 「無い」ものと同じに見せるのが実態に即している）
export function getRoutineScheduleDisplay(reminder: Reminder | null): RoutineScheduleDisplay {
  if (!reminder || !reminder.enabled) {
    return { label: 'リマインダーなし', active: false };
  }
  return { label: formatKindSummary(reminder), active: true };
}
