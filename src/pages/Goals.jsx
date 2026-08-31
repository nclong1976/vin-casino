import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Target, Plus, Wallet } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import BottomNav from "@/components/BottomNav";
import CircularProgress from "@/components/goals/CircularProgress";
import GoalCard from "@/components/goals/GoalCard";
import GoalFormModal from "@/components/goals/GoalFormModal";
import GoalFundsModal from "@/components/goals/GoalFundsModal";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { refreshLocalUserFromSupabase } from "@/lib/balanceSync";
import { contributeToSavingsGoal, withdrawFromSavingsGoal, deleteSavingsGoalWithRefund, getSupabaseUser } from "@/lib/supabaseDb";
import { toast } from "sonner";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

function fireConfetti() {
  confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ["#948154", "#eddab3", "#10B981"] });
  setTimeout(() => confetti({ particleCount: 60, spread: 100, origin: { y: 0.7 } }), 250);
}

export default function Goals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("active");
  const [formTarget, setFormTarget] = useState(undefined); // undefined=closed, null=new, object=edit
  const [fundsModal, setFundsModal] = useState(null); // { mode, goal }

  const loadGoals = useCallback(async () => {
    if (!user?.id) return;
    try {
      const list = await base44.entities.SavingsGoal.list("-created_date", 200);
      setGoals(Array.isArray(list) ? list : []);
    } catch (e) {
      // quiet fallback - giữ danh sách đang có
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadGoals();
    const unsub = base44.entities.SavingsGoal.subscribe(() => loadGoals());
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [loadGoals]);

  const activeGoals = goals.filter((g) => g.status !== "completed");
  const completedGoals = goals.filter((g) => g.status === "completed");
  const visibleGoals = activeTab === "active" ? activeGoals : completedGoals;

  const totalTarget = activeGoals.reduce((s, g) => s + Number(g.target_amount || 0), 0);
  const totalCurrent = activeGoals.reduce((s, g) => s + Number(g.current_amount || 0), 0);
  const overallPct = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;

  const handleSaveGoal = async (data) => {
    try {
      if (formTarget && formTarget.id) {
        await base44.entities.SavingsGoal.update(formTarget.id, data);
        toast.success("Đã cập nhật mục tiêu");
      } else {
        await base44.entities.SavingsGoal.create({ ...data, user_id: user.id, current_amount: 0, status: "active" });
        toast.success("Đã tạo mục tiêu mới");
      }
      setFormTarget(undefined);
      loadGoals();
    } catch (e) {
      toast.error("Không thể lưu mục tiêu, vui lòng thử lại");
    }
  };

  /** Đọc lại balance thật từ Supabase (nguồn sự thật, vừa được RPC nguyên tử
   * cập nhật) và áp ngay vào cache cục bộ + state để UI phản ánh tức thì,
   * không phải đợi kênh Realtime. */
  const refreshBalanceDisplay = async () => {
    try {
      const dbUser = await getSupabaseUser(user.id);
      if (dbUser) refreshLocalUserFromSupabase(user.id, dbUser);
    } catch (e) {}
  };

  const handleDeleteGoal = async (goal) => {
    const current = Number(goal.current_amount || 0);
    toast(`Xoá mục tiêu "${goal.title}"?`, {
      description: current > 0 ? `${fmt(current)} VNĐ đang tiết kiệm sẽ được hoàn lại vào ví chính.` : undefined,
      action: {
        label: "Xoá",
        onClick: async () => {
          const ok = await deleteSavingsGoalWithRefund(goal.id);
          if (!ok) {
            toast.error("Không thể xoá mục tiêu, vui lòng thử lại");
            return;
          }
          toast.success(current > 0 ? `Đã xoá mục tiêu và hoàn ${fmt(current)} VNĐ về ví` : "Đã xoá mục tiêu");
          if (current > 0) await refreshBalanceDisplay();
          loadGoals();
        },
      },
      cancel: { label: "Huỷ" },
    });
  };

  const handleConfirmFunds = async (amount) => {
    const { mode, goal } = fundsModal;
    const isContribute = mode === "contribute";
    const wasCompleted = goal.status === "completed";

    // RPC nguyên tử duy nhất cho mỗi chiều - trừ/cộng ví VÀ cập nhật mục
    // tiêu cùng lúc trong 1 transaction Postgres, không còn rủi ro "1 vế
    // thành công, 1 vế lỗi" như cách ghép 2 lệnh rời rạc trước đây.
    const goalResult = isContribute
      ? await contributeToSavingsGoal(goal.id, amount)
      : await withdrawFromSavingsGoal(goal.id, amount);

    if (!goalResult) {
      toast.error(isContribute ? "Không thể nạp vào mục tiêu, vui lòng thử lại" : "Không thể rút từ mục tiêu, vui lòng thử lại");
      return;
    }

    if (isContribute && !wasCompleted && goalResult.status === "completed") {
      fireConfetti();
      toast.success(`🎉 Chúc mừng! Đã hoàn thành mục tiêu "${goal.title}"`);
    } else {
      toast.success(isContribute ? `Đã nạp ${fmt(amount)} VNĐ vào "${goal.title}"` : `Đã rút ${fmt(amount)} VNĐ về ví chính`);
    }

    setFundsModal(null);
    await refreshBalanceDisplay();
    loadGoals();
  };

  return (
    <main className="relative w-full min-h-screen bg-[#f5f5f5] overflow-x-hidden font-heading">
      <PageHeader title="Mục tiêu tiết kiệm" />
      <div className="max-w-4xl mx-auto px-4 py-4 pb-24 space-y-4">
        {/* Tổng quan */}
        <div className="bg-gradient-to-br from-[#1a1715] via-[#26211c] to-[#1a1715] rounded-2xl p-4 shadow-md text-white">
          <div className="flex items-center gap-4">
            <CircularProgress percent={overallPct} size={72} strokeWidth={7} color="#eddab3">
              <span className="text-[13px] font-bold text-[#eddab3]">{overallPct.toFixed(0)}%</span>
            </CircularProgress>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-white/60 flex items-center gap-1">
                <Target className="w-3 h-3" /> Tổng tiến độ {activeGoals.length} mục tiêu
              </p>
              <p className="text-[16px] font-bold mt-0.5">{fmt(totalCurrent)} <span className="text-[11px] font-normal text-white/50">/ {fmt(totalTarget)} VNĐ</span></p>
              {user && (
                <p className="text-[10px] text-white/50 mt-1.5 flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> Số dư khả dụng: <span className="font-semibold text-white/80">{fmt(user.balance)} VNĐ</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 py-2 rounded-xl text-[11.5px] font-semibold transition-all ${
              activeTab === "active" ? "bg-[#948154] text-white" : "bg-white text-gray-500"
            }`}
          >
            Đang thực hiện ({activeGoals.length})
          </button>
          <button
            onClick={() => setActiveTab("completed")}
            className={`flex-1 py-2 rounded-xl text-[11.5px] font-semibold transition-all ${
              activeTab === "completed" ? "bg-[#948154] text-white" : "bg-white text-gray-500"
            }`}
          >
            Đã hoàn thành ({completedGoals.length})
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-[12px] text-gray-400">Đang tải mục tiêu...</div>
        ) : visibleGoals.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200 px-4 space-y-1.5"
          >
            <Target className="w-8 h-8 text-gray-200 mx-auto" />
            <p className="text-[12px] font-semibold text-gray-500">
              {activeTab === "active" ? "Chưa có mục tiêu nào đang thực hiện" : "Chưa hoàn thành mục tiêu nào"}
            </p>
            {activeTab === "active" && (
              <p className="text-[10.5px] text-gray-400">Tạo mục tiêu đầu tiên để bắt đầu tiết kiệm có kế hoạch</p>
            )}
          </motion.div>
        ) : (
          visibleGoals.map((g, i) => (
            <GoalCard
              key={g.id}
              goal={g}
              index={i}
              onContribute={(goal) => setFundsModal({ mode: "contribute", goal })}
              onWithdraw={(goal) => setFundsModal({ mode: "withdraw", goal })}
              onEdit={(goal) => setFormTarget(goal)}
              onDelete={handleDeleteGoal}
            />
          ))
        )}

        <button
          onClick={() => setFormTarget(null)}
          className="w-full py-2.5 rounded-xl border border-dashed border-[#948154]/30 text-[12px] font-medium text-[#948154] flex items-center justify-center gap-1.5 hover:bg-[#948154]/5"
        >
          <Plus className="w-4 h-4" /> Thêm mục tiêu
        </button>
      </div>

      <GoalFormModal
        open={formTarget !== undefined}
        goal={formTarget}
        onClose={() => setFormTarget(undefined)}
        onSave={handleSaveGoal}
      />

      <GoalFundsModal
        open={!!fundsModal}
        mode={fundsModal?.mode}
        goal={fundsModal?.goal}
        walletBalance={user?.balance}
        onClose={() => setFundsModal(null)}
        onConfirm={handleConfirmFunds}
      />

      <BottomNav />
    </main>
  );
}
