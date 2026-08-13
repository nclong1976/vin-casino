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
import { db } from "./firebase";
import { base44 } from "@/api/base44Client";

// Lưu danh sách các uninstaller của listener thời gian thực
const activeListeners = {};

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
export function startFirebaseSync() {
  const userId = getCurrentUserId();
  if (!userId) return;

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

  // Hủy các listener cũ nếu có
  stopFirebaseSync();

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

      // Lưu vào LocalStorage
      localStorage.setItem(`base44_entity_${entityName}`, JSON.stringify(items));

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
  Object.keys(activeListeners).forEach(key => {
    if (typeof activeListeners[key] === 'function') {
      activeListeners[key]();
      delete activeListeners[key];
    }
  });
  console.log("[FirebaseSync] Đã dừng toàn bộ kết nối đồng bộ hóa.");
}

/**
 * Hàm hỗ trợ đẩy một thay đổi đơn lẻ lên Firestore ngay lập tức (Write-Through)
 */
export async function pushEntityToFirestore(entityName, id, data, action = 'upsert') {
  const userId = getCurrentUserId();
  if (!userId) return;

  const docRef = doc(db, entityName, id);

  try {
    if (action === 'delete') {
      await deleteDoc(docRef);
      console.log(`[FirebaseSync] Đã xóa thành công ${entityName}/${id} trên Firestore`);
    } else {
      // Bổ sung userId để phân quyền bảo mật dữ liệu của từng cá nhân
      const payload = { ...data, userId };
      // Đảm bảo không ghi đè trường id trùng lặp vào body document
      delete payload.id; 

      await setDoc(docRef, payload, { merge: true });
      console.log(`[FirebaseSync] Đã đẩy thành công ${entityName}/${id} lên Firestore`);
    }
  } catch (error) {
    console.error(`[FirebaseSync] Lỗi cập nhật ${entityName} lên Firestore:`, error);
  }
}
