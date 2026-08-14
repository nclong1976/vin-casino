import { ref, set, update, onValue, onDisconnect } from "firebase/database";
import { rtdb, firebaseAuthReady } from "./firebase";
import { base44 } from "@/api/base44Client";

/**
 * Defers an onValue-based subscription until the Firebase Auth session
 * (see firebaseAuthReady in ./firebase) is ready, while still returning an
 * unsubscribe function synchronously so callers don't need to change.
 * Subscribing before auth resolves hits the RTDB rules with no token yet
 * and the listener gets permanently cancelled with permission_denied.
 */
function deferredSubscribe(subscribeFn) {
  let liveUnsub = null;
  let cancelled = false;
  firebaseAuthReady.then(() => {
    if (!cancelled) liveUnsub = subscribeFn();
  });
  return () => {
    cancelled = true;
    if (liveUnsub) liveUnsub();
  };
}

const BASE_RTDB_URL = "https://gen-lang-client-0800418734-default-rtdb.asia-southeast1.firebasedatabase.app";

function cleanObject(obj) {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(cleanObject);
  const cleaned = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = (typeof val === "object" && val !== null) ? cleanObject(val) : val;
    }
  }
  return cleaned;
}

export async function safeWriteRTDB(path, data, mode = "update") {
  if (!path || !data) return false;
  const cleaned = cleanObject(data);
  await firebaseAuthReady;

  try {
    const dbRef = ref(rtdb, path);
    if (mode === "set") {
      await set(dbRef, cleaned);
    } else {
      await update(dbRef, cleaned);
    }
    console.log(`[RTDB Sync] ✅ SDK write succeeded at /${path}`);
    return true;
  } catch (sdkErr) {
    console.warn(`[RTDB Sync] SDK write failed at /${path}, executing REST PUT fallback...`, sdkErr?.message || sdkErr);
    try {
      const url = `${BASE_RTDB_URL}/${path}.json`;
      const res = await fetch(url, {
        method: mode === "set" ? "PUT" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleaned)
      });
      const resData = await res.json();
      console.log(`[RTDB Sync] ✅ REST fallback succeeded at /${path}:`, resData ? "OK" : "ERR");
      return true;
    } catch (restErr) {
      console.error(`[RTDB Sync] ❌ REST fallback failed at /${path}:`, restErr?.message || restErr);
      return false;
    }
  }
}

/**
 * 1. Node: users/{uid}
 * Lưu thông tin tài khoản, số dư tiền mặt (balance), cấp độ VIP, avatar, quyền role.
 */
export async function pushUserToRTDB(user) {
  if (!user || (!user.id && !user.email)) return;
  const uid = user.id || 'u_' + user.email.replace(/[^a-zA-Z0-9]/g, '_');

  const userData = {
    id: uid,
    email: user.email || "",
    identifier: user.identifier || user.email || "",
    name: user.name || user.full_name || "Hội viên VinClub",
    full_name: user.full_name || user.name || "Hội viên VinClub",
    phone: user.phone || "",
    role: user.role || "user",
    avatar: user.avatar || user.avatar_url || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde",
    balance: Number(user.balance || 0),
    total_deposited: Number(user.total_deposited || 0),
    membership_tier: user.membership_tier || "VIP 1 - Gold",
    vip_level: user.vip_level || "VIP 1",
    is_locked: !!user.is_locked,
    bank_accounts: user.bank_accounts || [],
    bank_name: user.bank_name || "",
    account_number: user.account_number || "",
    account_holder: user.account_holder || "",
    created_at: user.created_at || new Date().toISOString(),
    last_active: new Date().toISOString(),
  };

  return safeWriteRTDB(`users/${uid}`, userData, "set");
}

/**
 * Real-time balance & status subscriber for individual logged-in user
 */
