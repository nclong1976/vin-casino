/**
 * Quy tắc thị trường phía giao diện (Giai đoạn 1) - cùng luật với các hàm
 * Postgres stock_session / stock_tick_size / place_stock_order. Server luôn
 * kiểm tra lại; ở đây chỉ để hiển thị và chặn sớm lỗi nhập liệu.
 */

export const ORDER_TYPES = ["LO", "MP", "ATO", "ATC"];

export const ORDER_TYPE_LABELS = {
  LO: "Lệnh giới hạn",
  MP: "Lệnh thị trường",
  ATO: "Giá mở cửa",
  ATC: "Giá đóng cửa",
};

export const SESSION_LABELS = {
  PRE_OPEN: "Chờ mở cửa",
  ATO: "Phiên mở cửa (ATO)",
  CONT: "Khớp lệnh liên tục",
  BREAK: "Nghỉ trưa",
  ATC: "Phiên đóng cửa (ATC)",
  CLOSED: "Đóng cửa",
};

export const STATUS_LABELS = {
  pending: "Chờ khớp",
  filled: "Đã khớp",
  cancelled: "Đã huỷ",
  expired: "Hết hiệu lực",
  rejected: "Từ chối",
};

const ALLOWED = {
  PRE_OPEN: ["LO", "ATO"],
  CLOSED: ["LO", "ATO"],
  ATO: ["LO", "ATO"],
  CONT: ["LO", "MP"],
  BREAK: ["LO"],
  ATC: ["LO", "ATC"],
};

