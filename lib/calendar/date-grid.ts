// カレンダー画面の月グリッド生成に使う純粋関数群。DB非依存でJestからテストできる
// （lib/notifications/schedule-math.tsと同じ考え方）。

export const CELLS_PER_WEEK = 7;

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// 月表示グリッドに必要な週数（4〜6週）を、1日の曜日と月の日数から計算する。
// デザイン案はその月を過不足なく埋められる最小の週数で表示しており（例: 2026年7月は5週）、
// 常に6週固定でパディングはしない
export function weeksInMonthGrid(year: number, month: number): number {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Math.ceil((firstOfMonth.getDay() + daysInMonth) / CELLS_PER_WEEK);
}

// 月表示グリッドに並べる日付を、前月/当月/翌月をまたいで生成する。行数は
// weeksInMonthGridに従い月ごとに4〜6週で可変（デザイン案通り）
export function buildMonthGridDates(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  const weeks = weeksInMonthGrid(year, month);
  return Array.from({ length: weeks * CELLS_PER_WEEK }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

// 日付を「YYYY-MM-DD」のローカルカレンダー基準キーに変換する。日別集計（実績・予定の
// 突合）のキーとして使う。toISOString()等のUTC変換は使わないこと
// （ユーザーのタイムゾーンによっては日付がずれるため。isSameDayと同じくgetFullYear/
// getMonth/getDateのみで組み立てる）
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// toDateKeyの逆変換。ローカルのカレンダー日付として組み立てる（new Date(dateKey)のようなISO
// パース経由だとUTC解釈されタイムゾーンによって日付がずれるため使わない）
export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ヘッダーの「YYYY年M月」表示・前月/翌月ナビゲーション用に、月単位でズラしたDateを返す
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  // Dateコンストラクタはmonthが0-11の範囲外でも年をまたいで正規化してくれるため、
  // 年またぎ（1月の前月→前年12月等）を個別分岐せずに済む
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
