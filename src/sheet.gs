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
 * スプレッドシートを新規作成してIDをログに出力する
 * GASエディタから手動実行してください
 * 作成後、表示されたIDを config.gs の SPREADSHEET_ID に設定してください
 */
function createSpreadsheet() {
  var ss = SpreadsheetApp.create('ヤフオク販売管理');
  var id = ss.getId();
  var url = ss.getUrl();

  // 出品管理シートをセットアップ
  var sheet = ss.getActiveSheet();
  sheet.setName(CONFIG.SHEET_NAME);
  var headerRange = sheet.getRange(1, 1, 1, CONFIG.HEADERS.length);
  headerRange.setValues([CONFIG.HEADERS]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4a86c8');
  headerRange.setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  Logger.log('========================================');
  Logger.log('スプレッドシートを作成しました');
  Logger.log('ID: ' + id);
  Logger.log('URL: ' + url);
  Logger.log('========================================');
  Logger.log('config.gs の SPREADSHEET_ID にこのIDを設定してください: ' + id);
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

/**
 * スプレッドシートの全データをログに出力する（デバッグ用）
 */
function debugSheetData() {
  var sheet = getAuctionSheet();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow <= 1) {
    Logger.log('データがありません');
    return;
  }

  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  // ヘッダー
  Logger.log('=== ヘッダー ===');
  Logger.log(data[0].join(' | '));

  // データ行
  Logger.log('=== データ（' + (lastRow - 1) + '行） ===');
  for (var i = 1; i < data.length; i++) {
    Logger.log('行' + (i + 1) + ': ID=' + data[i][0] +
      ' | 出品日=' + data[i][1] +
      ' | 商品名=' + data[i][2] +
      ' | 開始価格=' + data[i][3] +
      ' | 終了予定=' + data[i][4] +
      ' | 現在価格=' + data[i][5] +
      ' | 入札数=' + data[i][6] +
      ' | 落札価格=' + data[i][7] +
      ' | 落札者=' + data[i][8] +
      ' | ステータス=' + data[i][9]);
  }
}

/**
 * 1つの.emlファイルの中身をデバッグ表示する（パース確認用）
 * GASエディタから手動実行してください
 */
function debugFirstEml() {
  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  var files = folder.getFiles();

  // 出品メールと終了（落札者あり）メールを1件ずつ探す
  var listingFound = false;
  var winningFound = false;

  while (files.hasNext() && (!listingFound || !winningFound)) {
    var file = files.next();
    var fileName = file.getName();

    if (!listingFound && /出品：/.test(fileName)) {
      Logger.log('=== 出品メール サンプル ===');
      Logger.log('ファイル名: ' + fileName);
      var content = file.getBlob().getDataAsString('UTF-8');
      Logger.log('--- 先頭2000文字 ---');
      Logger.log(content.substring(0, 2000));
      Logger.log('--- Subject抽出結果 ---');
      Logger.log('Subject: ' + extractSubjectFromEml(file));
      Logger.log('AuctionID (subject): ' + extractAuctionIdFromSubject(fileName));
      var body = parseEmlFile(file);
      Logger.log('--- パース後本文（先頭1000文字）---');
      Logger.log(body.substring(0, 1000));
      Logger.log('AuctionID (body): ' + extractAuctionId(body));
      listingFound = true;
    }

    if (!winningFound && /終了（落札者あり）/.test(fileName)) {
      Logger.log('');
      Logger.log('=== 終了（落札者あり）メール サンプル ===');
      Logger.log('ファイル名: ' + fileName);
      var content2 = file.getBlob().getDataAsString('UTF-8');
      Logger.log('--- 先頭2000文字 ---');
      Logger.log(content2.substring(0, 2000));
      Logger.log('--- Subject抽出結果 ---');
      Logger.log('Subject: ' + extractSubjectFromEml(file));
      Logger.log('AuctionID (subject): ' + extractAuctionIdFromSubject(fileName));
      var body2 = parseEmlFile(file);
      Logger.log('--- パース後本文（先頭1000文字）---');
      Logger.log(body2.substring(0, 1000));
      Logger.log('AuctionID (body): ' + extractAuctionId(body2));
      var parsed = parseWinningMail(body2);
      Logger.log('--- parseWinningMail結果 ---');
      Logger.log(JSON.stringify(parsed));
      winningFound = true;
    }
  }
}
