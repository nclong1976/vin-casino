import React from "react";
import { motion } from "framer-motion";
import { MoreVertical, ArrowDownToLine, ArrowUpFromLine, Pencil, Trash2, CalendarClock, CheckCircle2 } from "lucide-react";
import CircularProgress from "./CircularProgress";
import { getGoalIcon } from "@/constants/goalIcons";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

function daysBetween(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

export default function GoalCard({ goal, index, onContribute, onWithdraw, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const Icon = getGoalIcon(goal.icon);
  const target = Number(goal.target_amount || 0);
  const current = Number(goal.current_amount || 0);
  const pct = target > 0 ? (current / target) * 100 : 0;
  const isCompleted = goal.status === "completed";
  const daysLeft = daysBetween(goal.target_date);
  const remaining = Math.max(0, target - current);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className={`relative bg-white rounded-2xl p-3.5 shadow-sm border transition-all ${
        isCompleted ? "border-emerald-200 bg-emerald-50/30" : "border-transparent"
      }`}
    >
      <div className="flex items-start gap-3">
        <CircularProgress percent={pct} size={56} strokeWidth={5} color={goal.color || "#948154"}>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: `${goal.color || "#948154"}1a` }}
          >
            <Icon className="w-4.5 h-4.5" style={{ color: goal.color || "#948154" }} />
          </div>
        </CircularProgress>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-black leading-tight truncate">{goal.title}</p>
              {isCompleted ? (
                <p className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Đã hoàn thành
                </p>
              ) : goal.target_date ? (
                <p className={`text-[10px] flex items-center gap-1 mt-0.5 ${daysLeft < 0 ? "text-red-500" : "text-gray-400"}`}>
                  <CalendarClock className="w-3 h-3" />
                  {daysLeft < 0 ? "Đã quá hạn mục tiêu" : `Còn ${daysLeft} ngày`}
                </p>
              ) : null}
            </div>

            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-50"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-7 z-20 w-36 bg-white rounded-xl shadow-lg border border-gray-100 py-1 text-[11px]">
                    <button
                      onClick={() => { setMenuOpen(false); onEdit(goal); }}
                      className="w-full px-3 py-2 flex items-center gap-2 text-gray-600 hover:bg-gray-50"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Sửa mục tiêu
                    </button>
                    {current > 0 && (
                      <button
                        onClick={() => { setMenuOpen(false); onWithdraw(goal); }}
                        className="w-full px-3 py-2 flex items-center gap-2 text-gray-600 hover:bg-gray-50"
                      >
                        <ArrowUpFromLine className="w-3.5 h-3.5" /> Rút về ví
                      </button>
                    )}
                    <button
                      onClick={() => { setMenuOpen(false); onDelete(goal); }}
                      className="w-full px-3 py-2 flex items-center gap-2 text-red-400 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Xoá mục tiêu
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-between text-[10px] text-gray-400 mt-2">
            <span>
              <span className="font-bold text-black">{fmt(current)}</span> / {fmt(target)} VNĐ
            </span>
            <span className="font-bold" style={{ color: goal.color || "#948154" }}>{pct.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {!isCompleted && (
        <button
          onClick={() => onContribute(goal)}
          className="w-full mt-3 py-2 rounded-lg text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
          style={{ backgroundColor: goal.color || "#948154" }}
        >
          <ArrowDownToLine className="w-3.5 h-3.5" /> Nạp tiền vào mục tiêu
        </button>
      )}

      {!isCompleted && remaining > 0 && goal.target_date && daysLeft > 0 && (
        <p className="text-[9.5px] text-gray-400 text-center mt-2">
          Cần thêm {fmt(Math.ceil(remaining / Math.max(1, Math.ceil(daysLeft / 30))))} VNĐ/tháng để đúng hạn
        </p>
      )}
    </motion.div>
  );
}