export function subscribeUserFromRTDB(userId, onUserReceived) {
  if (!userId) return () => {};
  return deferredSubscribe(() => {
  const userRef = ref(rtdb, `users/${userId}`);
  return onValue(userRef, (snapshot) => {
    if (snapshot.exists()) {
      const rtdbUser = snapshot.val();
      try {
        const currentLocalStr = localStorage.getItem('base44_local_user');
        if (currentLocalStr) {
          const currentLocal = JSON.parse(currentLocalStr);
          if (currentLocal.id === userId || currentLocal.email === userId) {
            if (currentLocal.balance !== rtdbUser.balance || currentLocal.is_locked !== rtdbUser.is_locked) {
              const updatedLocal = { ...currentLocal, balance: rtdbUser.balance, is_locked: rtdbUser.is_locked };
              localStorage.setItem('base44_local_user', JSON.stringify(updatedLocal));
              window.dispatchEvent(new CustomEvent("vinclub:balance_updated", {
                detail: { userId, newBalance: rtdbUser.balance, user: updatedLocal }
              }));
            }
          }
        }
      } catch (e) {}

      if (typeof onUserReceived === "function") {
        onUserReceived(rtdbUser);
      }
    }
  }, (err) => console.warn(`[RTDB User Sub ${userId}] Error:`, err));
  });
}

/**
 * 2. Node: online_users/{uid}
 * Theo dõi số lượng người dùng đang hoạt động thực tế trên ứng dụng.
 */
export function trackPresenceInRTDB(user) {
  if (!user || (!user.id && !user.email)) return () => {};
  const uid = user.id || 'u_' + user.email.replace(/[^a-zA-Z0-9]/g, '_');

  return deferredSubscribe(() => {
    const connectedRef = ref(rtdb, ".info/connected");
    const onlineRef = ref(rtdb, `online_users/${uid}`);

    return onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        set(onlineRef, {
          id: uid,
          name: user.name || user.full_name || user.email,
          email: user.email || "",
          role: user.role || "user",
          online: true,
          last_seen: new Date().toISOString(),
        }).catch(() => null);

        onDisconnect(onlineRef).remove().catch(() => null);
      }
    });
  });
}

/**
 * Admin Listener: users & online_users
 */
export function subscribeAllUsersFromRTDB(onUpdate) {
  return deferredSubscribe(() => {
  const usersRef = ref(rtdb, "users");
  const onlineRef = ref(rtdb, "online_users");

  let latestUsers = {};
  let latestOnline = {};

  const notifyAdmin = () => {
    const userList = Object.values(latestUsers);
    const onlineMap = latestOnline;

    if (userList.length > 0) {
      try {
        const rawLocalReg = localStorage.getItem("base44_registered_users");
        let localRegs = rawLocalReg ? JSON.parse(rawLocalReg) : [];
        let modified = false;

        userList.forEach((rtdbUser) => {
          const idx = localRegs.findIndex((u) => u.id === rtdbUser.id || (u.email && u.email === rtdbUser.email));
          if (idx === -1) {
            localRegs.push(rtdbUser);
            modified = true;
          } else {
            if (localRegs[idx].balance !== rtdbUser.balance || localRegs[idx].is_locked !== rtdbUser.is_locked) {
              modified = true;
            }
            localRegs[idx] = { ...localRegs[idx], ...rtdbUser };
          }
        });

        if (modified) {
          localStorage.setItem("base44_registered_users", JSON.stringify(localRegs));
          localStorage.setItem("base44_entity_User", JSON.stringify(localRegs));
          
          const currentLocalStr = localStorage.getItem("base44_local_user");
          if (currentLocalStr) {
            const currentLocal = JSON.parse(currentLocalStr);
            const rtdbMatch = userList.find(u => u.id === currentLocal.id || (u.email && u.email === currentLocal.email));
            if (rtdbMatch && (currentLocal.balance !== rtdbMatch.balance || currentLocal.is_locked !== rtdbMatch.is_locked)) {
              const updatedLocal = { ...currentLocal, balance: rtdbMatch.balance, is_locked: rtdbMatch.is_locked };
              localStorage.setItem("base44_local_user", JSON.stringify(updatedLocal));
              window.dispatchEvent(new CustomEvent("vinclub:balance_updated", { detail: { userId: currentLocal.id, newBalance: rtdbMatch.balance } }));
            }
          }

          if (base44.entities.User) {
            base44.entities.User.notifySubscribers();
          }
        }
      } catch (e) {}
    }

    if (typeof onUpdate === "function") {
      onUpdate(userList, onlineMap);
    }
  };

  const unsubUsers = onValue(usersRef, (snapshot) => {
    if (snapshot.exists()) {
      latestUsers = snapshot.val();
    } else {
      latestUsers = {};
    }
    notifyAdmin();
  }, (err) => console.warn("[RTDB Admin Sub] Users read error:", err));

  const unsubOnline = onValue(onlineRef, (snapshot) => {
    if (snapshot.exists()) {
      latestOnline = snapshot.val();
    } else {
      latestOnline = {};
    }
    notifyAdmin();
  }, (err) => console.warn("[RTDB Admin Sub] Online read error:", err));

  return () => {
    unsubUsers();
    unsubOnline();
  };
  });
}

