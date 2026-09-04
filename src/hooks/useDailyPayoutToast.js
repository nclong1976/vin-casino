import { useEffect } from "react";
import { toast } from "sonner";
import { subscribeSupabaseWalletTransactionsForUser } from "@/lib/supabaseDb";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

// note do disburse_daily_investment_payouts() ghi (xem migration
// 20260904010000_...sql): 'Giải ngân ngày X/N - dự án "TITLE"'
// [+ ' (kèm hoàn vốn gốc - đáo hạn)' ở ngày cuối] + ' [ref:<tx_id>]'
const NOTE_PATTERN = /^Giải ngân ngày (\d+)\/(\d+) - dự án "(.*)"/;

/**
 * Toast tức thời khi 1 dòng lãi ngày (category "Lãi Ngày Dự Án") được
 * disburse_daily_investment_payouts() (cron Postgres, 15 phút/lần) ghi vào
 * ví - qua đúng kênh Supabase Realtime lọc theo user_id đã có sẵn cho
 * useWithdrawalSync, không polling, không bảng/RPC mới.
 */
export function useDailyPayoutToast(userId) {
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = subscribeSupabaseWalletTransactionsForUser(userId, (payload) => {
      if (payload.eventType !== "INSERT") return;
      const row = payload.new;
      if (!row || row.category !== "Lãi Ngày Dự Án") return;

      const match = NOTE_PATTERN.exec(row.note || "");
      const isFinal = (row.note || "").includes("kèm hoàn vốn gốc");
      const title = match ? match[3] : "dự án đầu tư";
      const dayLabel = match ? ` (ngày ${match[1]}/${match[2]})` : "";

      toast.success(`+${fmt(row.amount)} đ lãi ngày${dayLabel} từ "${title}"`, {
        description: isFinal
          ? "Đã hoàn tất kỳ hạn - đã gồm cả hoàn vốn gốc."
          : "Đã cộng vào số dư ví của bạn.",
        duration: 6000,
      });
    });

    return unsubscribe;
  }, [userId]);
}
