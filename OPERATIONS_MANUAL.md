# ヤフオク販売管理ツール 運用マニュアル（実務版）

最終更新: 2026-05-19
対象: `tokumaru-auction`（Gmail + GAS + スプレッドシート）

## 1. このツールで何を自動化しているか
- ヤフオク通知メールを読み取り、スプレッドシートの「出品管理」を自動更新
- 対応イベント
  - 出品完了
  - 入札通知
  - 落札通知
  - 終了（未落札）
  - 取消
- 人が入力する列
  - 仕入価格（K列）
  - メモ（M列）

## 2. 日常運用（毎日これだけ）
### 朝 or 業務開始時（3分）
1. スプレッドシートを開く
2. ステータス列（J）を確認
3. 必要な行だけ `仕入価格` と `メモ` を入力

### 異常時のみ（5分）
- 「最新の出品/入札/落札が反映されない」とき:
  1. GASログを確認（`processYahooAuctionMails`）
  2. `diagnoseMail()` を実行
  3. 必要なら `resetProcessedLabels()` → `importAllMails()` を実行

## 3. 初回セットアップ手順
## 3-1. Gmail側
1. フィルタ作成
   - 条件例: `from:(@mail.yahoo.co.jp)`
   - 処理: ラベル `ヤフオク` を付与
2. ラベル確認
   - `ヤフオク`（入力）
   - `ヤフオク処理済`（GASが自動付与）

## 3-2. GAS側（必須関数）
初回はこの順で手動実行:
1. `initializeSpreadsheet()`（または既存シートを使う場合は不要）
2. `initializeSheet()`
3. `setupTrigger()`
4. 必要に応じて `importAllMails()`

補足:
- トリガー間隔は `CONFIG.TRIGGER_INTERVAL_MINUTES`（現在10分）
- バッチ処理件数は `CONFIG.BATCH_SIZE`（現在50）

## 3-3. 設定ファイル
編集対象: `src/config.gs`
- `SPREADSHEET_ID`
- `LABEL_YAHOO_AUCTION`
- `LABEL_PROCESSED`
- `DRIVE_FOLDER_ID`（.eml診断を使う場合）

## 4. Webアプリ運用（外部から実行）
実装: `src/webapp.gs`

### 4-1. 初回だけ
1. `setupWebappSecret()` を実行
2. GASを「ウェブアプリとしてデプロイ」
   - 実行ユーザー: 自分
   - アクセス: リンクを知っている全員（必要なら制限）

### 4-2. 実行できる関数
- `resetProcessedLabels`
- `importAllMails`
- `resetAndImport`

### 4-3. 呼び出し例
```bash
curl "<WEBAPP_URL>?secret=<SECRET>&fn=importAllMails"
```

成功レスポンス例:
```json
{"status":"ok","result":"importAllMails completed"}
```

## 5. よく使う運用コマンド
### claspデプロイ
```bash
clasp push
```

### GASエディタを開く
```bash
clasp open
```

### GitHub Actions自動デプロイ
- `src/**` / `appsscript.json` / `.clasp.json` 変更時に自動実行
- 対象ブランチ:
  - `main`
  - `claude/yahoo-auctions-automation-ySFp7`

## 6. 障害対応プレイブック
### 症状A: 未処理メール0件なのに実際はメールがある
1. `diagnoseMail()` 実行
2. `ヤフオク処理済` ラベルが誤付与されていれば `resetProcessedLabels()`
3. `importAllMails()` 再実行

### 症状B: 落札メールだけ反映されない
1. `debugWinningMailBody()` 実行
2. `src/parser.gs` の落札パターンを修正
3. `clasp push` 後に `importAllMails()` で再取り込み

### 症状C: 出品行がないのに入札/落札だけ先に来た
- 現行実装はプレースホルダー行を作成するので、後追いで出品情報が補完される

### 症状D: 処理が止まる/遅い
1. トリガー有無を確認（`setupTrigger()` 再実行）
2. 実行ログでエラー箇所を確認
3. BATCH_SIZEを下げる（50→20など）

## 7. 運用ルール（事故防止）
- ルール1: `仕入価格` と `メモ` は人が入力、他列は手修正しない
- ルール2: パーサー修正時は先に `debug*` 関数で再現ログを取る
- ルール3: 変更は小さくコミットし、必ずpushまで完了
- ルール4: 復旧作業（reset/import）を実施した日時をメモ列に残す

## 8. 主要関数クイックリファレンス
- 定期処理: `processYahooAuctionMails`
- トリガー設定: `setupTrigger` / `removeTrigger`
- 一括取込: `importAllMails`
- ラベル診断: `diagnoseMail`
- 処理済み解除: `resetProcessedLabels`
- 総合診断: `fullDiagnosis`
- Web秘密設定: `setupWebappSecret`
- 月次確認: `getMonthlySummary`
