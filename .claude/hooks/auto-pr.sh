#!/bin/bash
# Stop hook: 作業ブランチ(main以外)にmainより先のコミットがあり、
# 作業ツリーがクリーンなら push し、そのブランチのPRがまだ無ければ作成する。
# 既にPRがあれば push だけで内容は自動的に更新される（gh pr create は呼ばない）。
# コミット自体はこのフックでは行わない（コミットメッセージの判断はClaude側の責務のため）。
set -o pipefail

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$branch" = "main" ] || [ -z "$branch" ]; then
  exit 0
fi

ahead=$(git rev-list --count main.."$branch" 2>/dev/null || echo 0)
if [ "$ahead" -eq 0 ]; then
  exit 0
fi

if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  exit 0
fi

if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git push >/dev/null 2>&1 || exit 0
else
  git push -u origin "$branch" >/dev/null 2>&1 || exit 0
fi

if ! gh pr view "$branch" >/dev/null 2>&1; then
  if gh pr create --fill --head "$branch" --base main >/dev/null 2>&1; then
    pr_url=$(gh pr view "$branch" --json url -q .url 2>/dev/null)
    echo "{\"systemMessage\": \"ブランチ '$branch' のPRを自動作成しました: $pr_url\"}"
  fi
fi

exit 0
