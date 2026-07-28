#!/bin/bash
# 開発用: sample-data.sql をiOSシミュレータのDBに流し込む。
#
#   scripts/dev/apply-sample-data.sh            # 投入
#   scripts/dev/apply-sample-data.sh --cleanup  # 投入したサンプルだけ削除
#   scripts/dev/apply-sample-data.sh <dbのパス> # DBを明示指定
#
# 実行後はアプリをリロードすること（外部からの書き込みは expo-sqlite の
# changeListener を発火させないため、開いたままだと画面に反映されない）。
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SQL="$DIR/sample-data.sql"
DB=""

for arg in "$@"; do
  case "$arg" in
    --cleanup) SQL="$DIR/sample-data-cleanup.sql" ;;
    *) DB="$arg" ;;
  esac
done

if [ -z "$DB" ]; then
  # 複数のシミュレータに残っていることがあるので、最後に更新されたものを使う
  DB=$(find ~/Library/Developer/CoreSimulator/Devices -name kinkatsu -path '*SQLite*' \
    -exec stat -f '%m %N' {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
fi

if [ -z "$DB" ] || [ ! -f "$DB" ]; then
  echo "DBが見つかりません。パスを引数で渡してください: $0 <dbのパス>" >&2
  exit 1
fi

echo "DB : $DB"
echo "SQL: $SQL"
sqlite3 "$DB" "PRAGMA foreign_keys=ON;" ".read $SQL"

sqlite3 "$DB" "SELECT 'sessions=' || (SELECT count(*) FROM workout_sessions WHERE id >= 900001)
  || ' sets=' || (SELECT count(*) FROM sets WHERE id >= 900001);"
echo "完了。アプリをリロードしてください。"
