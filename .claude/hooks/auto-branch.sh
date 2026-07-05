#!/bin/bash
# PreToolUse(Write|Edit) hook: mainブランチ上で編集しようとした場合、
# 自動的に新しいブランチを作成して切り替える。他のブランチ上なら何もしない。
set -o pipefail

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$branch" = "main" ]; then
  new_branch="auto/$(date +%Y%m%d-%H%M%S)"
  if git checkout -b "$new_branch" >/dev/null 2>&1; then
    echo "{\"systemMessage\": \"mainブランチ上での編集を検知したため、新しいブランチ '$new_branch' を自動作成しました\"}"
  fi
fi

exit 0
