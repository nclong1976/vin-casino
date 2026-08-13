import { ref, set, update, onValue, onDisconnect, get, child } from "firebase/database";
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
      // Set online status
      set(onlineRef, {
        id: uid,
        name: user.name || user.full_name || user.email,
        email: user.email || "",
        role: user.role || "user",
        online: true,
        last_seen: new Date().toISOString(),
      }).catch(() => null);

      // On disconnect (tab/browser close), remove from online_users automatically
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

    // Merge into local registered users & base44 entity storage for Admin
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
            localRegs[idx] = { ...localRegs[idx], ...rtdbUser };
            modified = true;
          }
        });

        if (modified) {
          localStorage.setItem("base44_registered_users", JSON.stringify(localRegs));
          localStorage.setItem("base44_entity_User", JSON.stringify(localRegs));
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
