import { supabase } from './supabase';

/**
 * Thay thế trackPresenceInRTDB() (Firebase RTDB onDisconnect()) bằng Supabase
 * Realtime Presence - cùng cơ chế "server tự dọn khi socket ngắt kết nối",
 * không cần dịch vụ ngoài Firebase.
 *
 * QUAN TRỌNG: trackPresence() (mọi user đang đăng nhập, tự theo dõi chính
 * mình) và subscribeOnlineUsers() (Admin xem "ai đang online") trước đây mỗi
 * hàm tự gọi supabase.channel('online-users', ...) RIÊNG - nhưng supabase-js
 * trả về LẠI ĐÚNG channel object đã tồn tại cho cùng 1 tên topic thay vì tạo
 * bản mới. Nếu trackPresence() (chạy ngay từ lúc đăng nhập, ở AuthContext)
 * đã subscribe() channel đó trước, thì subscribeOnlineUsers() (chạy sau, khi
 * Admin mở tab Hội viên) gắn thêm .on('presence', ...) vào SAU khi channel
 * đã subscribe() sẽ bị supabase-js chặn với lỗi "cannot add `presence`
 * callbacks for realtime:online-users after `subscribe()`" - đúng lỗi quan
 * sát được, khiến UsersTab.jsx crash toàn bộ (AdminErrorBoundary bắt được).
 *
 * Sửa bằng 1 channel DÙNG CHUNG duy nhất (module-level singleton, đếm tham
 * chiếu): mọi listener 'presence' được gắn ĐÚNG 1 LẦN lúc tạo channel (trước
 * subscribe()), bất kể ai là người tạo trước; các lệnh gọi sau chỉ đăng ký
 * thêm vào registry cục bộ (Set) thay vì tự tạo/subscribe channel mới.
 */
const PRESENCE_CHANNEL_NAME = 'online-users';

let sharedChannel = null;
let sharedChannelKey = null;
let readyPromise = null;
let refCount = 0;
const listeners = new Set();

function notifyListeners() {
  if (!sharedChannel) return;
  let state;
  try {
    state = sharedChannel.presenceState();
  } catch (e) {
    return;
  }
  listeners.forEach((cb) => {
    try {
      cb(state);
    } catch (e) {}
  });
}

// preferredKey: identity dùng cho presence.track() của CHÍNH channel này (cố
// định lúc join, không đổi được sau) - chỉ thật sự cần đúng cho
// trackPresence() (người tự track chính mình), subscribeOnlineUsers() chỉ
// lắng nghe nên dùng key nào cũng được.
function ensureSharedChannel(preferredKey) {
  if (sharedChannel && (!preferredKey || sharedChannelKey === preferredKey)) {
    return { channel: sharedChannel, ready: readyPromise };
  }
  if (sharedChannel) {
    // Channel đã tồn tại nhưng dưới identity KHÁC (vd subscribeOnlineUsers()
    // lỡ tạo trước bằng key placeholder) - dựng lại đúng key để presence
    // của người dùng thật được ghi nhận đúng uid, không bị gộp nhầm.
    supabase.removeChannel(sharedChannel);
  }
  sharedChannelKey = preferredKey || '__viewer__';
  sharedChannel = supabase.channel(PRESENCE_CHANNEL_NAME, {
    config: { presence: { key: sharedChannelKey } },
  });
  sharedChannel
    .on('presence', { event: 'sync' }, notifyListeners)
    .on('presence', { event: 'join' }, notifyListeners)
    .on('presence', { event: 'leave' }, notifyListeners);

  readyPromise = new Promise((resolve) => {
    sharedChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve(sharedChannel);
    });
  });

  return { channel: sharedChannel, ready: readyPromise };
}

function release() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && sharedChannel) {
    const ch = sharedChannel;
    sharedChannel = null;
    sharedChannelKey = null;
    readyPromise = null;
    listeners.clear();
    supabase.removeChannel(ch);
  }
}

export function trackPresence(user) {
  if (!user || (!user.id && !user.email)) return () => {};
  const uid = user.id || 'u_' + user.email.replace(/[^a-zA-Z0-9]/g, '_');

  refCount += 1;
  const { channel, ready } = ensureSharedChannel(uid);
  let tracked = false;

  ready.then((ch) => {
    tracked = true;
    ch.track({
      id: uid,
      name: user.name || user.full_name || user.email,
      email: user.email || '',
      role: user.role || 'user',
      online_at: new Date().toISOString(),
    });
  });

  return () => {
    if (tracked && channel === sharedChannel) {
      channel.untrack().catch(() => null);
    }
    release();
  };
}

/** Trả về hàm huỷ đăng ký. callback nhận map { uid: [{id, name, email, role, online_at}] } */
export function subscribeOnlineUsers(callback) {
  refCount += 1;
  ensureSharedChannel();
  listeners.add(callback);
  notifyListeners();

  return () => {
    listeners.delete(callback);
    release();
  };
}
