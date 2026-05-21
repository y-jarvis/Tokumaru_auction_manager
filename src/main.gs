/**
 * メイン処理モジュール
 * ヤフオク落札管理 自動化システム エントリーポイント
 */

/**
 * メイン関数：未処理のヤフオクメールを処理する
 * トリガーから定期実行される
 */
function processYahooAuctionMails() {
  log('INFO', '=== ヤフオクメール処理 開始 ===');

  var threads = getUnprocessedThreads(CONFIG.BATCH_SIZE);

  if (threads.length === 0) {
    log('INFO', '未処理メールはありません');
    return;
  }

  log('INFO', '未処理メールスレッド数: ' + threads.length);

  var processedCount = 0;
  var errorCount = 0;

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var messages = getMessagesFromThread(thread);

    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];

      if (!isYahooAuctionMail(message)) continue;

      try {
        var result = processMessage(message);
        if (result) processedCount++;
      } catch (e) {
        errorCount++;
        log('ERROR', 'メール処理エラー: ' + e.message +
            ' (件名: ' + message.getSubject() + ')');
      }
    }

    markAsProcessed(thread);
  }

  log('INFO', '処理完了: ' + processedCount + '件処理, ' + errorCount + '件エラー');
  log('INFO', '=== ヤフオクメール処理 終了 ===');
}

/**
 * 個別メッセージを処理する
 * @param {GmailMessage} message - メールメッセージ
 * @return {boolean} 処理成功の場合 true
 */
function processMessage(message) {
  var subject  = message.getSubject();
  var body     = getPlainBody(message);
  var mailDate = message.getDate();
  var mailType = classifyMail(subject);

  log('INFO', '処理中: [' + mailType + '] ' + subject);

  switch (mailType) {
    case MAIL_TYPE.LISTING:
      return handleListingMail(body, mailDate, subject);

    case MAIL_TYPE.BID:
      // 入札通知は管理不要（落札通知で上書きされるため）
      log('INFO', 'スキップ（入札通知）: ' + subject);
      return false;

    case MAIL_TYPE.WINNING:
      return handleWinningMail(body, mailDate, subject);

    case MAIL_TYPE.END_UNSOLD:
      return handleEndUnsoldMail(body, subject);

    case MAIL_TYPE.CANCELLED:
      return handleCancelledMail(body, subject);

    case MAIL_TYPE.PAYMENT:
      log('INFO', 'スキップ（支払い完了）: ' + subject);
      return false;

    case MAIL_TYPE.SALES_CONFIRMED:
      return handleSalesConfirmedMail(body, mailDate, subject);

    default:
      log('WARN', '不明なメール種別: ' + subject);
      return false;
  }
}

/**
 * 出品完了メールを処理する
 * 出品日を記録する。落札されなかった行は「出品中」のまま残る。
 * @param {string} body     - メール本文
 * @param {Date}   mailDate - メール受信日時
 * @param {string} [subject] - メール件名
 * @return {boolean}
 */
function handleListingMail(body, mailDate, subject) {
  var data = parseListingMail(body, mailDate);

  if (!data && subject) {
    var auctionId = extractAuctionIdFromSubject(subject);
    if (auctionId) {
      data = {
        auctionId: auctionId,
        listedAt:  formatDate(mailDate),
        itemName:  extractItemNameFromSubject(subject)
      };
    }
  }

  if (!data) {
    log('WARN', '出品完了メールのパースに失敗しました');
    return false;
  }

  insertAuctionRow(data);
  log('INFO', '出品追加/補完: ' + data.auctionId + ' - ' + data.itemName);
  return true;
}

/**
 * 落札通知メールを処理する
 * 落札日・落札金額を記録し、ステータスを「落札済」にする。
 * @param {string} body     - メール本文
 * @param {Date}   mailDate - メール受信日時（落札日として使用）
 * @param {string} [subject] - メール件名
 * @return {boolean}
 */
function handleWinningMail(body, mailDate, subject) {
  var data = parseWinningMail(body);

  if (!data && subject) {
    var auctionId = extractAuctionIdFromSubject(subject);
    if (auctionId) {
      data = {
        auctionId:    auctionId,
        winningPrice: 0,
        itemName:     extractItemNameFromSubject(subject)
      };
    }
  }

  if (!data) {
    log('WARN', '落札通知メールのパースに失敗しました');
    return false;
  }

  var wonAt    = formatDate(mailDate);
  var itemName = data.itemName || (subject ? extractItemNameFromSubject(subject) : '');

  // 出品行がまだない場合は落札行として新規作成
  var existingRow = findRowByAuctionId(data.auctionId);
  if (existingRow === -1) {
    insertWonRow({
      auctionId:    data.auctionId,
      itemName:     itemName,
      wonAt:        wonAt,
      winningPrice: data.winningPrice
    });
  } else {
    // 既存行を更新（落札日・落札金額・ステータスを上書き）
    updateAuctionRow(data.auctionId, {
      itemName:     itemName,
      wonAt:        wonAt,
      winningPrice: data.winningPrice,
      status:       CONFIG.STATUS.WON
    });
  }

  log('INFO', '落札更新: ' + data.auctionId +
      ' 落札日: ' + wonAt +
      ' 落札金額: ' + data.winningPrice + '円');
  return true;
}

/**
 * 終了通知（未落札）メールを処理する
 * 出品行があればステータスを「未落札」にする。
 * @param {string} body    - メール本文
 * @param {string} [subject]
 * @return {boolean}
 */
