import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Wallet, AlertTriangle, Minus, Plus, Clock, ChevronDown, CalendarCheck, HelpCircle } from "lucide-react";
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
  allowedOrderTypes,
  addTradingDays,
  estimateCost,
  estimateSell,
  friendlyDate,
  holdAmount,
  maxQty,
  orderTradeDate,
  priceColor,
  qtyForAmount,
  roundToTick,
  sellQtyFraction,
  sessionHint,
  simpleOrderType,
  stepPrice,
  validateOrder,
} from "@/lib/stockMarket";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("vi-VN");
const BUY = "#10b981";
const SELL = "#ef4444";
const AMOUNT_PRESETS = [5000000, 10000000, 50000000];

/** Giá hiện tại kẹp trong Sàn–Trần, đúng bước giá (giá đặt mặc định). */
function defaultLimit(quote) {
  const p = roundToTick(quote?.last_price || 0);
  if (!quote) return p;
  return Math.min(Number(quote.ceiling_price), Math.max(Number(quote.floor_price), p));
}

/**
 * Sheet Mua / Bán.
 *  - Mặc định CHẾ ĐỘ ĐƠN GIẢN cho người mới: mua theo số tiền muốn đầu tư, bán
 *    theo số cổ phiếu; ứng dụng tự chọn loại lệnh (đang mở cửa: khớp ngay theo
 *    giá thị trường; ngoài giờ: đặt ở giá hiện tại và chờ phiên tới) và nói rõ
 *    trả bao nhiêu / nhận bao nhiêu / ngày nào cổ phiếu hoặc tiền về.
 *  - "Tuỳ chọn nâng cao": tự chọn LO / MP / ATO / ATC, giá đặt, khối lượng.
 * Server (place_stock_order / place_stock_sell_order) kiểm tra lại toàn bộ.
 */
