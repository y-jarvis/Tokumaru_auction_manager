/**
 * Google Driveインポートモジュール
 * Drive上の.emlファイルからヤフオクメールを取り込む
 */

/**
 * Driveフォルダ内のファイル一覧をログに出力する（確認用）
 * GASエディタから手動実行してください
 */
function listDriveFiles() {
  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  var files = folder.getFiles();

  var count = 0;
  while (files.hasNext()) {
    var file = files.next();
    Logger.log('ファイル: ' + file.getName() + ' | タイプ: ' + file.getMimeType() + ' | サイズ: ' + file.getSize());
    count++;
  }
  Logger.log('合計: ' + count + ' ファイル');
}

/**
 * Driveフォルダ内のメールファイルをインポートする
 * .eml形式に対応
 * GASエディタから手動実行してください
 */
function importFromDrive() {
  log('INFO', '=== Driveインポート 開始 ===');

  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  var files = folder.getFiles();
  var startTime = new Date().getTime();
  var MAX_EXECUTION_TIME = 5 * 60 * 1000;
  var processedCount = 0;
  var errorCount = 0;

  while (files.hasNext()) {
    var elapsed = new Date().getTime() - startTime;
    if (elapsed > MAX_EXECUTION_TIME) {
      log('INFO', '実行時間上限に達しました。再度 importFromDrive() を実行してください');
      break;
    }

    var file = files.next();
    var fileName = file.getName();
    var mimeType = file.getMimeType();

    try {
      var body = '';

      if (mimeType === 'message/rfc822' || fileName.match(/\.eml$/i)) {
        // .eml ファイル
        body = parseEmlFile(file);
      } else if (mimeType === 'text/plain' || fileName.match(/\.txt$/i)) {
        // テキストファイル
        body = file.getBlob().getDataAsString('UTF-8');
      } else if (mimeType === 'text/html' || fileName.match(/\.html?$/i)) {
        // HTMLファイル
        var html = file.getBlob().getDataAsString('UTF-8');
        body = stripHtmlTags(html);
      } else {
        log('WARN', 'スキップ（未対応形式）: ' + fileName + ' (' + mimeType + ')');
        continue;
      }

      if (!body) {
        log('WARN', '本文が空です: ' + fileName);
        continue;
      }

      // メール種別を判定して処理
      var subject = extractSubjectFromEml(file) || fileName;
      var mailType = classifyMail(subject);

      // ファイル名でも判定を試みる
      if (mailType === MAIL_TYPE.UNKNOWN) {
        mailType = classifyMail(fileName);
      }

      // 件名・ファイル名で判定できなければ本文から推測
      if (mailType === MAIL_TYPE.UNKNOWN) {
        mailType = classifyFromBody(body);
      }

      log('INFO', '処理中: [' + mailType + '] ' + fileName);

      var result = false;
      // 件名のフォールバック用に subject と fileName を統合
      var subjectForFallback = subject || fileName;

      switch (mailType) {
        case MAIL_TYPE.LISTING:
          var fileDate = extractDateFromEml(file) || file.getDateCreated();
          result = handleListingMail(body, fileDate, subjectForFallback);
          break;
        case MAIL_TYPE.BID:
          result = handleBidMail(body, subjectForFallback);
          break;
        case MAIL_TYPE.WINNING:
          result = handleWinningMail(body, subjectForFallback);
          break;
        case MAIL_TYPE.END_UNSOLD:
          result = handleEndUnsoldMail(body, subjectForFallback);
          break;
        case MAIL_TYPE.CANCELLED:
          result = handleCancelledMail(body, subjectForFallback);
          break;
        case MAIL_TYPE.PAYMENT:
          log('INFO', 'スキップ（支払い完了）: ' + fileName);
          break;
        case MAIL_TYPE.SALES_CONFIRMED:
          log('INFO', 'スキップ（売上確定）: ' + fileName);
          break;
        default:
          log('WARN', '種別不明: ' + fileName);
          break;
      }

      if (result) processedCount++;

    } catch (e) {
      errorCount++;
      log('ERROR', 'Driveインポートエラー: ' + fileName + ' - ' + e.message);
    }
  }

  log('INFO', '処理完了: ' + processedCount + '件成功, ' + errorCount + '件エラー');
  log('INFO', '=== Driveインポート 終了 ===');
}

/**
 * .emlファイルから本文を抽出する
 * @param {DriveApp.File} file - .emlファイル
 * @return {string} メール本文
 */
function parseEmlFile(file) {
  var content = file.getBlob().getDataAsString('UTF-8');

  // ヘッダーと本文を分離（空行で区切られる）
  var parts = content.split(/\r?\n\r?\n/);
  if (parts.length < 2) return content;

  var body = parts.slice(1).join('\n\n');

  // Content-Transfer-Encoding をチェック
  var header = parts[0];
  if (/Content-Transfer-Encoding:\s*base64/i.test(header)) {
    try {
      // マルチパートの場合、テキスト部分を探す
      body = decodeBase64Body(content);
    } catch (e) {
      // デコード失敗時はそのまま使う
    }
  } else if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(header)) {
    body = decodeQuotedPrintable(body);
  }

  // HTMLの場合はテキストに変換
  if (/<html/i.test(body)) {
    body = stripHtmlTags(body);
  }

  return body.trim();
}

