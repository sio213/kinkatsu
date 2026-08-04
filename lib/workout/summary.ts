import { WEEKDAY_LABELS } from '@/lib/format';

export type SessionSummary = {
  setCount: number;
  totalVolume: number;
};

// セッションの経過時間を「N分」表示にする。endedAtが無ければnow基準（進行中）
export function formatSessionDuration(
  startedAt: number,
  endedAt: number | null,
  now: number = Date.now(),
): string {
  const end = endedAt ?? now;
  const minutes = Math.max(0, Math.round((end - startedAt) / 60_000));
  return `${minutes}分`;
}

/**
 * 完了サマリーの所要時間表示。formatSessionDurationの「N分」に準拠しつつ、60分を超えたら
 * 「1時間12分」に切り替える（デザイン案）。ちょうど1時間なら「1時間」で、「1時間0分」は出さない。
 *
 * 記録タブのセッションカード・トレーニング中画面のタイマーチップは今も「N分」のままなので、
 * 90分のセッションはサマリーで「1時間30分」・記録タブで「90分」と表記が割れる。サマリーは
 * 数値を主役に据える画面で「92分」では長さが直感的に掴めないため、まずここだけ切り替えている
 */
export function formatSessionDurationLong(
  startedAt: number,
  endedAt: number | null,
  now: number = Date.now(),
): string {
  const end = endedAt ?? now;
  const minutes = Math.max(0, Math.round((end - startedAt) / 60_000));
  if (minutes < MINUTES_PER_HOUR) return `${minutes}分`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return rest === 0 ? `${hours}時間` : `${hours}時間${rest}分`;
}

const MINUTES_PER_HOUR = 60;

/**
 * その週の始まり（月曜0時）。完了サマリーの「今週N回目」の集計範囲に使う。
 *
 * 週の始まりを月曜に置くのはデザイン案の指定。トレーニングの習慣は「土日で帳尻を合わせる」
 * 形になりやすく、日曜始まりだと週末の2日が別々の週に割れてしまう
 */
export function startOfWeek(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  // getDay()は日曜が0。月曜を0にずらしてから、その日数だけ巻き戻す
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d.getTime();
}

// 経過時間を「M:SS」形式にする（分は60を超えても位取りせずそのまま伸びる）。
// トレーニング中画面のタイマーチップ・再開バナーの60分未満表記で共通利用（@reviewer指摘: 重複実装の解消）
export function formatMinutesSeconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// 再開バナーの経過時間表示用。60分未満は秒まで見える「M:SS」、60分以上になったら秒を落として
// 「H時間M分」に切り替える（デザイン案の要件: 60分を超えたら時間・分が分かりやすい表記にする）
export function formatElapsedClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  if (hours > 0) {
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}時間${minutes}分`;
  }
  return formatMinutesSeconds(ms);
}

// 記録タブの日付グループ見出し用（例: 「7月3日（木）」）
export function formatSessionDateGroup(startedAt: number): string {
  const d = new Date(startedAt);
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAY_LABELS[d.getDay()]}）`;
}

// 年をまたいでも同じ月日を誤って同一グループにしないための内部キー（表示には使わない）
function dateGroupKey(startedAt: number): string {
  const d = new Date(startedAt);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// 同じ日付グループのセッションをまとめる。新しい日付が先頭に来る前提（sessionsは降順ソート済み）。
// 同日のセッションが配列中で非連続（ソート前提が崩れている）場合は別グループに分裂する
export function groupSessionsByDate<T extends { startedAt: number }>(
  sessions: T[],
): { dateLabel: string; sessions: T[] }[] {
  const groups: { key: string; dateLabel: string; sessions: T[] }[] = [];
  for (const session of sessions) {
    const key = dateGroupKey(session.startedAt);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.key === key) {
      lastGroup.sessions.push(session);
    } else {
      groups.push({ key, dateLabel: formatSessionDateGroup(session.startedAt), sessions: [session] });
    }
  }
  return groups.map(({ dateLabel, sessions: s }) => ({ dateLabel, sessions: s }));
}

