/**
 * メールパーサーモジュール
 * ヤフオク通知メールの種別判定・本文パース処理
 *
 * ※ 公開情報ベースの仮実装です。
 *   実際のメールサンプル入手後に正規表現を調整してください。
 */

// メール種別定数
var MAIL_TYPE = {
  LISTING: 'listing',           // 出品
  BID: 'bid',                   // 入札通知
  WINNING: 'winning',           // 終了（落札者あり）
  END_UNSOLD: 'end_unsold',     // 終了（落札者なし）
  CANCELLED: 'cancelled',       // オークション取消
  PAYMENT: 'payment',           // 支払い完了
  SALES_CONFIRMED: 'sales_confirmed', // 売上確定
  UNKNOWN: 'unknown'
};

/**
 * メール件名からメール種別を判定する
 * @param {string} subject - メール件名
 * @return {string} MAIL_TYPE のいずれか
 */
function classifyMail(subject) {
  if (!subject) return MAIL_TYPE.UNKNOWN;

  // 終了（落札者あり）= 落札通知
  if (/終了（落札者あり）|終了\(落札者あり\)|落札されました/.test(subject)) {
    return MAIL_TYPE.WINNING;
  }

  // 終了（落札者なし）= 未落札
  if (/終了（落札者なし）|終了\(落札者なし\)|終了しました/.test(subject)) {
    return MAIL_TYPE.END_UNSOLD;
  }

  // 入札通知
  if (/入札がありました|入札.*ありました|新しい入札/.test(subject)) {
    return MAIL_TYPE.BID;
  }

  // 出品（「出品：」パターン）
  if (/出品：|出品:|出品しました|出品完了/.test(subject)) {
    return MAIL_TYPE.LISTING;
  }

  // オークション取消
  if (/オークションの取り消し|取り消しました/.test(subject)) {
    return MAIL_TYPE.CANCELLED;
  }

  // 支払い完了
  if (/支払いが完了しました/.test(subject)) {
    return MAIL_TYPE.PAYMENT;
  }

  // 売上確定
  if (/売上が確定しました/.test(subject)) {
    return MAIL_TYPE.SALES_CONFIRMED;
  }

  return MAIL_TYPE.UNKNOWN;
}

/**
 * メール本文からオークションIDを抽出する
 * @param {string} body - メール本文
 * @return {string|null} オークションID
 */
function extractAuctionId(body) {
  if (!body) return null;

  // ヤフオクのオークションIDパターン（英数字で構成）
  // URLから抽出: page.auctions.yahoo.co.jp/jp/auction/XXXXX
  var urlMatch = body.match(/page\.auctions\.yahoo\.co\.jp\/jp\/auction\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];

  // オークションID直接記載パターン
  var idMatch = body.match(/オークションID\s*[：:]\s*([a-zA-Z0-9]+)/);
  if (idMatch) return idMatch[1];

  // オークションID別パターン
  var idMatch2 = body.match(/オークション\s*ID\s*[：:]\s*([a-zA-Z0-9]+)/);
  if (idMatch2) return idMatch2[1];

  return null;
}

/**
 * 件名やファイル名からオークションIDを抽出する
 * パターン: (ID) や （ID） の形式
 * @param {string} text - 件名やファイル名
 * @return {string|null} オークションID
 */
function extractAuctionIdFromSubject(text) {
  if (!text) return null;

  // 半角括弧パターン: (x1234567890)
  var match = text.match(/\(([a-zA-Z]?\d{7,})\)/);
  if (match) return match[1];

  // 全角括弧パターン: （x1234567890）
  var match2 = text.match(/（([a-zA-Z]?\d{7,})）/);
  if (match2) return match2[1];

  return null;
}

/**
 * 件名やファイル名から商品名を抽出する
 * パターン: "Yahoo!オークション - 終了（落札者あり）：商品名(ID).eml"
 * @param {string} text - 件名やファイル名
 * @return {string} 商品名
 */
function extractItemNameFromSubject(text) {
  if (!text) return '';

  // "：商品名(ID)" パターン
  var match = text.match(/[：:]\s*(.+?)[\(（][a-zA-Z]?\d{7,}[\)）]/);
  if (match) return match[1].trim();

  // "：（ID）" パターン（出品メール、商品名なし）
  return '';
}

/**
 * 出品完了メールをパースする
 * @param {string} body - メール本文
 * @param {Date} mailDate - メール受信日時
 * @return {Object|null} パース結果
 */