/**
 * .emlファイルからSubjectを抽出する
 * @param {DriveApp.File} file - .emlファイル
 * @return {string|null} 件名
 */
function extractSubjectFromEml(file) {
  var content = file.getBlob().getDataAsString('UTF-8');
  var headerEnd = content.search(/\r?\n\r?\n/);
  var header = headerEnd > 0 ? content.substring(0, headerEnd) : content.substring(0, 2000);

  var subjectMatch = header.match(/^Subject:\s*(.+?)(?:\r?\n(?!\s))/m);
  if (!subjectMatch) return null;

  var subject = subjectMatch[1].trim();

  // MIMEエンコードされた件名をデコード
  if (/=\?/.test(subject)) {
    subject = decodeMimeHeader(subject);
  }

  return subject;
}

/**
 * .emlファイルからDateを抽出する
 * @param {DriveApp.File} file - .emlファイル
 * @return {Date|null} メール日時
 */
function extractDateFromEml(file) {
  var content = file.getBlob().getDataAsString('UTF-8');
  var headerEnd = content.search(/\r?\n\r?\n/);
  var header = headerEnd > 0 ? content.substring(0, headerEnd) : content.substring(0, 2000);

  var dateMatch = header.match(/^Date:\s*(.+)/m);
  if (!dateMatch) return null;

  try {
    return new Date(dateMatch[1].trim());
  } catch (e) {
    return null;
  }
}

/**
 * Base64エンコードされた本文をデコードする
 * @param {string} emlContent - .eml全体の内容
 * @return {string} デコードされた本文
 */
function decodeBase64Body(emlContent) {
  // text/plain パートを優先的に探す
  var textPlainMatch = emlContent.match(
    /Content-Type:\s*text\/plain[^\r\n]*\r?\n(?:Content-Transfer-Encoding:\s*base64\r?\n)?(?:[^\r\n]+\r?\n)*\r?\n([\s\S]*?)(?:\r?\n--|\Z)/i
  );

  if (textPlainMatch) {
    var encoded = textPlainMatch[1].replace(/\s/g, '');
    return Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8');
  }

  // text/html パートにフォールバック
  var textHtmlMatch = emlContent.match(
    /Content-Type:\s*text\/html[^\r\n]*\r?\n(?:Content-Transfer-Encoding:\s*base64\r?\n)?(?:[^\r\n]+\r?\n)*\r?\n([\s\S]*?)(?:\r?\n--|\Z)/i
  );

  if (textHtmlMatch) {
    var encoded = textHtmlMatch[1].replace(/\s/g, '');
    var html = Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8');
    return stripHtmlTags(html);
  }

  return '';
}

/**
 * Quoted-Printableをデコードする
 * @param {string} text - エンコードされたテキスト
 * @return {string} デコードされたテキスト
 */
function decodeQuotedPrintable(text) {
  // ソフト改行を除去
  text = text.replace(/=\r?\n/g, '');
  // =XX をデコード
  text = text.replace(/=([0-9A-Fa-f]{2})/g, function(match, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
  return text;
}

/**
 * MIMEエンコードされたヘッダーをデコードする
 * @param {string} encoded - エンコードされた文字列
 * @return {string} デコードされた文字列
 */
function decodeMimeHeader(encoded) {
  return encoded.replace(/=\?([^?]+)\?([BbQq])\?([^?]+)\?=/g, function(match, charset, encoding, text) {
    if (encoding.toUpperCase() === 'B') {
      return Utilities.newBlob(Utilities.base64Decode(text)).getDataAsString(charset);
    } else {
      // Q encoding
      var decoded = text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, function(m, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      });
      return decoded;
    }
  });
}

/**
 * 本文からメール種別を推測する
 * @param {string} body - メール本文
 * @return {string} MAIL_TYPE のいずれか
 */
function classifyFromBody(body) {
  if (/終了（落札者あり）|終了\(落札者あり\)|落札されました|ご落札/.test(body)) {
    return MAIL_TYPE.WINNING;
  }
  if (/終了（落札者なし）|終了\(落札者なし\)/.test(body)) {
    return MAIL_TYPE.END_UNSOLD;
  }
  if (/入札がありました|入札.*ありました|新しい入札|ご入札を受け付け/.test(body)) {
    return MAIL_TYPE.BID;
  }
  if (/出品[：:]|出品しました|出品完了|出品が完了/.test(body)) {
    return MAIL_TYPE.LISTING;
  }
  if (/オークションの取り消し|取り消しました/.test(body)) {
    return MAIL_TYPE.CANCELLED;
  }
  if (/支払いが完了しました|お支払いが完了/.test(body)) {
    return MAIL_TYPE.PAYMENT;
  }
  if (/売上が確定しました|売上確定/.test(body)) {
    return MAIL_TYPE.SALES_CONFIRMED;
  }
  return MAIL_TYPE.UNKNOWN;
}
