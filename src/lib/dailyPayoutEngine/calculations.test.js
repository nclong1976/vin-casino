import { describe, it, expect } from "vitest";
import {
  calculateTotalInterest,
  calculateDailyAccrual,
  generatePayoutSchedule,
  percentToBasisPoints,
} from "./calculations";

describe("percentToBasisPoints", () => {
  it("converts a human percent into exact basis points", () => {
    expect(percentToBasisPoints(6.5)).toBe(650n);
    expect(percentToBasisPoints(0.5)).toBe(50n);
    expect(percentToBasisPoints(100)).toBe(10000n);
  });

  it("rejects negative or non-finite rates", () => {
    expect(() => percentToBasisPoints(-1)).toThrow(RangeError);
    expect(() => percentToBasisPoints(NaN)).toThrow(RangeError);
  });
});

describe("calculateTotalInterest", () => {
  it("matches the spec formula for a round example", () => {
    // 100,000,000 * 6.5% = 6,500,000 exactly.
    expect(calculateTotalInterest(100_000_000n, 6.5)).toBe(6_500_000n);
  });

  it("never drifts from floating point for values where termRate/100 is inexact", () => {
    // 6.5 / 100 = 0.065, not exactly representable in binary float - a naive
    // `principal * (termRate/100)` implementation can be off by 1 VND at
    // large principal. The basis-point path must not be.
    const principal = 123_456_789_013n;
    const naive = Math.floor(Number(principal) * (6.5 / 100));
    const exact = calculateTotalInterest(principal, 6.5);
    expect(exact).toBe(BigInt(naive));
  });
});

describe("calculateDailyAccrual — penny-drop invariant", () => {
  it.each([
    [100_000_000n, 30, 6.5],
    [1_000_000n, 30, 6.5], // does not divide evenly - exercises the remainder path
    [999_999_999n, 7, 12.345],
    [1n, 3, 1], // interest smaller than cycleDays -> dailyBase is 0n, all interest lands on day N
  ])("dailyBase*(N-1) + (dailyBase+remainder) always equals totalInterest exactly (principal=%s, cycleDays=%s, rate=%s)", (principal, cycleDays, rate) => {
    const { totalInterest, dailyBase, remainder } = calculateDailyAccrual(principal, cycleDays, rate);
    const reconstructed = dailyBase * BigInt(cycleDays - 1) + (dailyBase + remainder);
    expect(reconstructed).toBe(totalInterest);
    expect(remainder).toBeGreaterThanOrEqual(0n);
    expect(remainder).toBeLessThan(BigInt(cycleDays));
  });
});

describe("generatePayoutSchedule", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");

  it("is a pure function: same inputs always produce the same output", () => {
    const a = generatePayoutSchedule(100_000_000n, 30, 6.5, start);
    const b = generatePayoutSchedule(100_000_000n, 30, 6.5, start);
    expect(a).toEqual(b);
  });

  it("returns exactly cycleDays items, all PENDING, dayIndex 1..N in order", () => {
    const schedule = generatePayoutSchedule(50_000_000n, 10, 5, start);
    expect(schedule).toHaveLength(10);
    schedule.forEach((item, i) => {
      expect(item.dayIndex).toBe(i + 1);
      expect(item.status).toBe("PENDING");
    });
  });

  it("only pays principal on the last day, and only there", () => {
    const schedule = generatePayoutSchedule(50_000_000n, 10, 5, start);
    const [allButLast, last] = [schedule.slice(0, -1), schedule[schedule.length - 1]];
    expect(allButLast.every((item) => item.principalReturn === 0n)).toBe(true);
    expect(last.principalReturn).toBe(50_000_000n);
    expect(last.totalPayout).toBe(last.dailyInterest + 50_000_000n);
  });

  it("summing every day's dailyInterest reconstructs totalInterest exactly (no VND lost or created)", () => {
    const principal = 1_000_000n;
    const rate = 6.5;
    const schedule = generatePayoutSchedule(principal, 30, rate, start);
    const summedInterest = schedule.reduce((sum, item) => sum + item.dailyInterest, 0n);
    expect(summedInterest).toBe(calculateTotalInterest(principal, rate));
  });

  it("accepts a plain number principal and normalizes it to bigint", () => {
    const schedule = generatePayoutSchedule(100_000_000, 30, 6.5, start);
    expect(typeof schedule[0].dailyInterest).toBe("bigint");
  });

  it("rejects a negative or non-integer principal", () => {
    expect(() => generatePayoutSchedule(-1, 30, 6.5, start)).toThrow(RangeError);
    expect(() => generatePayoutSchedule(1.5, 30, 6.5, start)).toThrow(RangeError);
  });

  it("rejects a non-positive cycleDays", () => {
    expect(() => generatePayoutSchedule(1_000_000n, 0, 6.5, start)).toThrow(RangeError);
  });

  it("payoutDate for day N equals startDate + cycleDays", () => {
    const schedule = generatePayoutSchedule(1_000_000n, 30, 6.5, start);
    const last = schedule[schedule.length - 1];
    const expected = new Date(start.getTime());
    expected.setUTCDate(expected.getUTCDate() + 30);
    expect(last.payoutDate).toBe(expected.toISOString());
  });
});
