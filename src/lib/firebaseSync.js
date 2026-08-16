import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  getDoc,
  updateDoc
} from "firebase/firestore";
import { db, firebaseAuthReady } from "./firebase";
import { base44 } from "@/api/base44Client";

// Lưu danh sách các uninstaller của listener thời gian thực
const activeListeners = {};

// Tăng mỗi khi stopFirebaseSync() chạy, dùng để huỷ một startFirebaseSync()
// đang chờ firebaseAuthReady nếu bị dừng/gọi lại trước khi nó kịp gắn listener
let activeSyncToken = 0;

/**
 * Lấy ID của người dùng hiện tại
 */
function getCurrentUserId() {
  try {
    const localUser = localStorage.getItem('base44_local_user');
    if (localUser) {
      const user = JSON.parse(localUser);
      return user.id;
    }
  } catch (e) {
    console.error("Lỗi lấy thông tin người dùng từ LocalStorage:", e);
  }
  return null;
}

/**
 * Tải và đồng bộ hóa thời gian thực các thực thể của người dùng từ Firestore
 */
export async function startFirebaseSync() {
  const userId = getCurrentUserId();
  if (!userId) return;

  // Hủy các listener cũ nếu có (đồng thời huỷ mọi lệnh startFirebaseSync
  // trước đó đang chờ firebaseAuthReady)
  stopFirebaseSync();
  const myToken = activeSyncToken;

  // Đợi phiên đăng nhập ẩn danh Firebase Auth sẵn sàng - rule bảo mật yêu cầu
  // auth != null nên gắn listener trước khi có token sẽ bị permission_denied
  await firebaseAuthReady;
  if (myToken !== activeSyncToken) return; // đã bị dừng/gọi lại trong lúc chờ

  console.log(`[FirebaseSync] Bắt đầu đồng bộ hóa dữ liệu cho người dùng: ${userId}`);

  // Các thực thể cần đồng bộ theo từng người dùng
  const userEntities = [
    'BankAccount',
    'Message',
    'Notification',
    'Signature',
    'Transaction',
    'WalletTransaction'
  ];

  // 1. Đồng bộ thông tin cá nhân của User từ Firestore
  const userDocRef = doc(db, "users", userId);
  activeListeners['User'] = onSnapshot(userDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const userData = docSnap.data();
      console.log("[FirebaseSync] Nhận cập nhật thông tin User từ Firestore:", userData);
      localStorage.setItem('base44_local_user', JSON.stringify({ ...userData, id: userId }));
      
      // Kích hoạt cập nhật UI qua base44Client
      if (base44.entities.User) {
        base44.entities.User.notifySubscribers();
      }
    } else {
      // Nếu user chưa tồn tại trên Firestore (lần đầu đăng nhập), tiến hành đẩy dữ liệu hiện tại lên
      try {
        const localUser = localStorage.getItem('base44_local_user');
        if (localUser) {
          const userObj = JSON.parse(localUser);
          setDoc(userDocRef, userObj).catch(() => null);
        }
      } catch (e) {}
    }
  }, (error) => {
    console.warn("[FirebaseSync] Không thể kết nối Firestore (User):", error?.message || error);
    if (error?.code === 'not-found' || error?.message?.includes('not found') || error?.message?.includes('Database')) {
      if (typeof activeListeners['User'] === 'function') {
        activeListeners['User']();
        delete activeListeners['User'];
      }
    }
  });

  // 2. Đồng bộ các thực thể khác của người dùng
  userEntities.forEach(entityName => {
    const colRef = collection(db, entityName);
    const q = query(colRef, where("userId", "==", userId));

    activeListeners[entityName] = onSnapshot(q, (querySnapshot) => {
      const items = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });

      console.log(`[FirebaseSync] Đồng bộ thực thể ${entityName} (${items.length} bản ghi) từ Firestore`);

      // Sắp xếp theo ngày tạo (mặc định) nếu có
      items.sort((a, b) => new Date(b.created_date || b.created_at || 0) - new Date(a.created_date || a.created_at || 0));

      // Hợp nhất thay vì ghi đè toàn bộ cache cục bộ cho MỌI thực thể ở đây
      // (không chỉ riêng Message): write-through của Firestore và RTDB chạy
      // song song không đồng bộ, nên một snapshot Firestore tới muộn hơn có
      // thể tạm thời chưa thấy bản ghi mà RTDB đã phát tức thì trước đó -
      // đặc biệt nghiêm trọng trên thiết bị Admin, nơi query Firestore chỉ
      // trả về đúng bản ghi CỦA ADMIN (userId == admin), nên "ghi đè thẳng"
      // sẽ xoá sạch mọi lệnh nạp/rút/hợp đồng đang chờ duyệt của TẤT CẢ hội
      // viên khác khỏi cache cục bộ mà admin đang xem. RTDB vẫn là nguồn xử
      // lý việc xoá bản ghi (deleteMessageFromRTDB cho Message; các entity
      // khác hiện không có luồng xoá cứng), nên gộp ở đây chỉ thêm/cập nhật.
      try {
        const raw = localStorage.getItem(`base44_entity_${entityName}`);
        const local = raw ? JSON.parse(raw) : [];
        let modified = false;
        items.forEach((it) => {
          const idx = local.findIndex((l) => l.id === it.id);
          if (idx === -1) {
            local.push(it);
            modified = true;
          } else if (JSON.stringify(local[idx]) !== JSON.stringify(it)) {
            local[idx] = { ...local[idx], ...it };
            modified = true;
          }
        });
        if (modified) {
          localStorage.setItem(`base44_entity_${entityName}`, JSON.stringify(local));
          if (entityName === "Message") {
            localStorage.setItem("vinclub_msg_update", Date.now().toString());
          }
        }
      } catch (e) {
        localStorage.setItem(`base44_entity_${entityName}`, JSON.stringify(items));
      }

      // Thông báo cho các React component đang lắng nghe thông qua client của base44
      if (base44.entities[entityName]) {
        base44.entities[entityName].notifySubscribers();
      }
    }, (error) => {
      console.warn(`[FirebaseSync] Không thể kết nối thực thể ${entityName}:`, error?.message || error);
      if (error?.code === 'not-found' || error?.message?.includes('not found') || error?.message?.includes('Database')) {
        if (typeof activeListeners[entityName] === 'function') {
          activeListeners[entityName]();
          delete activeListeners[entityName];
        }
      }
    });
  });

  // 3. Đồng bộ dự án (Project) chung
  const projectColRef = collection(db, "Project");
  activeListeners['Project'] = onSnapshot(projectColRef, (querySnapshot) => {
    if (querySnapshot.empty) {
      // Nếu Firestore trống, đẩy hạt giống (seed data) của dự án lên
      try {
        const localProjects = JSON.parse(localStorage.getItem('base44_entity_Project') || '[]');
        if (localProjects.length > 0) {
          localProjects.forEach(proj => {
            setDoc(doc(db, "Project", proj.id), proj).catch(() => null);
          });
        }
      } catch (e) {}
      return;
    }

    const projects = [];
    querySnapshot.forEach((doc) => {
      projects.push({ id: doc.id, ...doc.data() });
    });

    console.log(`[FirebaseSync] Đồng bộ danh sách Dự án (${projects.length}) từ Firestore`);
    localStorage.setItem(`base44_entity_Project`, JSON.stringify(projects));
    if (base44.entities.Project) {
      base44.entities.Project.notifySubscribers();
    }
  }, (error) => {
    console.warn("[FirebaseSync] Không thể kết nối Firestore (Project):", error?.message || error);
    if (error?.code === 'not-found' || error?.message?.includes('not found') || error?.message?.includes('Database')) {
      if (typeof activeListeners['Project'] === 'function') {
        activeListeners['Project']();
        delete activeListeners['Project'];
      }
    }
  });
}

