import { describe, it, expect } from "vitest";
import { generatePayoutSchedule } from "./calculations";
import { runDailyPayoutWorker } from "./worker";

function makeContract(overrides = {}) {
  return {
    id: "c1",
    userId: "u1",
    principal: 1_000_000n,
    cycleDays: 3,
    termRate: 3,
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2026-01-04T00:00:00.000Z",
    status: "ACTIVE",
    ...overrides,
  };
}

describe("runDailyPayoutWorker", () => {
  it("only pays items whose payoutDate has arrived, leaving later days PENDING", () => {
    const contract = makeContract();
    const schedule = generatePayoutSchedule(contract.principal, contract.cycleDays, contract.termRate, new Date(contract.startDate));
    const schedules = new Map([[contract.id, schedule]]);

    // now = exactly day 1's payoutDate, before day 2/3
    const now = new Date(schedule[0].payoutDate);
    const result = runDailyPayoutWorker([contract], schedules, now);

    const updated = result.updatedSchedules.get(contract.id);
    expect(updated[0].status).toBe("PAID");
    expect(updated[1].status).toBe("PENDING");
    expect(updated[2].status).toBe("PENDING");
    expect(result.auditLog).toHaveLength(1);
    expect(result.completedContracts.has(contract.id)).toBe(false);
  });

  it("is idempotent: running again with the same 'now' does not re-pay or duplicate audit entries", () => {
    const contract = makeContract();
    const schedule = generatePayoutSchedule(contract.principal, contract.cycleDays, contract.termRate, new Date(contract.startDate));
    let schedules = new Map([[contract.id, schedule]]);
    const now = new Date(schedule[0].payoutDate);

    const first = runDailyPayoutWorker([contract], schedules, now);
    schedules = new Map([[contract.id, first.updatedSchedules.get(contract.id)]]);

    const second = runDailyPayoutWorker([contract], schedules, now);
    expect(second.updatedSchedules.size).toBe(0);
    expect(second.auditLog).toHaveLength(0);
  });

  it("marks the contract completed and pays principal+interest together when the final day is reached", () => {
    const contract = makeContract();
    const schedule = generatePayoutSchedule(contract.principal, contract.cycleDays, contract.termRate, new Date(contract.startDate));
    const schedules = new Map([[contract.id, schedule]]);

    const now = new Date(schedule[schedule.length - 1].payoutDate);
    const result = runDailyPayoutWorker([contract], schedules, now);

    const updated = result.updatedSchedules.get(contract.id);
    expect(updated.every((item) => item.status === "PAID")).toBe(true);
    expect(result.completedContracts.get(contract.id)).toBe("COMPLETED");

    const finalDayEntry = result.auditLog.find((e) => e.dayIndex === contract.cycleDays);
    expect(finalDayEntry.type).toBe("INTEREST_AND_PRINCIPAL");
    expect(finalDayEntry.amount).toBe(schedule[schedule.length - 1].totalPayout);
  });

  it("skips contracts that are not ACTIVE", () => {
    const contract = makeContract({ status: "COMPLETED" });
    const schedule = generatePayoutSchedule(contract.principal, contract.cycleDays, contract.termRate, new Date(contract.startDate));
    const schedules = new Map([[contract.id, schedule]]);
    const now = new Date(schedule[schedule.length - 1].payoutDate);

    const result = runDailyPayoutWorker([contract], schedules, now);
    expect(result.updatedSchedules.size).toBe(0);
    expect(result.auditLog).toHaveLength(0);
  });
});
