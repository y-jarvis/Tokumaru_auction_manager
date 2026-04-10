/**
 * メイン処理モジュール
 * ヤフオク販売管理 自動化システム エントリーポイント
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

      // ヤフオク関連メールでなければスキップ
      if (!isYahooAuctionMail(message)) continue;

      try {
        var result = processMessage(message);
        if (result) {
          processedCount++;
        }
      } catch (e) {
        errorCount++;
        log('ERROR', 'メール処理エラー: ' + e.message +
            ' (件名: ' + message.getSubject() + ')');
      }
    }

    // スレッドを処理済みにする
    markAsProcessed(thread);
  }

  log('INFO', '処理完了: ' + processedCount + '件処理, ' +
      errorCount + '件エラー');
  log('INFO', '=== ヤフオクメール処理 終了 ===');
}

/**
 * 個別メッセージを処理する
 * @param {GmailMessage} message - メールメッセージ
 * @return {boolean} 処理成功の場合 true
 */
function processMessage(message) {
  var subject = message.getSubject();
  var body = getPlainBody(message);
  var mailDate = message.getDate();
  var mailType = classifyMail(subject);

  log('INFO', '処理中: [' + mailType + '] ' + subject);

  switch (mailType) {
    case MAIL_TYPE.LISTING:
      return handleListingMail(body, mailDate);

    case MAIL_TYPE.BID:
      return handleBidMail(body);

    case MAIL_TYPE.WINNING:
      return handleWinningMail(body);

    case MAIL_TYPE.END_UNSOLD:
      return handleEndUnsoldMail(body);

    default:
      log('WARN', '不明なメール種別: ' + subject);
      return false;
  }
}

/**
 * 出品完了メールを処理する
 * @param {string} body - メール本文
 * @param {Date} mailDate - メール受信日時
 * @return {boolean} 処理成功の場合 true
 */
function handleListingMail(body, mailDate) {
  var data = parseListingMail(body, mailDate);
  if (!data) {
    log('WARN', '出品完了メールのパースに失敗しました');
    return false;
  }

  insertAuctionRow(data);
  log('INFO', '出品追加: ' + data.auctionId + ' - ' + data.itemName);
  return true;
}

/**
 * 入札通知メールを処理する
 * @param {string} body - メール本文
 * @return {boolean} 処理成功の場合 true
 */
function handleBidMail(body) {
  var data = parseBidMail(body);
  if (!data) {
    log('WARN', '入札通知メールのパースに失敗しました');
    return false;
  }

  var updated = updateAuctionRow(data.auctionId, {
    currentPrice: data.currentPrice,
    bidCount: data.bidCount
  });

  if (updated) {
    log('INFO', '入札更新: ' + data.auctionId +
        ' 現在価格: ' + data.currentPrice + '円');
  }
  return updated;
}

/**
 * 落札通知メールを処理する
 * @param {string} body - メール本文
 * @return {boolean} 処理成功の場合 true
 */
function handleWinningMail(body) {
  var data = parseWinningMail(body);
  if (!data) {
    log('WARN', '落札通知メールのパースに失敗しました');
    return false;
  }

  var updated = updateAuctionRow(data.auctionId, {
    winningPrice: data.winningPrice,
    currentPrice: data.winningPrice,
    winner: data.winner,
    status: CONFIG.STATUS.SOLD
  });

  if (updated) {
    log('INFO', '落札更新: ' + data.auctionId +
        ' 落札価格: ' + data.winningPrice + '円 落札者: ' + data.winner);
  }
  return updated;
}

/**
 * 終了通知（未落札）メールを処理する
 * @param {string} body - メール本文
 * @return {boolean} 処理成功の場合 true
 */
function handleEndUnsoldMail(body) {
  var data = parseEndMail(body);
  if (!data) {
    log('WARN', '終了通知メールのパースに失敗しました');
    return false;
  }

  var updated = updateAuctionRow(data.auctionId, {
    status: CONFIG.STATUS.UNSOLD
  });

  if (updated) {
    log('INFO', '未落札更新: ' + data.auctionId);
  }
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
  // 既存の同名トリガーを削除
  removeTrigger();

  ScriptApp.newTrigger('processYahooAuctionMails')
    .timeBased()
    .everyMinutes(CONFIG.TRIGGER_INTERVAL_MINUTES)
    .create();

  log('INFO', 'トリガーを設定しました: ' +
      CONFIG.TRIGGER_INTERVAL_MINUTES + '分間隔');
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
  var MAX_EXECUTION_TIME = 5 * 60 * 1000; // 5分（余裕をもたせる）

  var threads = getUnprocessedThreads();

  if (threads.length === 0) {
    log('INFO', '未処理メールはありません');
    // インポート完了フラグをクリア
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
    // 実行時間チェック
    var elapsed = new Date().getTime() - startTime;
    if (elapsed > MAX_EXECUTION_TIME) {
      // 続きは次回実行
      PropertiesService.getScriptProperties().setProperty('IMPORT_OFFSET', String(i));
      log('INFO', '実行時間上限に達しました。次回 offset=' + i + ' から再開します');
      log('INFO', '再度 importAllMails() を実行してください');
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

  // インポート完了
  PropertiesService.getScriptProperties().deleteProperty('IMPORT_OFFSET');
  log('INFO', '一括インポート完了: ' + processedCount + '件処理');
  log('INFO', '=== 一括インポート 終了 ===');
}
