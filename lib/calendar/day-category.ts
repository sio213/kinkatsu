// カレンダーの日別マーカー用に、その日の代表カテゴリ（塗りつぶし色の元になるカテゴリ）を
// 決める純粋関数。DB非依存でJestからテストできる（lib/workout/history.tsのpickPrimaryCategoryと
// 似ているが、判定軸が異なる別物なので流用せずこちらに用意する:
// - pickPrimaryCategory: セッション単位・種目数が多いカテゴリ優先・タイはCATEGORY_ORDER順
// - この関数: 日単位（複数セッションをまたいで集計）・セット数が多いカテゴリ優先・
//   タイはその日最初にやった種目のカテゴリ優先（カレンダー機能の要件定義で確定した仕様）

export type DailyCategoryRow = {
  dateKey: string;
  category: string;
};

// rowsは「集計対象のセット1件につき1行」を想定する（どのセットを集計対象にするかは呼び出し側の
// 責務。hooks/use-calendar-month-records.tsを参照）。日付(dateKey)をまたいだ行の順序は
// 結果に影響しない（日ごとに独立集計するため）が、同じdateKey内の行は実施順（セッション
// 開始時刻→種目追加順）で並んでいる必要がある。この順序が「その日最初にやった種目」の判定に使われる
export function aggregateDailyPrimaryCategory(rows: DailyCategoryRow[]): Map<string, string> {
  const countsByDay = new Map<string, Map<string, number>>();

  for (const row of rows) {
    let counts = countsByDay.get(row.dateKey);
    if (!counts) {
      counts = new Map();
      countsByDay.set(row.dateKey, counts);
    }
    // Map.setは既存キーの値を更新するだけで挿入順(=そのカテゴリを初めて見た順序=実施順)は
    // 保持されるため、countsのイテレーション順がそのまま「先にやった種目」の判定に使える
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }

  const result = new Map<string, string>();
  for (const [dateKey, counts] of countsByDay) {
    // countsの先頭エントリ＝その日最初に見たカテゴリ（＝先にやった種目）を初期値にし、
    // 以降は「より多い」場合のみ更新する。同数では更新しないため、常に先に見つかった方
    // （＝実施順で先のカテゴリ）が勝ち残る
    let best: string | undefined;
    let bestCount = -1;
    for (const [category, count] of counts) {
      if (best === undefined) {
        best = category;
        bestCount = count;
        continue;
      }
      if (count > bestCount) {
        best = category;
        bestCount = count;
      }
    }
    result.set(dateKey, best!);
  }
  return result;
}

// カテゴリフィルターチップ用。「その日に該当カテゴリを1件でも実施したか」の判定に使う。
// aggregateDailyPrimaryCategoryの代表カテゴリ（1日1つ）とは別に、日ごとの実施カテゴリ
// 集合をそのまま返す（同じrows入力から両方を独立に計算できる）
export function aggregateDailyCategorySet(rows: DailyCategoryRow[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const row of rows) {
    let categories = result.get(row.dateKey);
    if (!categories) {
      categories = new Set();
      result.set(row.dateKey, categories);
    }
    categories.add(row.category);
  }
  return result;
}