/**
 * 3. Node: casino_config
 * Lưu điều chỉnh tỷ lệ phế, chế độ bẻ cầu (ép Player/Banker thắng/thua), trạng thái bảo trì bàn chơi.
 */
export async function pushCasinoConfigToRTDB(config) {
  if (!config) return;
  const payload = {
    ...config,
    house_edge: config.house_edge || 5, // Tỷ lệ phế 5%
    forced_mode_enabled: true,
    updated_at: new Date().toISOString()
  };
  return safeWriteRTDB("casino_config", payload, "set");
}

export function subscribeCasinoConfigFromRTDB(onConfigReceived) {
  return deferredSubscribe(() => {
  const configRef = ref(rtdb, "casino_config");
  return onValue(configRef, (snapshot) => {
    if (snapshot.exists()) {
      const config = snapshot.val();
      try {
        localStorage.setItem("vinclub_casino_config_v1", JSON.stringify(config));
        window.dispatchEvent(new CustomEvent("vinclub:casino_config_updated", { detail: config }));
      } catch (e) {}

      if (typeof onConfigReceived === "function") {
        onConfigReceived(config);
      }
    }
  }, (err) => console.warn("[RTDB Casino Config Sub] Error:", err));
  });
}

/**
 * 4. Node: investment_projects & projects
 * Cập nhật dự án BĐS (Vinhomes Grand Park, Ocean Park...), tiến độ phân lô & lợi nhuận ngày real-time.
 */
export async function pushProjectToRTDB(project) {
  if (!project || !project.id) return;
  const payload = {
    ...project,
    daily_return_rate: project.daily_return_rate || project.annual_return || 14.5,
    subdivision_progress: project.subdivision_progress || "Phân lô 85% - Đang bàn giao",
    synced_at: new Date().toISOString()
  };
  await safeWriteRTDB(`investment_projects/${project.id}`, payload, "set");
  return safeWriteRTDB(`projects/${project.id}`, payload, "set");
}

export function subscribeProjectsFromRTDB(onProjectsReceived) {
  return deferredSubscribe(() => {
  const projectsRef = ref(rtdb, "investment_projects");
  return onValue(projectsRef, (snapshot) => {
    if (snapshot.exists()) {
      const projMap = snapshot.val();
      const projList = Object.values(projMap);

      try {
        const rawProjs = localStorage.getItem("base44_entity_Project");
        let localProjs = rawProjs ? JSON.parse(rawProjs) : [];
        let modified = false;

        projList.forEach(p => {
          const idx = localProjs.findIndex(lp => lp.id === p.id);
          if (idx === -1) {
            localProjs.push(p);
            modified = true;
          } else {
            if (JSON.stringify(localProjs[idx]) !== JSON.stringify(p)) {
              localProjs[idx] = p;
              modified = true;
            }
          }
        });

        if (modified) {
          localStorage.setItem("base44_entity_Project", JSON.stringify(localProjs));
          if (base44.entities.Project) {
            base44.entities.Project.notifySubscribers();
          }
        }
      } catch (e) {}

      if (typeof onProjectsReceived === "function") {
        onProjectsReceived(projList);
      }
    }
  }, (err) => console.warn("[RTDB Projects Sub] Error:", err));
  });
}

/**
 * 5. Node: wallet_transactions
 * Ghi nhận yêu cầu Nạp/Rút tiền real-time để hiển thị tức thì trên Bảng quản trị Admin.
 */
export async function pushWalletTransactionToRTDB(tx) {
  if (!tx || !tx.id) return;
  const payload = {
    ...tx,
    synced_at: new Date().toISOString()
  };
  return safeWriteRTDB(`wallet_transactions/${tx.id}`, payload, "set");
}

/**
 * 6. Node: notifications/{uid} & notifications
 * Bắn thông báo đẩy biến động số dư, phê duyệt nạp rút tiền real-time về máy người dùng.
 */
