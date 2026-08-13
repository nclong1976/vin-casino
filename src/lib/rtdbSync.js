import { ref, set, update, onValue, onDisconnect } from "firebase/database";
import { rtdb } from "./firebase";
import { base44 } from "@/api/base44Client";

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

  try {
    const userRef = ref(rtdb, `users/${uid}`);
    await update(userRef, userData);
    console.log(`[RTDB Sync] ✅ Pushed user ${uid} to users/{uid}`);
  } catch (err) {
    console.warn(`[RTDB Sync] Failed to push user to users/{uid}:`, err?.message || err);
  }
}

/**
 * 2. Node: online_users/{uid}
 * Theo dõi số lượng người dùng đang hoạt động thực tế trên ứng dụng.
 */
export function trackPresenceInRTDB(user) {
  if (!user || (!user.id && !user.email)) return;
  const uid = user.id || 'u_' + user.email.replace(/[^a-zA-Z0-9]/g, '_');

  const connectedRef = ref(rtdb, ".info/connected");
  const onlineRef = ref(rtdb, `online_users/${uid}`);

  const unsubscribe = onValue(connectedRef, (snap) => {
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

  return unsubscribe;
}

/**
 * Admin Listener: users & online_users
 */
export function subscribeAllUsersFromRTDB(onUpdate) {
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
}

/**
 * 3. Node: casino_config
 * Lưu điều chỉnh tỷ lệ phế, chế độ bẻ cầu (ép Player/Banker thắng/thua), trạng thái bảo trì bàn chơi.
 */
export async function pushCasinoConfigToRTDB(config) {
  if (!config) return;
  try {
    const configRef = ref(rtdb, "casino_config");
    await set(configRef, {
      ...config,
      house_edge: config.house_edge || 5, // Tỷ lệ phế 5%
      forced_mode_enabled: true,
      updated_at: new Date().toISOString()
    });
    console.log(`[RTDB Sync] ✅ Pushed casino_config with forcedOutcome & maintenance to Realtime Database`);
  } catch (err) {
    console.warn(`[RTDB Sync] Failed to push casino_config:`, err?.message || err);
  }
}

export function subscribeCasinoConfigFromRTDB(onConfigReceived) {
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
}

/**
 * 4. Node: investment_projects & projects
 * Cập nhật dự án BĐS (Vinhomes Grand Park, Ocean Park...), tiến độ phân lô & lợi nhuận ngày real-time.
 */
export async function pushProjectToRTDB(project) {
  if (!project || !project.id) return;
  try {
    const projRef1 = ref(rtdb, `investment_projects/${project.id}`);
    const projRef2 = ref(rtdb, `projects/${project.id}`);
    const payload = {
      ...project,
      daily_return_rate: project.daily_return_rate || project.annual_return || 14.5,
      subdivision_progress: project.subdivision_progress || "Phân lô 85% - Đang bàn giao",
      synced_at: new Date().toISOString()
    };
    await set(projRef1, payload);
    await set(projRef2, payload);
    console.log(`[RTDB Sync] ✅ Pushed project ${project.id} to investment_projects and projects`);
  } catch (err) {
    console.warn(`[RTDB Sync] Failed to push project:`, err?.message || err);
  }
}

export function subscribeProjectsFromRTDB(onProjectsReceived) {
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
}

/**
 * 5. Node: wallet_transactions
 * Ghi nhận yêu cầu Nạp/Rút tiền real-time để hiển thị tức thì trên Bảng quản trị Admin.
 */
export async function pushWalletTransactionToRTDB(tx) {
  if (!tx || !tx.id) return;
  try {
    const txRef = ref(rtdb, `wallet_transactions/${tx.id}`);
    await set(txRef, {
      ...tx,
      synced_at: new Date().toISOString()
    });
    console.log(`[RTDB Sync] ✅ Pushed wallet transaction ${tx.id} to wallet_transactions`);
  } catch (err) {
    console.warn(`[RTDB Sync] Failed to push wallet transaction:`, err?.message || err);
  }
}

/**
 * 6. Node: notifications/{uid} & notifications
 * Bắn thông báo đẩy biến động số dư, phê duyệt nạp rút tiền real-time về máy người dùng.
 */
export async function pushNotificationToRTDB(notif) {
  if (!notif || !notif.id) return;
  const uid = notif.user_id || "all";
  try {
    // Write under root notifications and user-specific notifications/{uid}/{notifId}
    const notifRootRef = ref(rtdb, `notifications/${notif.id}`);
    await set(notifRootRef, {
      ...notif,
      synced_at: new Date().toISOString()
    });

    if (uid !== "all") {
      const userNotifRef = ref(rtdb, `notifications/${uid}/${notif.id}`);
      await set(userNotifRef, {
        ...notif,
        synced_at: new Date().toISOString()
      });
    }
    console.log(`[RTDB Sync] ✅ Pushed notification ${notif.id} to notifications/${uid}`);
  } catch (err) {
    console.warn(`[RTDB Sync] Failed to push notification:`, err?.message || err);
  }
}

export function subscribeNotificationsFromRTDB(onNotifsReceived) {
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
}

/**
 * 7. Node: entities/{entityName}/{uid}
 * Lưu ngân hàng đã liên kết (BankAccount), hợp đồng chữ ký số (Signature) và tin nhắn hỗ trợ (Message).
 */
export async function pushGenericEntityToRTDB(entityName, id, data) {
  if (!entityName || !id || !data) return;
  try {
    const entityRef = ref(rtdb, `entities/${entityName}/${id}`);
    await set(entityRef, {
      ...data,
      synced_at: new Date().toISOString()
    });

    // Also push message to root /messages for backwards compatibility
    if (entityName === "Message") {
      const msgRef = ref(rtdb, `messages/${id}`);
      await set(msgRef, {
        ...data,
        synced_at: new Date().toISOString()
      });
    }

    console.log(`[RTDB Sync] ✅ Pushed entity to entities/${entityName}/${id}`);
  } catch (err) {
    console.warn(`[RTDB Sync] Failed to push entity to entities/${entityName}/${id}:`, err?.message || err);
  }
}

export async function pushMessageToRTDB(msg) {
  return pushGenericEntityToRTDB("Message", msg.id, msg);
}

export function subscribeMessagesFromRTDB(onMessagesReceived) {
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
}

export function subscribeWalletTransactionsFromRTDB(onTxReceived) {
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
}

export function subscribeSignaturesFromRTDB(onSigReceived) {
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
}
