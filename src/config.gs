/**
 * 設定値
 * ヤフオク販売管理 自動化システム
 */

// スプレッドシートID（ご自身のスプレッドシートIDに変更してください）
var CONFIG = {
  SPREADSHEET_ID: '1Vxeb5e-gz2-87J6Ye6mrIv581GEGR0zSgyLCy41_WXI',
  SHEET_NAME: '出品管理',

  // Gmailラベル
  LABEL_YAHOO_AUCTION: 'ヤフオク',
  LABEL_PROCESSED: 'ヤフオク処理済',

  // トリガー間隔（分）
  TRIGGER_INTERVAL_MINUTES: 10,

  // 一括インポート時のバッチサイズ（GAS 6分制限対策）
  BATCH_SIZE: 50,

  // ヘッダー行の定義
  HEADERS: [
    'オークションID',
    '出品日時',
    '商品名',
    '開始価格',
    '終了予定日',
    '現在価格',
    '入札数',
    '落札価格',
    '落札者',
    'ステータス',
    '仕入価格',
    '利益',
    'メモ'
  ],

  // 列インデックス（1始まり）
  COL: {
    AUCTION_ID: 1,
    LISTED_AT: 2,
    ITEM_NAME: 3,
    START_PRICE: 4,
    END_DATE: 5,
    CURRENT_PRICE: 6,
    BID_COUNT: 7,
    WINNING_PRICE: 8,
    WINNER: 9,
    STATUS: 10,
    COST_PRICE: 11,
    PROFIT: 12,
    MEMO: 13
  },

  // Driveインポート用フォルダID
  DRIVE_FOLDER_ID: '1B83HS19aaGJ9Qot0Q5rkXheNgZ7kAv-L',

  // ステータス値
  STATUS: {
    LISTING: '出品中',
    SOLD: '落札済',
    UNSOLD: '未落札',
    CANCELLED: '取消'
  }
};
