#!/bin/bash
# PreToolUse(Write|Edit) hook: mainブランチ上で編集しようとした場合、
# 自動的に新しいブランチを作成して切り替える。他のブランチ上なら何もしない。
#
# ブランチ名は編集対象ファイル名から機械的に作った仮の名前（タスクの意図はこのフックからは
# 分からないため）。タスクの内容が分かった時点で `git branch -m <意味のある名前>` で
# リネームすること（まだpush前ならコストゼロで安全にリネームできる）。
set -o pipefail

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$branch" = "main" ]; then
  input=$(cat)
  file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
  slug="work"
  if [ -n "$file_path" ]; then
    base=$(basename "$file_path")
    base="${base%.*}"
    candidate=$(echo "$base" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed -E 's/^-+//; s/-+$//')
    [ -n "$candidate" ] && slug="$candidate"
  fi
  new_branch="auto/${slug}-$(date +%H%M%S)"
  if git checkout -b "$new_branch" >/dev/null 2>&1; then
    echo "{\"systemMessage\": \"mainブランチ上での編集を検知したため、新しいブランチ '$new_branch' を自動作成しました（仮の名前です。タスクが分かったらgit branch -mでリネームしてください）\"}"
  fi
fi

exit 0
