import { getYoutubeSearchUrl, YOUTUBE_QUERY_SUFFIX } from '@/lib/exercises/youtube';

describe('getYoutubeSearchUrl', () => {
  test('種目名からYouTube検索URLを組み立てる', () => {
    const url = getYoutubeSearchUrl('ベンチプレス');
    expect(url).toBe(
      'https://www.youtube.com/results?search_query=' +
        encodeURIComponent(`ベンチプレス ${YOUTUBE_QUERY_SUFFIX}`),
    );
  });

  test('記号を含む自由記述の種目名も正しくエンコードされる', () => {
    const url = getYoutubeSearchUrl('ジムの謎マシンB&C');
    expect(url).toBe(
      'https://www.youtube.com/results?search_query=' +
        encodeURIComponent(`ジムの謎マシンB&C ${YOUTUBE_QUERY_SUFFIX}`),
    );
  });
});