/**
 * Ngắt kết nối các listener đồng bộ
 */
export function stopFirebaseSync() {
  activeSyncToken++;
  Object.keys(activeListeners).forEach(key => {
    if (typeof activeListeners[key] === 'function') {
      activeListeners[key]();
      delete activeListeners[key];
    }
  });
  console.log("[FirebaseSync] Đã dừng toàn bộ kết nối đồng bộ hóa.");
}

/**
 * Xác định chủ sở hữu THỰC SỰ của một bản ghi để gắn vào trường `userId`
 * (dùng cho query bảo mật/real-time theo từng người dùng trên Firestore).
 *
 * Trước đây pushEntityToFirestore() luôn gắn userId = ID của người ĐANG
 * đăng nhập trên thiết bị thực hiện thao tác (getCurrentUserId()). Điều
 * này đúng khi khách hàng tự tạo bản ghi của chính họ, nhưng SAI khi Admin
 * tạo/cập nhật bản ghi THAY cho khách hàng — ví dụ Admin trả lời tin nhắn
 * CSKH hoặc duyệt nạp/rút tiền: bản ghi bị gắn nhầm userId = ID của Admin
 * thay vì ID khách hàng. Vì listener onSnapshot ở thiết bị khách hàng lọc
 * theo where("userId","==", chính họ), tin nhắn/trạng thái admin gửi sẽ
 * KHÔNG BAO GIỜ khớp query và không bao giờ tới được thiết bị khách hàng.
 * Dùng chủ sở hữu thật (user_id/conversation_id có sẵn trong data) để mọi
 * thiết bị đều đồng bộ đúng một "nguồn chân lý" duy nhất.
 */
function resolveOwnerId(entityName, data) {
  if (entityName === "Message") {
    return data?.conversation_id || data?.user_id || getCurrentUserId();
  }
  return data?.user_id || getCurrentUserId();
}

/**
 * Hàm hỗ trợ đẩy một thay đổi đơn lẻ lên Firestore ngay lập tức (Write-Through)
 */
export async function pushEntityToFirestore(entityName, id, data, action = 'upsert') {
  await firebaseAuthReady;
  const docRef = doc(db, entityName, id);

  try {
    if (action === 'delete') {
      await deleteDoc(docRef);
      console.log(`[FirebaseSync] Đã xóa thành công ${entityName}/${id} trên Firestore`);
      return;
    }

    const ownerId = resolveOwnerId(entityName, data);
    if (!ownerId) return;

    // Bổ sung userId = chủ sở hữu thực sự (không phải người đang thao tác)
    const payload = { ...data, userId: ownerId };
    // Đảm bảo không ghi đè trường id trùng lặp vào body document
    delete payload.id;

    await setDoc(docRef, payload, { merge: true });
    console.log(`[FirebaseSync] Đã đẩy thành công ${entityName}/${id} lên Firestore`);
  } catch (error) {
    console.error(`[FirebaseSync] Lỗi cập nhật ${entityName} lên Firestore:`, error);
  }
}
