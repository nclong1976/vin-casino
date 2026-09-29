/** Tiện ích HTTP dùng chung cho các Edge Function ký văn bản (viết tay, không sinh tự động). */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ENV_INTERNAL_SECRET = Deno.env.get("ESIGN_INTERNAL_SECRET") ?? "";
const ENV_APP_PUBLIC_URL = Deno.env.get("APP_PUBLIC_URL") ?? "";

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

export interface RuntimeConfig {
  /** Secret cho lời gọi nội bộ (pg_cron / function gọi function). */
  internalSecret: string;
  /** Gốc URL của app, không có "/" cuối - cho mã QR /verify và tải font. */
  appPublicUrl: string;
}

let configCache: Promise<RuntimeConfig> | null = null;

/**
 * Cấu hình chạy: ưu tiên secret Edge Function (ESIGN_INTERNAL_SECRET,
 * APP_PUBLIC_URL); thiếu thì đọc từ Supabase Vault qua RPC
 * esign_runtime_config (chỉ service role gọi được) - để không phải đặt
 * secret trùng lặp ở 2 nơi. Cache theo instance; lỗi thì không cache.
 */
export function runtimeConfig(): Promise<RuntimeConfig> {
  configCache ??= (async () => {
    let internalSecret = ENV_INTERNAL_SECRET;
    let appPublicUrl = ENV_APP_PUBLIC_URL;
    if (!internalSecret || !appPublicUrl) {
      const { data, error } = await serviceClient().rpc("esign_runtime_config");
      if (error) throw new Error(`Không đọc được cấu hình từ Vault: ${error.message}`);
      internalSecret ||= String(data?.internal_secret ?? "");
      appPublicUrl ||= String(data?.app_public_url ?? "");
    }
    return { internalSecret, appPublicUrl: appPublicUrl.replace(/\/+$/, "") };
  })().catch((e) => {
    configCache = null;
    throw e;
  });
  return configCache;
}

export async function isInternalRequest(req: Request): Promise<boolean> {
  const header = req.headers.get("X-Internal-Secret");
  if (!header) return false;
  const { internalSecret } = await runtimeConfig().catch(() => ({ internalSecret: "" }));
  return !!internalSecret && header === internalSecret;
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
  const p = runtimeConfig()
    .then(({ internalSecret }) => {
      if (!internalSecret) return;
      return fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Secret": internalSecret },
        body: JSON.stringify(body),
      });
    })
    .catch(() => undefined);
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(p);
}