export async function pushNotificationToRTDB(notif) {
  if (!notif || !notif.id) return;
  const uid = notif.user_id || "all";
  const payload = {
    ...notif,
    synced_at: new Date().toISOString()
  };
  await safeWriteRTDB(`notifications/${notif.id}`, payload, "set");

  if (uid !== "all") {
    await safeWriteRTDB(`notifications/${uid}/${notif.id}`, payload, "set");
  }
  return true;
}

export function subscribeNotificationsFromRTDB(onNotifsReceived) {
  return deferredSubscribe(() => {
  const notifRef = ref(rtdb, "notifications");
  return onValue(notifRef, (snapshot) => {
    if (snapshot.exists()) {
      const notifData = snapshot.val();
      let notifList = [];

      if (typeof notifData === "object") {
        Object.keys(notifData).forEach(k => {
          const item = notifData[k];
          if (item && item.id) {
            notifList.push(item);
          } else if (typeof item === "object") {
            Object.values(item).forEach(subItem => {
              if (subItem && subItem.id) notifList.push(subItem);
            });
          }
        });
      }

      try {
        const rawNotifs = localStorage.getItem("base44_entity_Notification");
        let localNotifs = rawNotifs ? JSON.parse(rawNotifs) : [];
        let modified = false;

        notifList.forEach(n => {
          const idx = localNotifs.findIndex(ln => ln.id === n.id);
          if (idx === -1) {
            localNotifs.unshift(n);
            modified = true;
          }
        });

        if (modified) {
          localStorage.setItem("base44_entity_Notification", JSON.stringify(localNotifs));
          if (base44.entities.Notification) {
            base44.entities.Notification.notifySubscribers();
          }
        }
      } catch (e) {}

      if (typeof onNotifsReceived === "function") {
        onNotifsReceived(notifList);
      }
    }
  }, (err) => console.warn("[RTDB Notifs Sub] Error:", err));
  });
}

/**
 * 7. Node: entities/{entityName}/{uid}
 * Lưu ngân hàng đã liên kết (BankAccount), hợp đồng chữ ký số (Signature) và tin nhắn hỗ trợ (Message).
 */
export async function pushGenericEntityToRTDB(entityName, id, data) {
  if (!entityName || !id || !data) return;
  const payload = {
    ...data,
    synced_at: new Date().toISOString()
  };

  await safeWriteRTDB(`entities/${entityName}/${id}`, payload, "set");

  if (entityName === "Message") {
    await safeWriteRTDB(`messages/${id}`, payload, "set");
  }
  return true;
}

export async function pushMessageToRTDB(msg) {
  return pushGenericEntityToRTDB("Message", msg.id, msg);
}

export function subscribeMessagesFromRTDB(onMessagesReceived) {
  return deferredSubscribe(() => {
  const messagesRef = ref(rtdb, "entities/Message");
  const legacyMessagesRef = ref(rtdb, "messages");

  const notify = (msgMap) => {
    if (!msgMap) return;
    const msgList = Object.values(msgMap);
    try {
      const rawMsgs = localStorage.getItem("base44_entity_Message");
      let localMsgs = rawMsgs ? JSON.parse(rawMsgs) : [];
      let modified = false;

      msgList.forEach(m => {
        const idx = localMsgs.findIndex(lm => lm.id === m.id);
        if (idx === -1) {
          localMsgs.push(m);
          modified = true;
        } else {
          if (JSON.stringify(localMsgs[idx]) !== JSON.stringify(m)) {
            localMsgs[idx] = m;
            modified = true;
          }
        }
      });

      if (modified) {
        localStorage.setItem("base44_entity_Message", JSON.stringify(localMsgs));
        localStorage.setItem("vinclub_msg_update", Date.now().toString());
        if (base44.entities.Message) {
          base44.entities.Message.notifySubscribers();
        }
      }
    } catch (e) {}

    if (typeof onMessagesReceived === "function") {
      onMessagesReceived(msgList);
    }
  };

  const unsub1 = onValue(messagesRef, (snapshot) => {
    if (snapshot.exists()) notify(snapshot.val());
  });

  const unsub2 = onValue(legacyMessagesRef, (snapshot) => {
    if (snapshot.exists()) notify(snapshot.val());
  });

  return () => {
    unsub1();
    unsub2();
  };
  });
}

