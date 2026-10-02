// Dữ liệu biểu đồ giá cổ phiếu từ stock_price_ticks (mỗi lần giá đổi một
// dòng). Giá đứng yên giữa hai lần đổi nên vẽ dạng bậc thang.

const HOUR = 3600000;

/** Thời điểm (ms) của giờ hh:mm theo giờ Việt Nam (UTC+7) trong ngày dateStr. */
export function vnTime(dateStr, hh, mm = 0) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - 7 * HOUR;
}

/**
 * Chuỗi điểm { t, p } tăng dần theo thời gian:
 *  - startPrice (nếu có) đặt ở mốc `from` - giá tại đầu kỳ;
 *  - các tick trong kỳ;
 *  - lastPrice (nếu có) ở mốc `now` - giá hiện tại.
 */
export function buildSeries({ ticks = [], from, now = Date.now(), startPrice, lastPrice }) {
  const pts = ticks
    .map((x) => ({ t: new Date(x.ts).getTime(), p: Number(x.price) }))
    .filter((x) => Number.isFinite(x.t) && x.p > 0 && (from == null || x.t >= from) && x.t <= now)
    .sort((a, b) => a.t - b.t);
  const start = Number(startPrice);
  if (from != null && start > 0 && !(pts[0]?.t <= from)) pts.unshift({ t: from, p: start });
  const last = Number(lastPrice);
  if (last > 0 && (pts.length === 0 || pts[pts.length - 1].t < now)) pts.push({ t: now, p: last });
  return pts;
}

/** Tóm tắt kỳ: giá đầu / cuối, chênh lệch, %, cao nhất, thấp nhất. */
export function seriesStats(series) {
  if (!series?.length) return null;
  const start = series[0].p;
  const end = series[series.length - 1].p;
  let high = series[0];
  let low = series[0];
  for (const x of series) {
    if (x.p > high.p) high = x;
    if (x.p < low.p) low = x;
  }
  const change = end - start;
  return {
    start,
    end,
    change,
    pct: start > 0 ? Math.round((change / start) * 10000) / 100 : 0,
    high: high.p,
    low: low.p,
    flat: high.p === low.p,
  };
}

/** Màu theo hướng: tăng xanh, giảm đỏ, đứng giá vàng (thông lệ bảng điện VN). */
export function trendColor(change) {
  if (change > 0) return "#10b981";
  if (change < 0) return "#ef4444";
  return "#d4af37";
}

/**
 * Chuỗi trong ngày: bắt đầu từ giá tham chiếu lúc 9:00, tới giá hiện tại.
 * Trước 9:00 phiên chưa mở - trả mảng rỗng.
 */
export function intradaySeries({ ticks, quote, dateStr, now = Date.now() }) {
  const open = vnTime(dateStr, 9);
  if (now < open) return [];
  return buildSeries({
    ticks,
    from: open,
    now,
    startPrice: quote?.reference_price,
    lastPrice: quote?.last_price,
  });
}
