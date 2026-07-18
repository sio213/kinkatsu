// 選択日パネルで同日複数セッションを朝/昼/夕方/夜にグループ分けするための時間帯判定。
// デザイン案「複数18: 時間帯アイコン（朝・夕方・夜）」の実施時刻から逆算した区分。
// 明確な境界時刻の指定はデザイン案に無いため、一般的な生活時間帯の感覚に合わせて決めた
// （4時始まりなのは、深夜のトレーニングを「前日の夜」ではなく「今日の朝」寄りにしないため）
export type TimeOfDay = 'morning' | 'midday' | 'evening' | 'night';

const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: '朝',
  midday: '昼',
  evening: '夕方',
  night: '夜',
};

export function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 4 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'midday';
  if (hour >= 17 && hour < 19) return 'evening';
  return 'night'; // 19:00〜翌3:59
}

export function getTimeOfDayLabel(period: TimeOfDay): string {
  return TIME_OF_DAY_LABELS[period];
}

export function formatHourMinute(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