export function subscribeWalletTransactionsFromRTDB(onTxReceived) {
  return deferredSubscribe(() => {
  const txRef = ref(rtdb, "wallet_transactions");
  return onValue(txRef, (snapshot) => {
    if (snapshot.exists()) {
      const txData = snapshot.val();
      const txList = Object.values(txData || {});
      try {
        const rawLocal = localStorage.getItem("base44_entity_WalletTransaction");
        let localTxs = rawLocal ? JSON.parse(rawLocal) : [];
        let modified = false;

        txList.forEach(t => {
          if (!t || !t.id) return;
          const idx = localTxs.findIndex(lt => lt.id === t.id);
          if (idx === -1) {
            localTxs.unshift(t);
            modified = true;
          } else {
            if (JSON.stringify(localTxs[idx]) !== JSON.stringify(t)) {
              localTxs[idx] = t;
              modified = true;
            }
          }
        });

        if (modified) {
          localStorage.setItem("base44_entity_WalletTransaction", JSON.stringify(localTxs));
          if (base44.entities.WalletTransaction) {
            base44.entities.WalletTransaction.notifySubscribers();
          }
        }
      } catch (e) {}

      if (typeof onTxReceived === "function") {
        onTxReceived(txList);
      }
    }
  }, (err) => console.warn("[RTDB WalletTx Sub] Error:", err));
  });
}

export function subscribeSignaturesFromRTDB(onSigReceived) {
  return deferredSubscribe(() => {
  const sigRef = ref(rtdb, "entities/Signature");
  return onValue(sigRef, (snapshot) => {
    if (snapshot.exists()) {
      const sigData = snapshot.val();
      const sigList = Object.values(sigData || {});
      try {
        const rawLocal = localStorage.getItem("base44_entity_Signature");
        let localSigs = rawLocal ? JSON.parse(rawLocal) : [];
        let modified = false;

        sigList.forEach(s => {
          if (!s || !s.id) return;
          const idx = localSigs.findIndex(ls => ls.id === s.id);
          if (idx === -1) {
            localSigs.unshift(s);
            modified = true;
          } else {
            if (JSON.stringify(localSigs[idx]) !== JSON.stringify(s)) {
              localSigs[idx] = s;
              modified = true;
            }
          }
        });

        if (modified) {
          localStorage.setItem("base44_entity_Signature", JSON.stringify(localSigs));
          if (base44.entities.Signature) {
            base44.entities.Signature.notifySubscribers();
          }
        }
      } catch (e) {}

      if (typeof onSigReceived === "function") {
        onSigReceived(sigList);
      }
    }
  }, (err) => console.warn("[RTDB Signature Sub] Error:", err));
  });
}

/**
 * 8. Node: entities/Transaction
 * Đồng bộ hợp đồng đầu tư (Transaction) thời gian thực - trước đây Admin
 * phải tự tải lại trang mới thấy hợp đồng mới do người dùng gửi lên.
 */
export function subscribeTransactionsFromRTDB(onTxReceived) {
  return deferredSubscribe(() => {
  const txRef = ref(rtdb, "entities/Transaction");
  return onValue(txRef, (snapshot) => {
    if (snapshot.exists()) {
      const txData = snapshot.val();
      const txList = Object.values(txData || {});
      try {
        const rawLocal = localStorage.getItem("base44_entity_Transaction");
        let localTxs = rawLocal ? JSON.parse(rawLocal) : [];
        let modified = false;

        txList.forEach(t => {
          if (!t || !t.id) return;
          const idx = localTxs.findIndex(lt => lt.id === t.id);
          if (idx === -1) {
            localTxs.unshift(t);
            modified = true;
          } else {
            if (JSON.stringify(localTxs[idx]) !== JSON.stringify(t)) {
              localTxs[idx] = t;
              modified = true;
            }
          }
        });

        if (modified) {
          localStorage.setItem("base44_entity_Transaction", JSON.stringify(localTxs));
          if (base44.entities.Transaction) {
            base44.entities.Transaction.notifySubscribers();
          }
        }
      } catch (e) {}

      if (typeof onTxReceived === "function") {
        onTxReceived(txList);
      }
    }
  }, (err) => console.warn("[RTDB Transaction Sub] Error:", err));
  });
}
