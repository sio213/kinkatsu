// 完全一致検索で1件もヒットしなかった場合のみ使うあいまい検索。
// 長い複合カタカナ語（ブルガリアンスプリットスクワット等）での
// 長音符抜け・小さい「っ」の打ち忘れなどのタイプミスを拾う。

// 編集距離（レーベンシュタイン距離）: aをbに変換するのに必要な
// 1文字挿入・削除・置換の最小回数
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const currRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow.push(
        Math.min(
          prevRow[j] + 1, // 削除
          currRow[j - 1] + 1, // 挿入
          prevRow[j - 1] + cost, // 置換
        ),
      );
    }
    prevRow = currRow;
  }
  return prevRow[b.length];
}

// クエリが短いほど1文字の誤差が致命的なので許容距離を絞る。
// 極端に短いクエリ（3文字以下）は誤爆しやすいためあいまい検索の対象外にする。
export function fuzzyThreshold(queryLength: number): number {
  if (queryLength <= 3) return 0;
  if (queryLength <= 7) return 1;
  return 2;
}

export function isFuzzyMatch(query: string, target: string): boolean {
  const threshold = fuzzyThreshold(query.length);
  if (threshold === 0) return false;
  // 長さの差だけで既に閾値を超えるなら距離計算を省略する
  if (Math.abs(query.length - target.length) > threshold) return false;
  return levenshteinDistance(query, target) <= threshold;
}
