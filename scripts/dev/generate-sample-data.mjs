// 開発用: 種目詳細の重量グラフを一通り確認するためのサンプル記録を生成する。
//
//   node scripts/dev/generate-sample-data.mjs
//     -> scripts/dev/sample-data.sql / sample-data-cleanup.sql を出力する
//
// 5つの計測タイプ（weight_reps / reps / time(秒) / time(分) / distance_time / weight_time）と、
// グラフ側の分岐（0点・1点・2点・停滞・下降・ベストが最新でない・軽量時の2.5kg刻み・
// ✓未確定セット・同日2セッション・期間チップで空になる古いデータ）を網羅するように作ってある。
//
// idは900000番台に固定してあるので、sample-data-cleanup.sql で丸ごと消せる。

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const ID_BASE = 900001;

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

// 再実行しても同じSQLになるように、Math.randomではなく固定シードのLCGを使う
let seed = 20260728;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

/** n日前の指定時刻（端末ローカル）のepoch ms */
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
function daysAgo(n, hour = 19, minute = 0) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

/** 0→1の進捗に対して、序盤は伸び、後半は伸びが鈍る曲線（実際の伸び方に近づける） */
function easeProgress(t) {
  return 1 - Math.pow(1 - t, 1.6);
}

function noise(amount) {
  return (rand() - 0.5) * 2 * amount;
}

// ---------------------------------------------------------------------------
// 行の組み立て
// ---------------------------------------------------------------------------

const sessions = [];
const sessionExercises = [];
const sets = [];
let nextSessionId = ID_BASE;
let nextSessionExerciseId = ID_BASE;
let nextSetId = ID_BASE;

/**
 * 1セッション（＝1種目分）を積む。
 * setSpecs: { weight, reps, durationSeconds, distanceMeters, completed }[]
 */
function pushSession(slug, startedAt, setSpecs, { durationMinutes = 50 } = {}) {
  const sessionId = nextSessionId++;
  const sessionExerciseId = nextSessionExerciseId++;
  const endedAt = startedAt + durationMinutes * 60 * 1000;
  const exerciseId = `(SELECT id FROM exercises WHERE slug='${slug}')`;

  sessions.push({ id: sessionId, startedAt, endedAt, createdAt: startedAt, updatedAt: endedAt });
  sessionExercises.push({
    id: sessionExerciseId,
    sessionId,
    exerciseId,
    orderIndex: 0,
    createdAt: startedAt,
  });

  setSpecs.forEach((spec, i) => {
    const at = startedAt + (i + 1) * 5 * 60 * 1000;
    sets.push({
      id: nextSetId++,
      sessionId,
      exerciseId,
      workoutSessionExerciseId: sessionExerciseId,
      setNumber: i + 1,
      weight: spec.weight ?? null,
      reps: spec.reps ?? null,
      durationSeconds: spec.durationSeconds ?? null,
      distanceMeters: spec.distanceMeters ?? null,
      // completed を明示的に false にしたセットだけ✓未確定にする
      completedAt: spec.completed === false ? null : at,
      createdAt: at,
    });
  });
}

/**
 * 「N日前から今日まで、intervalDays おき」に日付を作る。曜日が固定にならないよう
 * 間隔を±1日ゆらす（グラフのX軸が等間隔にならないことの確認も兼ねる）
 */
function schedule({ fromDaysAgo, toDaysAgo = 0, intervalDays }) {
  const days = [];
  let d = fromDaysAgo;
  while (d >= toDaysAgo) {
    days.push(d);
    d -= intervalDays + Math.round(noise(1));
  }
  return days;
}

// weight_reps: ウォームアップ1本＋メイン2本。ベストセットはメインの重量になる
function weightRepsSets(weight, topReps, { step = 2.5 } = {}) {
  const main = roundTo(weight, step);
  const warmup = roundTo(main * 0.6, step);
  return [
    { weight: warmup, reps: 10 },
    { weight: main, reps: topReps },
    { weight: main, reps: Math.max(1, topReps - 1) },
  ];
}

// ---------------------------------------------------------------------------
// シナリオ
// ---------------------------------------------------------------------------

// 1. ベンチプレス — 約10ヶ月・右肩上がり＋中盤に停滞期。
//    「全期間 / 6ヶ月 / 3ヶ月 / 1ヶ月」全てのチップで違う見え方になる基準データ。
{
  const days = schedule({ fromDaysAgo: 300, intervalDays: 5 });
  for (const d of days) {
    // 150〜110日前は同じ重量で止まる（プラトー）。それ以外はほぼ一定ペースで伸ばすので、
    // どの期間チップを選んでも「伸びている」ことが読み取れる
    const t = 1 - Math.max(d, d <= 150 && d >= 110 ? 150 : 0) / 300;
    const weight = 60 + 45 * t + noise(1.5);
    const topReps = 5 + Math.round(rand() * 3);
    pushSession('bench_press', daysAgo(d, 19), weightRepsSets(weight, topReps));
  }
  // 同日2セッション（朝と夜）— 1日1点にまとまることの確認。スケジュール済みの日に重ねる
  const doubleDay = days.reduce((a, b) => (Math.abs(b - 40) < Math.abs(a - 40) ? b : a));
  pushSession('bench_press', daysAgo(doubleDay, 8), weightRepsSets(85, 6));
  // 今日のセッションは3本目が✓未確定（内訳カードで「未実施」表示になる）
  pushSession('bench_press', daysAgo(0, 19), [
    { weight: 62.5, reps: 10 },
    { weight: 105, reps: 6 },
    { weight: 105, reps: 5, completed: false },
  ]);
}

