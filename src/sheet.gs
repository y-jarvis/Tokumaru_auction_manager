/**
 * スプレッドシート操作モジュール
 * 落札管理シートへの読み書き処理
 */

/**
 * スプレッドシートを取得する
 * ScriptProperties に保存されたIDを優先し、なければ CONFIG.SPREADSHEET_ID を使う
 * @return {SpreadsheetApp.Spreadsheet}
 */
function getSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID') || CONFIG.SPREADSHEET_ID;
  return SpreadsheetApp.openById(id);
}

/**
 * スプレッドシートを新規作成してIDをScriptPropertiesに保存する
 * 初回セットアップ時に一度だけ手動実行してください
 */
function initializeSpreadsheet() {
  var ss = SpreadsheetApp.create('ヤフオク落札管理');
  var id = ss.getId();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', id);
  Logger.log('スプレッドシートを作成しました。ID: ' + id);
  Logger.log('URL: ' + ss.getUrl());
  setupHeaders(ss.getSheets()[0]);
  Logger.log('ヘッダー設定完了。setupTrigger() を実行してください。');
}

/**
 * 落札管理シートを取得する（存在しなければ作成）
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
  headerRange.setBackground('#2d6a4f');
  headerRange.setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  // 列幅設定
  var colWidths = {
    1:  120, // オークションID
    2:  280, // 商品名
    3:  130, // 出品日
    4:  130, // 落札日
    5:   90, // 落札金額
    6:  130, // 売上確定日
    7:   80, // ステータス
    8:   90, // 仕入価格
    9:   90, // 手数料
    10:  90, // 利益
    11: 200  // メモ
  };
  for (var col in colWidths) {
    sheet.setColumnWidth(Number(col), colWidths[col]);
  }

  // ステータス列に条件付き書式
  var statusCol = CONFIG.COL.STATUS;
  var maxRow = 1000;
  var statusRange = sheet.getRange(2, statusCol, maxRow, 1);

  var rules = sheet.getConditionalFormatRules().filter(function(r) {
    var ranges = r.getRanges();
    for (var i = 0; i < ranges.length; i++) {
      if (ranges[i].getColumn() === statusCol) return false;
    }
    return true;
  });

  var statusRules = [
    { value: CONFIG.STATUS.WON,       bg: '#b6d7a8', fg: '#274e13' }, // 落札済: 緑
    { value: CONFIG.STATUS.LISTING,   bg: '#fff2cc', fg: '#7f6000' }, // 出品中: 黄
    { value: CONFIG.STATUS.CANCELLED, bg: '#f4cccc', fg: '#990000' }  // 取消: 赤
  ];

  statusRules.forEach(function(s) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(s.value)
        .setBackground(s.bg)
        .setFontColor(s.fg)
        .setRanges([statusRange])
        .build()
    );
  });

  sheet.setConditionalFormatRules(rules);
}

/**
 * シートのヘッダーを再設定する（GASエディタから手動実行用）
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

  var finder = sheet.getRange(2, CONFIG.COL.AUCTION_ID, lastRow - 1, 1)
    .createTextFinder(String(auctionId)).matchEntireCell(true);
  var result = finder.findNext();
  return result ? result.getRow() : -1;
}

/**
 * 出品完了時に新規行を追加する（出品日の記録用）
 * @param {Object} data
 * @param {string} data.auctionId - オークションID
 * @param {string} [data.itemName] - 商品名
 * @param {string} [data.listedAt] - 出品日
 */
function insertAuctionRow(data) {
  var sheet = getAuctionSheet();

  var existingRow = findRowByAuctionId(data.auctionId);
  if (existingRow !== -1) {
    // 既存行があれば出品日・商品名だけ補完（上書きしない）
    if (data.listedAt) {
      var existingDate = sheet.getRange(existingRow, CONFIG.COL.LISTED_AT).getValue();
      if (!existingDate) sheet.getRange(existingRow, CONFIG.COL.LISTED_AT).setValue(data.listedAt);
    }
    if (data.itemName) {
      var existingName = sheet.getRange(existingRow, CONFIG.COL.ITEM_NAME).getValue();
      if (!existingName) sheet.getRange(existingRow, CONFIG.COL.ITEM_NAME).setValue(data.itemName);
    }
    return;
  }

  var newRow = new Array(CONFIG.HEADERS.length).fill('');
  newRow[CONFIG.COL.AUCTION_ID - 1] = data.auctionId;
  newRow[CONFIG.COL.ITEM_NAME  - 1] = data.itemName || '';
  newRow[CONFIG.COL.LISTED_AT  - 1] = data.listedAt || '';
  newRow[CONFIG.COL.STATUS     - 1] = CONFIG.STATUS.LISTING;

  var targetRow = sheet.getLastRow() + 1;
  sheet.getRange(targetRow, 1, 1, newRow.length).setValues([newRow]);
  setRowFormulas_(sheet, targetRow);

  Logger.log('出品行を追加: ' + data.auctionId + ' - ' + data.itemName);
}

