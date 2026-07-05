import type { Set } from '@/db/schema';
import { WEEKDAY_LABELS } from '@/lib/notifications/format';

export type SessionSummary = {
  setCount: number;
  totalVolume: number;
};

export function summarizeSets(sets: Pick<Set, 'weight' | 'reps'>[]): SessionSummary {
  const setCount = sets.length;
  const totalVolume = sets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
  return { setCount, totalVolume };
}

// sessionIdごとにセットをグルーピングして集計する（記録タブの一覧表示用）
export function summarizeSetsBySession(
  sets: Pick<Set, 'sessionId' | 'weight' | 'reps'>[],
): Map<number, SessionSummary> {
  const bySession = new Map<number, Pick<Set, 'weight' | 'reps'>[]>();
  for (const s of sets) {
    const list = bySession.get(s.sessionId);
    if (list) list.push(s);
    else bySession.set(s.sessionId, [s]);
  }
  return new Map(
    Array.from(bySession.entries()).map(([sessionId, setsForSession]) => [
      sessionId,
      summarizeSets(setsForSession),
    ]),
  );
}

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
