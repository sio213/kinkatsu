import { formatHourMinute, getTimeOfDay, getTimeOfDayLabel } from '@/lib/calendar/time-of-day';

describe('getTimeOfDay', () => {
  it('4:00〜10:59は朝(morning)', () => {
    expect(getTimeOfDay(new Date(2026, 6, 16, 4, 0))).toBe('morning');
    expect(getTimeOfDay(new Date(2026, 6, 16, 7, 10))).toBe('morning');
    expect(getTimeOfDay(new Date(2026, 6, 16, 10, 59))).toBe('morning');
  });

  it('11:00〜15:59は昼(midday)', () => {
    expect(getTimeOfDay(new Date(2026, 6, 16, 11, 0))).toBe('midday');
    expect(getTimeOfDay(new Date(2026, 6, 16, 12, 30))).toBe('midday');
    expect(getTimeOfDay(new Date(2026, 6, 16, 15, 59))).toBe('midday');
  });

  it('16:00〜18:59は夕方(evening)', () => {
    expect(getTimeOfDay(new Date(2026, 6, 16, 16, 0))).toBe('evening');
    expect(getTimeOfDay(new Date(2026, 6, 16, 17, 40))).toBe('evening');
    expect(getTimeOfDay(new Date(2026, 6, 16, 18, 59))).toBe('evening');
  });

  it('19:00〜翌3:59は夜(night)', () => {
    expect(getTimeOfDay(new Date(2026, 6, 16, 19, 0))).toBe('night');
    expect(getTimeOfDay(new Date(2026, 6, 16, 21, 30))).toBe('night');
    expect(getTimeOfDay(new Date(2026, 6, 16, 23, 59))).toBe('night');
    expect(getTimeOfDay(new Date(2026, 6, 16, 0, 0))).toBe('night');
    expect(getTimeOfDay(new Date(2026, 6, 16, 3, 59))).toBe('night');
  });
});

describe('getTimeOfDayLabel', () => {
  it('各時間帯の日本語ラベルを返す', () => {
    expect(getTimeOfDayLabel('morning')).toBe('朝');
    expect(getTimeOfDayLabel('midday')).toBe('昼');
    expect(getTimeOfDayLabel('evening')).toBe('夕方');
    expect(getTimeOfDayLabel('night')).toBe('夜');
  });
});

describe('formatHourMinute', () => {
  it('1桁の時・分を0埋めして"HH:MM"にする', () => {
    expect(formatHourMinute(new Date(2026, 6, 16, 7, 5))).toBe('07:05');
  });

  it('2桁の時・分はそのまま', () => {
    expect(formatHourMinute(new Date(2026, 6, 16, 21, 30))).toBe('21:30');
  });

  it('0時0分は"00:00"', () => {
    expect(formatHourMinute(new Date(2026, 6, 16, 0, 0))).toBe('00:00');
  });
});
