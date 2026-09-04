/**
 * Simulated cron/worker for the Daily Yield Accrual & Payout Engine.
 *
 * This is a MOCK of the server-side job, kept in-memory and idempotent so it
 * is safe to call repeatedly (e.g. once per render tick in a demo UI) — it
 * never re-pays an item already marked PAID. A real deployment would NOT
 * look like this: it would be a single Postgres function using
 * `SELECT ... FOR UPDATE SKIP LOCKED` and a unique constraint on
 * (contract_id, day_index) for the ledger insert, run on a schedule via
 * pg_cron — exactly the pattern this app already uses for
 * settle_matured_investments() and credit_daily_interest_batch() in
 * supabase/migrations/20260901000000_baseline.sql. Porting this worker to a
 * real RPC in that style is a deliberate follow-up step, not done here.
 */

import type { DailyPayoutScheduleItem, InvestmentContract, PayoutAuditLogEntry } from "./types";

export interface WorkerRunResult {
  /** contractId -> updated schedule (only contracts with at least one newly-paid item are included). */
  updatedSchedules: Map<string, DailyPayoutScheduleItem[]>;
  /** contractId -> new status, only present when a contract just completed. */
  completedContracts: Map<string, "COMPLETED">;
  auditLog: PayoutAuditLogEntry[];
}

let auditLogSeq = 0;

/**
 * Scans every ACTIVE contract's schedule for PENDING items whose payoutDate
 * has arrived and marks them PAID, producing one audit log entry per item
 * paid. Returns new schedule arrays/maps rather than mutating the inputs —
 * callers (e.g. React state) can treat the result as an immutable snapshot.
 */
export function runDailyPayoutWorker(
  contracts: InvestmentContract[],
  schedulesByContract: Map<string, DailyPayoutScheduleItem[]>,
  now: Date
): WorkerRunResult {
  const updatedSchedules = new Map<string, DailyPayoutScheduleItem[]>();
  const completedContracts = new Map<string, "COMPLETED">();
  const auditLog: PayoutAuditLogEntry[] = [];

  for (const contract of contracts) {
    if (contract.status !== "ACTIVE") continue;
    const schedule = schedulesByContract.get(contract.id);
    if (!schedule) continue;

    let changed = false;
    const nextSchedule = schedule.map((item) => {
      if (item.status === "PAID") return item;
      if (new Date(item.payoutDate).getTime() > now.getTime()) return item;

      changed = true;
      auditLogSeq += 1;
      auditLog.push({
        id: `audit_${contract.id}_${item.dayIndex}_${auditLogSeq}`,
        contractId: contract.id,
        userId: contract.userId,
        dayIndex: item.dayIndex,
        amount: item.totalPayout,
        type: item.principalReturn > 0n ? "INTEREST_AND_PRINCIPAL" : "INTEREST",
        postedAt: now.toISOString(),
      });
      return { ...item, status: "PAID" as const };
    });

    if (changed) {
      updatedSchedules.set(contract.id, nextSchedule);
      if (nextSchedule[nextSchedule.length - 1].status === "PAID") {
        completedContracts.set(contract.id, "COMPLETED");
      }
    }
  }

  return { updatedSchedules, completedContracts, auditLog };
}
