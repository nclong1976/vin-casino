/**
 * Interactive demo/reference UI for the Daily Yield Accrual & Payout Engine.
 *
 * STANDALONE — not imported by any existing page/route. Nothing in the
 * current app links here; it exists purely as a reviewable, runnable
 * deliverable for the engine in ../../lib/dailyPayoutEngine. Wiring this
 * into real navigation, or replacing the app's current lump-sum-at-maturity
 * payout model with this daily-accrual one, is a deliberate integration
 * decision left for later — not done as part of this file.
 */
import React, { useMemo, useState } from "react";
import {
  generatePayoutSchedule,
  calculateDailyAccrual,
  summarizeSchedule,
  formatVnd,
} from "@/lib/dailyPayoutEngine/calculations";
import { runDailyPayoutWorker } from "@/lib/dailyPayoutEngine/worker";
import type {
  DailyPayoutScheduleItem,
  InvestmentContract,
  PayoutAuditLogEntry,
} from "@/lib/dailyPayoutEngine/types";

const START_DATE = new Date("2026-01-01T00:00:00.000Z");

function makeSampleContract(principal: bigint, cycleDays: number, termRate: number): InvestmentContract {
  const end = new Date(START_DATE.getTime());
  end.setUTCDate(end.getUTCDate() + cycleDays);
  return {
    id: "demo-contract-1",
    userId: "demo-user-1",
    principal,
    cycleDays,
    termRate,
    startDate: START_DATE.toISOString(),
    endDate: end.toISOString(),
    status: "ACTIVE",
  };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function MetricCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-xs">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-[16px] font-extrabold mt-1 ${accent ? "text-[#948154]" : "text-black"}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: DailyPayoutScheduleItem["status"] }) {
  const isPaid = status === "PAID";
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold ${
        isPaid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
      }`}
    >
      {isPaid ? "Đã nhận" : "Chờ xử lý"}
    </span>
  );
}

export default function DailyPayoutDashboard() {
  const [principalInput, setPrincipalInput] = useState("100000000");
  const [cycleDays, setCycleDays] = useState(30);
  const [termRate, setTermRate] = useState(6.5);

  const [contract, setContract] = useState<InvestmentContract>(() =>
    makeSampleContract(100_000_000n, 30, 6.5)
  );
  const [schedule, setSchedule] = useState<DailyPayoutScheduleItem[]>(() =>
    generatePayoutSchedule(contract.principal, contract.cycleDays, contract.termRate, new Date(contract.startDate))
  );
  const [simulatedNow, setSimulatedNow] = useState<Date>(new Date(contract.startDate));
  const [auditLog, setAuditLog] = useState<PayoutAuditLogEntry[]>([]);

  const { dailyBase } = useMemo(
    () => calculateDailyAccrual(contract.principal, contract.cycleDays, contract.termRate),
    [contract]
  );
  const summary = useMemo(
    () => summarizeSchedule(contract.principal, dailyBase, schedule),
    [contract, dailyBase, schedule]
  );

  function handleApplyContract() {
    const p = BigInt(Math.max(0, Math.floor(Number(principalInput) || 0)));
    const days = Math.max(1, Math.floor(cycleDays) || 1);
    const rate = Math.max(0, Number(termRate) || 0);
    const next = makeSampleContract(p, days, rate);
    setContract(next);
    setSchedule(generatePayoutSchedule(next.principal, next.cycleDays, next.termRate, new Date(next.startDate)));
    setSimulatedNow(new Date(next.startDate));
    setAuditLog([]);
  }

  function handleAdvanceOneDay() {
    if (summary.isCompleted) return;
    const nextNow = new Date(simulatedNow.getTime());
    nextNow.setUTCDate(nextNow.getUTCDate() + 1);

    const result = runDailyPayoutWorker([contract], new Map([[contract.id, schedule]]), nextNow);
    const updated = result.updatedSchedules.get(contract.id);
    if (updated) setSchedule(updated);
    if (result.auditLog.length > 0) setAuditLog((prev) => [...result.auditLog, ...prev]);
    if (result.completedContracts.has(contract.id)) {
      setContract((c) => ({ ...c, status: "COMPLETED" }));
    }
    setSimulatedNow(nextNow);
  }

  function handleRunToMaturity() {
    if (summary.isCompleted) return;
    const end = new Date(contract.endDate);
    const result = runDailyPayoutWorker([contract], new Map([[contract.id, schedule]]), end);
    const updated = result.updatedSchedules.get(contract.id);
    if (updated) setSchedule(updated);
    if (result.auditLog.length > 0) setAuditLog((prev) => [...result.auditLog, ...prev]);
    if (result.completedContracts.has(contract.id)) {
      setContract((c) => ({ ...c, status: "COMPLETED" }));
    }
    setSimulatedNow(end);
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4 font-sans">
      <div>
        <h1 className="text-[16px] font-extrabold text-black">Daily Yield Accrual & Payout Engine</h1>
        <p className="text-[11px] text-gray-500 mt-0.5">
          Demo độc lập — không gắn vào luồng đầu tư thật của ứng dụng.
        </p>
      </div>

      {/* Contract input */}
      <div className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
        <label className="text-[11px] font-medium text-gray-600 space-y-1 block">
          <span>Vốn gốc (VNĐ)</span>
          <input
            type="number"
            min={0}
            value={principalInput}
            onChange={(e) => setPrincipalInput(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
          />
        </label>
        <label className="text-[11px] font-medium text-gray-600 space-y-1 block">
          <span>Kỳ hạn (ngày)</span>
          <input
            type="number"
            min={1}
            value={cycleDays}
            onChange={(e) => setCycleDays(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
          />
        </label>
        <label className="text-[11px] font-medium text-gray-600 space-y-1 block">
          <span>Lãi suất toàn kỳ (%)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={termRate}
            onChange={(e) => setTermRate(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
          />
        </label>
        <button
          onClick={handleApplyContract}
          className="h-[34px] rounded-lg bg-[#948154] hover:bg-[#7a6c44] text-white text-[12px] font-bold transition-colors cursor-pointer"
        >
          Tạo hợp đồng mới
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <MetricCard label="Vốn ban đầu" value={`${formatVnd(summary.principal)}đ`} />
        <MetricCard label="Lãi nhận mỗi ngày" value={`${formatVnd(summary.dailyInterestAmount)}đ`} accent />
        <MetricCard label="Tổng lãi đã giải ngân" value={`${formatVnd(summary.totalDisbursedInterest)}đ`} accent />
        <MetricCard label="Lãi còn chờ mở khóa" value={`${formatVnd(summary.pendingInterest)}đ`} />
      </div>

      {/* Simulated clock controls */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl p-3 border border-gray-100 shadow-xs">
        <span className="text-[11px] text-gray-500">
          Ngày mô phỏng hiện tại: <b className="text-black">{fmtDate(simulatedNow.toISOString())}</b>
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleAdvanceOneDay}
            disabled={summary.isCompleted}
            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-black text-[11px] font-bold transition-colors cursor-pointer"
          >
            Chạy Cron: qua 1 ngày
          </button>
          <button
            onClick={handleRunToMaturity}
            disabled={summary.isCompleted}
            className="px-3 py-1.5 rounded-lg bg-[#948154] hover:bg-[#7a6c44] disabled:opacity-40 text-white text-[11px] font-bold transition-colors cursor-pointer"
          >
            Chạy tới đáo hạn
          </button>
        </div>
      </div>

      {summary.isCompleted && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] font-bold text-emerald-700">
          Hợp đồng đã đáo hạn — đã hoàn trả đủ vốn gốc + lãi.
        </div>
      )}

      {/* Payout schedule table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-gray-100">
          <h2 className="text-[12px] font-bold text-black">Bảng tiến độ giải ngân</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left font-semibold px-3 py-2">Ngày</th>
                <th className="text-left font-semibold px-3 py-2">Ngày mở khóa</th>
                <th className="text-right font-semibold px-3 py-2">Lãi ngày</th>
                <th className="text-right font-semibold px-3 py-2">Hoàn vốn gốc</th>
                <th className="text-right font-semibold px-3 py-2">Tổng nhận</th>
                <th className="text-center font-semibold px-3 py-2">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((item) => (
                <tr key={item.dayIndex} className="border-t border-gray-50">
                  <td className="px-3 py-1.5 font-medium text-black">
                    {item.dayIndex}
                    {item.dayIndex === contract.cycleDays && (
                      <span className="ml-1 text-[9px] text-[#948154] font-bold">(Đáo hạn)</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">{fmtDate(item.payoutDate)}</td>
                  <td className="px-3 py-1.5 text-right text-black">{formatVnd(item.dailyInterest)}đ</td>
                  <td className="px-3 py-1.5 text-right text-black">
                    {item.principalReturn > 0n ? `${formatVnd(item.principalReturn)}đ` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-black">{formatVnd(item.totalPayout)}đ</td>
                  <td className="px-3 py-1.5 text-center">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit log */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-gray-100">
          <h2 className="text-[12px] font-bold text-black">Audit Log (bút toán đã ghi)</h2>
        </div>
        {auditLog.length === 0 ? (
          <p className="px-3.5 py-4 text-[11px] text-gray-400 text-center">Chưa có bút toán nào - bấm "Chạy Cron" để mô phỏng.</p>
        ) : (
          <ul className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
            {auditLog.map((entry) => (
              <li key={entry.id} className="px-3.5 py-2 text-[10.5px] flex items-center justify-between gap-2">
                <span className="text-gray-500">
                  Ngày {entry.dayIndex} · {entry.type === "INTEREST_AND_PRINCIPAL" ? "Lãi + Vốn gốc" : "Lãi ngày"}
                </span>
                <span className="font-bold text-black">+{formatVnd(entry.amount)}đ</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
