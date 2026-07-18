// カレンダー画面の月グリッド生成に使う純粋関数群。DB非依存でJestからテストできる
// （lib/notifications/schedule-math.tsと同じ考え方）。

export const CELLS_PER_WEEK = 7;
export const WEEKS_PER_GRID = 6;

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// 月表示グリッドに並べる42日分（6週間×7日）の日付を、前月/当月/翌月をまたいで生成する。
// 1日が週の何曜日から始まるかに関わらず常に6週間分埋めることで、月によってグリッドの
// 高さが変わってしまう（＝画面が月をまたぐたびにガタつく）のを防ぐ
export function buildMonthGridDates(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  return Array.from({ length: WEEKS_PER_GRID * CELLS_PER_WEEK }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

// ヘッダーの「YYYY年M月」表示・前月/翌月ナビゲーション用に、月単位でズラしたDateを返す
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  // Dateコンストラクタはmonthが0-11の範囲外でも年をまたいで正規化してくれるため、
  // 年またぎ（1月の前月→前年12月等）を個別分岐せずに済む
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
