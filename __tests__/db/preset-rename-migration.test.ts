// プリセット種目の改名を運ぶマイグレーション（0023・0024）の挙動を固定する。
//
// db/seed.ts の seed() は既存行の category / measurement_type / paired_weights しか同期せず、
// name は意図的に触らない——プリセット種目も詳細画面の⋮「編集」から改名でき
// （components/exercises/exercise-form.tsx の isPreset はフォームのポイントを隠すだけ）、
// seed() が name を上書きすると「ベンチプレス」を「BP」に直した人の変更を毎起動で奪うため。
// そのぶんマスタ側の改名は個別のマイグレーションで運ぶことになるので、その書き方
// （slug だけでなく旧名も WHERE に置く）が守られていることをここで担保する。
// 次に改名するときは RENAMES に1行足せば同じ検証が付いてくる。
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DRIZZLE_DIR = path.join(__dirname, '../../drizzle');

type Rename = { migration: string; slug: string; oldName: string; newName: string };

const RENAMES: Rename[] = [
  {
    migration: '0023_rename_ab_machine_presets.sql',
    slug: 'machine_crunch',
    oldName: 'アブドミナルクランチ（マシン）',
    newName: 'アブドミナルクランチマシン',
  },
  {
    migration: '0023_rename_ab_machine_presets.sql',
    slug: 'torso_rotation_machine',
    oldName: 'トーソローテーション（マシン）',
    newName: 'トーソローテーションマシン',
  },
  {
    migration: '0024_rename_chest_press_machine.sql',
    slug: 'chest_press_machine',
    oldName: 'チェストプレス（マシン）',
    newName: 'チェストプレスマシン',
  },
];

function sqlOf(file: string): string {
  return fs
    .readFileSync(path.join(DRIZZLE_DIR, file), 'utf-8')
    .replace(/--> statement-breakpoint/g, '');
}

/** そのマイグレーションの1つ手前まで適用したDBに種目を1件置き、そこへ当該マイグレーションを当てる */
function applyRename(
  migration: string,
  seed: { slug: string; name: string; source?: string },
): { name: string; updated_at: number } {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const earlier = fs
    .readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith('.sql') && f < migration)
    .sort();
  for (const file of earlier) db.exec(sqlOf(file));

  db.prepare(
    `INSERT INTO exercises (name, category, source, slug, measurement_type, created_at, updated_at)
     VALUES (?, 'chest', ?, ?, 'weight_reps', 1, 1)`,
  ).run(seed.name, seed.source ?? 'preset', seed.slug);

  db.exec(sqlOf(migration));

  const row = db.prepare(`SELECT name, updated_at FROM exercises WHERE slug = ?`).get(seed.slug) as {
    name: string;
    updated_at: number;
  };
  db.close();
  return row;
}

describe.each(RENAMES)('プリセット改名: $slug', ({ migration, slug, oldName, newName }) => {
  it('旧名のままなら新名へ書き換え、updated_at も進める（一覧のライブクエリに拾わせるため）', () => {
    const row = applyRename(migration, { slug, name: oldName });

    expect(row.name).toBe(newName);
    expect(row.updated_at).toBeGreaterThan(1);
  });

  // プリセット種目も⋮「編集」から改名できる仕様なので、slug だけを条件にすると
  // その人が付けた名前を奪ってしまう
  it('ユーザーが自分で改名した行には当てない', () => {
    const row = applyRename(migration, { slug, name: 'わたしの種目' });

    expect(row).toEqual({ name: 'わたしの種目', updated_at: 1 });
  });

  it('すでに新名なら何もしない（updated_at も動かさない）', () => {
    const row = applyRename(migration, { slug, name: newName });

    expect(row).toEqual({ name: newName, updated_at: 1 });
  });

  it('preset 以外の行には当てない', () => {
    const row = applyRename(migration, { slug, name: oldName, source: 'custom' });

    expect(row.name).toBe(oldName);
  });
});

describe('プリセット改名の取りこぼし検知', () => {
  // 「seed.ts の名前だけ変えてマイグレーションを足し忘れる」と、新規インストールと
  // 既存インストールで名前が食い違ったまま誰も気づかない。改名済みの旧名がマスタに
  // 残っていないことだけは機械的に確かめられる
  it('マスタの現在名が、いずれかの改名の旧名と一致していない', () => {
    const seedSource = fs.readFileSync(path.join(__dirname, '../../db/seed.ts'), 'utf-8');
    const leftovers = RENAMES.filter((r) => seedSource.includes(`name: '${r.oldName}'`));

    expect(leftovers.map((r) => r.slug)).toEqual([]);
  });

  it('マスタの現在名が、対応する改名の新名になっている', () => {
    const seedSource = fs.readFileSync(path.join(__dirname, '../../db/seed.ts'), 'utf-8');
    const missing = RENAMES.filter(
      (r) => !seedSource.includes(`slug: '${r.slug}', name: '${r.newName}'`),
    );

    expect(missing.map((r) => r.slug)).toEqual([]);
  });
});

describe('マイグレーションの登録', () => {
  it('journal の when が単調増加している（古いと適用が黙ってスキップされる）', () => {
    const journal = JSON.parse(
      fs.readFileSync(path.join(DRIZZLE_DIR, 'meta/_journal.json'), 'utf-8'),
    ) as { entries: { tag: string; when: number }[] };

    const whens = journal.entries.map((e) => e.when);
    expect(whens).toEqual([...whens].sort((a, b) => a - b));
  });

  it('drizzle/ の .sql が全て journal と migrations.js に登録されている', () => {
    const files = fs.readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith('.sql'));
    const journal = JSON.parse(
      fs.readFileSync(path.join(DRIZZLE_DIR, 'meta/_journal.json'), 'utf-8'),
    ) as { entries: { tag: string }[] };
    const tags = new Set(journal.entries.map((e) => e.tag));
    const js = fs.readFileSync(path.join(DRIZZLE_DIR, 'migrations.js'), 'utf-8');

    expect(files.filter((f) => !js.includes(`./${f}`))).toEqual([]);
    expect(files.filter((f) => !tags.has(f.replace('.sql', '')))).toEqual([]);
  });
});
