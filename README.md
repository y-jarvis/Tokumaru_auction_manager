# ヤフオク販売管理 自動化システム

ヤフオク通知メールをGmail経由で読み取り、Googleスプレッドシートに自動反映するGASツールです。

## すぐ読むべき資料
- 運用マニュアル（本番用）
  - `OPERATIONS_MANUAL.md`

## このリポジトリでできること
- 出品完了メールの新規登録
- 入札通知の価格/件数更新
- 落札通知のステータス更新
- 終了（未落札）/取消のステータス更新
- 過去メールの一括取り込み
- Webアプリ経由での外部実行（`importAllMails` など）

## クイックセットアップ
1. `src/config.gs` を設定
2. GASへpush（`clasp push`）
3. GASエディタで以下を順に実行
   - `initializeSpreadsheet()`（既存シート運用なら不要）
   - `initializeSheet()`
   - `setupTrigger()`

詳細は `OPERATIONS_MANUAL.md` を参照。
