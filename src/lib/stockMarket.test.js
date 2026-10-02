import { describe, it, expect } from "vitest";
import {
  sessionAt,
  allowedOrderTypes,
  tickSize,
  isValidTick,
  stepPrice,
  holdAmount,
  estimateCost,
  maxQty,
  validateOrder,
  changePct,
} from "./stockMarket";

// 2026-10-05 là thứ Hai. Giờ VN = UTC+7.
const vn = (hhmm, day = "2026-10-05") => new Date(`${day}T${hhmm}:00+07:00`);
const quote = { reference_price: 18350, ceiling_price: 19600, floor_price: 17100, last_price: 18350 };

describe("sessionAt", () => {
  it("theo khung giờ HOSE", () => {
    expect(sessionAt(vn("08:59"))).toBe("PRE_OPEN");
    expect(sessionAt(vn("09:00"))).toBe("ATO");
    expect(sessionAt(vn("09:15"))).toBe("CONT");
    expect(sessionAt(vn("11:30"))).toBe("BREAK");
    expect(sessionAt(vn("13:00"))).toBe("CONT");
    expect(sessionAt(vn("14:30"))).toBe("ATC");
    expect(sessionAt(vn("14:45"))).toBe("CLOSED");
  });

  it("cuối tuần và ngày nghỉ lễ đóng cửa", () => {
    expect(sessionAt(vn("10:00", "2026-10-03"))).toBe("CLOSED");
    expect(sessionAt(vn("10:00"), { "2026-10-05": false })).toBe("CLOSED");
    expect(sessionAt(vn("10:00", "2026-10-03"), { "2026-10-03": true })).toBe("CONT");
  });

  it("loại lệnh hợp lệ theo phiên", () => {
    expect(allowedOrderTypes("CONT")).toEqual(["LO", "MP"]);
    expect(allowedOrderTypes("CLOSED")).toEqual(["LO", "ATO"]);
    expect(allowedOrderTypes("ATC")).toEqual(["LO", "ATC"]);
  });
});

describe("bước giá", () => {
  it("10 / 50 / 100 đồng", () => {
    expect(tickSize(9990)).toBe(10);
    expect(tickSize(18350)).toBe(50);
    expect(tickSize(88500)).toBe(100);
    expect(isValidTick(18350)).toBe(true);
    expect(isValidTick(18360)).toBe(false);
  });

  it("tăng/giảm 1 bước, kẹp trong biên độ", () => {
    expect(stepPrice(18350, 1, quote)).toBe(18400);
    expect(stepPrice(18350, -1, quote)).toBe(18300);
    expect(stepPrice(19600, 1, quote)).toBe(19600);
    expect(stepPrice(17100, -1, quote)).toBe(17100);
    expect(stepPrice(50000, -1, { floor_price: 0, ceiling_price: 1e9 })).toBe(49950);
  });
});

describe("tiền phong toả", () => {
  it("LO theo giá đặt, MP theo giá trần (giống server)", () => {
    expect(holdAmount({ orderType: "LO", qty: 100, limitPrice: 18350, quote, feeRate: 0.0015 })).toBe(1837753);
    expect(holdAmount({ orderType: "MP", qty: 100, quote, feeRate: 0.0015 })).toBe(1962940);
  });

  it("ước tính giá trị + phí khi khớp", () => {
    expect(estimateCost({ orderType: "MP", qty: 100, quote, feeRate: 0.0015 })).toEqual({
      price: 18350,
      value: 1835000,
      fee: 2753,
      total: 1837753,
    });
  });

  it("khối lượng tối đa theo lô 100", () => {
    expect(maxQty({ balance: 10000000, orderType: "LO", limitPrice: 18350, quote, feeRate: 0.0015 })).toBe(500);
    expect(maxQty({ balance: 1000, orderType: "MP", quote, feeRate: 0 })).toBe(0);
  });
});

describe("validateOrder", () => {
  it("bắt lỗi như server", () => {
    expect(validateOrder({ orderType: "MP", qty: 100, quote, session: "CLOSED" })).toBe("ORDER_TYPE_NOT_ALLOWED_IN_SESSION");
    expect(validateOrder({ orderType: "ATO", qty: 150, quote, session: "CLOSED" })).toBe("INVALID_LOT");
    expect(validateOrder({ orderType: "LO", qty: 50, limitPrice: 18350, quote, session: "CONT" })).toBeNull();
    expect(validateOrder({ orderType: "LO", qty: 100, limitPrice: 25000, quote, session: "CONT" })).toBe("PRICE_OUT_OF_BAND");
    expect(validateOrder({ orderType: "LO", qty: 100, limitPrice: 18360, quote, session: "CONT" })).toBe("INVALID_TICK_SIZE");
  });

  it("% thay đổi so với tham chiếu", () => {
    expect(changePct({ reference_price: 18350, last_price: 18000 })).toBe(-1.91);
  });
});
