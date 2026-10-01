import { describe, it, expect } from "vitest";
import { canExtend, canRemind, canRevoke, displayStatus } from "./esignStatus";

const now = new Date("2026-10-02T00:00:00Z");
const d = (patch) => ({ status: "pending", ...patch });

describe("displayStatus", () => {
  it("derives sent / delivered / viewed / expired from a pending document", () => {
    expect(displayStatus(d({}), now)).toBe("sent");
    expect(displayStatus(d({ delivered_at: "x" }), now)).toBe("delivered");
    expect(displayStatus(d({ delivered_at: "x", first_viewed_at: "y" }), now)).toBe("viewed");
    expect(displayStatus(d({ first_viewed_at: "y", due_at: "2026-10-01T00:00:00Z" }), now)).toBe("expired");
  });

  it("keeps final statuses", () => {
    for (const s of ["signed", "approved", "rejected", "expired", "revoked"]) expect(displayStatus({ status: s }, now)).toBe(s);
  });

  it("allows actions only on open documents", () => {
    expect(canRemind(d({}))).toBe(true);
    expect(canRemind({ status: "expired" })).toBe(false);
    expect(canExtend({ status: "expired" })).toBe(true);
    expect(canRevoke({ status: "signed", locked_at: "x" })).toBe(false);
  });
});
