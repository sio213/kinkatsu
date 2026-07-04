// exercisesテーブルのform_points列（JSON配列文字列）とアプリ内のstring[]表現を相互変換する。
// 書き込みはhooks/use-exercises.ts、読み出しはapp/exercise配下の画面から共通で使う。
export function serializeFormPoints(points: string[]): string | null {
  return points.length > 0 ? JSON.stringify(points) : null;
}

export function parseFormPoints(value: string | null): string[] {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}