/** { date: 'YYYY-MM-DD', minutes } theo giờ Việt Nam. */
export function vnClock(at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** calendar: { 'YYYY-MM-DD': boolean } - ngày nghỉ lễ / làm bù (stock_market_calendar). */
export function isTradingDay(dateStr, calendar = {}) {
  if (Object.prototype.hasOwnProperty.call(calendar, dateStr)) return !!calendar[dateStr];
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow >= 1 && dow <= 5;
}

export function sessionAt(at = new Date(), calendar = {}) {
  const { date, minutes } = vnClock(at);
  if (!isTradingDay(date, calendar)) return "CLOSED";
  if (minutes < 9 * 60) return "PRE_OPEN";
  if (minutes < 9 * 60 + 15) return "ATO";
  if (minutes < 11 * 60 + 30) return "CONT";
  if (minutes < 13 * 60) return "BREAK";
  if (minutes < 14 * 60 + 30) return "CONT";
  if (minutes < 14 * 60 + 45) return "ATC";
  return "CLOSED";
}

export function allowedOrderTypes(session) {
  return ALLOWED[session] || ["LO"];
}

export function tickSize(price) {
  const p = Number(price) || 0;
  if (p < 10000) return 10;
  if (p < 50000) return 50;
  return 100;
}

export function roundToTick(price) {
  const p = Number(price) || 0;
  const t = tickSize(p);
  return Math.round(p / t) * t;
}

export function isValidTick(price) {
  const p = Number(price);
  return Number.isFinite(p) && p > 0 && p % tickSize(p) === 0;
}

/** Bước giá kế tiếp lên / xuống (dir = +1 / -1), giữ trong [floor, ceiling]. */
export function stepPrice(price, dir, quote) {
  const p = roundToTick(price);
  const next = dir > 0 ? p + tickSize(p) : p - tickSize(p - 1);
  const lo = Number(quote?.floor_price) || 0;
  const hi = Number(quote?.ceiling_price) || Infinity;
  return Math.min(hi, Math.max(lo, next));
}

/** Giá dùng để phong toả: LO = giá đặt; MP/ATO/ATC = max(Trần, giá hiện tại). */
export function holdUnitPrice(orderType, limitPrice, quote) {
  if (orderType === "LO") return Number(limitPrice) || 0;
  return Math.max(Number(quote?.ceiling_price) || 0, Number(quote?.last_price) || 0);
}

export function holdAmount({ orderType, qty, limitPrice, quote, feeRate }) {
  const unit = holdUnitPrice(orderType, limitPrice, quote);
  return Math.ceil(unit * (Number(qty) || 0) * (1 + (Number(feeRate) || 0)));
}

/** Giá trị + phí ước tính khi khớp (MP ước theo giá hiện tại). */
export function estimateCost({ orderType, qty, limitPrice, quote, feeRate }) {
  const price = orderType === "LO" ? Number(limitPrice) || 0 : Number(quote?.last_price) || 0;
  const value = Math.round(price * (Number(qty) || 0));
  const fee = Math.round(value * (Number(feeRate) || 0));
  return { price, value, fee, total: value + fee };
}

/** Bán: giá trị, phí, thuế TNCN, tiền ròng về ví (T+2). */
export function estimateSell({ orderType, qty, limitPrice, quote, feeRate, taxRate }) {
  const price = orderType === "LO" ? Number(limitPrice) || 0 : Number(quote?.last_price) || 0;
  const value = Math.round(price * (Number(qty) || 0));
  const fee = Math.round(value * (Number(feeRate) || 0));
  const tax = Math.round(value * (Number(taxRate) || 0));
  return { price, value, fee, tax, net: value - fee - tax };
}

/**
 * Khối lượng bán theo tỉ lệ (25/50/100%) - làm tròn xuống lô 100. Khi không
 * còn đủ 1 lô, 100% trả về phần lẻ (< 100 CP, chỉ bán được bằng lệnh LO).
 */
export function sellQtyFraction(sellable, fraction, lotSize = 100) {
  const s = Math.floor(Number(sellable) || 0);
  const lots = Math.floor((s * fraction) / lotSize) * lotSize;
  if (lots > 0) return lots;
  return fraction >= 1 ? s % lotSize : 0;
}

export function maxQty({ balance, orderType, limitPrice, quote, feeRate, lotSize = 100 }) {
  const unit = holdUnitPrice(orderType, limitPrice, quote) * (1 + (Number(feeRate) || 0));
  if (!(unit > 0)) return 0;
  const raw = Math.floor((Number(balance) || 0) / unit);
  return Math.floor(raw / lotSize) * lotSize;
}

/** Trả mã lỗi (giống server) hoặc null nếu hợp lệ. */
export function validateOrder({ orderType, qty, limitPrice, quote, session, lotSize = 100, side = "BUY", sellable }) {
  if (!allowedOrderTypes(session).includes(orderType)) return "ORDER_TYPE_NOT_ALLOWED_IN_SESSION";
  const q = Number(qty);
  if (!Number.isInteger(q) || q <= 0 || q > 10000000) return "INVALID_LOT";
  if (q % lotSize !== 0 && !(orderType === "LO" && q < lotSize)) return "INVALID_LOT";
  if (side === "SELL" && q > (Number(sellable) || 0)) return "INSUFFICIENT_SHARES";
  if (orderType === "LO") {
    const p = Number(limitPrice);
    if (!(p >= Number(quote?.floor_price)) || !(p <= Number(quote?.ceiling_price))) return "PRICE_OUT_OF_BAND";
    if (!isValidTick(p)) return "INVALID_TICK_SIZE";
  }
  return null;
}

/** Màu theo thông lệ bảng điện: trần tím, sàn xanh lơ, TC vàng, tăng xanh, giảm đỏ. */
export function priceColor(price, quote) {
  const p = Number(price);
  if (!quote || !Number.isFinite(p)) return "#e5e7eb";
  if (p >= Number(quote.ceiling_price)) return "#a855f7";
  if (p <= Number(quote.floor_price)) return "#22d3ee";
  const ref = Number(quote.reference_price);
  if (p > ref) return "#10b981";
  if (p < ref) return "#ef4444";
  return "#d4af37";
}

export function changePct(quote) {
  const ref = Number(quote?.reference_price);
  const last = Number(quote?.last_price);
  if (!(ref > 0) || !(last > 0)) return 0;
  return Math.round((last / ref - 1) * 10000) / 100;
}

// ───────────── Chế độ đơn giản cho người mới ─────────────

const DOW = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Cộng n ngày giao dịch (bỏ cuối tuần / ngày nghỉ) - giống stock_add_trading_days. */
export function addTradingDays(dateStr, n, calendar = {}) {
  let d = dateStr;
  let k = 0;
  while (k < n) {
    d = shiftDate(d, 1);
    if (isTradingDay(d, calendar)) k += 1;
  }
  return d;
}

/** Ngày giao dịch mà lệnh đặt lúc `at` thuộc về (ngoài giờ => phiên kế tiếp). */
export function orderTradeDate(at = new Date(), calendar = {}) {
  const { date } = vnClock(at);
  return sessionAt(at, calendar) === "CLOSED" ? addTradingDays(date, 1, calendar) : date;
}

/** "Thứ Hai 05/10" */
export function friendlyDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DOW[dow]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/**
 * Loại lệnh chế độ đơn giản: đang khớp liên tục => MP (khớp ngay theo giá thị
 * trường); ngoài giờ / nghỉ trưa / phiên định kỳ => LO tại giá hiện tại (chờ
 * thị trường mở). Người dùng không cần biết LO/MP/ATO/ATC.
 */
export function simpleOrderType(session) {
  return session === "CONT" ? "MP" : "LO";
}

/** Câu giải thích phiên hiện tại bằng lời thường. */
export function sessionHint(session, at = new Date(), calendar = {}) {
  if (session === "CONT") return "Thị trường đang mở — lệnh của bạn được khớp ngay.";
  if (session === "ATO") return "Phiên mở cửa — lệnh sẽ được khớp lúc 09:15.";
  if (session === "ATC") return "Phiên đóng cửa — lệnh sẽ được khớp lúc 14:45.";
  if (session === "BREAK") return "Nghỉ trưa — lệnh sẽ được khớp khi thị trường mở lại lúc 13:00.";
  if (session === "PRE_OPEN") return "Thị trường chưa mở — lệnh sẽ được khớp từ 09:00 hôm nay.";
  return `Thị trường đã đóng cửa — lệnh sẽ được khớp khi mở cửa ${friendlyDate(orderTradeDate(at, calendar))} (09:00).`;
}

/** Số CP mua được với số tiền `amount` (gồm phí), làm tròn xuống lô. */
export function qtyForAmount({ amount, orderType, limitPrice, quote, feeRate, lotSize = 100 }) {
  return maxQty({ balance: amount, orderType, limitPrice, quote, feeRate, lotSize });
}
