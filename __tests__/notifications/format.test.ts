import { formatNextFire } from '@/lib/notifications/format';

describe('formatNextFire', () => {
  const now = new Date(2026, 6, 5, 8, 0);

  test('returns em dash when date is null', () => {
    expect(formatNextFire(null, now)).toBe('—');
  });

  test('shows 今日 when the date is later today', () => {
    const today = new Date(2026, 6, 5, 21, 30);
    expect(formatNextFire(today, now)).toBe('次回: 今日 21:30');
  });

  test('shows 明日 for tomorrow', () => {
    const tomorrow = new Date(2026, 6, 6, 9, 0);
    expect(formatNextFire(tomorrow, now)).toBe('次回: 明日 09:00');
  });

  test('shows the date (not 明日) for the day after tomorrow', () => {
    const dayAfterTomorrow = new Date(2026, 6, 7, 9, 0);
    expect(formatNextFire(dayAfterTomorrow, now)).toBe('次回: 7/7 09:00');
  });

  test('shows just the date further out', () => {
    const later = new Date(2026, 6, 10, 9, 0);
    expect(formatNextFire(later, now)).toBe('次回: 7/10 09:00');
  });
});
