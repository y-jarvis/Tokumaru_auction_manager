/**
 * メールパーサーモジュール
 * ヤフオク通知メールの種別判定・本文パース処理
 *
 * ※ 公開情報ベースの仮実装です。
 *   実際のメールサンプル入手後に正規表現を調整してください。
 */

// メール種別定数
var MAIL_TYPE = {
  LISTING:         'listing',          // 出品
  BID:             'bid',              // 入札通知
  WINNING:         'winning',          // 終了（落札者あり）
  END_UNSOLD:      'end_unsold',       // 終了（落札者なし）
  CANCELLED:       'cancelled',        // オークション取消
  PAYMENT:         'payment',          // 支払い完了
  SALES_CONFIRMED: 'sales_confirmed',  // 売上確定
  UNKNOWN:         'unknown'
};

/**
 * メール件名からメール種別を判定する
 * @param {string} subject - メール件名
 * @return {string} MAIL_TYPE のいずれか
 */
function classifyMail(subject) {
  if (!subject) return MAIL_TYPE.UNKNOWN;

  // 終了（落札者あり）= 落札通知
  // 例: "Yahoo!オークション - 終了（落札者あり）：商品名"
  if (/終了（落札者あり）|終了\(落札者あり\)|落札されました|ご落札/.test(subject)) {
    return MAIL_TYPE.WINNING;
  }

  // 終了（落札者なし）= 未落札
  // 例: "Yahoo!オークション - 終了（落札者なし）：商品名"
  if (/終了（落札者なし）|終了\(落札者なし\)/.test(subject)) {
    return MAIL_TYPE.END_UNSOLD;
  }

  // 入札通知（入札キャンセルは別途 UNKNOWN として無視）
  // 例: "Yahoo!オークション - 入札がありました"
  //     "Yahoo!オークション - ご入札を受け付けました"
  if (/入札がありました|入札.*ありました|新しい入札|ご入札を受け付け/.test(subject)) {
    return MAIL_TYPE.BID;
  }

  // 出品完了
  // 例: "Yahoo!オークション - 出品：商品名（ID）"
  if (/出品[：:]|出品しました|出品完了|出品が完了/.test(subject)) {
    return MAIL_TYPE.LISTING;
  }

  // オークション取消
  // 例: "Yahoo!オークション - オークションの取り消し：商品名"
  //     "Yahoo!オークション - 再出品のお知らせ" は取消とは違うので除外
  if (/オークションの取り消し|取り消しました/.test(subject)) {
    return MAIL_TYPE.CANCELLED;
  }

  // 支払い完了
  if (/支払いが完了しました|お支払いが完了/.test(subject)) {
    return MAIL_TYPE.PAYMENT;
  }

  // 売上確定
  // 例: "Yahoo!オークション - 売上が確定しました：商品名"
  //     "Yahoo!オークション - 売上が確定しました"
  //     "【Yahoo!オークション】売上確定のお知らせ"
  if (/売上が確定しました|売上確定|売上金の振込/.test(subject)) {
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
  // 新URL形式: auctions.yahoo.co.jp/item/XXXXX
  var newUrlMatch = body.match(/auctions\.yahoo\.co\.jp\/(?:item|auction)\/([a-zA-Z0-9]+)/);
  if (newUrlMatch) return newUrlMatch[1];

  // 旧URL形式: page.auctions.yahoo.co.jp/jp/auction/XXXXX
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

  // 商品名: "商品：商品名" 形式
  var itemName = '';
  var nameMatch = body.match(/商品\s*[：:]\s*(.+?)[\r\n]/);
  if (nameMatch) {
    itemName = nameMatch[1].trim();
  }

  return {
    auctionId: auctionId,
    listedAt:  formatDate(mailDate),
    itemName:  itemName
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

  // 商品名: "商品：商品名" 形式
  var itemName = '';
  var nameMatch = body.match(/商品\s*[：:]\s*(.+?)[\r\n]/);
  if (nameMatch) itemName = nameMatch[1].trim();

  // 落札金額: "落札金額：18,100 円" 形式（ヤフオクは「落札金額」）
  var winningPrice = 0;
  var priceMatch = body.match(/落札金額\s*[：:]\s*([0-9,]+)\s*円/);
  if (priceMatch) {
    winningPrice = parseInt(priceMatch[1].replace(/,/g, ''), 10);
  }

  // 入札件数: "入札件数：13" 形式
  var bidCount = 0;
  var bidMatch = body.match(/入札件数\s*[：:]\s*(\d+)/);
  if (bidMatch) bidCount = parseInt(bidMatch[1], 10);

  // 落札者IDはメール本文に含まれないためスキップ

  return {
    auctionId: auctionId,
    itemName: itemName,
    winningPrice: winningPrice,
    bidCount: bidCount,
    winner: ''
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
