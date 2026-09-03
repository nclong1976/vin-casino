import { supabase } from './supabase';

/**
 * Thay thế trackPresenceInRTDB() (Firebase RTDB onDisconnect()) bằng Supabase
 * Realtime Presence - cùng cơ chế "server tự dọn khi socket ngắt kết nối",
 * không cần dịch vụ ngoài Firebase.
 */
const PRESENCE_CHANNEL_NAME = 'online-users';

export function trackPresence(user) {
  if (!user || (!user.id && !user.email)) return () => {};
  const uid = user.id || 'u_' + user.email.replace(/[^a-zA-Z0-9]/g, '_');

  const channel = supabase.channel(PRESENCE_CHANNEL_NAME, {
    config: { presence: { key: uid } },
  });

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({
        id: uid,
        name: user.name || user.full_name || user.email,
        email: user.email || '',
        role: user.role || 'user',
        online_at: new Date().toISOString(),
      });
    }
  });

  return () => {
    channel.untrack().catch(() => null);
    supabase.removeChannel(channel);
  };
}

/** Trả về hàm huỷ đăng ký. callback nhận map { uid: [{id, name, email, role, online_at}] } */
export function subscribeOnlineUsers(callback) {
  const channel = supabase.channel(PRESENCE_CHANNEL_NAME, {
    config: { presence: { key: '__viewer__' } },
  });

  const emit = () => {
    try {
      callback(channel.presenceState());
    } catch (e) {}
  };

  channel
    .on('presence', { event: 'sync' }, emit)
    .on('presence', { event: 'join' }, emit)
    .on('presence', { event: 'leave' }, emit)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
