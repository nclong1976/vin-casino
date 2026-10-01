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
  /** Secret gửi kèm lời gọi nội bộ đi ra (function gọi function). */
  internalSecret: string;
  /**
   * Mọi secret nội bộ được chấp nhận khi nhận lời gọi: giá trị trong Vault
   * (pg_cron luôn dùng giá trị này) và secret Edge Function nếu có đặt.
   */
  acceptedSecrets: string[];
  /** Gốc URL của app, không có "/" cuối - cho mã QR /verify và tải font. */
  appPublicUrl: string;
}

let configCache: Promise<RuntimeConfig> | null = null;

/**
 * Cấu hình chạy. Secret nội bộ lấy từ Supabase Vault (esign_internal_secret,
 * đọc qua RPC esign_runtime_config - chỉ service role) vì pg_cron cũng dùng
 * đúng giá trị này; secret Edge Function ESIGN_INTERNAL_SECRET (nếu có) chỉ
 * được chấp nhận thêm, nên 2 nơi có lệch nhau cũng không làm pg_cron bị 403.
 * APP_PUBLIC_URL ưu tiên secret Edge Function, thiếu thì lấy từ Vault.
 * Cache theo instance; lỗi thì không cache.
 */
export function runtimeConfig(): Promise<RuntimeConfig> {
  configCache ??= (async () => {
    const { data, error } = await serviceClient().rpc("esign_runtime_config");
    if (error && !(ENV_INTERNAL_SECRET && ENV_APP_PUBLIC_URL)) {
      throw new Error(`Không đọc được cấu hình từ Vault: ${error.message}`);
    }
    const vaultSecret = error ? "" : String(data?.internal_secret ?? "").trim();
    const envSecret = ENV_INTERNAL_SECRET.trim();
    const appPublicUrl = (ENV_APP_PUBLIC_URL || (error ? "" : String(data?.app_public_url ?? ""))).trim();
    return {
      internalSecret: vaultSecret || envSecret,
      acceptedSecrets: [...new Set([vaultSecret, envSecret].filter(Boolean))],
      appPublicUrl: appPublicUrl.replace(/\/+$/, ""),
    };
  })().catch((e) => {
    configCache = null;
    throw e;
  });
  return configCache;
}

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function isInternalRequest(req: Request): Promise<boolean> {
  const header = req.headers.get("X-Internal-Secret")?.trim();
  if (!header) return false;
  const { acceptedSecrets } = await runtimeConfig().catch(() => ({ acceptedSecrets: [] as string[] }));
  return acceptedSecrets.some((s) => safeEqual(header, s));
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
