/**
 * Pure calculation core for the Daily Yield Accrual & Payout Engine.
 *
 * MONEY-SAFETY RULE: every amount here is a bigint (integer VND). termRate is
 * the only floating-point input (a human-entered percent like 6.5), and it is
 * converted ONCE into an integer basis-point value before touching principal
 * — `principal * (termRate / 100)` is never computed directly, because
 * `termRate / 100` is frequently NOT exactly representable in binary
 * floating point (e.g. 6.5 / 100 = 0.065, which has no exact binary
 * fraction), and multiplying a large bigint-scale principal by that
 * imprecise value can silently round to the wrong integer VND at the sizes
 * this app deals in. Converting to basis points (1 bp = 0.01%) up front
 * keeps every subsequent step exact integer arithmetic.
 */

import type { DailyPayoutScheduleItem } from "./types";

/** 1 basis point = 0.01%. termRate is scaled into this unit before any multiplication. */
const BPS_DENOMINATOR = 10_000n;

/** Round a human-entered percent (e.g. 6.5) to whole basis points (650) — the last point at which floating point is allowed to touch the calculation at all. */
export function percentToBasisPoints(termRatePercent: number): bigint {
  if (!Number.isFinite(termRatePercent) || termRatePercent < 0) {
    throw new RangeError(`termRate must be a finite, non-negative percent, got ${termRatePercent}`);
  }
  return BigInt(Math.round(termRatePercent * 100));
}

/** Normalize a principal given as number|bigint into bigint, rejecting non-integers/negatives. */
export function toIntegerVnd(amount: number | bigint): bigint {
  if (typeof amount === "bigint") {
    if (amount < 0n) throw new RangeError("amount must not be negative");
    return amount;
  }
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    throw new RangeError(`amount must be a non-negative integer, got ${amount}`);
  }
  return BigInt(amount);
}

/**
 * Tổng lợi nhuận cam kết toàn kỳ = principal * (termRate / 100), tính hoàn
 * toàn bằng số nguyên (bigint) qua basis points thay vì chia thập phân.
 */
export function calculateTotalInterest(principal: bigint, termRatePercent: number): bigint {
  const bps = percentToBasisPoints(termRatePercent);
  return (principal * bps) / BPS_DENOMINATOR;
}

export interface DailyAccrualBreakdown {
  totalInterest: bigint;
  /** Lãi cơ sở mỗi ngày — floor(totalInterest / cycleDays). */
  dailyBase: bigint;
  /** Phần dư thập phân dồn vào ngày cuối để tổng khớp 100% totalInterest. */
  remainder: bigint;
}

/**
 * Xử lý số dư lẻ (penny-drop / ledger balancing): BigInt division truncates
 * toward zero, which for two non-negative operands is identical to floor(),
 * so `totalInterest / cycleDays` already IS `Math.floor(totalInterest /
 * cycleDays)` without ever going through a floating-point division. The
 * leftover `remainder` (always in [0, cycleDays)) is added to the LAST day
 * only, so summing every day's dailyInterest always reconstructs
 * totalInterest exactly — see the invariant test in calculations.test.ts.
 */
export function calculateDailyAccrual(
  principal: bigint,
  cycleDays: number,
  termRatePercent: number
): DailyAccrualBreakdown {
  if (!Number.isInteger(cycleDays) || cycleDays < 1) {
    throw new RangeError(`cycleDays must be a positive integer, got ${cycleDays}`);
  }
  const totalInterest = calculateTotalInterest(principal, termRatePercent);
  const days = BigInt(cycleDays);
  const dailyBase = totalInterest / days;
  const remainder = totalInterest - dailyBase * days;
  return { totalInterest, dailyBase, remainder };
}

function addDaysIso(startDate: Date, days: number): string {
  const d = new Date(startDate.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * generatePayoutSchedule — PURE FUNCTION. Given the same inputs it always
 * returns the same schedule; it reads no external state and has no side
 * effects (does not touch a database, clock, or wallet). Day 1..N-1 release
 * dailyBase interest only; day N (đáo hạn) releases dailyBase + remainder
 * interest AND returns the full principal in the same item.
 */
export function generatePayoutSchedule(
  principal: number | bigint,
  cycleDays: number,
  termRatePercent: number,
  startDate: Date
): DailyPayoutScheduleItem[] {
  const p = toIntegerVnd(principal);
  const { dailyBase, remainder } = calculateDailyAccrual(p, cycleDays, termRatePercent);

  const schedule: DailyPayoutScheduleItem[] = [];
  for (let dayIndex = 1; dayIndex <= cycleDays; dayIndex++) {
    const isMaturityDay = dayIndex === cycleDays;
    const dailyInterest = isMaturityDay ? dailyBase + remainder : dailyBase;
    const principalReturn = isMaturityDay ? p : 0n;

    schedule.push({
      dayIndex,
      payoutDate: addDaysIso(startDate, dayIndex),
      dailyInterest,
      principalReturn,
      totalPayout: dailyInterest + principalReturn,
      status: "PENDING",
    });
  }
  return schedule;
}

/** Aggregate helper for the dashboard metric cards — sums PAID vs PENDING interest. */
export function summarizeSchedule(principal: bigint, dailyBase: bigint, schedule: DailyPayoutScheduleItem[]) {
  let totalDisbursedInterest = 0n;
  let pendingInterest = 0n;
  for (const item of schedule) {
    if (item.status === "PAID") totalDisbursedInterest += item.dailyInterest;
    else pendingInterest += item.dailyInterest;
  }
  const isCompleted = schedule.length > 0 && schedule[schedule.length - 1].status === "PAID";
  return {
    principal,
    dailyInterestAmount: dailyBase,
    totalDisbursedInterest,
    pendingInterest,
    isCompleted,
  };
}

/** Formats an integer-VND bigint for display, e.g. 1_500_000n -> "1.500.000". Display-only — never parse this string back into money math. */
export function formatVnd(amount: bigint): string {
  return amount.toLocaleString("vi-VN");
}
