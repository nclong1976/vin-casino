import React from "react";
import { CheckCircle2, Clock } from "lucide-react";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

const fmtDate = (d) =>
  d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

// Tính lại đúng công thức SQL disburse_daily_investment_payouts() (xem
// supabase/migrations/20260904010000_daily_accrual_payout_for_vinhomes_resort.sql)
// hoàn toàn phía client, KHÔNG query thêm wallet_transactions - vì mọi giá
// trị cần thiết (amount/profit/duration_days/daily_payout_days_paid) đã có
// sẵn trên chính transaction, và số tiền mỗi ngày là xác định (không có gì
// ngẫu nhiên) nên tính lại phía client cho đúng con số Postgres đã/sẽ trả.
function buildSchedule(tx) {
  const cycleDays = Math.max(1, Number(tx.duration_days) || 0);
  const totalInterest = Math.trunc(Number(tx.profit) || 0);
  const principal = Math.trunc(Number(tx.amount) || 0);
  const dailyBase = Math.floor(totalInterest / cycleDays);
  const remainder = totalInterest - dailyBase * cycleDays;
  const daysPaid = Math.max(0, Number(tx.daily_payout_days_paid) || 0);
  const createdDate = new Date(tx.created_date);

  const rows = [];
  for (let day = 1; day <= cycleDays; day++) {
    const isFinal = day === cycleDays;
    const expectedDate = new Date(createdDate);
    expectedDate.setDate(expectedDate.getDate() + day);
    rows.push({
      day,
      expectedDate,
      amount: dailyBase + (isFinal ? remainder + principal : 0),
      isFinal,
      paid: day <= daysPaid,
    });
  }
  return rows;
}

export default function DailyPayoutSchedule({ tx }) {
  if (!tx || tx.payout_model !== "DAILY_ACCRUAL") return null;

  const rows = buildSchedule(tx);
  const cycleDays = rows.length;
  const daysPaid = Math.min(cycleDays, Math.max(0, Number(tx.daily_payout_days_paid) || 0));
  const receivedTotal = rows.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm font-heading">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[12.5px] font-bold text-black">Lịch giải ngân lãi hàng ngày</h3>
        <span className="text-[10px] font-bold text-emerald-600">
          Đã nhận {daysPaid}/{cycleDays} ngày
        </span>
      </div>
      <div className="h-1 rounded-full bg-gray-100 overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${cycleDays ? (daysPaid / cycleDays) * 100 : 0}%` }}
        />
      </div>

      <p className="text-[10px] text-gray-400 mb-2">
        Lãi được cộng vào ví mỗi ngày, vốn gốc hoàn trả cùng lãi ngày cuối khi đáo hạn. Đã nhận tổng
        cộng <span className="font-bold text-emerald-600">{fmt(receivedTotal)} đ</span>.
      </p>

      <div className="divide-y divide-gray-50 border-t border-gray-100 max-h-72 overflow-y-auto">
        {rows.map((r) => (
          <div key={r.day} className="flex items-center justify-between py-2 text-[11px]">
            <div className="flex items-center gap-2 min-w-0">
              {r.paid ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Clock className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              )}
              <div className="min-w-0">
                <p className={`font-semibold ${r.paid ? "text-gray-900" : "text-gray-400"}`}>
                  Ngày {r.day}/{cycleDays}
                  {r.isFinal && <span className="ml-1 text-[9px] font-bold text-[#948154]">(kèm hoàn vốn gốc)</span>}
                </p>
                <p className="text-[9.5px] text-gray-400">{fmtDate(r.expectedDate)}</p>
              </div>
            </div>
            <span className={`font-bold shrink-0 ${r.paid ? "text-emerald-600" : "text-gray-300"}`}>
              +{fmt(r.amount)} đ
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