/**
 * 落札通知時に新規行を追加する（出品行がまだない場合）
 * @param {Object} data
 * @param {string} data.auctionId    - オークションID
 * @param {string} [data.itemName]   - 商品名
 * @param {string} [data.wonAt]      - 落札日
 * @param {number} [data.winningPrice] - 落札金額
 */
function insertWonRow(data) {
  var sheet = getAuctionSheet();

  var newRow = new Array(CONFIG.HEADERS.length).fill('');
  newRow[CONFIG.COL.AUCTION_ID    - 1] = data.auctionId;
  newRow[CONFIG.COL.ITEM_NAME     - 1] = data.itemName     || '';
  newRow[CONFIG.COL.WON_AT        - 1] = data.wonAt        || '';
  newRow[CONFIG.COL.WINNING_PRICE - 1] = data.winningPrice || '';
  newRow[CONFIG.COL.STATUS        - 1] = CONFIG.STATUS.WON;

  var targetRow = sheet.getLastRow() + 1;
  sheet.getRange(targetRow, 1, 1, newRow.length).setValues([newRow]);
  setRowFormulas_(sheet, targetRow);

  Logger.log('落札行を追加: ' + data.auctionId + ' - ' + data.itemName);
}

/**
 * 既存行を更新する
 * @param {string} auctionId - オークションID
 * @param {Object} data      - 更新データ
 * @return {boolean} 更新成功の場合 true
 */
function updateAuctionRow(auctionId, data) {
  var sheet = getAuctionSheet();
  var row = findRowByAuctionId(auctionId);

  if (row === -1) {
    Logger.log('オークションIDが見つかりません: ' + auctionId);
    return false;
  }

  var rowRange = sheet.getRange(row, 1, 1, CONFIG.HEADERS.length);
  var rowValues = rowRange.getValues()[0];

  if (data.itemName      !== undefined && data.itemName)      rowValues[CONFIG.COL.ITEM_NAME     - 1] = data.itemName;
  if (data.listedAt      !== undefined && data.listedAt)      rowValues[CONFIG.COL.LISTED_AT     - 1] = data.listedAt;
  if (data.wonAt         !== undefined && data.wonAt)         rowValues[CONFIG.COL.WON_AT        - 1] = data.wonAt;
  if (data.winningPrice  !== undefined)                       rowValues[CONFIG.COL.WINNING_PRICE - 1] = data.winningPrice;
  if (data.confirmedAt   !== undefined && data.confirmedAt)   rowValues[CONFIG.COL.CONFIRMED_AT  - 1] = data.confirmedAt;
  if (data.status        !== undefined)                       rowValues[CONFIG.COL.STATUS        - 1] = data.status;

  rowRange.setValues([rowValues]);

  // 数式が消えた場合に再設定
  setRowFormulas_(sheet, row);

  Logger.log('更新完了: ' + auctionId + ' ' + JSON.stringify(data));
  return true;
}

/**
 * 手数料・利益の数式を設定する（内部用）
 * 手数料 = 落札金額 × 10%
 * 利益   = 落札金額 − 手数料 − 仕入価格（いずれかが空でも計算）
 * @param {SpreadsheetApp.Sheet} sheet
 * @param {number} row - 対象行番号
 */
