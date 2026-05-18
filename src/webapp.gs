/**
 * WebアプリエンドポイントによるGAS外部実行
 * clasp run の代替として使用
 */

/**
 * GETリクエストを受け付けて関数を実行する
 * @param {Object} e - リクエストパラメータ
 */
function doGet(e) {
  var secret = e.parameter.secret || '';
  var fn = e.parameter.fn || '';

  var storedSecret = PropertiesService.getScriptProperties().getProperty('WEBAPP_SECRET');
  if (!storedSecret || secret !== storedSecret) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error', message: 'unauthorized'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var result = '';
  try {
    if (fn === 'resetProcessedLabels') {
      resetProcessedLabels();
      result = 'resetProcessedLabels completed';
    } else if (fn === 'importAllMails') {
      importAllMails();
      result = 'importAllMails completed';
    } else if (fn === 'resetAndImport') {
      resetProcessedLabels();
      importAllMails();
      result = 'resetAndImport completed';
    } else {
      result = 'unknown function: ' + fn;
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error', message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok', result: result
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Webアプリのシークレットを ScriptProperties に設定する
 * 初回セットアップ時に一度だけ GASエディタから手動実行してください
 */
function setupWebappSecret() {
  var secret = 'tokumaru-auction-2026';
  PropertiesService.getScriptProperties().setProperty('WEBAPP_SECRET', secret);
  Logger.log('WEBAPP_SECRET を設定しました');
}
