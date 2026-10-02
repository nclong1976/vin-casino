import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import MarketSummary from "@/components/stocks/MarketSummary";
import StockCard from "@/components/stocks/StockCard";
import TradeSheet from "@/components/stocks/TradeSheet";
import BottomNav from "@/components/BottomNav";
import MarketSearchBar from "@/components/shared/MarketSearchBar";
import { base44 } from "@/api/base44Client";
import MyHoldings from "@/components/stocks/MyHoldings";
import MyOrders from "@/components/stocks/MyOrders";
import StockDetailSheet from "@/components/stocks/StockDetailSheet";
import DividendCalendar from "@/components/stocks/DividendCalendar";
import { useMyPositions, sellableOf } from "@/hooks/useMyPositions";
import { useAuth } from "@/lib/AuthContext";
import { useStockMarket } from "@/hooks/useStockMarket";
import { changePct } from "@/lib/stockMarket";
import { toast } from "sonner";

const TABS = [
  ["market", "Thị trường"],
  ["portfolio", "Danh mục"],
  ["orders", "Lệnh"],
  ["dividends", "Cổ tức"],
];

// Chỉ dùng khi bảng investment_projects chưa có mã cổ phiếu nào (vd lần
// khởi tạo đầu tiên/mất kết nối) - KHÔNG còn là nguồn dữ liệu chính. Trước
// đây trang này 100% hardcode, không hề đọc Supabase, nên StocksTab.jsx
// bên Admin chỉnh sửa gì cũng không ảnh hưởng người dùng thật.
const FALLBACK_STOCKS = [
  // Không có id dự án thật => không đặt lệnh được, hiện "Tạm khóa giao dịch".
  { symbol: "VIC", name: "Tập đoàn Vingroup", price: "45.200", change: 3.1, is_active: false, spark: [42, 42.5, 41.8, 43, 44, 43.5, 44.8, 45.2] },
  { symbol: "VHM", name: "Vinhomes", price: "42.800", change: 2.4, is_active: false, spark: [41, 41.2, 40.8, 41.5, 42, 41.8, 42.5, 42.8] },
];

/** Sinh dãy điểm cho mini-chart (spark) ổn định theo giá+biến động hiện tại - không có cột lưu từng điểm biểu đồ trong DB. */
function synthesizeSpark(price, changePercent) {
  const end = Number(price) || 0;
  const start = end / (1 + (Number(changePercent) || 0) / 100);
  const points = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const wobble = Math.sin(i * 1.7) * (end - start) * 0.08;
    points.push(Number((start + (end - start) * t + wobble).toFixed(2)));
  }
  points[7] = end;
  return points;
}

function mapProjectToStock(p) {
  const symbolFallback = (p.title || p.name || "").match(/\(([^)]+)\)/)?.[1] || "CP";
  const symbol = (p.stock_symbol || symbolFallback).toUpperCase();
  const price = Math.round(Number(p.price_per_m2) || 0);
  const change = Number(p.daily_change_percent) || 0;
  return {
    id: p.id,
    symbol,
    name: p.name || p.title || symbol,
    price: price.toLocaleString("vi-VN"),
    change,
    spark: synthesizeSpark(price, change),
    // Theo đúng trạng thái Admin đặt ở tab Dự án: mã đang khoá thì không mua
    // được (server place_stock_order cũng từ chối SYMBOL_HALTED).
    is_active: p.is_active !== false,
    priceNum: price,
    description: p.description || "",
  };
}

function mapStockList(allProjects) {
  if (!Array.isArray(allProjects)) return FALLBACK_STOCKS;
  const stockProjects = allProjects.filter(
    (p) => (p.category || "").trim() === "Đầu tư chứng khoán"
  );
  return stockProjects.length > 0 ? stockProjects.map(mapProjectToStock) : FALLBACK_STOCKS;
}

/** Ghép giá realtime (stock_quotes) vào thẻ cổ phiếu. */
function withQuote(stock, quote) {
  if (!quote) return stock;
  const price = Math.round(Number(quote.last_price) || 0);
  const change = changePct(quote);
  return {
    ...stock,
    price: price.toLocaleString("vi-VN"),
    priceNum: price,
    change,
    spark: synthesizeSpark(price, change),
    quote,
  };
}

