@AGENTS.md

## Development Team

| エージェント | 役割 | 起動タイミング |
|---|---|---|
| @planner | チーフアーキテクト（計画・影響範囲） | 新機能・改修の計画フェーズ |
| @tester | テスト設計・カバレッジ分析 | 実装後のテスト追加・レビュー |
| @designer | UI/UXレビューと改善提案 | 画面設計・コンポーネントレビュー |
| @reviewer | コード品質レビュー（重複・単一責任・配置・未使用コード） | 実装完了後・PR前 |
| @pm | ビジネス価値・マネタイズ・優先順位の評価 | 要件定義・機能検討フェーズ |
| @market-research | 競合調査・価格帯・ユーザーレビュー収集 | 機能検討・マネタイズ設計時 |
| @growth | ASO・SNS・広告・ローンチ・バイラル施策 | リリース準備・グロース施策検討時 |
| @user-advisor | 筋トレユーザー目線のフィードバック・機能要望 | 要件定義・設計フェーズ |

実装はメイン会話（Claude Code本体）が行う。

## Notion 戦略・ロードマップ

「🏋️ 筋トレアプリ」ワークスペース（親ページ: https://app.notion.com/p/38774815a297808baad2cbcb0f2bdd5c）に現在の戦略・ロードマップ・設定がある。企画・実装の判断は必ずこれらを前提として行うこと。

- ロードマップ: https://app.notion.com/p/39074815a29781d0883de4c8c90c2cb3
- マネタイズ設計: https://app.notion.com/p/39074815a297818aa2c0dddd705e7b50
- 要件: https://app.notion.com/p/38774815a29780e09bb0f8bb56096c72
- 📋 バックログ（機能要望・バグ・タスク）: https://app.notion.com/p/7ed5e36bcdcb48b3a736e485196f0d3c
- 競合アプリ: https://app.notion.com/p/86174815a29782a68e750162dbd3b76c
- 開発環境構築: https://app.notion.com/p/ce974815a2978244a27c01081953f3b9
- 本番環境構築: https://app.notion.com/p/c3374815a29782a38835019f13799643

**能動的な更新（ユーザーに確認せず反映してよい）**
- 会話の中で戦略・優先順位・マネタイズ方針の変更が決まったら、都度ロードマップ／マネタイズ設計ページを更新する。
- 「あったらいいな」という機能案が出てきたら、都度📋バックログに追加する（ステータス: アイデア）。
- 「💡 アイデア」DBは別物（事業アイデア出し用）なので混同しない。kinkatsu内の話は必ず📋バックログへ。

## Google Drive（成果物・ナレッジ管理）

kinkatsu用のGoogle Driveフォルダが `仕事 > Webサービス > 🏋️ kinkatsu` 配下にある: https://drive.google.com/drive/folders/1uB-teWweWEZJ7jFCQi5wdsbsC47lnsT6

- 戦略/ — 上記Notion各ページへのリンク集のみ。実体はNotion側なので複製しない
- ソースコード/ — 実体は置かない。ローカルパス（このリポジトリ）を示すREADMEのみ。gitリポジトリ（.git・node_modules・ios/Pods等の大量の小ファイル）をGoogle Drive同期対象に入れると同期破損・不安定化のリスクがあるため、実体は絶対にここに置かないこと
- デザイン・UI案/ — UI/UXモックアップ、AI生成デザイン案
- ナレッジ/ — 競合・市場調査の一次資料（サマリーはNotion「競合アプリ」ページ）
- 動画・画像/購入素材（GymVisual等）/ — GymVisualの生素材（動画・サムネイル静止画）。ローカル同期パス: `~/Documents/仕事/Webサービス/🏋️ kinkatsu/動画・画像/購入素材（GymVisual等）`、配下は`動画/male`,`動画/female`,`サムネイル/male`,`サムネイル/female`。ここには購入時のzipがそのまま置かれていることが多く未展開の場合がある。展開済みのものが`~/Downloads`に残っていることがあるので、無ければそちらも確認する（詳細手順は下記「プリセット種目を新規追加するとき」）
- 画像/ — AI生成画像等その他の画像
- ストア素材（App Store申請用）/ — ロードマップPhase 3のApp Store申請用
- 法務・規約（プライバシーポリシー等）/ — App Store申請や機微データを扱う機能（進捗写真機能など）に必要なプライバシーポリシー等の草案置き場