// 2. スクワット — 4ヶ月・上下に振れて、自己ベストが最新ではなく途中（約60日前）にある
{
  const days = schedule({ fromDaysAgo: 120, intervalDays: 6 });
  for (const d of days) {
    // 60日前をピークにした山型
    const peak = 1 - Math.abs(d - 60) / 90;
    const weight = 95 + 25 * peak + noise(4);
    pushSession('squat', daysAgo(d, 20), weightRepsSets(weight, 5 + Math.round(rand() * 3)));
  }
}

// 3. デッドリフト — 2点だけ。点が2つのときの線・ラベルの確認
{
  pushSession('deadlift', daysAgo(14, 19), weightRepsSets(120, 5));
  pushSession('deadlift', daysAgo(2, 19), weightRepsSets(130, 5));
}

// 4. バーベルショルダープレス — 1点だけ（PR#240の1件表示）
{
  pushSession('barbell_shoulder_press', daysAgo(6, 19), weightRepsSets(45, 8));
}

// 5. ラットプルダウン — 3ヶ月ずっと同じ重量（完全な停滞）。重量は動かず回数だけ伸びるので、
//    minRangeが効かないと僅差が急成長のように描かれてしまうケースの確認
{
  const days = schedule({ fromDaysAgo: 90, intervalDays: 5 });
  days.forEach((d, i) => {
    const topReps = 8 + Math.min(4, Math.floor(i / 4));
    pushSession('lat_pulldown', daysAgo(d, 20), [
      { weight: 40, reps: 12 },
      { weight: 50, reps: topReps },
      { weight: 50, reps: topReps - 1 },
    ]);
  });
}

// 6. ダンベルカール — 軽量帯（8→15kg）。5kg刻みだと線が3本しか引けず、2.5kgまで落ちることの確認
{
  const days = schedule({ fromDaysAgo: 60, intervalDays: 4 });
  for (const d of days) {
    const t = 1 - d / 60;
    const weight = 8 + (15 - 8) * easeProgress(t) + noise(0.8);
    const main = roundTo(weight, 2.5);
    pushSession('dumbbell_curl', daysAgo(d, 20, 30), [
      { weight: main, reps: 12 },
      { weight: main, reps: 10 },
      { weight: main, reps: 8 },
    ]);
  }
}

// 7. レッグプレス — 右肩下がり（怪我明けで落ちていく）。下降トレンドの描画確認
{
  const days = schedule({ fromDaysAgo: 100, intervalDays: 6 });
  for (const d of days) {
    const t = 1 - d / 100;
    const weight = 180 - 60 * t + noise(6);
    pushSession('leg_press', daysAgo(d, 19, 30), weightRepsSets(weight, 10, { step: 5 }));
  }
}

// 8. ディップス（reps） — 200〜150日前だけ。「1ヶ月」「3ヶ月」チップで0点になるケース
{
  const days = schedule({ fromDaysAgo: 200, toDaysAgo: 150, intervalDays: 6 });
  for (const d of days) {
    const reps = 8 + Math.round((200 - d) / 12);
    pushSession('dips', daysAgo(d, 18), [
      { reps },
      { reps: reps - 1 },
      { reps: reps - 3 },
    ]);
  }
}

// 9. 懸垂（reps） — 3ヶ月・5→13回
{
  const days = schedule({ fromDaysAgo: 90, intervalDays: 5 });
  for (const d of days) {
    const t = 1 - d / 90;
    const top = Math.max(3, Math.round(5 + (13 - 5) * easeProgress(t) + noise(1)));
    pushSession('pull_up', daysAgo(d, 18), [
      { reps: top },
      { reps: Math.max(1, top - 2) },
      { reps: Math.max(1, top - 4) },
    ]);
  }
}

// 10. プランク（time・秒表示） — 40→150秒。最大値が600秒未満なので「秒」のまま
{
  const days = schedule({ fromDaysAgo: 70, intervalDays: 4 });
  for (const d of days) {
    const t = 1 - d / 70;
    const top = Math.round(40 + (150 - 40) * easeProgress(t) + noise(6));
    pushSession('plank', daysAgo(d, 21), [
      { durationSeconds: top },
      { durationSeconds: Math.max(20, top - 15) },
      { durationSeconds: Math.max(20, top - 25) },
    ], { durationMinutes: 15 });
  }
}

