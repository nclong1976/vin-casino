import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import StockHeader from "@/components/stocks/StockHeader";
import MarketSummary from "@/components/stocks/MarketSummary";
import StockCard from "@/components/stocks/StockCard";
import TradeSheet from "@/components/stocks/TradeSheet";
import BottomNav from "@/components/BottomNav";
import MarketSearchBar from "@/components/shared/MarketSearchBar";
import { base44 } from "@/api/base44Client";

// Chỉ dùng khi bảng investment_projects chưa có mã cổ phiếu nào (vd lần
// khởi tạo đầu tiên/mất kết nối) - KHÔNG còn là nguồn dữ liệu chính. Trước
// đây trang này 100% hardcode, không hề đọc Supabase, nên StocksTab.jsx
// bên Admin chỉnh sửa gì cũng không ảnh hưởng người dùng thật.
const FALLBACK_STOCKS = [
  { symbol: "VIC", name: "Tập đoàn Vingroup", price: "45.200", change: 3.1, spark: [42, 42.5, 41.8, 43, 44, 43.5, 44.8, 45.2] },
  { symbol: "VHM", name: "Vinhomes", price: "42.800", change: 2.4, spark: [41, 41.2, 40.8, 41.5, 42, 41.8, 42.5, 42.8] },
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
    is_active: p.is_active ?? true,
  };
}

async function fetchStocks() {
  const allProjects = await base44.entities.Project.list().catch(() => []);
  const stockProjects = allProjects.filter(
    (p) => (p.category || "").trim() === "Đầu tư chứng khoán"
  );
  return stockProjects.length > 0 ? stockProjects.map(mapProjectToStock) : FALLBACK_STOCKS;
}

export default function Stocks() {
  const [selected, setSelected] = useState(null);
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [highlightActive, setHighlightActive] = useState(!!highlightId);

  // Đọc trực tiếp danh sách cổ phiếu admin cấu hình trong StocksTab.jsx
  // (đọc-nhanh khi mount, không polling liên tục vì giá không thay đổi
  // ngẫu nhiên trong app demo này).
  const { data: stocks = FALLBACK_STOCKS } = useQuery({
    queryKey: ["stocks"],
    queryFn: fetchStocks,
    staleTime: 30_000,
  });

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
      <StockHeader />

      <div className="max-w-5xl mx-auto px-4 py-4 pb-24 space-y-4">
        <MarketSummary />

        {/* Live Market & Stock Search Grounding */}
        <div className="pt-1 pb-1">
          <MarketSearchBar darkTheme={true} placeholder="Tra cứu thông tin cổ phiếu, tin chứng khoán mới nhất..." />
        </div>

        <div className="flex items-center justify-between pt-1">
          <h2 className="text-[13px] font-semibold text-white">Cổ phiếu Vingroup</h2>
          <span className="text-[10px] text-gray-500">Cập nhật trực tiếp</span>
        </div>

        {stocks.map((stock, index) => (
          <div
            key={stock.id || stock.symbol}
            id={stock.id ? `project-${stock.id}` : undefined}
            className={highlightActive && highlightId === String(stock.id) ? "ring-2 ring-amber-400 rounded-2xl" : ""}
          >
            <StockCard stock={stock} index={index} onTrade={setSelected} />
          </div>
        ))}

        <p className="text-[9px] text-gray-600 text-center pt-2 leading-relaxed">
          Dữ liệu mang tính tham khảo. Đầu tư chứng khoán có rủi ro, vui lòng cân nhắc kỹ.
        </p>
      </div>

      {selected && <TradeSheet stock={selected} onClose={() => setSelected(null)} />}

      <BottomNav />
    </main>
  );
}
