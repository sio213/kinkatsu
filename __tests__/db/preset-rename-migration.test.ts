// プリセット種目の改名を運ぶマイグレーション（0023）の挙動を固定する。
//
// db/seed.ts の seed() は既存行の category / measurement_type / paired_weights しか同期せず、
// name は意図的に触らない——プリセット種目も詳細画面の⋮「編集」から改名でき
// （components/exercises/exercise-form.tsx の isPreset はフォームのポイントを隠すだけ）、
// seed() が name を上書きすると「ベンチプレス」を「BP」に直した人の変更を毎起動で奪うため。
// そのぶんマスタ側の改名は個別のマイグレーションで運ぶことになるので、その書き方
// （slug だけでなく旧名も WHERE に置く）が守られていることをここで担保する。
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DRIZZLE_DIR = path.join(__dirname, '../../drizzle');
const RENAME_MIGRATION = '0023_rename_ab_machine_presets.sql';

function sqlOf(file: string): string {
  return fs.readFileSync(path.join(DRIZZLE_DIR, file), 'utf-8').replace(/--> statement-breakpoint/g, '');
}

function migrationsBeforeRename(): string[] {
  return fs
    .readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith('.sql') && f < RENAME_MIGRATION)
    .sort();
}

/** 0023 の1つ手前まで適用したDBに種目を1件置き、そこへ 0023 を当てる */
function applyRenameTo(seed: { slug: string; name: string; source?: string }) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const file of migrationsBeforeRename()) db.exec(sqlOf(file));
  db.prepare(
    `INSERT INTO exercises (name, category, source, slug, measurement_type, created_at, updated_at)
     VALUES (?, 'abs', ?, ?, 'weight_reps', 1, 1)`,
  ).run(seed.name, seed.source ?? 'preset', seed.slug);

  db.exec(sqlOf(RENAME_MIGRATION));

  const row = db.prepare(`SELECT name, updated_at FROM exercises WHERE slug = ?`).get(seed.slug) as {
    name: string;
    updated_at: number;
  };
  db.close();
  return row;
}

describe('0023: 腹筋マシン2種の改名', () => {
  it.each([
    ['machine_crunch', 'アブドミナルクランチ（マシン）', 'アブドミナルクランチマシン'],
    ['torso_rotation_machine', 'トーソローテーション（マシン）', 'トーソローテーションマシン'],
  ])('%s が旧名のままなら新名へ書き換える', (slug, oldName, newName) => {
    const row = applyRenameTo({ slug, name: oldName });

    expect(row.name).toBe(newName);
    // 一覧のライブクエリに変更を拾わせるため updated_at も進める
    expect(row.updated_at).toBeGreaterThan(1);
  });

  // プリセット種目も⋮「編集」から改名できる仕様なので、slug だけを条件にすると
  // その人が付けた名前を奪ってしまう
  it('ユーザーが自分で改名した行には当てない', () => {
    const row = applyRenameTo({ slug: 'machine_crunch', name: 'わたしのクランチ' });

    expect(row.name).toBe('わたしのクランチ');
    expect(row.updated_at).toBe(1);
  });

  it('すでに新名なら何もしない（updated_at も動かさない）', () => {
    const row = applyRenameTo({ slug: 'machine_crunch', name: 'アブドミナルクランチマシン' });

    expect(row.name).toBe('アブドミナルクランチマシン');
    expect(row.updated_at).toBe(1);
  });

  // slug はユニークなので同じ slug のカスタム種目は作れないが、将来 source の扱いが
  // 変わったときに preset 以外へ波及しないことを明示しておく
  it('preset 以外の行には当てない', () => {
    const row = applyRenameTo({
      slug: 'machine_crunch',
      name: 'アブドミナルクランチ（マシン）',
      source: 'custom',
    });

    expect(row.name).toBe('アブドミナルクランチ（マシン）');
  });
});

describe('マイグレーションの登録', () => {
  it('journal の when が既存の最大値より新しい（古いと適用がスキップされる）', () => {
    const journal = JSON.parse(
      fs.readFileSync(path.join(DRIZZLE_DIR, 'meta/_journal.json'), 'utf-8'),
    ) as { entries: { tag: string; when: number }[] };

    const whens = journal.entries.map((e) => e.when);
    expect(whens).toEqual([...whens].sort((a, b) => a - b));
    expect(journal.entries.at(-1)?.tag).toBe(RENAME_MIGRATION.replace('.sql', ''));
  });

  it('drizzle/ の .sql が全て migrations.js から読み込まれている', () => {
    const files = fs.readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith('.sql'));
    const js = fs.readFileSync(path.join(DRIZZLE_DIR, 'migrations.js'), 'utf-8');

    const unregistered = files.filter((f) => !js.includes(`./${f}`));
    expect(unregistered).toEqual([]);
  });
});
