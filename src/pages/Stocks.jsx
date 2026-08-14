import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import StockHeader from "@/components/stocks/StockHeader";
import MarketSummary from "@/components/stocks/MarketSummary";
import StockCard from "@/components/stocks/StockCard";
import TradeSheet from "@/components/stocks/TradeSheet";
import BottomNav from "@/components/BottomNav";
import MarketSearchBar from "@/components/shared/MarketSearchBar";

const DEFAULT_STOCKS = [
  {
    symbol: "VIC",
    name: "Tập đoàn Vingroup",
    price: "45.200",
    change: 3.1,
    spark: [42, 42.5, 41.8, 43, 44, 43.5, 44.8, 45.2],
  },
  {
    symbol: "VHM",
    name: "Vinhomes",
    price: "42.800",
    change: 2.4,
    spark: [41, 41.2, 40.8, 41.5, 42, 41.8, 42.5, 42.8],
  },
  {
    symbol: "VRE",
    name: "Vincom Retail",
    price: "18.350",
    change: 1.6,
    spark: [17.8, 17.9, 18, 17.95, 18.1, 18.2, 18.3, 18.35],
  },
  {
    symbol: "VPL",
    name: "Vinpearl",
    price: "71.500",
    change: 4.2,
    spark: [67, 68, 67.5, 69, 70, 69.5, 71, 71.5],
  },
  {
    symbol: "VFS",
    name: "VinFast Auto (Nasdaq)",
    price: "3.480",
    change: -1.8,
    spark: [3.7, 3.65, 3.6, 3.55, 3.5, 3.52, 3.48, 3.48],
  },
];

export default function Stocks() {
  const [selected, setSelected] = useState(null);

  // Retrieve stock prices using TanStack Query
  const { data: stocks = DEFAULT_STOCKS } = useQuery({
    queryKey: ["stocks"],
    queryFn: async () => DEFAULT_STOCKS, // Fallback query function
    staleTime: Infinity, // Rely on Socket.io push updates to setQueryData
    initialData: DEFAULT_STOCKS,
  });

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
          <StockCard key={stock.symbol} stock={stock} index={index} onTrade={setSelected} />
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
