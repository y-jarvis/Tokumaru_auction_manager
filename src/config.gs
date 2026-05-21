/**
 * 設定値
 * ヤフオク落札管理 自動化システム
 */

// スプレッドシートID（ご自身のスプレッドシートIDに変更してください）
var CONFIG = {
  SPREADSHEET_ID: '1Vxeb5e-gz2-87J6Ye6mrIv581GEGR0zSgyLCy41_WXI',
  SHEET_NAME: '落札管理',

  // Gmailラベル
  LABEL_YAHOO_AUCTION: 'ヤフオク',
  LABEL_PROCESSED: 'ヤフオク処理済',

  // トリガー間隔（分）
  TRIGGER_INTERVAL_MINUTES: 10,

  // 一括インポート時のバッチサイズ（GAS 6分制限対策）
  BATCH_SIZE: 50,

  // ヘッダー行の定義（落札された商品のみ管理）
  HEADERS: [
    'オークションID',
    '商品名',
    '出品日',
    '落札日',
    '落札金額',
    '売上確定日',
    'ステータス',
    '仕入価格',
    '手数料',
    '利益',
    'メモ'
  ],

  // 列インデックス（1始まり）
  COL: {
    AUCTION_ID:    1,
    ITEM_NAME:     2,
    LISTED_AT:     3,
    WON_AT:        4,
    WINNING_PRICE: 5,
    CONFIRMED_AT:  6,
    STATUS:        7,
    COST_PRICE:    8,
    FEE:           9,  // 手数料（落札金額×10%）
    PROFIT:       10,
    MEMO:         11
  },

  // Driveインポート用フォルダID
  DRIVE_FOLDER_ID: '1B83HS19aaGJ9Qot0Q5rkXheNgZ7kAv-L',

  // ステータス値（3値のみ）
  STATUS: {
    LISTING:   '出品中',  // 出品後・落札前
    WON:       '落札済',  // 落札通知受信後
    CANCELLED: '取消'     // 取消・未落札
  }
};