## ワークフロー

### 要件定義・設計フェーズ
- 判断の前提として、上記「Notion 戦略・ロードマップ」の内容（特にロードマップ・マネタイズ設計・要件）を確認する。
- ユーザーから新機能・改修の依頼が来たら、実装前に必ず以下を並行起動すること。ユーザーに確認せず自動で実行する。
  - @planner — 技術的な計画・影響範囲
  - @designer — UI/UX設計・案の提示
  - @pm — ビジネス価値・優先順位・マネタイズ観点
  - @user-advisor — 実際のユーザー目線でのフィードバック・機能要望
- 市場情報が判断に必要なときは @market-research も起動する。
- 全エージェントの結果を統合し、方針をユーザーに提示してから実装に入る。

### 実装完了後（ユーザーへの報告前に必ず実施）
以下を順番に実行し、指摘があればすべて修正してから報告する。

**起動基準（以下のいずれかを満たす場合のみ起動する）**
- 新規ファイル・コンポーネント・フックの追加
- 既存ロジック（関数・状態管理・DB操作）の変更
- UI の構造・レイアウト・インタラクションの変更

**スキップしてよいケース（軽微な修正）**
- ラベル・文言・定数値の変更のみ
- スタイル数値の微調整のみ
- コメントの追加・削除のみ

1. @reviewer — コード品質レビュー（重複・単一責任・パフォーマンス・未使用コード）
2. @tester — ロジック（関数・状態管理・DB操作）の追加・変更を伴う場合のみ起動
3. @designer — 実装されたUIの体験・一貫性レビュー

## 実装ルール

### エラーハンドリング
- DB書き込み（insert / update / delete）は必ず `try/catch` し、失敗時は `Alert.alert` でユーザーに通知する
- Promise を fire-and-forget にしない。呼び出し側で `await` して `catch` する
- `useMigrations` の `error` は必ずハンドリングし、失敗時はクラッシュさせずエラー画面を表示する
- 楽観的UIを使う場合はエラー時に状態を元に戻す

### フォーム実装
- 入力を伴うフォーム（複数フィールドがあり送信・バリデーションを行う画面）は必ず `react-hook-form` の `useForm`/`Controller` と `zodResolver` + Zodスキーマで実装する。`useState` + 手書きのbooleanバリデーション（`xxxValid`変数を並べる方式）は使わない
- Zodスキーマは対象ドメインの `lib/**/validation.ts` に置く（例: `lib/exercises/validation.ts`）。フォーム独自の状態（UIモード切り替えなど、送信先の型に直接存在しないフィールド）もスキーマに含めてよく、送信時に確定した型（例: `ReminderInput`）へ変換する関数を同じファイルに用意する
- チップ選択・トグルなど標準的な `TextInput` 以外のカスタムコントロールも `Controller` の `render={({ field: { value, onChange } }) => ...}` でRHFに繋ぐ
- エラーメッセージは `formState.errors` を使い、`formState.isSubmitted`（またはisSubmittedと同等のフラグ）で「送信を試みた後だけ表示する」ガードを掛ける
- バリデーションエラー時に、エラーになった項目のうち画面上で一番上にあるものまで自動スクロールする仕組み（`components/ui/form-scroll-context.tsx`）が共通化されている。新しいフォームを追加する際は必ず以下の3点を満たすこと（Providerの外や`name`を渡さなくてもクラッシュはしないが、その分自動スクロールが効かなくなる）
  1. フォームを包むScrollViewの`ref`を`FormScrollProvider`の`scrollRef`に渡し、ScrollView自体もその中に置く
  2. `FormField`に各フィールドの`name`（`Controller`/`register`に渡すnameと同じもの）を渡す。現時点でエラーを表示していないフィールド（チップ選択のkind切替など）でも、単一のRHFフィールドに対応するものには付けておくと、後からそのフィールドにバリデーションを追加した際も自動的に効く
  3. `useImperativeHandle`のsubmitや送信ボタンの`onPress`は、`useScrollToFirstError()`で得た関数を`handleSubmit(onSubmit, onInvalid)`の第2引数に渡す（`handleSubmit(onSubmit)`単体のままにしない）