function setRowFormulas_(sheet, row) {
  var priceCol    = columnLetter(CONFIG.COL.WINNING_PRICE); // E
  var feeCol      = columnLetter(CONFIG.COL.FEE);           // I
  var costCol     = columnLetter(CONFIG.COL.COST_PRICE);    // H

  // 手数料: 落札金額が入力されていれば自動計算（10%）
  sheet.getRange(row, CONFIG.COL.FEE).setFormula(
    '=IF(' + priceCol + row + '<>"",ROUND(' + priceCol + row + '*0.1,0),"")'
  );

  // 利益: 落札金額があれば計算。手数料・仕入価格は空でも0として扱う
  sheet.getRange(row, CONFIG.COL.PROFIT).setFormula(
    '=IF(' + priceCol + row + '<>"",' +
    priceCol + row +
    '-IF(' + feeCol  + row + '<>"",' + feeCol  + row + ',0)' +
    '-IF(' + costCol + row + '<>"",' + costCol + row + ',0)' +
    ',"")'
  );
}

/**
 * 列番号をアルファベットに変換する（A, B, ... Z, AA, ...）
 * @param {number} col - 列番号（1始まり）
 * @return {string}
 */
function columnLetter(col) {
  var letter = '';
  while (col > 0) {
    var mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

/**
 * スプレッドシートの全データをログに出力する（デバッグ用）
 */
function debugSheetData() {
  var sheet = getAuctionSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('データがありません');
    return;
  }

  var data = sheet.getRange(1, 1, lastRow, CONFIG.HEADERS.length).getValues();
  Logger.log('=== ヘッダー ===');
  Logger.log(data[0].join(' | '));
  Logger.log('=== データ（' + (lastRow - 1) + '行） ===');
  for (var i = 1; i < data.length; i++) {
    Logger.log(
      '行' + (i + 1) + ': ID='         + data[i][CONFIG.COL.AUCTION_ID    - 1] +
      ' | 商品名='    + data[i][CONFIG.COL.ITEM_NAME     - 1] +
      ' | 出品日='    + data[i][CONFIG.COL.LISTED_AT     - 1] +
      ' | 落札日='    + data[i][CONFIG.COL.WON_AT        - 1] +
      ' | 落札金額='  + data[i][CONFIG.COL.WINNING_PRICE - 1] +
      ' | 売上確定日=' + data[i][CONFIG.COL.CONFIRMED_AT  - 1] +
      ' | ステータス=' + data[i][CONFIG.COL.STATUS        - 1]
    );
  }
}

/**
 * 月次サマリーをログに出力する（落札日基準）
 * GASエディタから手動実行してください
 * @param {number} [year]  - 対象年（省略時は当年）
 * @param {number} [month] - 対象月 1〜12（省略時は当月）
 */
function getMonthlySummary(year, month) {
  var now = new Date();
  var targetYear  = year  || now.getFullYear();
  var targetMonth = month || (now.getMonth() + 1);

  var sheet   = getAuctionSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('データがありません');
    return;
  }

  var data = sheet.getRange(2, 1, lastRow - 1, CONFIG.HEADERS.length).getValues();

  var totalWon  = 0;
  var salesSum  = 0;
  var profitSum = 0;
  var profitCount = 0;

  data.forEach(function(row) {
    var wonAt = row[CONFIG.COL.WON_AT - 1];
    if (!wonAt) return;

    var d = (wonAt instanceof Date) ? wonAt : new Date(wonAt);
    if (isNaN(d.getTime())) return;
    if (d.getFullYear() !== targetYear || (d.getMonth() + 1) !== targetMonth) return;

    var status       = row[CONFIG.COL.STATUS        - 1];
    var winningPrice = row[CONFIG.COL.WINNING_PRICE - 1];
    var costPrice    = row[CONFIG.COL.COST_PRICE    - 1];
    var fee          = row[CONFIG.COL.FEE           - 1];

    if (status === CONFIG.STATUS.WON) {
      totalWon++;
      if (winningPrice) salesSum += Number(winningPrice);
      if (winningPrice) {
        var feeAmt  = fee      ? Number(fee)      : Number(winningPrice) * 0.1;
        var costAmt = costPrice ? Number(costPrice) : 0;
        profitSum += Number(winningPrice) - feeAmt - costAmt;
        profitCount++;
      }
    }
  });

  Logger.log('========================================');
  Logger.log(targetYear + '年' + targetMonth + '月 月次サマリー');
  Logger.log('========================================');
  Logger.log('落札数    : ' + totalWon + ' 件');
  Logger.log('売上合計  : ' + salesSum.toLocaleString() + ' 円');
  Logger.log('利益合計  : ' + (profitCount > 0
    ? profitSum.toLocaleString() + ' 円（' + profitCount + '件分）'
    : '（データなし）'));
  Logger.log('========================================');
}
