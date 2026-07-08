#!/bin/bash
# Stop hook: 作業ブランチ(main以外)がmainと内容差分を持ち、
# 作業ツリーがクリーンなら push する。
# PR作成はこのフックでは行わない（タイトル・本文を日本語でテンプレートに沿って
# 書く判断はClaude側の責務のため。gh pr create --fill は英語のコミット件名を
# そのままタイトルにしてしまい、重複PRやクローズ漏れの原因になっていた）。
# コミット自体もこのフックでは行わない。
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

exit 0