export default function TradeSheet({
  stock,
  quote,
  config,
  session,
  calendar,
  side = "BUY",
  sellable = 0,
  avgCost = 0,
  onClose,
  onPlaced,
  onHelp,
}) {
  const isSell = side === "SELL";
  const navigate = useNavigate();
  const { user } = useAuth();
  const types = allowedOrderTypes(session);
  const [advanced, setAdvanced] = useState(false);
  const [advType, setAdvType] = useState(types.includes("MP") ? "MP" : "LO");
  const [limitPrice, setLimitPrice] = useState(() => defaultLimit(quote));
  const [amount, setAmount] = useState(10000000);
  const [qtyInput, setQtyInput] = useState(() => (isSell ? sellQtyFraction(sellable, 1) || 0 : 100));
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
    if (!types.includes(advType)) setAdvType(types[0]);
  }, [session]);

  const feeRate = Number(config?.fee_rate) || 0;
  const lotSize = Number(config?.lot_size) || 100;
  const taxRate = Number(config?.sell_tax_rate) || 0;

  // Chế độ đơn giản: loại lệnh + giá do ứng dụng chọn.
  // Bán lô lẻ (< 100 CP, VD cổ phiếu từ DRIP) chỉ đặt được bằng lệnh LO.
  const orderType = advanced
    ? advType
    : isSell && qtyInput > 0 && qtyInput < lotSize
      ? "LO"
      : simpleOrderType(session);
  const effLimit = advanced ? limitPrice : defaultLimit(quote);
  const qty = !advanced && !isSell ? qtyForAmount({ amount, orderType, limitPrice: effLimit, quote, feeRate, lotSize }) : qtyInput;

  const params = { orderType, qty, limitPrice: effLimit, quote, feeRate };
  const hold = isSell ? 0 : holdAmount(params);
  const est = estimateCost(params);
  const sellEst = estimateSell({ ...params, taxRate });
  const maxBuy = maxQty({ balance: userBalance, orderType, limitPrice: effLimit, quote, feeRate, lotSize });
  const invalid = quote
    ? validateOrder({ orderType, qty, limitPrice: effLimit, quote, session, lotSize, side, sellable })
    : "PRICE_UNAVAILABLE";
  const short = !isSell && userBalance < hold;
  const accent = isSell ? SELL : BUY;
  const last = Number(quote?.last_price) || 0;
  const tradeDate = orderTradeDate(new Date(), calendar);
  const settleDate = addTradingDays(tradeDate, 2, calendar);
  const minLotCost = Math.ceil(holdAmount({ ...params, qty: lotSize }));
  const salePnl = isSell && avgCost > 0 ? sellEst.net - avgCost * qty : null;

  if (!stock) return null;

  const handleOrder = async () => {
    if (!stock.id) {
      toast.error("Mã này chưa mở giao dịch.");
      return;
    }
    if (short && !invalid) {
      toast.warning(`Số dư ${fmt(userBalance)} đ chưa đủ ${fmt(hold)} đ. Đang chuyển đến trang Nạp tiền...`);
      onClose?.();
      navigate("/profile?deposit=true");
      return;
    }
    if (invalid) {
      toast.error(STOCK_ERROR_MESSAGES[invalid] || "Lệnh không hợp lệ.");
      return;
    }

    setLoading(true);
    try {
      const place = isSell ? placeStockSellOrder : placeStockOrder;
      const result = await place({ projectId: stock.id, orderType, qty, limitPrice: effLimit, idempotencyKey });
      if (result?.balance != null) setUserBalance(Number(result.balance));
      setIdempotencyKey(newIdempotencyKey());
      window.dispatchEvent(new Event("vinclub:balance_updated"));
      const o = result?.order || {};
      const verb = isSell ? "bán" : "mua";
      if (o.status === "filled") {
        toast.success(
          `Đã ${verb} ${fmt(o.qty)} cổ phiếu ${o.symbol} giá ${fmt(o.price)} đ. ` +
            (isSell ? `Tiền về ví ${friendlyDate(settleDate)}.` : `Cổ phiếu về tài khoản ${friendlyDate(settleDate)}.`)
        );
      } else {
        toast.success(
          `Đã đặt lệnh ${verb} ${fmt(o.qty)} cổ phiếu ${o.symbol}` +
            (o.limit_price ? ` giá ${fmt(o.limit_price)} đ` : "") +
            ". Lệnh đang chờ khớp — xem ở tab Lệnh, có thể huỷ bất cứ lúc nào trước khi khớp."
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

  const Row = ({ label, value, strong, tone }) => (
    <div className={`flex justify-between ${strong ? "pt-1.5 border-t border-white/10" : ""}`}>
      <span className={strong ? "text-gray-200" : "text-gray-400"}>{label}</span>
      <span className={`font-mono ${strong ? "font-bold text-white text-[14px]" : ""}`} style={tone ? { color: tone } : undefined}>
        {value}
      </span>
    </div>
  );

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
          {/* Đầu: mã, giá, khoảng giá trong ngày */}
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[16px] font-bold text-white">
                {isSell ? "Bán" : "Mua"} {stock.symbol}{" "}
                <span className="font-mono" style={{ color: priceColor(last, quote) }}>
                  {fmt(last)} đ
                </span>
              </p>
              <p className="text-[11px] text-gray-400">{stock.name}</p>
              {quote && (
                <p className="text-[10.5px] text-gray-500 mt-0.5">
                  Hôm nay giá được phép từ <span className="text-[#22d3ee] font-mono">{fmt(quote.floor_price)}</span> đến{" "}
                  <span className="text-[#a855f7] font-mono">{fmt(quote.ceiling_price)}</span> đ
                </p>
              )}
            </div>
            <div className="flex gap-1">
              {onHelp && (
                <button onClick={onHelp} className="p-1.5 rounded-full bg-white/5 cursor-pointer" aria-label="Hướng dẫn">
                  <HelpCircle className="w-4 h-4 text-gray-300" />
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-full bg-white/5 cursor-pointer" aria-label="Đóng">
                <X className="w-4 h-4 text-gray-300" />
              </button>
            </div>
          </div>

          <div className="flex items-start gap-1.5 text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2 mb-3">
            <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{sessionHint(session, new Date(), calendar)}</span>
          </div>

          {/* ───── Chế độ đơn giản ───── */}
          {!advanced && !isSell && (
            <>
              <p className="text-[12px] text-gray-200 font-semibold mb-1.5">Bạn muốn đầu tư bao nhiêu tiền?</p>
              <div className="flex items-center gap-1.5 mb-2">
                {AMOUNT_PRESETS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setAmount(n)}
                    className={`flex-1 py-2 rounded-lg text-[12px] font-medium cursor-pointer ${
                      amount === n ? "text-white font-bold" : "bg-[#1f2937] text-gray-300"
                    }`}
                    style={amount === n ? { backgroundColor: accent } : undefined}
                  >
                    {n / 1000000} triệu
                  </button>
                ))}
                <button
                  onClick={() => setAmount(userBalance)}
                  className={`flex-1 py-2 rounded-lg text-[12px] font-medium cursor-pointer ${
                    amount === userBalance ? "text-white font-bold" : "bg-[#1f2937] text-gray-300"
                  }`}
                  style={amount === userBalance ? { backgroundColor: accent } : undefined}
                >
                  Toàn bộ
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount ? fmt(amount) : ""}
                  onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)}
                  placeholder="Nhập số tiền"
                  className="w-full px-3 py-2.5 pr-8 rounded-lg bg-[#0d1117] border border-[#222c38] text-white text-[15px] font-mono outline-none focus:border-[#d4af37]"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-500">đ</span>
              </div>
              <p className="text-[10.5px] text-gray-500 mt-1 flex items-center gap-1">
                <Wallet className="w-3 h-3" /> Số dư ví: <span className="font-mono text-gray-300">{fmt(userBalance)} đ</span>
              </p>

              <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3 space-y-1.5 text-[12px]">
                {qty > 0 ? (
                  <>
                    <Row label="Bạn sẽ mua được" value={`${fmt(qty)} cổ phiếu`} />
                    <Row label={`Giá ${orderType === "MP" ? "hiện tại (ước tính)" : "đặt mua"}`} value={`${fmt(est.price)} đ / cổ phiếu`} />
                    <Row label={`Phí giao dịch ${(feeRate * 100).toLocaleString("vi-VN")}%`} value={`${fmt(est.fee)} đ`} />
                    <Row label="Tổng tiền trả" value={`${fmt(est.total)} đ`} strong />
                    <p className="text-[10.5px] text-emerald-300/90 flex items-center gap-1 pt-1">
                      <CalendarCheck className="w-3.5 h-3.5" /> Cổ phiếu về tài khoản: {friendlyDate(settleDate)} (bán được từ ngày này)
                    </p>
                    {orderType === "MP" ? (
                      <p className="text-[10px] text-gray-500">
                        Ứng dụng tạm giữ {fmt(hold)} đ để chắc chắn đủ tiền; phần thừa được trả lại ngay khi khớp.
                      </p>
                    ) : (
                      <p className="text-[10px] text-gray-500">
                        Lệnh đặt ở giá {fmt(effLimit)} đ. Nếu khi khớp giá cao hơn mức này, lệnh không khớp và tiền được trả lại cuối phiên.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-amber-300">
                    Cần tối thiểu khoảng <b className="font-mono">{fmt(minLotCost)} đ</b> để mua 1 lô ({lotSize} cổ phiếu).
                  </p>
                )}
              </div>
            </>
          )}

          {!advanced && isSell && (
            <>
              <p className="text-[12px] text-gray-200 font-semibold mb-1.5">Bạn muốn bán bao nhiêu cổ phiếu?</p>
              <div className="flex items-center gap-1.5 mb-2">
                {[
                  ["1/4", sellQtyFraction(sellable, 0.25, lotSize)],
                  ["1/2", sellQtyFraction(sellable, 0.5, lotSize)],
                  ["Bán hết", sellQtyFraction(sellable, 1, lotSize)],
                ].map(([label, n]) => (
                  <button
                    key={label}
                    disabled={!(n > 0)}
                    onClick={() => setQtyInput(n)}
                    className={`flex-1 py-2 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-40 ${
                      qtyInput === n && n > 0 ? "text-white font-bold" : "bg-[#1f2937] text-gray-300"
                    }`}
                    style={qtyInput === n && n > 0 ? { backgroundColor: accent } : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="number"
                inputMode="numeric"
                value={qtyInput}
                onChange={(e) => setQtyInput(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="w-full px-3 py-2.5 rounded-lg bg-[#0d1117] border border-[#222c38] text-white text-[15px] font-mono outline-none focus:border-[#d4af37]"
              />
              <p className="text-[10.5px] text-gray-500 mt-1">
                Bạn có <span className="font-mono text-gray-300">{fmt(sellable)}</span> cổ phiếu bán được
.
              </p>

              <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3 space-y-1.5 text-[12px]">
                <Row label="Giá trị bán" value={`${fmt(sellEst.value)} đ`} />
                <Row label={`Phí ${(feeRate * 100).toLocaleString("vi-VN")}% + thuế ${(taxRate * 100).toLocaleString("vi-VN")}%`} value={`-${fmt(sellEst.fee + sellEst.tax)} đ`} />
                <Row label="Bạn nhận về" value={`${fmt(sellEst.net)} đ`} strong />
                {salePnl !== null && qty > 0 && (
                  <Row
                    label="So với giá vốn"
                    value={`${salePnl >= 0 ? "Lãi +" : "Lỗ "}${fmt(salePnl)} đ`}
                    tone={salePnl >= 0 ? "#10b981" : "#ef4444"}
                  />
                )}
                <p className="text-[10.5px] text-emerald-300/90 flex items-center gap-1 pt-1">
                  <CalendarCheck className="w-3.5 h-3.5" /> Tiền về ví: {friendlyDate(settleDate)}
                </p>
              </div>
            </>
          )}

          {/* ───── Tuỳ chọn nâng cao ───── */}
          <button
            onClick={() => setAdvanced((v) => !v)}
            className="w-full mt-3 flex items-center justify-between text-[11.5px] text-gray-400 py-2 cursor-pointer"
          >
            <span>{advanced ? "Quay lại chế độ đơn giản" : "Tuỳ chọn nâng cao (tự chọn loại lệnh, đặt giá)"}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${advanced ? "rotate-180" : ""}`} />
          </button>

          {advanced && (
            <div className="space-y-3">
              {quote && (
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  {[
                    ["Trần", quote.ceiling_price, "#a855f7"],
                    ["Tham chiếu", quote.reference_price, "#d4af37"],
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

              <div>
                <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#0d1117]">
                  {["LO", "MP", "ATO", "ATC"].map((t) => {
                    const ok = types.includes(t);
                    return (
                      <button
                        key={t}
                        disabled={!ok}
                        onClick={() => setAdvType(t)}
                        className={`py-1.5 rounded-lg text-[12px] font-bold transition-colors ${
                          advType === t ? "text-white" : ok ? "text-gray-300 cursor-pointer" : "text-gray-600 cursor-not-allowed"
                        }`}
                        style={advType === t ? { backgroundColor: accent } : undefined}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  {ORDER_TYPE_LABELS[advType]}
                  {advType === "LO" ? (isSell ? ": bán khi giá ≥ giá bạn đặt" : ": mua khi giá ≤ giá bạn đặt") : ""}
                  {advType === "MP" ? ": khớp ngay theo giá hiện tại" : ""}
                  {advType === "ATO" ? ": khớp lúc 09:15 theo giá mở cửa" : ""}
                  {advType === "ATC" ? ": khớp lúc 14:45 theo giá đóng cửa" : ""}. Loại mờ không dùng được trong phiên hiện tại.
                </p>
              </div>

              {advType === "LO" && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-1.5">Giá đặt (đ)</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setLimitPrice((p) => stepPrice(p, -1, quote))}
                      className="w-10 h-10 rounded-lg bg-[#1f2937] text-gray-200 flex items-center justify-center cursor-pointer"
                      aria-label="Giảm giá"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(Number(e.target.value) || 0)}
                      onBlur={() => setLimitPrice((p) => roundToTick(p))}
                      className="flex-1 px-3 py-2.5 rounded-lg bg-[#0d1117] border border-[#222c38] text-white text-[14px] text-center outline-none focus:border-[#d4af37] font-mono"
                    />
                    <button
                      onClick={() => setLimitPrice((p) => stepPrice(p, 1, quote))}
                      className="w-10 h-10 rounded-lg bg-[#1f2937] text-gray-200 flex items-center justify-center cursor-pointer"
                      aria-label="Tăng giá"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <div>
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
                      onClick={() => setQtyInput(n)}
                      className={`flex-1 py-2 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-40 ${
                        qtyInput === n && n > 0 ? "text-white font-bold" : "bg-[#1f2937] text-gray-300"
                      }`}
                      style={qtyInput === n && n > 0 ? { backgroundColor: accent } : undefined}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  className="w-full px-3 py-2.5 rounded-lg bg-[#0d1117] border border-[#222c38] text-white text-[13px] outline-none focus:border-[#d4af37] font-mono"
                />
              </div>

              <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-1.5 text-[11.5px]">
                {isSell ? (
                  <>
                    <Row label="CP bán được" value={`${fmt(sellable)} CP`} />
                    <Row label="Giá trị bán" value={`${fmt(sellEst.value)} đ`} />
                    <Row label={`Phí ${(feeRate * 100).toLocaleString("vi-VN")}%`} value={`-${fmt(sellEst.fee)} đ`} />
                    <Row label={`Thuế TNCN ${(taxRate * 100).toLocaleString("vi-VN")}%`} value={`-${fmt(sellEst.tax)} đ`} />
                    <Row label={`Tiền về ví (${friendlyDate(settleDate)})`} value={`${fmt(sellEst.net)} đ`} strong />
                  </>
                ) : (
                  <>
                    <Row label="Số dư ví" value={`${fmt(userBalance)} đ · tối đa ${fmt(maxBuy)} CP`} />
                    <Row label="Giá trị lệnh" value={`${fmt(est.value)} đ`} />
                    <Row label={`Phí ${(feeRate * 100).toLocaleString("vi-VN")}%`} value={`${fmt(est.fee)} đ`} />
                    <Row label="Tiền tạm giữ" value={`${fmt(hold)} đ`} strong />
                    {advType !== "LO" && (
                      <p className="text-[9.5px] text-gray-500">Lệnh {advType} tạm giữ theo giá trần; phần thừa được trả lại khi khớp.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {invalid && invalid !== "PRICE_UNAVAILABLE" && !(invalid === "INVALID_LOT" && qty === 0 && !advanced && !isSell) && (
            <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[10.5px] text-red-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{STOCK_ERROR_MESSAGES[invalid]}</span>
            </div>
          )}
          {!invalid && short && (
            <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10.5px] text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>Số dư ví chưa đủ. Bấm nút bên dưới để nạp thêm tiền.</span>
            </div>
          )}

          <button
            disabled={loading || (!!invalid && !short)}
            onClick={handleOrder}
            className="w-full mt-4 py-3 rounded-xl text-[14px] font-extrabold text-white active:scale-[0.98] transition-transform cursor-pointer shadow-lg uppercase tracking-wider disabled:opacity-50"
            style={{ backgroundColor: short && !invalid ? "#d4af37" : accent }}
          >
            {loading
              ? "Đang xử lý..."
              : short && !invalid
                ? "Nạp tiền để mua"
                : isSell
                  ? `Xác nhận bán ${qty > 0 ? fmt(qty) + " cổ phiếu" : ""}`
                  : `Xác nhận mua ${qty > 0 ? fmt(qty) + " cổ phiếu" : ""}`}
          </button>
          <p className="text-[9.5px] text-gray-500 text-center mt-2">
            Lệnh chưa khớp có thể huỷ ở tab Lệnh — tiền / cổ phiếu được trả lại ngay.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
