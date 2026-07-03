現在の変更内容からブランチを切ってPRを作成してください。

1. `git status` / `git diff` で未コミットの変更内容を確認する
2. 変更内容を要約した名前でブランチを作成する(例: `feature/xxx`, `refactor/xxx`, `fix/xxx`)。すでに作業ブランチが切られている場合はそのまま使う
3. 関連ファイルのみを `git add` し、変更の「なぜ」を1〜2文で説明するコミットメッセージでコミットする(リポジトリの `git log` のスタイルに合わせる)
4. `git push -u origin <branch>` でリモートにプッシュする
5. `gh pr create` でPRを作成する。タイトルは70文字以内、本文は Summary(箇条書き)と Test plan(チェックリスト)を含める
6. 作成したPRのURLをユーザーに伝える

コミット・プッシュ・PR作成はいずれも既存のGit Safety Protocol(force push禁止、mainへの直接pushしない等)に従うこと。
