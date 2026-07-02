export const YOUTUBE_QUERY_SUFFIX = 'フォーム 筋トレ';

export function getYoutubeSearchUrl(exerciseName: string): string {
  const query = `${exerciseName} ${YOUTUBE_QUERY_SUFFIX}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
