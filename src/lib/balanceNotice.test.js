import { describe, expect, it } from "vitest";
import { accountLabel, balanceChangeNotice, toMemo } from "./balanceNotice";

describe("balanceChangeNotice", () => {
  it("cộng tiền: định dạng giống tin nhắn ngân hàng", () => {
    const n = balanceChangeNotice({ user: { identifier: "minh duc80" }, delta: 100000000, balanceAfter: 250500000, at: "2026-10-02T06:51:53Z" });
    expect(n.title).toBe("Biến động số dư");
    expect(n.type).toBe("deposit");
    expect(n.content).toBe("TK minh duc80: +100,000,000 VND luc 13:51 02/10/2026. SD: 250,500,000 VND. ND: CT CP VINCLUB CHUYEN TIEN");
  });

  it("trừ tiền, có lý do, không có số dư", () => {
    const n = balanceChangeNotice({ user: { email: "dat1978@vinclub.com" }, delta: -5000000, memo: "Giải ngân dự án Quỹ Thiện Tâm", at: "2026-09-29T17:05:00Z" });
    expect(n.type).toBe("withdraw");
    expect(n.content).toBe("TK dat1978: -5,000,000 VND luc 00:05 30/09/2026. ND: GIAI NGAN DU AN QUY THIEN TAM");
  });

  it("toMemo / accountLabel", () => {
    expect(toMemo("  Đã   nạp tiền  ")).toBe("DA NAP TIEN");
    expect(accountLabel({ id: "u1" })).toBe("u1");
  });
});
