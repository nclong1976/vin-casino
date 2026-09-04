/**
 * Daily Yield Accrual & Payout Engine — type definitions.
 *
 * STANDALONE MODULE — not wired into any existing route, RPC, or the app's
 * current investment flow (which pays principal + interest in a single lump
 * sum at maturity via settle_matured_investments()/resolve_project_maturity_payout()
 * in supabase/migrations/20260901000000_baseline.sql). Nothing existing was
 * changed to add this; it is a self-contained deliverable for review before
 * any decision to integrate it as a real, alternative payout model.
 *
 * All money amounts are bigint (integer VND, no decimal subunit) throughout,
 * never `number`/floating point — see calculations.ts for why.
 */

export type ContractStatus = "ACTIVE" | "COMPLETED";
export type PayoutStatus = "PENDING" | "PAID";

export interface InvestmentContract {
  id: string;
  userId: string;
  /** Integer VND. */
  principal: bigint;
  /** Total number of days in the term (N). */
  cycleDays: number;
  /** Whole-term interest rate as a percent, e.g. 6.5 means 6.5%. */
  termRate: number;
  /** ISO 8601 date-time string. */
  startDate: string;
  /** ISO 8601 date-time string — startDate + cycleDays. */
  endDate: string;
  status: ContractStatus;
}

export interface DailyPayoutScheduleItem {
  /** 1-indexed day number within the cycle, 1..cycleDays. */
  dayIndex: number;
  /** ISO 8601 date-time string this item unlocks on. */
  payoutDate: string;
  /** Interest portion released this day (integer VND). */
  dailyInterest: bigint;
  /** Principal returned this day — 0n for every day except the last. */
  principalReturn: bigint;
  /** dailyInterest + principalReturn. */
  totalPayout: bigint;
  status: PayoutStatus;
}

/** One immutable record of a payout the worker actually applied — the audit trail. */
export interface PayoutAuditLogEntry {
  id: string;
  contractId: string;
  userId: string;
  dayIndex: number;
  amount: bigint;
  /** "INTEREST" for days 1..N-1, "INTEREST_AND_PRINCIPAL" for day N. */
  type: "INTEREST" | "INTEREST_AND_PRINCIPAL";
  postedAt: string;
}

/** Aggregate view used by the dashboard metric cards. */
export interface PayoutSummary {
  principal: bigint;
  dailyInterestAmount: bigint;
  totalDisbursedInterest: bigint;
  pendingInterest: bigint;
  isCompleted: boolean;
}
