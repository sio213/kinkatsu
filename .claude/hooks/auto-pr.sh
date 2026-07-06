#!/bin/bash
# Stop hook: 作業ブランチ(main以外)がmainと内容差分を持ち、
# 作業ツリーがクリーンなら push し、そのブランチのPRがまだ無ければ作成する。
# 既にPRがあれば push だけで内容は自動的に更新される（gh pr create は呼ばない）。
# コミット自体はこのフックでは行わない（コミットメッセージの判断はClaude側の責務のため）。
#
# 差分判定はコミット祖先(git rev-list main..branch)ではなく内容diffで行う。
# squash mergeされたブランチはmainの祖先にならず「ahead」判定が誤検知するため
# （元PRがclose済みで見つからず、フォールバックが重複PRを作成してしまう）。
set -o pipefail

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$branch" = "main" ] || [ -z "$branch" ]; then
  exit 0
fi

git fetch origin main --quiet 2>/dev/null

if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
  exit 0
fi

if git diff --quiet origin/main "$branch" -- 2>/dev/null; then
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
  # フォールバック作成(Claude側でPR未作成のまま停止した場合のみ発火)。
  # titleはコミット件名からの自動生成(--fill)のため英語のままになりうる。
  # bodyだけでもPRテンプレートの構成に合わせる。
  template=".github/PULL_REQUEST_TEMPLATE.md"
  body_arg=()
  if [ -f "$template" ]; then
    body_arg=(--body-file "$template")
  fi
  if gh pr create --fill "${body_arg[@]}" --head "$branch" --base main >/dev/null 2>&1; then
    pr_url=$(gh pr view "$branch" --json url -q .url 2>/dev/null)
    echo "{\"systemMessage\": \"ブランチ '$branch' のPRを自動作成しました: $pr_url\"}"
  fi
fi

exit 0