function handleEndUnsoldMail(body, subject) {
  var data = parseEndMail(body);

  if (!data && subject) {
    var auctionId = extractAuctionIdFromSubject(subject);
    if (auctionId) data = { auctionId: auctionId };
  }

  if (!data) {
    log('WARN', '終了通知メールのパースに失敗しました');
    return false;
  }

  // 出品行がない場合は更新不要（未落札なのでシートに追加しない）
  if (findRowByAuctionId(data.auctionId) === -1) {
    log('INFO', '未落札（出品行なし）: ' + data.auctionId);
    return false;
  }

  var updated = updateAuctionRow(data.auctionId, { status: CONFIG.STATUS.UNSOLD });
  if (updated) log('INFO', '未落札更新: ' + data.auctionId);
  return updated;
}

/**
 * 取消メールを処理する
 * @param {string} body    - メール本文
 * @param {string} [subject]
 * @return {boolean}
 */
function handleCancelledMail(body, subject) {
  var auctionId = extractAuctionId(body);

  if (!auctionId && subject) auctionId = extractAuctionIdFromSubject(subject);

  if (!auctionId) {
    log('WARN', '取消メールのパースに失敗しました');
    return false;
  }

  if (findRowByAuctionId(auctionId) === -1) {
    log('INFO', '取消（出品行なし）: ' + auctionId);
    return false;
  }

  var updated = updateAuctionRow(auctionId, { status: CONFIG.STATUS.CANCELLED });
  if (updated) log('INFO', '取消更新: ' + auctionId);
  return updated;
}

/**
 * 売上確定メールを処理する
 * 売上確定日を記録し、ステータスを「売上確定」にする。
 * @param {string} body     - メール本文
 * @param {Date}   mailDate - メール受信日時（売上確定日として使用）
 * @param {string} [subject]
 * @return {boolean}
 */
function handleSalesConfirmedMail(body, mailDate, subject) {
  var auctionId = extractAuctionId(body);

  if (!auctionId && subject) auctionId = extractAuctionIdFromSubject(subject);

  if (!auctionId) {
    log('WARN', '売上確定メールのパースに失敗しました: ' + subject);
    return false;
  }

  var confirmedAt = formatDate(mailDate);

  // 落札行がない場合（落札メールが未処理など）はここで新規作成
  var existingRow = findRowByAuctionId(auctionId);
  if (existingRow === -1) {
    insertWonRow({
      auctionId:    auctionId,
      itemName:     subject ? extractItemNameFromSubject(subject) : '',
      wonAt:        '',
      winningPrice: ''
    });
    log('WARN', '売上確定: 対応する落札行がなかったため新規作成: ' + auctionId);
  }

  var updated = updateAuctionRow(auctionId, {
    confirmedAt: confirmedAt,
    status:      CONFIG.STATUS.CONFIRMED
  });

  if (updated) log('INFO', '売上確定更新: ' + auctionId + ' 確定日: ' + confirmedAt);
  return updated;
}

// ============================================================
// トリガー管理
// ============================================================

/**
 * 10分間隔の定期実行トリガーを設定する
 * GASエディタから手動実行してください
 */
function setupTrigger() {
  removeTrigger();

  ScriptApp.newTrigger('processYahooAuctionMails')
    .timeBased()
    .everyMinutes(CONFIG.TRIGGER_INTERVAL_MINUTES)
    .create();

  log('INFO', 'トリガーを設定しました: ' + CONFIG.TRIGGER_INTERVAL_MINUTES + '分間隔');
}

/**
 * processYahooAuctionMails のトリガーを削除する
 */
function removeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processYahooAuctionMails') {
      ScriptApp.deleteTrigger(triggers[i]);
      log('INFO', 'トリガーを削除しました');
    }
  }
}

// ============================================================
// 過去メール一括インポート
// ============================================================

/**
 * 過去のヤフオクメールを一括でインポートする
 * GAS 6分制限に対応するバッチ処理
 * GASエディタから手動実行してください
 */
function importAllMails() {
  log('INFO', '=== 一括インポート 開始 ===');

  var startTime = new Date().getTime();
  var MAX_EXECUTION_TIME = 5 * 60 * 1000; // 5分

  var threads = getUnprocessedThreads();

  if (threads.length === 0) {
    log('INFO', '未処理メールはありません');
    PropertiesService.getScriptProperties().deleteProperty('IMPORT_OFFSET');
    return;
  }

  log('INFO', '未処理メールスレッド数: ' + threads.length);

  var offset = parseInt(
    PropertiesService.getScriptProperties().getProperty('IMPORT_OFFSET') || '0',
    10
  );
  var processedCount = 0;

  for (var i = offset; i < threads.length; i++) {
    var elapsed = new Date().getTime() - startTime;
    if (elapsed > MAX_EXECUTION_TIME) {
      PropertiesService.getScriptProperties().setProperty('IMPORT_OFFSET', String(i));
      log('INFO', '実行時間上限。次回 offset=' + i + ' から再開します。再度 importAllMails() を実行してください');
      return;
    }

    var thread = threads[i];
    var messages = getMessagesFromThread(thread);

    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      if (!isYahooAuctionMail(message)) continue;

      try {
        processMessage(message);
        processedCount++;
      } catch (e) {
        log('ERROR', '一括インポートエラー: ' + e.message);
      }
    }

    markAsProcessed(thread);
  }

  PropertiesService.getScriptProperties().deleteProperty('IMPORT_OFFSET');
  log('INFO', '一括インポート完了: ' + processedCount + '件処理');
  log('INFO', '=== 一括インポート 終了 ===');
}
