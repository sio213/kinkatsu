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

// 記録タブの日付グループ見出し用（例: 「7月3日（木）」）
export function formatSessionDateGroup(startedAt: number): string {
  const d = new Date(startedAt);
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAY_LABELS[d.getDay()]}）`;
}

// 年をまたいでも同じ月日を誤って同一グループにしないための内部キー（表示には使わない）。
// 「過去のトレーニングを選ぶ」画面で同じ暦日に複数セッションがあるかどうかの判定にも使うためexportする
export function dateGroupKey(startedAt: number): string {
  const d = new Date(startedAt);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// 「過去のトレーニングを選ぶ」画面で、同じ暦日に複数セッションがあり日付だけでは区別できない場合に
// 開始時刻を補足表示するためのフォーマッタ（例:「8:30」）。lib/notifications/format.tsの
// HH:MM表記と同じ0埋めの流儀に合わせる
export function formatSessionTime(startedAt: number): string {
  const d = new Date(startedAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

// 「記録から読み込む」画面の直近項目用。直近1週間は日単位（n日前）、それ以降は週単位（先週／n週間前）の
// おおまかな相対表示にする。未来方向（クロックのずれ等でstartedAtがnowより後になるケース）はnullを返し、
// 呼び出し側は絶対日付（formatSessionDateGroup）のみを表示する
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
  const weeks = Math.floor(diffDays / 7);
  return weeks === 1 ? '先週' : `${weeks}週間前`;
}

// 「記録から読み込む」画面の月グループ見出し用（例:「2026年7月」）
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
