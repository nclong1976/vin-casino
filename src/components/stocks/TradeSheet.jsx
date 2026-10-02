import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Wallet, AlertTriangle, Minus, Plus, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  placeStockOrder,
  placeStockSellOrder,
  newIdempotencyKey,
  stockErrorCode,
  stockErrorMessage,
  STOCK_ERROR_MESSAGES,
} from "@/lib/stockOrders";
import {
  ORDER_TYPE_LABELS,
  SESSION_LABELS,
  allowedOrderTypes,
  estimateCost,
  estimateSell,
  holdAmount,
  maxQty,
  priceColor,
  roundToTick,
  sellQtyFraction,
  stepPrice,
  validateOrder,
} from "@/lib/stockMarket";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("vi-VN");
const BUY = "#10b981";
const SELL = "#ef4444";

/**
 * Bottom sheet đặt lệnh (spec §2.2, §2.5): loại lệnh theo phiên, giá LO theo
 * bước giá trong [Sàn, Trần], khối lượng theo lô.
 *   side = BUY : sức mua, phí, tiền phong toả (place_stock_order).
 *   side = SELL: CP khả dụng (sellable), phí + thuế 0,1%, tiền ròng về ví T+2
 *                (place_stock_sell_order).
 * Server kiểm tra lại toàn bộ.
 */
