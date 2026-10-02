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

/** Đặt lệnh mua MP. Trả { order, balance, duplicate }; lỗi => throw. */
export async function placeStockOrder({ projectId, qty, idempotencyKey }) {
  const { data, error } = await supabase.rpc("place_stock_order", {
    p_project_id: projectId,
    p_qty: qty,
    p_idempotency_key: idempotencyKey || null,
  });
  if (error) throw error;
  return data;
}

/** Admin cấp lệnh cho khách (có thể trừ ví hoặc chỉ ghi nhận cổ phần). */
export async function adminCreateStockOrder({ userId, projectId, qty, chargeWallet, note }) {
  const { data, error } = await supabase.rpc("admin_create_stock_order", {
    p_user_id: userId,
    p_project_id: projectId,
    p_qty: qty,
    p_charge_wallet: !!chargeWallet,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
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
      const cost = Number(p.total_cost) || 0;
      const price = Number(prices?.[p.symbol]);
      const hasPrice = Number.isFinite(price) && price > 0;
      const value = hasPrice ? price * qty : cost;
      return {
        symbol: p.symbol,
        projectId: p.project_id,
        qty,
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