const DAYS_PER_WEEK = 7;
// 表示用の概算値。lib/notifications/scheduler.tsの通知スケジューリングは実カレンダー月
// （年×12+月）で厳密に計算するが、こちらは相対表示なので30日固定の近似で十分という判断で
// 意図的に別系統にしている（正確な月境界は扱わない）
const APPROX_DAYS_PER_MONTH = 30;
const MONTHS_PER_YEAR = 12;
const DAYS_PER_YEAR = 365;

// 「記録から読み込む」画面の直近項目用。直近1週間は日単位（n日前）、それ以降は週単位（先週／n週間前）、
// 30日以降は月単位（nヶ月前）、12ヶ月に達したら年単位（n年前）のおおまかな相対表示にする
// （長期間記録を続けるユーザーだと「37ヶ月前」のような表記になりうるため、GitHub等の相対時刻表示と
// 同じ考え方で年単位まで用意する。2026-07-08 要件定義で確定）。未来方向（クロックのずれ等で
// startedAtがnowより後になるケース）はnullを返し、呼び出し側は絶対日付（formatSessionDateGroup）のみを表示する
export function formatRelativeDaysAgo(startedAt: number, now: number = Date.now()): string | null {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diffDays = Math.round((startOfDay(now) - startOfDay(startedAt)) / 86_400_000);
  if (diffDays < 0) return null;
  if (diffDays === 0) return '今日';
  if (diffDays === 1) return '昨日';
  if (diffDays <= 6) return `${diffDays}日前`;
  if (diffDays < APPROX_DAYS_PER_MONTH) {
    const weeks = Math.floor(diffDays / DAYS_PER_WEEK);
    return weeks === 1 ? '先週' : `${weeks}週間前`;
  }
  const months = Math.floor(diffDays / APPROX_DAYS_PER_MONTH);
  if (months < MONTHS_PER_YEAR) return `${months}ヶ月前`;
  // 12ヶ月(360日)は365日にわずかに届かないため、単純にdiffDays/365すると「0年前」になってしまう。
  // 月換算で12ヶ月に達した時点で年表示に切り替える以上、最低でも「1年前」を保証する
  const years = Math.max(1, Math.floor(diffDays / DAYS_PER_YEAR));
  return `${years}年前`;
}

// 月グループ見出し用（例:「2026年7月」）。「記録から読み込む」画面の月グループ見出しと
// カレンダー画面(app/(tabs)/calendar.tsx)のヘッダータイトルの両方で使う
export function formatMonthGroup(startedAt: number): string {
  const d = new Date(startedAt);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

// 年をまたいでも同じ月を誤って同一グループにしないための内部キー（表示には使わない）
function monthGroupKey(startedAt: number): string {
  const d = new Date(startedAt);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

// 「記録から読み込む」画面用。groupSessionsByDateと同じ考え方で月単位にまとめる。
// 新しい日付が先頭に来る前提（itemsは降順ソート済み）
export function groupByMonth<T extends { startedAt: number }>(
  items: T[],
): { monthLabel: string; items: T[] }[] {
  const groups: { key: string; monthLabel: string; items: T[] }[] = [];
  for (const item of items) {
    const key = monthGroupKey(item.startedAt);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.key === key) {
      lastGroup.items.push(item);
    } else {
      groups.push({ key, monthLabel: formatMonthGroup(item.startedAt), items: [item] });
    }
  }
  return groups.map(({ monthLabel, items: i }) => ({ monthLabel, items: i }));
}

// groupByMonthの結果をSectionListのsectionsの形へ変換する。
// ExerciseHistoryPickerView(種目単位の実績一覧)とSessionHistoryPickerView(セッション単位の
// 一覧)がまったく同じ変換を書いていたためここへ寄せた（@reviewer指摘）。
// 月ヘッダーの描画とstyle(monthLabelWrapper等)も両者で完全一致しているが、そちらの共通化は
// 利用箇所が2つでrule of threeに達していないため見送っている。3本目が出たら
// components/workout/month-section-list.tsx として切り出すこと
export function toMonthSections<T extends { startedAt: number }>(
  items: T[],
): { title: string; data: T[] }[] {
  return groupByMonth(items).map((group) => ({ title: group.monthLabel, data: group.items }));
}
