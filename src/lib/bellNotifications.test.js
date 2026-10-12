import { describe, it, expect } from "vitest";
import { filterBellNotifications } from "./bellNotifications";

const user = { id: "u1", role: "user", created_at: "2026-10-12T10:00:00Z" };

describe("filterBellNotifications", () => {
  it("hides broadcasts created before the account, keeps only the welcome note", () => {
    const list = [
      { id: "n_welcome_u1", user_id: "u1", type: "admin", created_date: "2026-10-12T10:00:00Z" },
      { id: "old", user_id: null, type: "project", created_date: "2026-10-01T00:00:00Z" },
      { id: "other", user_id: "u2", type: "admin", created_date: "2026-10-12T11:00:00Z" },
      { id: "admin", user_id: "admin", type: "admin", created_date: "2026-10-12T11:00:00Z" },
      { id: "doc", user_id: "u1", type: "document", created_date: "2026-10-12T11:00:00Z" },
    ];
    expect(filterBellNotifications(list, user).map((n) => n.id)).toEqual(["n_welcome_u1"]);
  });

  it("keeps broadcasts created after the account", () => {
    const list = [{ id: "new", user_id: null, type: "project", created_date: "2026-10-13T00:00:00Z" }];
    expect(filterBellNotifications(list, user).map((n) => n.id)).toEqual(["new"]);
  });

  it("shows admin broadcasts to admins and keeps all broadcasts when created_at is unknown", () => {
    const list = [
      { id: "a", user_id: "admin", created_date: "2020-01-01T00:00:00Z" },
      { id: "b", user_id: null, created_date: "2020-01-01T00:00:00Z" },
    ];
    expect(filterBellNotifications(list, { id: "x", role: "admin" }).map((n) => n.id)).toEqual(["a", "b"]);
  });
});
