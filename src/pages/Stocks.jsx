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
import StockGuide, { StockGuideBanner, hasSeenGuide, markGuideSeen } from "@/components/stocks/StockGuide";
import { HelpCircle } from "lucide-react";
import { useMyPositions, sellableOf } from "@/hooks/useMyPositions";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useAuth } from "@/lib/AuthContext";
import { useStockMarket } from "@/hooks/useStockMarket";
import { changePct } from "@/lib/stockMarket";
import { intradaySeries } from "@/lib/stockChart";
import { useIntradayTicks } from "@/hooks/useIntradayTicks";
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
  { symbol: "VIC", name: "Tập đoàn Vingroup", price: "45.200", change: 3.1, is_active: false },
  { symbol: "VHM", name: "Vinhomes", price: "42.800", change: 2.4, is_active: false },
];

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
    quote,
  };
}

export default function Stocks() {
  // trade = { stock, side: 'BUY' | 'SELL' } - sheet đặt lệnh; detail = mã đang xem biểu đồ.
  const [trade, setTrade] = useState(null);
  const [detail, setDetail] = useState(null);
  const { user } = useAuth();
  const positions = useMyPositions(user?.id);
  const { watched, toggle: toggleWatch } = useWatchlist(user?.id);
  const [onlyWatched, setOnlyWatched] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showBanner, setShowBanner] = useState(() => !hasSeenGuide());
  const [stocks, setStocks] = useState(FALLBACK_STOCKS);
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [highlightActive, setHighlightActive] = useState(!!highlightId);
  const tab = TABS.some(([k]) => k === searchParams.get("tab")) ? searchParams.get("tab") : "market";
  const { quotes, config, session, calendar } = useStockMarket();
  const { ticks: dayTicks, dateStr } = useIntradayTicks();

  const openGuide = () => {
    setShowGuide(true);
    setShowBanner(false);
    markGuideSeen();
  };
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
        {showBanner && (
          <StockGuideBanner
            onOpen={openGuide}
            onDismiss={() => {
              setShowBanner(false);
              markGuideSeen();
            }}
          />
        )}

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
            <MarketSummary
              quotes={quotes}
              session={session}
              calendar={calendar}
              band={config.price_band_pct}
              onSelect={(sym) => {
                const s = liveStocks.find((x) => x.symbol === sym);
                if (s) setDetail(s);
              }}
            />

            <MyHoldings quotes={quotes} compact />

            {/* Live Market & Stock Search Grounding */}
            <div className="pt-1 pb-1">
              <MarketSearchBar darkTheme={true} placeholder="Tra cứu thông tin cổ phiếu, tin chứng khoán mới nhất..." />
            </div>

            <div className="flex items-center justify-between pt-1">
              <h2 className="text-[13px] font-semibold text-white">Cổ phiếu Vingroup</h2>
              {user?.id ? (
                <div className="flex gap-1 p-0.5 rounded-lg bg-[#151b24]">
                  {[
                    [false, "Tất cả"],
                    [true, `★ Theo dõi (${watched.size})`],
                  ].map(([v, label]) => (
                    <button
                      key={label}
                      onClick={() => setOnlyWatched(v)}
                      className={`px-2.5 py-1 rounded-md text-[10.5px] cursor-pointer ${onlyWatched === v ? "bg-[#d4af37] text-black font-bold" : "text-gray-400"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-[10px] text-gray-500">Cập nhật trực tiếp</span>
              )}
            </div>

            {onlyWatched && !liveStocks.some((s) => watched.has(s.symbol)) && (
              <p className="text-center text-[12px] text-gray-500 py-8 rounded-2xl bg-[#151b24]">
                Chưa theo dõi mã nào. Bấm ☆ cạnh mã cổ phiếu để thêm vào danh sách theo dõi.
              </p>
            )}

            {liveStocks
              .filter((s) => !onlyWatched || watched.has(s.symbol))
              .sort((a, b) => Number(watched.has(b.symbol)) - Number(watched.has(a.symbol)))
              .map((stock, index) => (
              <div
                key={stock.id || stock.symbol}
                id={stock.id ? `project-${stock.id}` : undefined}
                className={highlightActive && highlightId === String(stock.id) ? "ring-2 ring-amber-400 rounded-2xl" : ""}
              >
                <StockCard
                  stock={stock}
                  series={stock.quote ? intradaySeries({ ticks: dayTicks[stock.symbol], quote: stock.quote, dateStr }) : []}
                  index={index}
                  onTrade={(s) => openTrade(s, "BUY")}
                  onDetail={setDetail}
                  watched={watched.has(stock.symbol)}
                  onToggleWatch={
                    user?.id
                      ? async (sym) => {
                          const r = await toggleWatch(sym);
                          if (r === null) toast.error("Không cập nhật được danh sách theo dõi");
                        }
                      : undefined
                  }
                />
              </div>
            ))}
          </>
        )}

        {tab === "portfolio" && (
          <MyHoldings
            quotes={quotes}
            onBuy={(sym) => openTrade(sym, "BUY")}
            onSell={(sym) => openTrade(sym, "SELL")}
            onStart={() => setTab("market")}
            onHelp={openGuide}
          />
        )}

        {tab === "orders" && <MyOrders />}

        {tab === "dividends" && <DividendCalendar positions={positions} />}

        <button
          onClick={openGuide}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-[#222c38] text-[12px] text-gray-300 cursor-pointer"
        >
          <HelpCircle className="w-4 h-4 text-[#d4af37]" /> Hướng dẫn mua bán cổ phiếu cho người mới
        </button>

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
          avgCost={
            Number(positions[trade.stock.symbol]?.qty) > 0
              ? Number(positions[trade.stock.symbol].total_cost) / Number(positions[trade.stock.symbol].qty)
              : 0
          }
          quote={quotes[trade.stock.symbol]}
          config={config}
          session={session}
          calendar={calendar}
          onHelp={openGuide}
          onClose={() => setTrade(null)}
          onPlaced={(o) => o?.status === "pending" && setTab("orders")}
        />
      )}

      {showGuide && (
        <StockGuide
          onClose={() => setShowGuide(false)}
          onStart={() => {
            setShowGuide(false);
            setTab("market");
          }}
        />
      )}

      <BottomNav />
    </main>
  );
}
