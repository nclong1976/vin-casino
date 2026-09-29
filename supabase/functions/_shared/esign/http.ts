/** Tiện ích HTTP dùng chung cho các Edge Function ký văn bản (viết tay, không sinh tự động). */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const INTERNAL_SECRET = Deno.env.get("ESIGN_INTERNAL_SECRET") ?? "";
export const APP_PUBLIC_URL = (Deno.env.get("APP_PUBLIC_URL") ?? "").replace(/\/+$/, "");

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export function isInternalRequest(req: Request): boolean {
  return !!INTERNAL_SECRET && req.headers.get("X-Internal-Secret") === INTERNAL_SECRET;
}

/** Người dùng đang đăng nhập (từ JWT) + client mang JWT đó; null nếu không hợp lệ. */
export async function authedUser(req: Request): Promise<{ id: string; client: SupabaseClient } | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(auth.slice(7));
  if (error || !data?.user?.id || data.user.is_anonymous) return null;
  return { id: data.user.id, client };
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? req.headers.get("cf-connecting-ip");
}

/** Gọi 1 Edge Function khác ở nền (không chờ), giữ instance sống tới khi xong. */
export function fireAndForget(fn: string, body: unknown): void {
  if (!INTERNAL_SECRET) return;
  const p = fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
    body: JSON.stringify(body),
  }).catch(() => undefined);
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(p);
}
