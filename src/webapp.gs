/**
 * WebアプリエンドポイントによるGAS外部実行
 * clasp run の代替として使用
 */

var WEBAPP_SECRET = 'tokumaru-auction-2026';

/**
 * GETリクエストを受け付けて関数を実行する
 * @param {Object} e - リクエストパラメータ
 */
function doGet(e) {
  var secret = e.parameter.secret || '';
  var fn = e.parameter.fn || '';

  if (secret !== WEBAPP_SECRET) {
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