### ナビゲーション・タブバーの表示範囲
下部タブは4本（記録／カレンダー／種目／設定）で確定。当面再編しない。

**原則: タブのコンテンツを「見て回っている」間はタブバーを出す。作成・編集・選択フローと没入モードでは隠す。**

新しい画面を追加するときは、指示がなくても以下のどれに当たるかを判定して配置を決める。

| 分類 | 例 | タブバー | 置き場所 |
|---|---|---|---|
| 閲覧・ドリルダウン | 一覧画面、詳細画面 | **出す** | `app/(tabs)/(<tab>)/` 配下のStack |
| 作成・編集フォーム | `exercise/new`、`routine/edit/[id]`、`calendar/schedule-workout-edit` | 隠す | ルートStack（`app/` 直下） |
| フロー内の中間画面 | picker / chooser / load / reorder / swap 系 | 隠す | ルートStack |
| 没入モード | `workout/[id]`（トレーニング中） | 隠す | ルートStack |

タブ配下にStackを作るときの必須事項（1つでも欠けると壊れる）:

1. **実ディレクトリではなくグループ `( )` を使う。** `app/(tabs)/record/` にするとURLが `/routine` → `/record/routine` に変わり、ディープリンクとtyped routesが壊れる。`app/(tabs)/(record)/` ならURLは不変
2. **`Tabs.Screen` 側に `headerShown: false` を付ける。** 付けないとタブナビゲータのヘッダーと配下Stackのヘッダーが二重に出る
3. **配下Stackに `export const unstable_settings = { anchor: 'index' }` を書く。** expo-routerはグループ名と同名の子ルートが無いと暗黙のanchorを設定しない。anchorはディープリンク・コールドスタート時のstate復元にのみ使われるため、無いと `kinkatsu:///routine` で直接起動したときに下に `index` が積まれず戻る導線が消える（型チェックもテストも素通りする。実機で再現確認済み）
4. タブのヘッダーがJS実装（bottom-tabs）からネイティブ（native-stack）に変わるため、**タイトルの縦位置が他タブと約4ptズレる**。`sharedHeaderStyle` を共有していてもreact-navigationの実装差で吸収できない既知の差異

- **`tabBarStyle` で出し分けることはできない。** expo-routerでは親Stackにpushされた画面はタブナビゲータの外側にあるため、タブバーを出したい画面は物理的にタブ配下のStackへ置く必要がある。逆に、タブ配下に置いた画面を隠したいときだけ `tabBarStyle: { display: 'none' }` が使える
- タブ配下へ移した画面の `SafeAreaView` は `edges={[]}` にする（タブバーが下端を占有するため）。ルートStack上の画面は `edges={['bottom']}`。移設時の直し忘れが起きやすい
- 同じ画面が「閲覧から」と「編集フロー内から」の両方で開かれる場合は、画面本体を `components/**/*-screen.tsx` に抽出し、タブ配下とルートStackの2箇所からマウントして呼び出し側でパスを出し分ける。**2つのマウント先は別々のURLが必要**（同一URLは衝突する）。実例が種目詳細で、実体は `components/exercises/exercise-detail-screen.tsx`、経路は次の2つ
  - `/exercises/[id]`（`app/(tabs)/(library)/exercises/[id].tsx`）… 種目タブの一覧から。タブバーあり
  - `/exercise/[id]`（`app/exercise/[id].tsx`）… トレーニング中・ルーティン編集・予定編集・種目入れ替えから。タブバーなし
