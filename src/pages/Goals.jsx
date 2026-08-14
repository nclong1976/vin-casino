import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Plus, X, Trash2 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

const INITIAL_GOALS = [
  { id: 1, title: "Quỹ hưu trí", target: 500000000, current: 125000000, color: "#948154" },
  { id: 2, title: "Du lịch châu Âu", target: 80000000, current: 35000000, color: "#3B82F6" },
  { id: 3, title: "Mua xe hơi", target: 600000000, current: 180000000, color: "#10B981" },
];

export default function Goals() {
  const [goals, setGoals] = useState(INITIAL_GOALS);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", target: "" });

  const handleAdd = () => {
    if (!form.title || !form.target) {
      toast.error("Vui lòng nhập đầy đủ");
      return;
    }
    const colors = ["#948154", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"];
    setGoals([
      ...goals,
      {
        id: Date.now(),
        title: form.title,
        target: parseInt(form.target),
        current: 0,
        color: colors[goals.length % colors.length],
      },
    ]);
    setForm({ title: "", target: "" });
    setShowAdd(false);
    toast.success("Đã tạo mục tiêu mới");
  };

  const handleDelete = (id) => {
    setGoals(goals.filter((g) => g.id !== id));
    toast.success("Đã xóa mục tiêu");
  };

  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const totalCurrent = goals.reduce((s, g) => s + g.current, 0);

  return (
    <main className="relative w-full min-h-screen bg-[#f5f5f5] overflow-x-hidden font-heading">
      <PageHeader title="Mục tiêu" />
      <div className="max-w-4xl mx-auto px-4 py-4 pb-24 space-y-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[13px] font-bold text-black flex items-center gap-1.5">
              <Target className="w-4 h-4 text-[#948154]" /> Tổng quan
            </h2>
          </div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-gray-400">Tiến độ chung</span>
            <span className="font-bold text-[#948154]">
              {((totalCurrent / totalTarget) * 100 || 0).toFixed(1)}%
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#948154] to-[#6b5e3e] rounded-full transition-all duration-500"
              style={{ width: `${(totalCurrent / totalTarget) * 100 || 0}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[11px]">
            <span className="text-gray-400">Đã tiết kiệm</span>
            <span className="font-bold text-black">{fmt(totalCurrent)} VNĐ</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-400">Mục tiêu</span>
            <span className="font-bold text-black">{fmt(totalTarget)} VNĐ</span>
          </div>
        </div>

        {goals.map((g, i) => {
          const pct = (g.current / g.target) * 100 || 0;
          return (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-white rounded-xl p-3 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: g.color }} />
                  <p className="text-[12px] font-bold text-black">{g.title}</p>
                </div>
                <button onClick={() => handleDelete(g.id)} className="text-gray-300 hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-2 mb-1">
                <span>{fmt(g.current)} VNĐ</span>
                <span>{fmt(g.target)} VNĐ</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: g.color }}
                />
              </div>
              <p className="text-[10px] font-bold text-right mt-1" style={{ color: g.color }}>
                {pct.toFixed(1)}%
              </p>
            </motion.div>
          );
        })}

        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-2.5 rounded-xl border border-dashed border-[#948154]/30 text-[12px] font-medium text-[#948154] flex items-center justify-center gap-1.5 hover:bg-[#948154]/5"
        >
          <Plus className="w-4 h-4" /> Thêm mục tiêu
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50"
            onClick={() => setShowAdd(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="w-full max-w-[331px] bg-white rounded-t-2xl p-4 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-bold text-black">Mục tiêu mới</h2>
                <button onClick={() => setShowAdd(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-600 mb-1">Tên mục tiêu</p>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="VD: Quỹ giáo dục con cái"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
                />
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-600 mb-1">Số tiền mục tiêu (VNĐ)</p>
                <input
                  type="number"
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: e.target.value })}
                  placeholder="VD: 100000000"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
                />
              </div>
              <button onClick={handleAdd} className="w-full py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[12px] font-semibold">
                Tạo mục tiêu
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <BottomNav />
    </main>
  );
}