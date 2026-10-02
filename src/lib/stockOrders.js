import { supabase } from "@/lib/supabase";

/**
 * Lệnh cổ phiếu (Giai đoạn 0 - docs/design/stock-investment-spec.md).
 * Trừ ví, ghi lệnh và cộng nắm giữ đều chạy trong RPC place_stock_order trên
 * Postgres - trình duyệt không tự trừ tiền nữa.
 */

export const STOCK_ERROR_MESSAGES = {
  INSUFFICIENT_BUYING_POWER: "Số dư ví không đủ để đặt lệnh.",
  SYMBOL_HALTED: "Mã cổ phiếu đang tạm khoá giao dịch.",
  SYMBOL_NOT_FOUND: "Không tìm thấy mã cổ phiếu.",
  PRICE_UNAVAILABLE: "Mã chưa có giá giao dịch.",
  INVALID_QTY: "Khối lượng không hợp lệ.",
  ACCOUNT_LOCKED: "Tài khoản đang bị khoá.",
  NOT_AUTHENTICATED: "Vui lòng đăng nhập để đặt lệnh.",
  NOT_AUTHORIZED: "Bạn không có quyền thực hiện thao tác này.",
  USER_NOT_FOUND: "Không tìm thấy tài khoản nhà đầu tư.",
  INVALID_ORDER_TYPE: "Loại lệnh không hợp lệ.",
  ORDER_TYPE_NOT_ALLOWED_IN_SESSION: "Loại lệnh này không được đặt trong phiên hiện tại.",
  INVALID_LOT: "Khối lượng phải là bội số 100 (lô lẻ 1–99 chỉ dùng lệnh LO).",
  PRICE_OUT_OF_BAND: "Giá đặt phải nằm trong khoảng Sàn – Trần.",
  INVALID_TICK_SIZE: "Giá đặt không đúng bước giá.",
  ORDER_NOT_FOUND: "Không tìm thấy lệnh.",
  ORDER_NOT_CANCELLABLE: "Lệnh không còn ở trạng thái chờ khớp.",
  CANCEL_NOT_ALLOWED_IN_SESSION: "Không được huỷ lệnh trong phiên ATO / ATC.",
  INVALID_PRICE: "Giá không hợp lệ.",
};

export function stockErrorCode(error) {
  const msg = String(error?.message || error || "");
  return Object.keys(STOCK_ERROR_MESSAGES).find((code) => msg.includes(code)) || null;
}

export function stockErrorMessage(error, fallback = "Không thể thực hiện lệnh, vui lòng thử lại!") {
  const code = stockErrorCode(error);
  return code ? STOCK_ERROR_MESSAGES[code] : fallback;
}

export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

/**
 * Đặt lệnh mua LO / MP / ATO / ATC. Server phong toả tiền và (nếu đủ điều
 * kiện) khớp ngay. Trả { order, balance, duplicate, session }; lỗi => throw.
 */
export function placeStockOrder({ projectId, orderType = "MP", qty, limitPrice, idempotencyKey }) {
  return rpc("place_stock_order", {
    p_project_id: projectId,
    p_order_type: orderType,
    p_qty: qty,
    p_limit_price: orderType === "LO" ? limitPrice : null,
    p_idempotency_key: idempotencyKey || null,
  });
}

/** Huỷ lệnh chờ khớp - hoàn đủ tiền phong toả. */
export function cancelStockOrder(orderId) {
  return rpc("cancel_stock_order", { p_order_id: orderId });
}

export function adminSetStockPrice(symbol, price) {
  return rpc("admin_set_stock_price", { p_symbol: symbol, p_price: price });
}

export function adminResetStockReference(symbol, price) {
  return rpc("admin_reset_stock_reference", { p_symbol: symbol, p_price: price });
}

export function adminSetStockConfig({ feeRate, priceBandPct }) {
  return rpc("admin_set_stock_config", { p_fee_rate: feeRate ?? null, p_price_band_pct: priceBandPct ?? null });
}

/** Admin cấp lệnh cho khách (có thể trừ ví hoặc chỉ ghi nhận cổ phần). */
export function adminCreateStockOrder({ userId, projectId, qty, chargeWallet, note }) {
  return rpc("admin_create_stock_order", {
    p_user_id: userId,
    p_project_id: projectId,
    p_qty: qty,
    p_charge_wallet: !!chargeWallet,
    p_note: note || null,
  });
}

/**
 * Gộp nắm giữ với giá hiện tại. prices: { [symbol]: number }.
 * Trả { rows, totalCost, marketValue, pnl, pnlPct }.
 */
export function summarizePositions(positions, prices) {
  const rows = (positions || [])
    .filter((p) => Number(p.qty) > 0)
    .map((p) => {
      const qty = Number(p.qty) || 0;
      const pending = Math.min(qty, Number(p.qty_pending) || 0);
      const cost = Number(p.total_cost) || 0;
      const price = Number(prices?.[p.symbol]);
      const hasPrice = Number.isFinite(price) && price > 0;
      const value = hasPrice ? price * qty : cost;
      return {
        symbol: p.symbol,
        projectId: p.project_id,
        qty,
        qtyPending: pending,
        qtyAvailable: qty - pending,
        avgCost: qty > 0 ? cost / qty : 0,
        cost,
        price: hasPrice ? price : null,
        value,
        pnl: value - cost,
        pnlPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
      };
    })
    .sort((a, b) => b.value - a.value);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const marketValue = rows.reduce((s, r) => s + r.value, 0);
  return {
    rows,
    totalCost,
    marketValue,
    pnl: marketValue - totalCost,
    pnlPct: totalCost > 0 ? ((marketValue - totalCost) / totalCost) * 100 : 0,
  };
}