// 11. ステアクライマー（time・分表示） — 15→45分。最大値が600秒以上なので「分」に切り替わる
{
  const days = schedule({ fromDaysAgo: 90, intervalDays: 6 });
  for (const d of days) {
    const t = 1 - d / 90;
    const minutes = 15 + (45 - 15) * easeProgress(t) + noise(3);
    pushSession('stair_climber', daysAgo(d, 7), [
      { durationSeconds: Math.round(minutes) * 60 },
    ], { durationMinutes: 45 });
  }
}

// 12. ランニング（distance_time） — 3→11km。m→km換算と、補助情報を出さないケースの確認
{
  const days = schedule({ fromDaysAgo: 90, intervalDays: 3 });
  for (const d of days) {
    const t = 1 - d / 90;
    const km = 3 + (11 - 3) * easeProgress(t) + noise(0.8);
    const meters = roundTo(km * 1000, 100);
    pushSession('running', daysAgo(d, 6, 30), [
      // 1kmあたり約5分30秒
      { distanceMeters: meters, durationSeconds: Math.round((meters / 1000) * 330) },
    ], { durationMinutes: 60 });
  }
}

// 13. 加重プランク（weight_time） — 10→22.5kg。ツールチップの補助情報が「×秒」になるケース
{
  const days = schedule({ fromDaysAgo: 60, intervalDays: 5 });
  for (const d of days) {
    const t = 1 - d / 60;
    const weight = roundTo(10 + (22.5 - 10) * easeProgress(t) + noise(1), 2.5);
    const top = Math.round(45 + 25 * t + noise(4));
    pushSession('weighted_plank', daysAgo(d, 21), [
      { weight, durationSeconds: top },
      { weight, durationSeconds: Math.max(20, top - 10) },
      { weight, durationSeconds: Math.max(20, top - 15) },
    ], { durationMinutes: 20 });
  }
}

// ---------------------------------------------------------------------------
// SQL出力
// ---------------------------------------------------------------------------

function num(v) {
  if (v == null) return 'NULL';
  // 2.5kg刻み等で 82.50000000000001 のような値が出ないように丸める
  return String(Math.round(v * 100) / 100);
}

const generatedAt = new Date().toISOString().slice(0, 10);

const header = `-- kinkatsu 開発用サンプル記録（生成日: ${generatedAt}）
-- scripts/dev/generate-sample-data.mjs が出力。手で編集せず、スクリプト側を直して再生成する。
-- id は ${ID_BASE} 以降を使っているので sample-data-cleanup.sql で丸ごと消せる。
-- セッション ${sessions.length}件 / 種目カード ${sessionExercises.length}件 / セット ${sets.length}件
`;

const sessionSql = `INSERT INTO workout_sessions
  (id, started_at, ended_at, routine_id, scheduled_workout_id, note, created_at, updated_at)
VALUES
${sessions
  .map(
    (s) =>
      `  (${s.id}, ${s.startedAt}, ${s.endedAt}, NULL, NULL, NULL, ${s.createdAt}, ${s.updatedAt})`,
  )
  .join(',\n')};
`;

const sessionExerciseSql = `INSERT INTO workout_session_exercises
  (id, session_id, exercise_id, order_index, created_at)
VALUES
${sessionExercises
  .map((e) => `  (${e.id}, ${e.sessionId}, ${e.exerciseId}, ${e.orderIndex}, ${e.createdAt})`)
  .join(',\n')};
`;

const setSql = `INSERT INTO sets
  (id, session_id, exercise_id, workout_session_exercise_id, set_number,
   weight, reps, duration_seconds, distance_meters, completed_at, created_at)
VALUES
${sets
  .map(
    (s) =>
      `  (${s.id}, ${s.sessionId}, ${s.exerciseId}, ${s.workoutSessionExerciseId}, ${s.setNumber}, ` +
      `${num(s.weight)}, ${num(s.reps)}, ${num(s.durationSeconds)}, ${num(s.distanceMeters)}, ` +
      `${s.completedAt ?? 'NULL'}, ${s.createdAt})`,
  )
  .join(',\n')};
`;

writeFileSync(
  join(OUT_DIR, 'sample-data.sql'),
  [
    header,
    '-- 1) セッション',
    sessionSql,
    '-- 2) セッション内の種目カード',
    sessionExerciseSql,
    '-- 3) セット',
    setSql,
  ].join('\n'),
);

writeFileSync(
  join(OUT_DIR, 'sample-data-cleanup.sql'),
  `-- サンプル記録の削除。外部キーの向きに合わせて子から消す
DELETE FROM sets WHERE id >= ${ID_BASE};
DELETE FROM workout_session_exercises WHERE id >= ${ID_BASE};
DELETE FROM workout_sessions WHERE id >= ${ID_BASE};
`,
);

console.log(
  `sessions=${sessions.length} sessionExercises=${sessionExercises.length} sets=${sets.length}`,
);
