/**
 * Gmail連携モジュール
 * ヤフオク通知メールの検索・取得・ラベル管理
 */

/**
 * 未処理のヤフオクメールスレッドを取得する
 * @param {number} [maxThreads] - 取得する最大スレッド数（省略時は全件）
 * @return {GmailThread[]} 未処理メールスレッドの配列
 */
function getUnprocessedThreads(maxThreads) {
  var query = 'label:' + CONFIG.LABEL_YAHOO_AUCTION +
              ' -label:' + CONFIG.LABEL_PROCESSED;

  if (maxThreads) {
    return GmailApp.search(query, 0, maxThreads);
  }
  return GmailApp.search(query);
}

/**
 * メールスレッドを処理済みにする
 * @param {GmailThread} thread - 処理済みにするスレッド
 */
function markAsProcessed(thread) {
  var label = getOrCreateLabel(CONFIG.LABEL_PROCESSED);
  thread.addLabel(label);
}

/**
 * Gmailラベルを取得する（存在しなければ作成）
 * @param {string} labelName - ラベル名
 * @return {GmailLabel} ラベルオブジェクト
 */
function getOrCreateLabel(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
    Logger.log('ラベルを作成しました: ' + labelName);
  }
  return label;
}

/**
 * メールスレッドから個別メッセージを時系列順で取得する
 * @param {GmailThread} thread - メールスレッド
 * @return {GmailMessage[]} メッセージの配列（古い順）
 */
function getMessagesFromThread(thread) {
  return thread.getMessages();
}

/**
 * ヤフオク関連メールかどうかを判定する
 * @param {GmailMessage} message - メールメッセージ
 * @return {boolean} ヤフオク関連メールの場合 true
 */
function isYahooAuctionMail(message) {
  var from = message.getFrom();
  // アドレス部分のみ抽出して検証（表示名に yahoo.co.jp が含まれる詐称を防ぐ）
  var addrMatch = from.match(/<([^>]+)>/);
  var email = (addrMatch ? addrMatch[1] : from).toLowerCase();
  return email.endsWith('@mail.yahoo.co.jp') ||
         email.endsWith('@auctions.yahoo.co.jp') ||
         email.endsWith('@yahoo.co.jp');
}

/**
 * メッセージからプレーンテキスト本文を取得する
 * HTMLメールの場合はタグを除去する
 * @param {GmailMessage} message - メールメッセージ
 * @return {string} プレーンテキスト本文
 */
function getPlainBody(message) {
  var plainBody = message.getPlainBody();
  if (plainBody) return plainBody;

  // プレーンテキストがない場合はHTMLからテキストを抽出
  var htmlBody = message.getBody();
  if (!htmlBody) return '';

  return stripHtmlTags(htmlBody);
}

/**
 * HTMLタグを除去してプレーンテキストに変換する
 * @param {string} html - HTML文字列
 * @return {string} プレーンテキスト
 */
function stripHtmlTags(html) {
  // <br> や <p> を改行に変換
  var text = html.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  // HTMLタグを除去
  text = text.replace(/<[^>]+>/g, '');
  // HTML エンティティをデコード
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  // 連続する改行を整理
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
