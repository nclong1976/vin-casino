import { assertEquals } from "jsr:@std/assert@1";
import { isGone, parseMessages, planDeliveries, safeUrl } from "./core.ts";

Deno.test("parseMessages bỏ dòng thiếu dữ liệu, cắt chuỗi dài, chặn URL ngoài", () => {
  const msgs = parseMessages({
    messages: [
      { user_id: "u1", title: "Bạn có văn bản mới", body: "x".repeat(400), url: "/document/d1", tag: "document-d1" },
      { user_id: "", title: "thiếu user" },
      { user_id: "u2", title: "" },
      { user_id: "u3", title: "Link lạ", url: "https://evil.example" },
      { user_id: "u4", title: "Protocol-relative", url: "//evil.example/x" },
    ],
  });
  assertEquals(msgs.length, 3);
  assertEquals(msgs[0].body.length, 300);
  assertEquals(msgs[0].url, "/document/d1");
  assertEquals(msgs[1].url, "/");
  assertEquals(msgs[2].url, "/");
  assertEquals(parseMessages(null), []);
  assertEquals(parseMessages({ messages: "x" }), []);
});

Deno.test("planDeliveries gửi mỗi thông báo tới mọi thiết bị của đúng người", () => {
  const subs = [
    { endpoint: "https://p/1", user_id: "u1", p256dh: "k", auth: "a" },
    { endpoint: "https://p/2", user_id: "u1", p256dh: "k", auth: "a" },
    { endpoint: "https://p/3", user_id: "u2", p256dh: "k", auth: "a" },
  ];
  const plan = planDeliveries(
    [
      { user_id: "u1", title: "A", body: "", url: "/document/d1" },
      { user_id: "u9", title: "B", body: "", url: "/" },
    ],
    subs,
  );
  assertEquals(plan.map((d) => d.subscription.endpoint), ["https://p/1", "https://p/2"]);
  assertEquals(JSON.parse(plan[0].payload), { title: "A", body: "", url: "/document/d1" });
});

Deno.test("safeUrl / isGone", () => {
  assertEquals(safeUrl("/document/abc?x=1"), "/document/abc?x=1");
  assertEquals(safeUrl("javascript:alert(1)"), "/");
  assertEquals(isGone(410), true);
  assertEquals(isGone(500), false);
});