export default function Stocks() {
  // trade = { stock, side: 'BUY' | 'SELL' } - sheet đặt lệnh; detail = mã đang xem biểu đồ.
  const [trade, setTrade] = useState(null);
  const [detail, setDetail] = useState(null);
  const { user } = useAuth();
  const positions = useMyPositions(user?.id);
  const [stocks, setStocks] = useState(FALLBACK_STOCKS);
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [highlightActive, setHighlightActive] = useState(!!highlightId);
  const tab = TABS.some(([k]) => k === searchParams.get("tab")) ? searchParams.get("tab") : "market";
  const { quotes, config, session } = useStockMarket();
  const liveStocks = useMemo(() => stocks.map((s) => withQuote(s, quotes[s.symbol])), [stocks, quotes]);

  const setTab = (k) => {
    const next = new URLSearchParams(searchParams);
    if (k === "market") next.delete("tab");
    else next.set("tab", k);
    next.delete("highlight");
    setSearchParams(next, { replace: true });
  };

  const openTrade = (stockOrSymbol, side = "BUY") => {
    const s = typeof stockOrSymbol === "string" ? liveStocks.find((x) => x.symbol === stockOrSymbol) : stockOrSymbol;
    if (!s?.id || !s.is_active) {
      toast.error("Mã này đang tạm khoá giao dịch.");
      return;
    }
    setDetail(null);
    setTrade({ stock: s, side });
  };

  // Đọc trực tiếp danh sách cổ phiếu admin cấu hình trong StocksTab.jsx qua
  // Supabase Realtime (giống hệt Projects.jsx/LandInvestment.jsx/Resort.jsx)
  // - trước đây chỉ đọc 1 lần lúc mount (react-query, staleTime 30s, không
  // polling/subscribe gì thêm) nên admin sửa giá/bật-tắt cổ phiếu ở
  // StocksTab.jsx không hề hiện ra cho người dùng đang mở sẵn trang này cho
  // tới khi họ tự tải lại trang - mâu thuẫn với chính dòng chữ "Cập nhật
  // trực tiếp" hiển thị ngay trên trang.
  useEffect(() => {
    const fetch = () => {
      base44.entities.Project.list().then((all) => setStocks(mapStockList(all))).catch(() => {});
    };

    fetch();

    const unsubscribe = base44.entities.Project.subscribe((updatedItems) => {
      if (Array.isArray(updatedItems) && updatedItems.length > 0) setStocks(mapStockList(updatedItems));
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Tới đây từ 1 thông báo "dự án mới mở" (NotificationBell.jsx) - cuộn tới
  // đúng thẻ cổ phiếu đó và nổi bật tạm thời vài giây rồi tự tắt.
  useEffect(() => {
    if (!highlightId || stocks.length === 0) return;
    const el = document.getElementById(`project-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setHighlightActive(false), 3000);
    return () => clearTimeout(timer);
  }, [highlightId, stocks]);

  return (
    <main className="relative w-full min-h-screen bg-[#0d1117] overflow-x-hidden font-heading">
      <PageHeader
        title="ĐẦU TƯ CHỨNG KHOÁN"
        headerClassName="bg-[#0d1117] border-b border-[#1f2630]"
        titleClassName="text-white tracking-wide"
        backButtonClassName="text-white/70 hover:bg-white/10"
      />

      <div className="max-w-5xl mx-auto px-4 py-4 pb-24 space-y-4">
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#151b24] border border-[#222c38]">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`py-2 rounded-lg text-[12.5px] font-semibold transition-colors cursor-pointer ${
                tab === k ? "bg-[#d4af37] text-black" : "text-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "market" && (
          <>
            <MarketSummary quotes={quotes} session={session} />

            <MyHoldings quotes={quotes} compact />

            {/* Live Market & Stock Search Grounding */}
            <div className="pt-1 pb-1">
              <MarketSearchBar darkTheme={true} placeholder="Tra cứu thông tin cổ phiếu, tin chứng khoán mới nhất..." />
            </div>

            <div className="flex items-center justify-between pt-1">
              <h2 className="text-[13px] font-semibold text-white">Cổ phiếu Vingroup</h2>
              <span className="text-[10px] text-gray-500">Cập nhật trực tiếp</span>
            </div>

            {liveStocks.map((stock, index) => (
              <div
                key={stock.id || stock.symbol}
                id={stock.id ? `project-${stock.id}` : undefined}
                className={highlightActive && highlightId === String(stock.id) ? "ring-2 ring-amber-400 rounded-2xl" : ""}
              >
                <StockCard stock={stock} index={index} onTrade={(s) => openTrade(s, "BUY")} onDetail={setDetail} />
              </div>
            ))}
          </>
        )}

        {tab === "portfolio" && (
          <MyHoldings quotes={quotes} onBuy={(sym) => openTrade(sym, "BUY")} onSell={(sym) => openTrade(sym, "SELL")} />
        )}

        {tab === "orders" && <MyOrders />}

        {tab === "dividends" && <DividendCalendar positions={positions} />}

        <p className="text-[9px] text-gray-600 text-center pt-2 leading-relaxed">
          Giao dịch khớp nội bộ trên VinClub theo giá do VinClub công bố, mô phỏng quy tắc sàn HOSE; không phải lệnh trên Sở Giao dịch Chứng khoán. Đầu tư có rủi ro, vui lòng cân nhắc kỹ.
        </p>
      </div>

      {detail && (
        <StockDetailSheet
          stock={liveStocks.find((x) => x.symbol === detail.symbol) || detail}
          quote={quotes[detail.symbol]}
          sellable={sellableOf(positions[detail.symbol])}
          onClose={() => setDetail(null)}
          onBuy={() => openTrade(detail.symbol, "BUY")}
          onSell={() => openTrade(detail.symbol, "SELL")}
        />
      )}

      {trade && (
        <TradeSheet
          key={`${trade.stock.symbol}-${trade.side}`}
          stock={trade.stock}
          side={trade.side}
          sellable={sellableOf(positions[trade.stock.symbol])}
          quote={quotes[trade.stock.symbol]}
          config={config}
          session={session}
          onClose={() => setTrade(null)}
          onPlaced={(o) => o?.status === "pending" && setTab("orders")}
        />
      )}

      <BottomNav />
    </main>
  );
}
