/**
 * スプレッドシート操作モジュール
 * 出品管理シートへの読み書き処理
 */

/**
 * スプレッドシートを取得する
 * @return {SpreadsheetApp.Spreadsheet}
 */
function getSpreadsheet() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

/**
 * 出品管理シートを取得する（存在しなければ作成）
 * @return {SpreadsheetApp.Sheet}
 */
function getAuctionSheet() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    setupHeaders(sheet);
  }
  return sheet;
}

/**
 * ヘッダー行をセットアップする
 * @param {SpreadsheetApp.Sheet} [sheet] - 対象シート（省略時は自動取得）
 */
function setupHeaders(sheet) {
  if (!sheet) {
    sheet = getAuctionSheet();
  }
  var headerRange = sheet.getRange(1, 1, 1, CONFIG.HEADERS.length);
  headerRange.setValues([CONFIG.HEADERS]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4a86c8');
  headerRange.setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

/**
 * シートを初期化する（GASエディタから手動実行用）
 */
function initializeSheet() {
  var sheet = getAuctionSheet();
  setupHeaders(sheet);
  Logger.log('シートの初期化が完了しました: ' + CONFIG.SHEET_NAME);
}

/**
 * オークションIDで該当行を検索する
 * @param {string} auctionId - オークションID
 * @return {number} 行番号（1始まり）。見つからない場合は -1
 */
function findRowByAuctionId(auctionId) {
  var sheet = getAuctionSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;

  var idRange = sheet.getRange(2, CONFIG.COL.AUCTION_ID, lastRow - 1, 1);
  var values = idRange.getValues();

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(auctionId)) {
      return i + 2; // ヘッダー行分 +1、0始まり→1始まり +1
    }
  }
  return -1;
}

/**
 * 新規行を追加する（出品完了時）
 * @param {Object} data - 出品データ
 * @param {string} data.auctionId - オークションID
 * @param {string} data.listedAt - 出品日時
 * @param {string} data.itemName - 商品名
 * @param {number} data.startPrice - 開始価格
 * @param {string} data.endDate - 終了予定日
 */
function insertAuctionRow(data) {
  var sheet = getAuctionSheet();

  // 既に同じオークションIDが存在する場合はスキップ
  if (findRowByAuctionId(data.auctionId) !== -1) {
    Logger.log('既存のオークションID: ' + data.auctionId + ' スキップしました');
    return;
  }

  var newRow = [
    data.auctionId,
    data.listedAt,
    data.itemName,
    data.startPrice,
    data.endDate,
    data.startPrice, // 現在価格 = 開始価格
    0,               // 入札数
    '',              // 落札価格
    '',              // 落札者
    CONFIG.STATUS.LISTING, // ステータス: 出品中
    '',              // 仕入価格（手入力）
    '',              // 利益（数式で自動計算）
    ''               // メモ
  ];

  var lastRow = sheet.getLastRow();
  var targetRow = lastRow + 1;
  sheet.getRange(targetRow, 1, 1, newRow.length).setValues([newRow]);

  // 利益列に数式を設定: =H行-K行
  var profitCell = sheet.getRange(targetRow, CONFIG.COL.PROFIT);
  profitCell.setFormula('=IF(AND(H' + targetRow + '<>"",K' + targetRow + '<>""),H' + targetRow + '-K' + targetRow + ',"")');

  Logger.log('新規出品を追加: ' + data.auctionId + ' - ' + data.itemName);
}

/**
 * 既存行を更新する（入札・落札・終了時）
 * @param {string} auctionId - オークションID
 * @param {Object} data - 更新データ（更新したい列のみ含む）
 * @param {number} [data.currentPrice] - 現在価格
 * @param {number} [data.bidCount] - 入札数
 * @param {number} [data.winningPrice] - 落札価格
 * @param {string} [data.winner] - 落札者
 * @param {string} [data.status] - ステータス
 */
function updateAuctionRow(auctionId, data) {
  var sheet = getAuctionSheet();
  var row = findRowByAuctionId(auctionId);

  if (row === -1) {
    Logger.log('オークションIDが見つかりません: ' + auctionId);
    return false;
  }

  if (data.currentPrice !== undefined) {
    sheet.getRange(row, CONFIG.COL.CURRENT_PRICE).setValue(data.currentPrice);
  }
  if (data.bidCount !== undefined) {
    sheet.getRange(row, CONFIG.COL.BID_COUNT).setValue(data.bidCount);
  }
  if (data.winningPrice !== undefined) {
    sheet.getRange(row, CONFIG.COL.WINNING_PRICE).setValue(data.winningPrice);
  }
  if (data.winner !== undefined) {
    sheet.getRange(row, CONFIG.COL.WINNER).setValue(data.winner);
  }
  if (data.status !== undefined) {
    sheet.getRange(row, CONFIG.COL.STATUS).setValue(data.status);
  }

  Logger.log('更新完了: ' + auctionId + ' ' + JSON.stringify(data));
  return true;
}
