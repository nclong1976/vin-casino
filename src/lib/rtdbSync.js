import { ref, set, update, onValue, onDisconnect } from "firebase/database";
import { rtdb } from "./firebase";
import { base44 } from "@/api/base44Client";

/**
 * Syncs a registered or updated user object to Firebase Realtime Database (/users/{userId})
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
    balance: Number(user.balance || 0),
    total_deposited: Number(user.total_deposited || 0),
    membership_tier: user.membership_tier || "Member",
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
    console.log(`[RTDB Sync] ✅ Pushed user ${uid} to Realtime Database`);
  } catch (err) {
    console.warn(`[RTDB Sync] Failed to push user to Realtime Database:`, err?.message || err);
  }
}

/**
 * Tracks user online presence across tabs/devices using Firebase Realtime Database
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
 * Admin Subscription: Listens in real-time to ALL users & presence from Firebase Realtime Database
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
 * Pushes a new Message to Firebase Realtime Database (/messages/{msgId})
 */
export async function pushMessageToRTDB(msg) {
  if (!msg || !msg.id) return;
  try {
    const msgRef = ref(rtdb, `messages/${msg.id}`);
    await set(msgRef, {
      ...msg,
      synced_at: new Date().toISOString()
    });
    console.log(`[RTDB Sync] ✅ Pushed message ${msg.id} to Realtime Database`);
  } catch (err) {
    console.warn(`[RTDB Sync] Failed to push message:`, err?.message || err);
  }
}

/**
 * Subscribes to real-time messages from Firebase Realtime Database
 */
export function subscribeMessagesFromRTDB(onMessagesReceived) {
  const messagesRef = ref(rtdb, "messages");
  return onValue(messagesRef, (snapshot) => {
    if (snapshot.exists()) {
      const msgMap = snapshot.val();
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
    }
  }, (err) => console.warn("[RTDB Messages Sub] Error:", err));
}

/**
 * Pushes a new Wallet Transaction (Deposit / Withdrawal adjustment) to Firebase Realtime Database (/wallet_transactions/{txId})
 */
export async function pushWalletTransactionToRTDB(tx) {
  if (!tx || !tx.id) return;
  try {
    const txRef = ref(rtdb, `wallet_transactions/${tx.id}`);
    await set(txRef, {
      ...tx,
      synced_at: new Date().toISOString()
    });
    console.log(`[RTDB Sync] ✅ Pushed wallet transaction ${tx.id} to Realtime Database`);
  } catch (err) {
    console.warn(`[RTDB Sync] Failed to push wallet transaction:`, err?.message || err);
  }
}

/**
 * Pushes Admin Notifications to Firebase Realtime Database (/notifications/{notifId})
 */
export async function pushNotificationToRTDB(notif) {
  if (!notif || !notif.id) return;
  try {
    const notifRef = ref(rtdb, `notifications/${notif.id}`);
    await set(notifRef, {
      ...notif,
      synced_at: new Date().toISOString()
    });
    console.log(`[RTDB Sync] ✅ Pushed notification ${notif.id} to Realtime Database`);
  } catch (err) {
    console.warn(`[RTDB Sync] Failed to push notification:`, err?.message || err);
  }
}

/**
 * Subscribes to Admin Notifications from Firebase Realtime Database
 */
export function subscribeNotificationsFromRTDB(onNotifsReceived) {
  const notifRef = ref(rtdb, "notifications");
  return onValue(notifRef, (snapshot) => {
    if (snapshot.exists()) {
      const notifMap = snapshot.val();
      const notifList = Object.values(notifMap);

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
 * Pushes Investment Project open/close status to Firebase Realtime Database (/investment_projects/{projectId})
 */
export async function pushProjectToRTDB(project) {
  if (!project || !project.id) return;
  try {
    const projRef = ref(rtdb, `investment_projects/${project.id}`);
    await set(projRef, {
      ...project,
      synced_at: new Date().toISOString()
    });
    console.log(`[RTDB Sync] ✅ Pushed investment project ${project.id} to Realtime Database`);
  } catch (err) {
    console.warn(`[RTDB Sync] Failed to push project:`, err?.message || err);
  }
}

/**
 * Subscribes to Investment Projects open/close state from Firebase Realtime Database
 */
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
 * Pushes Casino Controls & 1.1x Payout Odds Toggles to Firebase Realtime Database (/casino_config)
 */
export async function pushCasinoConfigToRTDB(config) {
  if (!config) return;
  try {
    const configRef = ref(rtdb, "casino_config");
    await set(configRef, {
      ...config,
      updated_at: new Date().toISOString()
    });
    console.log(`[RTDB Sync] ✅ Pushed Casino Config & 1.1x Payout Odds to Realtime Database`);
  } catch (err) {
    console.warn(`[RTDB Sync] Failed to push casino config:`, err?.message || err);
  }
}

/**
 * Subscribes to Casino Controls & 1.1x Payout Odds Toggles from Firebase Realtime Database
 */
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
