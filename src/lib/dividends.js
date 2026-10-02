/**
 * Cổ tức (Giai đoạn 3) - cùng công thức với stock_record_action trên Postgres:
 *   Tiền mặt: gross = SL × đ/CP; thuế = round(gross × tax_rate); net = gross − thuế
 *   Cổ phiếu (tỉ lệ b:a): CP nhận = floor(SL × a / b); tổng giá vốn giữ nguyên.
 */

export const ACTION_STATUS_LABELS = {
  announced: "Đã công bố",
  recorded: "Đã chốt quyền",
  paid: "Đã thực hiện",
  cancelled: "Đã huỷ",
};

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("vi-VN");

export function actionLabel(a) {
  if (!a) return "";
  if (a.action_type === "CASH") return `Tiền mặt ${fmt(a.cash_per_share)} đ/CP`;
  return `Cổ phiếu tỉ lệ ${a.ratio_from}:${a.ratio_to}`;
}

export function estimateEntitlement(a, qty) {
  const q = Math.max(0, Math.floor(Number(qty) || 0));
  if (!a || q <= 0) return { qty: 0, gross: 0, tax: 0, net: 0, shares: 0 };
  if (a.action_type === "CASH") {
    const gross = Math.round(q * Number(a.cash_per_share || 0));
    const tax = Math.round(gross * Number(a.tax_rate || 0));
    return { qty: q, gross, tax, net: gross - tax, shares: 0 };
  }
  const shares = Math.floor((q * Number(a.ratio_to || 0)) / Number(a.ratio_from || 1));
  return { qty: q, gross: 0, tax: 0, net: 0, shares };
}

/** Giá vốn bình quân sau khi nhận CP cổ tức (tổng giá vốn không đổi). */
export function avgCostAfterStockDividend(qty, totalCost, newShares) {
  const total = (Number(qty) || 0) + (Number(newShares) || 0);
  return total > 0 ? (Number(totalCost) || 0) / total : 0;
}

/** Nhóm theo tháng của ngày khoá (mặc định ngày thực hiện): [{ key: 'MM/YYYY', items }]. */
export function groupByMonth(items, dateKey = "payment_date") {
  const groups = new Map();
  for (const it of items || []) {
    const d = String(it[dateKey] || "");
    const key = d.length >= 7 ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, items: list }));
}

export function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}
