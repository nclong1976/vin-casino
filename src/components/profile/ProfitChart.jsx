import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

export default function ProfitChart({ txs, loading }) {
  const data = useMemo(() => {
    if (!txs || txs.length === 0) return [];
    const sorted = [...txs].sort(
      (a, b) => new Date(a.created_date) - new Date(b.created_date)
    );
    let cumulative = 0;
    return sorted.map((t, i) => {
      cumulative += t.profit || 0;
      const d = new Date(t.created_date);
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      return {
        label,
        profit: t.profit || 0,
        cumulative,
        idx: i,
      };
    });
  }, [txs]);

  const totalProfit = data.length ? data[data.length - 1].cumulative : 0;
  const lastProfit = data.length ? data[data.length - 1].profit : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-[#948154]" />
          <h2 className="text-[13px] font-bold text-black">
            Tăng trưởng lợi nhuận
          </h2>
        </div>
        <span className="text-[9px] text-gray-400">Theo thời gian</span>
      </div>

      {loading ? (
        <div className="h-[120px] flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-[#948154] animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="h-[120px] flex flex-col items-center justify-center text-gray-300 gap-2">
          <TrendingUp className="w-8 h-8" />
          <p className="text-[11px]">Chưa có dữ liệu lợi nhuận</p>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-[9px] text-gray-400">Tổng lợi nhuận</p>
              <p className="text-[18px] font-bold text-[#D32F2F]">
                {fmt(totalProfit)} VNĐ
              </p>
            </div>
            {lastProfit > 0 && (
              <div className="text-right">
                <p className="text-[9px] text-gray-400">Giao dịch gần nhất</p>
                <p className="text-[12px] font-semibold text-[#948154]">
                  +{fmt(lastProfit)} VNĐ
                </p>
              </div>
            )}
          </div>

          <div className="h-[130px] -ml-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 8, fill: "#999" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 8, fill: "#999" }}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                  tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}tr` : fmt(v))}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 10,
                    borderRadius: 8,
                    border: "1px solid #e5e5e5",
                    padding: "6px 10px",
                  }}
                  labelStyle={{ color: "#666", marginBottom: 2 }}
                  formatter={(value, name) => [
                    `${fmt(value)} VNĐ`,
                    name === "cumulative" ? "Tích lũy" : "Lần này",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#948154"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: "#948154" }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </motion.div>
  );
}