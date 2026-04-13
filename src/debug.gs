/**
 * デバッグ・診断モジュール
 * 1回の実行で全情報を収集する包括診断
 */

/**
 * 包括診断: スプレッドシート + 各種別のemlサンプルを一括チェック
 * GASエディタから手動実行してください
 */
function fullDiagnosis() {
  Logger.log('========================================');
  Logger.log('=== 包括診断 開始 ===');
  Logger.log('========================================');

  // 1. スプレッドシートの現状
  Logger.log('');
  Logger.log('--- [1] スプレッドシート現状 ---');
  var sheet = getAuctionSheet();
  var lastRow = sheet.getLastRow();
  Logger.log('データ行数: ' + (lastRow - 1));

  if (lastRow > 1) {
    var data = sheet.getRange(2, 1, Math.min(lastRow - 1, 5), 13).getValues();
    for (var i = 0; i < data.length; i++) {
      Logger.log('行' + (i + 2) + ': ID=' + data[i][0] +
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

  // 2. 各種別の.emlサンプルを1件ずつ詳細分析
  Logger.log('');
  Logger.log('--- [2] .eml サンプル分析 ---');

  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  var files = folder.getFiles();

  // 各種別のサンプルを集める
  var samples = {
    '出品': null,
    '終了（落札者あり）': null,
    '終了（落札者なし）': null,
    'オークションの取り消し': null,
    '支払い': null,
    '売上確定': null
  };

  var samplePatterns = {
    '出品': /- 出品：/,
    '終了（落札者あり）': /終了（落札者あり）/,
    '終了（落札者なし）': /終了（落札者なし）/,
    'オークションの取り消し': /オークションの取り消し/,
    '支払い': /支払いが完了しました/,
    '売上確定': /売上が確定しました/
  };

  while (files.hasNext()) {
    var file = files.next();
    var fn = file.getName();
    for (var key in samplePatterns) {
      if (!samples[key] && samplePatterns[key].test(fn)) {
        samples[key] = file;
      }
    }
    // 全種別揃ったら終了
    var allFound = true;
    for (var k in samples) {
      if (!samples[k]) { allFound = false; break; }
    }
    if (allFound) break;
  }

  // 各サンプルを詳細分析
  for (var type in samples) {
    Logger.log('');
    Logger.log('=== サンプル: ' + type + ' ===');

    if (!samples[type]) {
      Logger.log('(該当ファイルなし)');
      continue;
    }

    var f = samples[type];
    var fileName = f.getName();
    Logger.log('ファイル名: ' + fileName);
    Logger.log('MIMEタイプ: ' + f.getMimeType());

    // rawコンテンツの先頭を表示
    var rawContent = f.getBlob().getDataAsString('UTF-8');
    Logger.log('--- raw先頭500文字 ---');
    Logger.log(rawContent.substring(0, 500));

    // ヘッダー解析
    Logger.log('--- ヘッダー解析 ---');
    var headerEnd = rawContent.search(/\r?\n\r?\n/);
    var header = headerEnd > 0 ? rawContent.substring(0, headerEnd) : rawContent.substring(0, 2000);

    // Content-Type
    var ctMatch = header.match(/^Content-Type:\s*(.+)/m);
    Logger.log('Content-Type: ' + (ctMatch ? ctMatch[1] : '(なし)'));

    // Content-Transfer-Encoding
    var cteMatch = header.match(/^Content-Transfer-Encoding:\s*(.+)/m);
    Logger.log('Content-Transfer-Encoding: ' + (cteMatch ? cteMatch[1] : '(なし)'));

    // マルチパートboundary
    var boundaryMatch = header.match(/boundary="?([^";\r\n]+)"?/i);
    Logger.log('Boundary: ' + (boundaryMatch ? boundaryMatch[1] : '(なし)'));

    // Subject抽出
    var extractedSubject = extractSubjectFromEml(f);
    Logger.log('Subject (抽出): ' + extractedSubject);

    // Date抽出
    var extractedDate = extractDateFromEml(f);
    Logger.log('Date (抽出): ' + extractedDate);

    // classifyMail結果
    var mailType = classifyMail(extractedSubject || '');
    Logger.log('classifyMail(subject): ' + mailType);
    var mailType2 = classifyMail(fileName);
    Logger.log('classifyMail(fileName): ' + mailType2);

    // AuctionID抽出
    Logger.log('AuctionID (fileName): ' + extractAuctionIdFromSubject(fileName));
    Logger.log('AuctionID (subject): ' + extractAuctionIdFromSubject(extractedSubject || ''));

    // 本文パース
    var parsedBody = parseEmlFile(f);
    Logger.log('--- パース後本文（先頭500文字）---');
    Logger.log(parsedBody.substring(0, 500));
    Logger.log('パース後本文の長さ: ' + parsedBody.length + '文字');

    // 本文からのAuctionID
    Logger.log('AuctionID (body): ' + extractAuctionId(parsedBody));

    // 商品名抽出テスト
    Logger.log('商品名 (fileName): ' + extractItemNameFromSubject(fileName));

    // 種別別パース結果
    if (type === '出品') {
      var listingData = parseListingMail(parsedBody, extractedDate || new Date());
      Logger.log('--- parseListingMail結果 ---');
      Logger.log(JSON.stringify(listingData));
    }
    if (type === '終了（落札者あり）') {
      var winData = parseWinningMail(parsedBody);
      Logger.log('--- parseWinningMail結果 ---');
      Logger.log(JSON.stringify(winData));
    }
  }

  Logger.log('');
  Logger.log('========================================');
  Logger.log('=== 包括診断 終了 ===');
  Logger.log('========================================');
}