- ディレクトリをリネーム・移動したら **Metroを `npx expo start --clear` で再起動する**。Metroのモジュールグラフは旧パスを掴んだままになりやすく、古いルートが幽霊タブとして残ったりビルドが500で失敗したりする（実際に発生。コードは正しいのに壊れて見えるので原因を見誤りやすい）
- ルートを移動したら **通知タップの遷移（`app/_layout.tsx` の `resolveReminderTapDestination` → `router.navigate`）を実機で再検証する**。「タブ切り替えを伴うので`replace`/`dismissTo`ではなく`navigate`」という実機検証済みの前提があり、パス変更で崩れやすい

### タイポグラフィ・共通コンポーネント
- フォントサイズ・ウェイト・行間は、必ず共通トークン（theme.ts等で一元管理するFontSize/Typography定義）を参照する。画面やコンポーネント個別に`fontSize`の値をハードコードしない
- 本文・見出し・カード見出し・画面タイトル・Dropdownメニュー項目など、役割が同じテキスト/コンポーネントは、実装場所が違っても同じトークン・同じスタイルを使い、サイズやウェイトを揃える
- 新しいUIコンポーネントを作る前に、Checkbox・Radio・Submitボタン・アイコン・カード・カテゴリチップ・ヘッダー・Dropdownなど類似の既存コンポーネントがないか確認し、あれば流用・共通化する。指示がなくても毎回自己点検する
- 文字サイズや行間を変更したときは、固定高さのコンテナ・1行想定のテキスト（ellipsis/numberOfLines指定箇所）・アイコンとの縦位置揃えなど、レイアウトが崩れないかを実機/シミュレータで確認する

### プリセット種目を新規追加するとき
`db/seed.ts` の `PRESET_EXERCISES` に1件足すだけでは不完全。指示がなくても以下を毎回チェックする。

- `lib/exercises/guides.ts` の `GUIDES`: 使う筋肉・フォームのポイント・注意点・呼吸法。加重バリエーションは通常版と同じフォームを流用しつつ「どこに加重するか（ベルト/ベスト/プレート等）」を1点目に追記する
- `lib/exercises/readings.ts` の `READINGS`: 種目名が漢字を含む場合のみ、ひらがな検索用の読みを追加する（純カタカナ名は不要）。加重バリエーションは「かじゅう」+ 元の読みで作る
- `lib/exercises/aliases.ts` の `ALIASES`: カタカナ表記と競合する和名の俗称があれば追加する（無ければ不要）
- `lib/exercises/images.ts` の `IMAGES`（動画・サムネイル）: GymVisualの生素材の場所は上記「Google Drive」節を参照（実際に使うのは大抵`~/Downloads`の展開済みフォルダ、例: `1201-01 05 26-male1` が動画本体、`1201-01 05 26-thumbnails-male1` がSTEP1/STEP2静止画）。該当クリップ（英語種目名で検索）を探し、以下で変換・登録する
  - 動画: `ffmpeg -y -i "<raw>.mp4" -vf scale=960:540 -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart -an assets/exercise-media/<slug>.mp4`
  - サムネ: STEP2の静止画（ピーク収縮側。STEP1/2は目視で選ぶ）に `ffmpeg -y -nostdin -i "<raw>-STEP2.png" -vf "crop=1080:1080,scale=300:300" assets/exercise-media/<slug>_thumb.png`
  - 該当クリップが無い/複数候補があって名称的に確信が持てない場合はユーザーに確認する。それでも見つからない種目だけ登録を省略してよい（`PLACEHOLDER_THUMBNAIL` にフォールバックする）
- 記録機能実装後は `db/schema.ts` の `exercises.measurementType` も分類する
