// 開発用: サンプル記録を「今つながっている端末のアプリ」に流し込む。
// 実機のExpo Goでも使える（アプリのサンドボックス内のDBはMacから直接触れないため、
// Drizzle Studioと同じ devtools プラグインの経路でアプリ側に実行してもらう）。
//
//   node scripts/dev/push-sample-data.mjs                      # 投入
//   node scripts/dev/push-sample-data.mjs --cleanup             # 削除
//   node scripts/dev/push-sample-data.mjs --host 192.168.8.135:8081
//   node scripts/dev/push-sample-data.mjs --sql "SELECT ..."    # 任意のSQLを1文実行
//
// アプリと同じDB接続（db/client.ts の expoDb）を通るので changeListener が発火し、
// リロード無しで画面に反映される。PRAGMA foreign_keys=ON も効いた状態で実行される。
//
// 注意: devtoolsのWebSocketはブロードキャストなので、シミュレータと実機を同時につないで
// いると両方のアプリに同じSQLが流れて二重に入る。片方だけ接続した状態で実行すること。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_NAME = 'expo-drizzle-studio-plugin';
const DEFAULT_HOST = 'localhost:8081';
const ID_BASE = 900001;

// ---------------------------------------------------------------------------
// 引数
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const host = flag('--host') ?? DEFAULT_HOST;
const rawSql = flag('--sql');
const cleanup = argv.includes('--cleanup');

// ---------------------------------------------------------------------------
// devtoolsプラグインのフレーム（@expo/devtools の MessageFramePacker と同じ形式）
// ---------------------------------------------------------------------------
//
// @expo/devtools 本体は拡張子なしのimportを使っていてNodeのESMからは読めないため、
// 必要な部分だけ実装する。送信側はプレーンオブジェクトのみなので常にJSON文字列（fast path）。
// 受信側は、クエリ結果が配列で返ってくる場合にバイナリ形式になるため両方を解く。
//
//   +------------------+-------------------+-----------------+-------------------+
//   | 4 bytes (Uint32) | messageKey (JSON) | 1 byte (種別)   | payload           |
//   +------------------+-------------------+-----------------+-------------------+

const PAYLOAD_TYPE_OBJECT = 6;
const decoder = new TextDecoder();

function pack(method, payload) {
  return JSON.stringify({ messageKey: { pluginName: PLUGIN_NAME, method }, payload });
}

function unpack(data) {
  if (typeof data === 'string') return JSON.parse(data);

  const view = new DataView(data);
  const keyLength = view.getUint32(0, false);
  const messageKey = JSON.parse(decoder.decode(data.slice(4, 4 + keyLength)));
  const payloadType = view.getUint8(4 + keyLength);
  const payloadBytes = data.slice(4 + keyLength + 1);
  // クエリ結果（配列）は Object 種別で送られてくる。それ以外は解く必要がない
  const payload =
    payloadType === PAYLOAD_TYPE_OBJECT ? JSON.parse(decoder.decode(payloadBytes)) : undefined;
  return { messageKey, payload };
}

// ---------------------------------------------------------------------------
// 実行するSQL
// ---------------------------------------------------------------------------

function readSql(name) {
  return readFileSync(join(DIR, name), 'utf8');
}

// プラグインは prepareAsync でSQLを1文しかコンパイルしないため、必ず1文ずつ送る
let statements;
if (rawSql) {
  statements = [['SQL', rawSql]];
} else if (cleanup) {
  statements = [
    // 外部キーの向きに合わせて子から消す
    ['セット', `DELETE FROM sets WHERE id >= ${ID_BASE}`],
    ['種目カード', `DELETE FROM workout_session_exercises WHERE id >= ${ID_BASE}`],
    ['セッション', `DELETE FROM workout_sessions WHERE id >= ${ID_BASE}`],
  ];
} else {
  statements = [
    ['セッション', readSql('sample-data-step1-sessions.sql')],
    ['種目カード', readSql('sample-data-step2-exercises.sql')],
    ['セット', readSql('sample-data-step3-sets.sql')],
  ];
}

// ---------------------------------------------------------------------------
// 接続
// ---------------------------------------------------------------------------

const url = `ws://${host}/expo-dev-plugins/broadcast`;
console.log(`dev server: ${url}`);

const ws = new WebSocket(url);
ws.binaryType = 'arraybuffer';

// メソッド名（query-<id>）ごとの待ち受け
const pending = new Map();

ws.addEventListener('message', (event) => {
  let frame;
  try {
    frame = unpack(event.data);
  } catch {
    // ハンドシェイク等、こちらが解釈しないフレームは無視する
    return;
  }
  const resolver = pending.get(frame.messageKey?.method);
  if (resolver) {
    pending.delete(frame.messageKey.method);
    resolver(frame.payload);
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', () => {
    reject(
      new Error(
        `devサーバー(${host})につながりません。npx expo start が動いているか、--host の値を確認してください。`,
      ),
    );
  }, { once: true });
}).catch((e) => {
  console.error(e.message);
  process.exit(1);
});

/**
 * 1文だけ実行して結果を待つ。
 * ハンドシェイクは送らない——アプリ側は 'query' を直接待ち受けており、ハンドシェイクは
 * 同じプラグインの重複ブラウザを切るためだけに使われる（DevToolsPluginClientImplApp）。
 * 送るとブラウザで開いているDrizzle Studioの方が切断されてしまう
 */
function runQuery(sql, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const id = `push-${process.pid}-${pending.size}-${Math.round(performance.now())}`;
    const method = `query-${id}`;
    const timer = setTimeout(() => {
      pending.delete(method);
      reject(
        new Error('アプリから応答がありません。端末でアプリを開いた状態にしてから実行してください。'),
      );
    }, timeoutMs);

    pending.set(method, (payload) => {
      clearTimeout(timer);
      // プラグインはSQLエラーを例外ではなく { error } として返してくる
      if (payload && !Array.isArray(payload) && payload.error) {
        reject(new Error(payload.error));
        return;
      }
      resolve(payload ?? []);
    });

    ws.send(pack('query', { sql, params: [], arrayMode: false, id }));
  });
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------

try {
  for (const [label, sql] of statements) {
    process.stdout.write(`${label}... `);
    const result = await runQuery(sql);
    console.log(rawSql ? JSON.stringify(result, null, 2) : 'OK');
  }

  if (!rawSql) {
    const [counts] = await runQuery(
      `SELECT (SELECT count(*) FROM workout_sessions WHERE id >= ${ID_BASE}) AS sessions,
              (SELECT count(*) FROM sets WHERE id >= ${ID_BASE}) AS sets`,
    );
    console.log(`\n現在のサンプル: sessions=${counts.sessions} sets=${counts.sets}`);
    console.log('完了。リロード不要でそのまま画面に反映されます。');
  }
} catch (e) {
  console.error(`\n失敗: ${e instanceof Error ? e.message : e}`);
  ws.close();
  process.exit(1);
}

ws.close();
