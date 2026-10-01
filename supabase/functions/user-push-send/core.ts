/**
 * Logic gửi Web Push cho người dùng (spec hợp đồng mục 0.2 Q2, 3.1, 5.5),
 * tách khỏi Supabase/web-push để test (core.test.ts).
 */

export interface PushMessage {
  user_id: string;
  title: string;
  body: string;
  url: string;
  tag?: string | null;
}

export interface PushSubscriptionRow {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
}

export interface Delivery {
  subscription: PushSubscriptionRow;
  payload: string;
}

const MAX_MESSAGES = 500;
const MAX_TITLE = 120;
const MAX_BODY = 300;

function clip(s: unknown, n: number): string {
  const t = typeof s === "string" ? s.trim() : "";
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Chỉ nhận đường dẫn nội bộ ("/document/…") để thông báo không mở trang lạ. */
export function safeUrl(url: unknown): string {
  const u = typeof url === "string" ? url.trim() : "";
  return /^\/(?!\/)[\w\-./?=&%]*$/.test(u) ? u : "/";
}

export function parseMessages(body: unknown): PushMessage[] {
  const raw = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(raw)) return [];
  const out: PushMessage[] = [];
  for (const m of raw.slice(0, MAX_MESSAGES)) {
    const r = (m || {}) as Record<string, unknown>;
    const userId = typeof r.user_id === "string" ? r.user_id : "";
    const title = clip(r.title, MAX_TITLE);
    if (!userId || !title) continue;
    out.push({ user_id: userId, title, body: clip(r.body, MAX_BODY), url: safeUrl(r.url), tag: typeof r.tag === "string" ? r.tag.slice(0, 80) : null });
  }
  return out;
}

/** Mỗi thông báo gửi tới mọi thiết bị của đúng người nhận. */
export function planDeliveries(messages: PushMessage[], subs: PushSubscriptionRow[]): Delivery[] {
  const byUser = new Map<string, PushSubscriptionRow[]>();
  for (const s of subs) {
    const list = byUser.get(s.user_id) ?? [];
    list.push(s);
    byUser.set(s.user_id, list);
  }
  const out: Delivery[] = [];
  for (const m of messages) {
    const payload = JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag ?? undefined });
    for (const s of byUser.get(m.user_id) ?? []) out.push({ subscription: s, payload });
  }
  return out;
}

/** Mã lỗi web-push cho biết thiết bị đã huỷ đăng ký → xoá khỏi bảng. */
export function isGone(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}
