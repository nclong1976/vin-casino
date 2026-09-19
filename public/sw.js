// Minimal service worker — required by Chrome/Android's install criteria so
// "Add to Home Screen" actually launches in fullscreen/standalone mode
// instead of falling back to a plain browser bookmark shortcut. Does not
// cache anything; every request just passes straight through to the network.
self.addEventListener("fetch", () => {});

// Thông báo đẩy (Web Push) cho quản trị viên - nhận được ngay cả khi đã
// đóng hẳn trình duyệt/tab (xem src/lib/pushNotifications.js và Edge
// Function supabase/functions/admin-push-send). Payload luôn là JSON
// {title, body, url} do server tự dựng (không đọc trực tiếp từ Postgres ở
// đây - service worker không có quyền truy cập Supabase).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "VinClub Admin";
  const options = {
    body: data.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
    data: { url: data.url || "/admin" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Bấm vào thông báo - focus tab admin đang mở sẵn (nếu có) thay vì luôn mở
// tab mới, tránh admin có nhiều tab "/admin" chồng chất mỗi lần bấm thông báo.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
