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

## 構成概要

```
GitHub push → GitHub Actions → clasp push → GAS 自動デプロイ
                                              ↓
Gmail (info@jarvis-group.co.jp) ← 10分トリガー → スプレッドシート
```

## クイックセットアップ
1. `src/config.gs` を設定
2. GASへpush（`clasp push`）
3. GASエディタで以下を順に実行
   - `setupWebappSecret()`
   - `initializeSpreadsheet()`（既存シート運用なら不要）
   - `initializeSheet()`
   - `setupTrigger()`

詳細は `OPERATIONS_MANUAL.md` を参照。

---

## ファイル構成

```
src/
├── main.gs     # エントリーポイント（トリガー実行、一括インポート）
├── config.gs   # 設定値（スプレッドシートID、ラベル名等）
├── gmail.gs    # Gmail検索・ラベル管理
├── parser.gs   # メール本文パース（正規表現処理）
├── sheet.gs    # スプレッドシート読み書き
├── webapp.gs   # Webアプリエンドポイント（外部からの関数呼び出し用）
├── drive.gs    # Driveからの .eml インポート
├── debug.gs    # デバッグ用関数
└── utils.gs    # ユーティリティ（日付変換等）

.github/
└── workflows/
    └── deploy.yml  # GitHub Actions 自動デプロイ
```

## シート設計

| 列 | 項目 | 説明 |
|----|------|------|
| A | オークションID | 一意キー |
| B | 出品日時 | メールから自動取得 |
| C | 商品名 | メールから自動取得 |
| D | 開始価格 | メールから自動取得 |
| E | 終了予定日 | メールから自動取得 |
| F | 現在価格 | 入札時に自動更新 |
| G | 入札数 | 入札時に自動更新 |
| H | 落札価格 | 落札時に自動更新 |
| I | 落札者 | 落札時に自動更新 |
| J | ステータス | 出品中 / 落札済 / 未落札 / 取消 |
| K | 仕入価格 | **手入力** |
| L | 利益 | `=H-K`（自動計算） |
| M | メモ | **手入力** |