export default function TradeSheet({ stock, quote, config, session, side = "BUY", sellable = 0, onClose, onPlaced }) {
  const isSell = side === "SELL";
  const navigate = useNavigate();
  const { user } = useAuth();
  const types = allowedOrderTypes(session);
  const [orderType, setOrderType] = useState(types.includes("MP") ? "MP" : "LO");
  const [limitPrice, setLimitPrice] = useState(() => roundToTick(quote?.last_price || 0));
  const [qty, setQty] = useState(() => (isSell ? sellQtyFraction(sellable, 1) || 0 : 100));
  const [loading, setLoading] = useState(false);
  const [userBalance, setUserBalance] = useState(Number(user?.balance || 0));
  // Cùng 1 khoá cho mọi lần bấm của 1 lệnh => bấm đúp/gửi lại không khớp 2 lần.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    let alive = true;
    (async () => {
      const me = user || (await base44.auth.me().catch(() => null));
      if (alive && me) setUserBalance(Number(me.balance || 0));
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  // Phiên đổi khi đang mở sheet: bỏ loại lệnh không còn hợp lệ.
  useEffect(() => {
    if (!types.includes(orderType)) setOrderType(types[0]);
  }, [session]);

  const feeRate = Number(config?.fee_rate) || 0;
  const lotSize = Number(config?.lot_size) || 100;
  const taxRate = Number(config?.sell_tax_rate) || 0;
  const params = { orderType, qty, limitPrice, quote, feeRate };
  const hold = isSell ? 0 : holdAmount(params);
  const est = estimateCost(params);
  const sellEst = estimateSell({ ...params, taxRate });
  const maxBuy = maxQty({ balance: userBalance, orderType, limitPrice, quote, feeRate, lotSize });
  const invalid = quote
    ? validateOrder({ orderType, qty, limitPrice, quote, session, lotSize, side, sellable })
    : "PRICE_UNAVAILABLE";
  const short = !isSell && userBalance < hold;
  const accent = isSell ? SELL : BUY;

  if (!stock) return null;

  const handleOrder = async () => {
    if (!stock.id) {
      toast.error("Mã này chưa mở giao dịch.");
      return;
    }
    if (invalid) {
      toast.error(STOCK_ERROR_MESSAGES[invalid] || "Lệnh không hợp lệ.");
      return;
    }
    if (short) {
      toast.warning(`Sức mua ${fmt(userBalance)} đ không đủ ${fmt(hold)} đ. Đang chuyển đến trang Nạp tiền...`);
      onClose?.();
      navigate("/profile?deposit=true");
      return;
    }

    setLoading(true);
    try {
      const place = isSell ? placeStockSellOrder : placeStockOrder;
      const result = await place({ projectId: stock.id, orderType, qty, limitPrice, idempotencyKey });
      if (result?.balance != null) setUserBalance(Number(result.balance));
      setIdempotencyKey(newIdempotencyKey());
      window.dispatchEvent(new Event("vinclub:balance_updated"));
      const o = result?.order || {};
      const verb = isSell ? "bán" : "mua";
      if (o.status === "filled") {
        toast.success(
          `Đã khớp ${verb} ${fmt(o.qty)} CP ${o.symbol} giá ${fmt(o.price)} đ. ` +
            (isSell ? "Tiền bán về ví sau T+2." : "Cổ phiếu về tài khoản sau T+2.")
        );
      } else {
        toast.success(
          `Đã đặt lệnh ${o.order_type} ${verb} ${fmt(o.qty)} CP ${o.symbol}` +
            (o.limit_price ? ` giá ${fmt(o.limit_price)} đ` : "") +
            " - đang chờ khớp." +
            (isSell ? "" : ` Đã phong toả ${fmt(o.hold_amount)} đ.`)
        );
      }
      onPlaced?.(o);
      onClose();
    } catch (e) {
      if (stockErrorCode(e) === "INSUFFICIENT_BUYING_POWER") toast.warning(stockErrorMessage(e));
      else toast.error(stockErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const last = Number(quote?.last_price) || 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center font-heading"
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[480px] max-h-[92vh] overflow-y-auto bg-[#151b24] rounded-t-3xl p-5 pb-8 border-t border-[#d4af37]/30"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[15px] font-bold text-white">
                {isSell ? "Bán" : "Mua"} {stock.symbol}{" "}
                <span className="font-mono" style={{ color: priceColor(last, quote) }}>
                  {fmt(last)}
                </span>
              </p>
              <p className="text-[11px] text-gray-400">{stock.name}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full bg-white/5 cursor-pointer">
              <X className="w-4 h-4 text-gray-300" />
            </button>
          </div>

          {quote && (
            <div className="grid grid-cols-3 gap-1.5 mb-3 text-center">
              {[
                ["Trần", quote.ceiling_price, "#a855f7"],
                ["TC", quote.reference_price, "#d4af37"],
                ["Sàn", quote.floor_price, "#22d3ee"],
              ].map(([label, v, c]) => (
                <div key={label} className="rounded-lg bg-[#0d1117] py-1.5">
                  <p className="text-[9px] text-gray-500">{label}</p>
                  <p className="text-[12px] font-bold font-mono" style={{ color: c }}>
                    {fmt(v)}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[10.5px] text-gray-400 mb-3">
            <Clock className="w-3 h-3" /> {SESSION_LABELS[session] || session}
            {session === "CLOSED" || session === "PRE_OPEN" ? " · lệnh sẽ vào phiên giao dịch kế tiếp" : ""}
          </div>

          {/* Loại lệnh */}
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#0d1117] mb-1.5">
            {["LO", "MP", "ATO", "ATC"].map((t) => {
              const ok = types.includes(t);
              return (
                <button
                  key={t}
                  disabled={!ok}
                  onClick={() => setOrderType(t)}
                  className={`py-1.5 rounded-lg text-[12px] font-bold transition-colors ${
                    orderType === t ? "text-white" : ok ? "text-gray-300 cursor-pointer" : "text-gray-600 cursor-not-allowed"
                  }`}
                  style={orderType === t ? { backgroundColor: accent } : undefined}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-500 mb-3">{ORDER_TYPE_LABELS[orderType]}</p>

          {/* Giá (LO) */}
          {orderType === "LO" ? (
            <>
              <p className="text-[11px] text-gray-400 mb-1.5">Giá đặt (đ)</p>
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => setLimitPrice((p) => stepPrice(p, -1, quote))}
                  className="w-10 h-10 rounded-lg bg-[#1f2937] text-gray-200 flex items-center justify-center cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(Number(e.target.value) || 0)}
                  onBlur={() => setLimitPrice((p) => roundToTick(p))}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-[#0d1117] border border-[#222c38] text-white text-[14px] text-center outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  onClick={() => setLimitPrice((p) => stepPrice(p, 1, quote))}
                  className="w-10 h-10 rounded-lg bg-[#1f2937] text-gray-200 flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-baseline justify-between p-3 rounded-xl bg-[#0d1117] mb-3">
              <span className="text-[11px] text-gray-400">
                {orderType === "MP" ? "Khớp ngay theo giá thị trường" : orderType === "ATO" ? "Khớp lúc 09:15 theo giá mở cửa" : "Khớp lúc 14:45 theo giá đóng cửa"}
              </span>
              <span className="text-[13px] font-bold font-mono text-white">≈ {fmt(last)}</span>
            </div>
          )}

          {/* Khối lượng */}
          <p className="text-[11px] text-gray-400 mb-1.5">Khối lượng (cổ phiếu)</p>
          <div className="flex items-center gap-1.5 mb-2">
            {(isSell
              ? [
                  ["25%", sellQtyFraction(sellable, 0.25, lotSize)],
                  ["50%", sellQtyFraction(sellable, 0.5, lotSize)],
                  ["Tất cả", sellQtyFraction(sellable, 1, lotSize)],
                ]
              : [
                  ["100", 100],
                  ["500", 500],
                  ["1.000", 1000],
                  ["Tối đa", maxBuy],
                ]
            ).map(([label, n]) => (
              <button
                key={label}
                disabled={!(n > 0)}
                onClick={() => setQty(n)}
                className={`flex-1 py-2 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-40 ${
                  qty === n && n > 0 ? "text-white font-bold" : "bg-[#1f2937] text-gray-300"
                }`}
                style={qty === n && n > 0 ? { backgroundColor: accent } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="number"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="w-full px-3 py-2.5 rounded-lg bg-[#0d1117] border border-[#222c38] text-white text-[13px] outline-none focus:border-[#d4af37] font-mono"
          />

          {/* Sức mua / cổ phiếu khả dụng & tổng */}
          {isSell ? (
            <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3 space-y-1.5 text-[11.5px]">
              <div className="flex justify-between text-gray-300">
                <span className="text-amber-300">CP khả dụng để bán</span>
                <span className="font-mono font-bold text-white">{fmt(sellable)} CP</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Giá trị bán{orderType === "LO" ? "" : " (ước tính)"}</span>
                <span className="font-mono">{fmt(sellEst.value)} đ</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Phí giao dịch ({(feeRate * 100).toLocaleString("vi-VN", { maximumFractionDigits: 3 })}%)</span>
                <span className="font-mono">-{fmt(sellEst.fee)} đ</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Thuế TNCN ({(taxRate * 100).toLocaleString("vi-VN", { maximumFractionDigits: 3 })}%)</span>
                <span className="font-mono">-{fmt(sellEst.tax)} đ</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-white/10">
                <span className="text-gray-300">Tiền về ví (T+2)</span>
                <span className="font-mono font-bold text-white text-[14px]">{fmt(sellEst.net)} đ</span>
              </div>
              <p className="text-[9.5px] text-gray-500">Cổ phiếu được giữ cho lệnh đến khi khớp, huỷ hoặc hết phiên.</p>
            </div>
          ) : (
            <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3 space-y-1.5 text-[11.5px]">
              <div className="flex justify-between text-gray-300">
                <span className="flex items-center gap-1.5 text-amber-300">
                  <Wallet className="w-3.5 h-3.5" /> Sức mua
                </span>
                <span className="font-mono font-bold text-white">
                  {fmt(userBalance)} đ · tối đa {fmt(maxBuy)} CP
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Giá trị lệnh{orderType === "LO" ? "" : " (ước tính)"}</span>
                <span className="font-mono">{fmt(est.value)} đ</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Phí giao dịch ({(feeRate * 100).toLocaleString("vi-VN", { maximumFractionDigits: 3 })}%)</span>
                <span className="font-mono">{fmt(est.fee)} đ</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-white/10">
                <span className="text-gray-300">Tiền phong toả</span>
                <span className="font-mono font-bold text-white text-[14px]">{fmt(hold)} đ</span>
              </div>
              {orderType !== "LO" && (
                <p className="text-[9.5px] text-gray-500">
                  Lệnh {orderType} phong toả theo giá trần; phần chênh được hoàn ngay khi khớp.
                </p>
              )}
            </div>
          )}

          {invalid && invalid !== "PRICE_UNAVAILABLE" && (
            <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[10.5px] text-red-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{STOCK_ERROR_MESSAGES[invalid]}</span>
            </div>
          )}
          {!invalid && short && (
            <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10.5px] text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>Sức mua không đủ. Khi bấm đặt lệnh sẽ chuyển đến Nạp tiền.</span>
            </div>
          )}

          <button
            disabled={loading || (!!invalid && !short)}
            onClick={handleOrder}
            className="w-full mt-4 py-3 rounded-xl text-[14px] font-extrabold text-white active:scale-[0.98] transition-transform cursor-pointer shadow-lg uppercase tracking-wider disabled:opacity-50"
            style={{ backgroundColor: short && !invalid ? "#d4af37" : accent }}
          >
            {loading
              ? "Đang xử lý lệnh..."
              : short && !invalid
                ? "Nạp tiền để đặt lệnh"
                : `Xác nhận ${isSell ? "bán" : "mua"} ${orderType}`}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
