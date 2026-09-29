/**
 * Edge Function phát hành một đợt văn bản (spec mục 8.2).
 *
 * POST { campaign_id }
 * - Admin gọi từ trình duyệt (Authorization: Bearer <JWT admin>), hoặc
 * - pg_cron / chính hàm này gọi tiếp (X-Internal-Secret = ESIGN_INTERNAL_SECRET).
 *
 * Secrets cần cấu hình cho Edge Function:
 * - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (Supabase cấp sẵn)
 * - ESIGN_INTERNAL_SECRET, APP_PUBLIC_URL (tuỳ chọn): thiếu thì đọc từ Vault
 *   ('esign_internal_secret', 'esign_app_public_url') - xem runtimeConfig.
 *
 * verify_jwt tắt trong supabase/config.toml vì request nội bộ không có JWT;
 * hàm tự kiểm tra quyền như trên.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { runDispatch } from "./core.ts";
import { supabaseRepo } from "./repo.ts";
import { ANON_KEY, SUPABASE_URL, fireAndForget, isInternalRequest, runtimeConfig, serviceClient } from "../_shared/esign/http.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function isAdminRequest(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await userClient.rpc("is_admin");
  return !error && data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const internal = await isInternalRequest(req);
  if (!internal && !(await isAdminRequest(req))) return json({ error: "Forbidden" }, 403);

  let campaignId = "";
  try {
    campaignId = String((await req.json())?.campaign_id ?? "");
  } catch {
    // body rỗng/sai định dạng - xử lý bên dưới
  }
  if (!campaignId) return json({ error: "campaign_id is required" }, 400);

  const { appPublicUrl } = await runtimeConfig().catch(() => ({ appPublicUrl: "" }));
  const result = await runDispatch(supabaseRepo(serviceClient()), campaignId, {
    verifyBaseUrl: appPublicUrl ? `${appPublicUrl}/verify/` : undefined,
  });

  // Còn người nhận: tự gọi tiếp ở nền (không cần chờ cron) nếu có secret nội bộ.
  if (result.outcome === "continue") fireAndForget("dispatch-campaign", { campaign_id: campaignId });

  const status = result.outcome === "failed" ? 422 : 200;
  return json(result, status);
});
