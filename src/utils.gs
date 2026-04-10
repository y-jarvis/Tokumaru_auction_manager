/**
 * ユーティリティモジュール
 * 共通ヘルパー関数
 */

/**
 * Date オブジェクトを日本時間の文字列にフォーマットする
 * @param {Date} date - 日付オブジェクト
 * @return {string} フォーマット済み日時文字列（例: 2024/04/01 12:30）
 */
function formatDate(date) {
  if (!date) return '';
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
}

/**
 * 金額文字列をパースして数値に変換する
 * @param {string} priceStr - 金額文字列（例: "1,500円", "¥1500"）
 * @return {number} 金額（数値）
 */
function parsePrice(priceStr) {
  if (!priceStr) return 0;
  var cleaned = String(priceStr).replace(/[,、円¥￥\s]/g, '');
  var num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * ログを記録する（デバッグ用）
 * @param {string} level - ログレベル（INFO, WARN, ERROR）
 * @param {string} message - メッセージ
 */
function log(level, message) {
  var timestamp = formatDate(new Date());
  Logger.log('[' + timestamp + '] [' + level + '] ' + message);
}
