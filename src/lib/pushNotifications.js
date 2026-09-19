import { saveAdminPushSubscription, deleteAdminPushSubscription } from "@/lib/supabaseDb";

// Khoá VAPID công khai (an toàn để nhúng thẳng vào bundle client - đúng bản
// chất "public key", không phải secret) - phải khớp đúng VAPID_PUBLIC_KEY
// cấu hình trong Edge Function Secrets của admin-push-send (xem migration
// 20260919090000_admin_push_notifications.sql).
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// Chuyển chuỗi base64url (định dạng VAPID key chuẩn) sang Uint8Array -
// PushManager.subscribe() yêu cầu applicationServerKey ở dạng binary, không
// nhận thẳng chuỗi base64.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && !!VAPID_PUBLIC_KEY;
}

/** Trạng thái đăng ký push HIỆN CÓ của thiết bị/trình duyệt này (null nếu chưa bật). */
export async function getCurrentPushSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Xin quyền + đăng ký nhận thông báo đẩy cho thiết bị này, lưu xuống Supabase. */
export async function subscribeAdminPush(adminUserId) {
  if (!isPushSupported()) {
    throw new Error("Trình duyệt này không hỗ trợ thông báo đẩy hoặc thiếu cấu hình VAPID key.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Bạn chưa cấp quyền hiển thị thông báo cho trang này.");
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  await saveAdminPushSubscription({
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    adminUserId,
    userAgent: navigator.userAgent,
  });

  return subscription;
}

/** Tắt thông báo đẩy trên thiết bị này - huỷ đăng ký cả phía trình duyệt lẫn Supabase. */
export async function unsubscribeAdminPush() {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => {});
  await deleteAdminPushSubscription(endpoint).catch(() => {});
}