function parseListingMail(body, mailDate) {
  if (!body) return null;

  var auctionId = extractAuctionId(body);
  if (!auctionId) {
    Logger.log('出品完了メール: オークションIDが見つかりません');
    return null;
  }

  // 商品名を抽出
  var itemName = '';
  var nameMatch = body.match(/商品名\s*[：:]\s*(.+?)[\r\n]/);
  if (nameMatch) {
    itemName = nameMatch[1].trim();
  } else {
    // 件名から商品名を推測（「〜を出品しました」パターン）
    var nameMatch2 = body.match(/「(.+?)」/);
    if (nameMatch2) itemName = nameMatch2[1].trim();
  }

  // 開始価格を抽出
  var startPrice = 0;
  var priceMatch = body.match(/開始価格\s*[：:]\s*([0-9,]+)\s*円/);
  if (priceMatch) {
    startPrice = parseInt(priceMatch[1].replace(/,/g, ''), 10);
  } else {
    var priceMatch2 = body.match(/([0-9,]+)\s*円.*(?:から|スタート|開始)/);
    if (priceMatch2) startPrice = parseInt(priceMatch2[1].replace(/,/g, ''), 10);
  }

  // 終了予定日を抽出
  var endDate = '';
  var endMatch = body.match(/終了(?:日時|予定日?)\s*[：:]\s*(.+?)[\r\n]/);
  if (endMatch) {
    endDate = endMatch[1].trim();
  } else {
    var endMatch2 = body.match(/(\d{4}[\/-]\d{1,2}[\/-]\d{1,2}\s+\d{1,2}:\d{2}).*(?:終了|まで)/);
    if (endMatch2) endDate = endMatch2[1].trim();
  }

  return {
    auctionId: auctionId,
    listedAt: formatDate(mailDate),
    itemName: itemName,
    startPrice: startPrice,
    endDate: endDate
  };
}

/**
 * 入札通知メールをパースする
 * @param {string} body - メール本文
 * @return {Object|null} パース結果
 */
function parseBidMail(body) {
  if (!body) return null;

  var auctionId = extractAuctionId(body);
  if (!auctionId) {
    Logger.log('入札通知メール: オークションIDが見つかりません');
    return null;
  }

  // 現在価格を抽出
  var currentPrice = 0;
  var priceMatch = body.match(/現在(?:の)?価格\s*[：:]\s*([0-9,]+)\s*円/);
  if (priceMatch) {
    currentPrice = parseInt(priceMatch[1].replace(/,/g, ''), 10);
  } else {
    var priceMatch2 = body.match(/([0-9,]+)\s*円/);
    if (priceMatch2) currentPrice = parseInt(priceMatch2[1].replace(/,/g, ''), 10);
  }

  // 入札数を抽出
  var bidCount = 0;
  var bidMatch = body.match(/入札(?:数|件数)\s*[：:]\s*(\d+)/);
  if (bidMatch) {
    bidCount = parseInt(bidMatch[1], 10);
  } else {
    var bidMatch2 = body.match(/(\d+)\s*件/);
    if (bidMatch2) bidCount = parseInt(bidMatch2[1], 10);
  }

  return {
    auctionId: auctionId,
    currentPrice: currentPrice,
    bidCount: bidCount
  };
}

/**
 * 落札通知メールをパースする
 * @param {string} body - メール本文
 * @return {Object|null} パース結果
 */
function parseWinningMail(body) {
  if (!body) return null;

  var auctionId = extractAuctionId(body);
  if (!auctionId) {
    Logger.log('落札通知メール: オークションIDが見つかりません');
    return null;
  }

  // 落札価格を抽出
  var winningPrice = 0;
  var priceMatch = body.match(/落札価格\s*[：:]\s*([0-9,]+)\s*円/);
  if (priceMatch) {
    winningPrice = parseInt(priceMatch[1].replace(/,/g, ''), 10);
  } else {
    var priceMatch2 = body.match(/([0-9,]+)\s*円.*(?:で落札|落札されました)/);
    if (priceMatch2) winningPrice = parseInt(priceMatch2[1].replace(/,/g, ''), 10);
  }

  // 落札者IDを抽出
  var winner = '';
  var winnerMatch = body.match(/落札者\s*[：:]\s*(.+?)[\r\n]/);
  if (winnerMatch) {
    winner = winnerMatch[1].trim();
  } else {
    var winnerMatch2 = body.match(/落札者.*?ID\s*[：:]\s*(.+?)[\r\n]/);
    if (winnerMatch2) winner = winnerMatch2[1].trim();
  }

  return {
    auctionId: auctionId,
    winningPrice: winningPrice,
    winner: winner
  };
}

/**
 * 終了通知（未落札）メールをパースする
 * @param {string} body - メール本文
 * @return {Object|null} パース結果
 */
function parseEndMail(body) {
  if (!body) return null;

  var auctionId = extractAuctionId(body);
  if (!auctionId) {
    Logger.log('終了通知メール: オークションIDが見つかりません');
    return null;
  }

  return {
    auctionId: auctionId
  };
}
