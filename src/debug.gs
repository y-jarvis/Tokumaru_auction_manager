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
    var data = sheet.getRange(2, 1, Math.min(lastRow - 1, 5), CONFIG.HEADERS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      Logger.log('行' + (i + 2) + ': ID='        + data[i][CONFIG.COL.AUCTION_ID    - 1] +
        ' | 商品名='    + data[i][CONFIG.COL.ITEM_NAME     - 1] +
        ' | 出品日='    + data[i][CONFIG.COL.LISTED_AT     - 1] +
        ' | 落札日='    + data[i][CONFIG.COL.WON_AT        - 1] +
        ' | 落札金額='  + data[i][CONFIG.COL.WINNING_PRICE - 1] +
        ' | 売上確定日=' + data[i][CONFIG.COL.CONFIRMED_AT  - 1] +
        ' | ステータス='  + data[i][CONFIG.COL.STATUS        - 1] +
        ' | 手数料='    + data[i][CONFIG.COL.FEE           - 1] +
        ' | 利益='      + data[i][CONFIG.COL.PROFIT        - 1]);
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

/**
 * 落札メールの本文をログ出力してパターンを確認する
 * パーサー修正前に実行してください
 */
function debugWinningMailBody() {
  var threads = GmailApp.search(
    'label:' + CONFIG.LABEL_YAHOO_AUCTION + ' subject:終了（落札者あり）', 0, 1
  );
  if (threads.length === 0) {
    Logger.log('落札メールが見つかりません');
    return;
  }
  var msgs = threads[0].getMessages();
  var msg = msgs[0];
  Logger.log('=== 件名 ===');
  Logger.log(msg.getSubject());
  Logger.log('=== 本文（プレーンテキスト）===');
  Logger.log(msg.getPlainBody().substring(0, 2000));
}

/**
 * 売上確定メールの件名・本文を丸ごとログ出力する
 * 「売上確定メールのパースに失敗しました」が出るときに実行してください
 * GASエディタから手動実行してください
 */
function debugSalesConfirmedMail() {
  // 件名パターンを広めに検索
  var queries = [
    'label:' + CONFIG.LABEL_YAHOO_AUCTION + ' subject:売上が確定',
    'label:' + CONFIG.LABEL_YAHOO_AUCTION + ' subject:売上確定',
    'from:@mail.yahoo.co.jp subject:売上'
  ];

  var found = false;
  for (var q = 0; q < queries.length; q++) {
    var threads = GmailApp.search(queries[q], 0, 3);
    if (threads.length === 0) continue;

    Logger.log('=== クエリ: ' + queries[q] + ' (' + threads.length + '件) ===');
    for (var t = 0; t < threads.length; t++) {
      var msgs = threads[t].getMessages();
      var msg = msgs[msgs.length - 1];
      Logger.log('--- 件名 ---');
      Logger.log(msg.getSubject());
      Logger.log('--- From ---');
      Logger.log(msg.getFrom());
      Logger.log('--- 本文（先頭3000文字）---');
      Logger.log(getPlainBody(msg).substring(0, 3000));
      Logger.log('--- extractAuctionId 結果 ---');
      Logger.log(extractAuctionId(getPlainBody(msg)));
      Logger.log('--- extractAuctionIdFromSubject 結果 ---');
      Logger.log(extractAuctionIdFromSubject(msg.getSubject()));
      Logger.log('');
    }
    found = true;
  }

  if (!found) {
    Logger.log('売上確定メールが見つかりませんでした');
    Logger.log('「ヤフオク」ラベルが付いているか確認してください');
  }
}

/**
 * Gmail ラベル診断: メール検索状況を確認する
 * 「未処理メールはありません」が出るときに実行してください
 */
function diagnoseMail() {
  Logger.log('=== Gmail ラベル診断 ===');

  // ヤフオクラベルのみで検索（処理済みフィルターなし）
  var allThreads = GmailApp.search('label:' + CONFIG.LABEL_YAHOO_AUCTION, 0, 10);
  Logger.log('「ヤフオク」ラベルのスレッド数: ' + allThreads.length);

  // 未処理のみ
  var unprocessed = GmailApp.search(
    'label:' + CONFIG.LABEL_YAHOO_AUCTION + ' -label:' + CONFIG.LABEL_PROCESSED, 0, 10
  );
  Logger.log('未処理スレッド数: ' + unprocessed.length);

  // 処理済みのみ
  var processed = GmailApp.search(
    'label:' + CONFIG.LABEL_YAHOO_AUCTION + ' label:' + CONFIG.LABEL_PROCESSED, 0, 10
  );
  Logger.log('処理済みスレッド数: ' + processed.length);

  if (allThreads.length > 0) {
    Logger.log('--- 最新3件のメール件名 ---');
    for (var i = 0; i < Math.min(3, allThreads.length); i++) {
      var msgs = allThreads[i].getMessages();
      Logger.log('[' + i + '] ' + msgs[msgs.length - 1].getSubject());
      Logger.log('    From: ' + msgs[msgs.length - 1].getFrom());
      var labels = allThreads[i].getLabels().map(function(l) { return l.getName(); });
      Logger.log('    Labels: ' + labels.join(', '));
    }
  }
}

/**
 * 「ヤフオク処理済」ラベルを全スレッドから一括削除する
 * importAllMails() が「未処理メールはありません」と返す場合に実行してください
 * GAS 6分制限対策のため複数回実行が必要な場合があります
 */
function resetProcessedLabels() {
  var label = GmailApp.getUserLabelByName(CONFIG.LABEL_PROCESSED);
  if (!label) {
    Logger.log('「' + CONFIG.LABEL_PROCESSED + '」ラベルは存在しません');
    return;
  }

  var removed = 0;
  var threads;
  do {
    threads = GmailApp.search('label:' + CONFIG.LABEL_PROCESSED, 0, 100);
    for (var i = 0; i < threads.length; i++) {
      threads[i].removeLabel(label);
      removed++;
    }
    Logger.log(removed + '件のラベルを削除しました...');
  } while (threads.length === 100);

  Logger.log('完了: 合計 ' + removed + ' スレッドから「' + CONFIG.LABEL_PROCESSED + '」を削除しました');
  Logger.log('次に importAllMails() を実行してください');
}
