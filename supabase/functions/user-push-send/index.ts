/**
 * Edge Function gửi Web Push cho người dùng (spec hợp đồng mục 0.2 Q2, 5.5).
 *
 * POST { messages: [{ user_id, title, body, url, tag? }] } với
 * X-Internal-Secret - do trigger esign_push_document_notifications() (bảng
 * notifications) gọi qua pg_net. Gửi tới mọi thiết bị trong
 * user_push_subscriptions của từng người nhận; thiết bị đã huỷ (404/410) bị
 * xoá khỏi bảng.
 *
 * Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (tuỳ chọn) - dùng
 * chung với admin-push-send.
 */

import webpush from "npm:web-push@3.6.7";
import { isGone, parseMessages, planDeliveries, type PushSubscriptionRow } from "./core.ts";
import { isInternalRequest, json, serviceClient } from "../_shared/esign/http.ts";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@vinclub.com";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await isInternalRequest(req))) return json({ error: "Forbidden" }, 403);
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ error: "VAPID_NOT_CONFIGURED" }, 500);
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const messages = parseMessages(await req.json().catch(() => null));
  if (!messages.length) return json({ sent: 0, cleaned: 0 });

  const db = serviceClient();
  const userIds = [...new Set(messages.map((m) => m.user_id))];
  const { data: subs, error } = await db.from("user_push_subscriptions").select("endpoint, user_id, p256dh, auth").in("user_id", userIds);
  if (error) return json({ error: error.message }, 500);

  const deliveries = planDeliveries(messages, (subs ?? []) as PushSubscriptionRow[]);
  const results = await Promise.allSettled(
    deliveries.map((d) =>
      webpush.sendNotification({ endpoint: d.subscription.endpoint, keys: { p256dh: d.subscription.p256dh, auth: d.subscription.auth } }, d.payload, { TTL: 86400 }),
    ),
  );

  const dead = new Set<string>();
  results.forEach((r, i) => {
    if (r.status !== "rejected") return;
    const code = (r.reason as { statusCode?: number } | undefined)?.statusCode;
    if (isGone(code)) dead.add(deliveries[i].subscription.endpoint);
    else console.warn("[user-push-send] gửi thất bại:", code, String((r.reason as Error)?.message ?? r.reason).slice(0, 200));
  });
  if (dead.size) await db.from("user_push_subscriptions").delete().in("endpoint", [...dead]);

  return json({ sent: results.filter((r) => r.status === "fulfilled").length, failed: results.length - dead.size - results.filter((r) => r.status === "fulfilled").length, cleaned: dead.size });
});
