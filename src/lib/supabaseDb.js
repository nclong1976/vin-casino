import { supabase } from './supabase';

/**
 * supabaseDb — Module truy vấn & thao tác cơ sở dữ liệu Supabase Database (PostgreSQL)
 * Hỗ trợ các bảng: users, wallet_transactions, notifications, messages, investment_projects
 * Có cơ chế tự động fallback mượt mà.
 */

// ==========================================
// 1. USERS OPERATIONS
// ==========================================

export async function getSupabaseUser(id) {
  if (!id) return null;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.warn(`[SupabaseDb] getSupabaseUser error:`, error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.warn(`[SupabaseDb] getSupabaseUser exception:`, e);
    return null;
  }
}

export async function listSupabaseUsers() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn(`[SupabaseDb] listSupabaseUsers error:`, error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn(`[SupabaseDb] listSupabaseUsers exception:`, e);
    return [];
  }
}

export async function upsertSupabaseUser(user) {
  if (!user || (!user.id && !user.email)) return null;
  const uid = user.id || 'u_' + (user.email ? user.email.replace(/[^a-zA-Z0-9]/g, '_') : Date.now());

  const payload = {
    id: uid,
    email: user.email || '',
    identifier: user.identifier || user.email || '',
    name: user.name || user.full_name || 'Hội viên VinClub',
    full_name: user.full_name || user.name || 'Hội viên VinClub',
    phone: user.phone || '',
    role: user.role || 'user',
    balance: Number(user.balance || 0),
    total_deposited: Number(user.total_deposited || 0),
    membership_tier: user.membership_tier || 'Member',
    vip_level: user.vip_level || 'VIP 0',
    is_locked: !!user.is_locked,
    daily_interest_enabled: !!user.daily_interest_enabled,
    avatar_url: user.avatar_url || user.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde',
    bank_name: user.bank_name || '',
    account_number: user.account_number || '',
    account_holder: user.account_holder || '',
    referral_code: user.referral_code || '',
    last_active: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('users')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (error) {
      console.warn(`[SupabaseDb] upsertSupabaseUser error:`, error.message);
      return payload;
    }
    return data || payload;
  } catch (e) {
    console.warn(`[SupabaseDb] upsertSupabaseUser exception:`, e);
    return payload;
  }
}

/**
 * Cộng/trừ số dư NGUYÊN TỬ qua hàm Postgres increment_user_balance (xem
 * supabase_schema.sql). Postgres khóa dòng trong lúc UPDATE nên 2 lệnh
 * gọi gần như đồng thời (khác thiết bị, hoặc admin + user cùng lúc) luôn
 * cộng dồn đúng - không còn kiểu "đọc số dư cũ rồi ghi đè" khiến lệnh sau
 * xoá mất kết quả của lệnh trước.
 * @returns {Promise<{balance: number, total_deposited: number} | null>}
 *   Số dư THẬT sau khi cộng/trừ (đọc trực tiếp từ kết quả UPDATE), null
 *   nếu RPC lỗi (ví dụ chưa chạy migration supabase_schema.sql mới nhất).
 */
export async function incrementUserBalance(userId, delta, totalDepositedDelta = 0) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase.rpc('increment_user_balance', {
      p_user_id: userId,
      p_delta: Math.trunc(Number(delta) || 0),
      p_total_deposited_delta: Math.trunc(Number(totalDepositedDelta) || 0),
    });

    if (error) {
      console.warn('[SupabaseDb] incrementUserBalance error:', error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      balance: Number(row.balance || 0),
      total_deposited: Number(row.total_deposited || 0),
      balance_version: Number(row.balance_version || 0),
    };
  } catch (e) {
    console.warn('[SupabaseDb] incrementUserBalance exception:', e);
    return null;
  }
}

/**
 * Đặt balance/total_deposited về giá trị TUYỆT ĐỐI qua hàm Postgres
 * set_user_balance_absolute - vẫn tăng balance_version như
 * incrementUserBalance() (khác với upsertSupabaseUser() thông thường,
 * không chạm tới balance_version) để phiên Realtime khác nhận diện đây là
 * thay đổi mới hơn thay vì bị bộ so sánh version bỏ qua.
 * @returns {Promise<{balance: number, total_deposited: number, balance_version: number} | null>}
 */
export async function setUserBalanceAbsolute(userId, balance, totalDeposited) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase.rpc('set_user_balance_absolute', {
      p_user_id: userId,
      p_balance: Math.trunc(Number(balance) || 0),
      p_total_deposited: Math.trunc(Number(totalDeposited) || 0),
    });

    if (error) {
      console.warn('[SupabaseDb] setUserBalanceAbsolute error:', error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      balance: Number(row.balance || 0),
      total_deposited: Number(row.total_deposited || 0),
      balance_version: Number(row.balance_version || 0),
    };
  } catch (e) {
    console.warn('[SupabaseDb] setUserBalanceAbsolute exception:', e);
    return null;
  }
}

/**
 * Admin duyệt/từ chối 1 lệnh rút tiền qua RPC process_withdrawal() - đổi
 * status + hoàn tiền (nếu từ chối) + ghi audit log/notification trong CÙNG
 * 1 transaction Postgres, khoá đúng dòng (FOR UPDATE + status='pending')
 * nên click đúp/2 tab admin cùng lúc chỉ xử lý được đúng 1 lần.
 */
export async function processWithdrawal(txId, action, reason = null) {
  if (!txId || !['approve', 'reject'].includes(action)) return null;
  try {
    const { data, error } = await supabase.rpc('process_withdrawal', {
      p_tx_id: txId,
      p_action: action,
      p_reason: reason,
    });

    if (error) {
      console.warn('[SupabaseDb] processWithdrawal error:', error.message);
      return null;
    }
    return Array.isArray(data) ? data[0] : data;
  } catch (e) {
    console.warn('[SupabaseDb] processWithdrawal exception:', e);
    return null;
  }
}

/**
 * Kiểm tra xem một tên tài khoản/định danh (username, số điện thoại, hoặc
 * email) đã tồn tại trên hệ thống (bảng users Supabase - nguồn dữ liệu
 * chung, dùng chung cho mọi thiết bị) hay chưa, để chặn đăng ký trùng lặp.
 */
export async function isIdentifierTaken(identifier) {
  const clean = (identifier || '').trim();
  if (!clean) return false;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .or(`identifier.eq.${clean},email.eq.${clean},phone.eq.${clean}`)
      .limit(1);

    if (error) {
      console.warn('[SupabaseDb] isIdentifierTaken error:', error.message);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    console.warn('[SupabaseDb] isIdentifierTaken exception:', e);
    return false;
  }
}

export async function updateSupabaseUser(id, updates) {
  if (!id || !updates) return null;
  try {
    const cleanUpdates = {
      ...updates,
      last_active: new Date().toISOString(),
    };
    // Ensure numerical balance
    if (cleanUpdates.balance !== undefined) {
      cleanUpdates.balance = Number(cleanUpdates.balance);
    }
    if (cleanUpdates.total_deposited !== undefined) {
      cleanUpdates.total_deposited = Number(cleanUpdates.total_deposited);
    }

    const { data, error } = await supabase
      .from('users')
      .update(cleanUpdates)
      .eq('id', id)
      .select()
      .maybeSingle();

    return data;
  } catch (e) {
    console.warn(`[SupabaseDb] updateSupabaseUser exception:`, e);
    return null;
  }
}

export async function deleteSupabaseUser(id) {
  if (!id) return false;
  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) {
      console.warn(`[SupabaseDb] deleteSupabaseUser error:`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[SupabaseDb] deleteSupabaseUser exception:`, e);
    return false;
  }
}

// ==========================================
// 2. WALLET TRANSACTIONS OPERATIONS
// ==========================================

export async function listSupabaseWalletTransactions(filter = {}, sort = '-created_date', limit = 500) {
  try {
    let query = supabase.from('wallet_transactions').select('*');

    if (filter.user_id) {
      query = query.eq('user_id', filter.user_id);
    }
    if (filter.type) {
      query = query.eq('type', filter.type);
    }
    if (filter.status) {
      query = query.eq('status', filter.status);
    }

    const isDesc = sort.startsWith('-');
    const sortField = isDesc ? sort.slice(1) : sort;
    query = query.order(sortField || 'created_date', { ascending: !isDesc });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) {
      console.warn(`[SupabaseDb] listSupabaseWalletTransactions error:`, error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn(`[SupabaseDb] listSupabaseWalletTransactions exception:`, e);
    return [];
  }
}

export async function createSupabaseWalletTransaction(tx) {
  if (!tx) return null;
  const newTx = {
    id: tx.id || 'wt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    user_id: tx.user_id || '',
    type: tx.type || 'deposit',
    amount: Number(tx.amount || 0),
    status: tx.status || 'completed',
    code: tx.code || 'VCW' + Date.now().toString().slice(-8),
    description: tx.description || '',
    bank_name: tx.bank_name || '',
    account_number: tx.account_number || '',
    account_holder: tx.account_holder || '',
    rejection_reason: tx.rejection_reason || null,
    approved_at: tx.approved_at || null,
    approved_by: tx.approved_by || null,
    rejected_at: tx.rejected_at || null,
    rejected_by: tx.rejected_by || null,
    created_date: tx.created_date || new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .insert([newTx])
      .select()
      .maybeSingle();

    if (error) {
      console.warn(`[SupabaseDb] createSupabaseWalletTransaction error:`, error.message);
      return newTx;
    }
    return data || newTx;
  } catch (e) {
    console.warn(`[SupabaseDb] createSupabaseWalletTransaction exception:`, e);
    return newTx;
  }
}

export async function updateSupabaseWalletTransaction(id, updates) {
  if (!id || !updates) return null;
  try {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.warn(`[SupabaseDb] updateSupabaseWalletTransaction error:`, error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.warn(`[SupabaseDb] updateSupabaseWalletTransaction exception:`, e);
    return null;
  }
}

export async function deleteSupabaseWalletTransaction(id) {
  if (!id) return false;
  try {
    const { error } = await supabase.from('wallet_transactions').delete().eq('id', id);
    if (error) {
      console.warn(`[SupabaseDb] deleteSupabaseWalletTransaction error:`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[SupabaseDb] deleteSupabaseWalletTransaction exception:`, e);
    return false;
  }
}

// ==========================================
// 3. REALTIME SUBSCRIPTION FOR SUPABASE
// ==========================================
// supabase-js định danh channel theo TÊN (topic) - gọi .channel() 2 lần với
// cùng 1 tên sẽ trả về/khớp lại đúng channel đã subscribe() trước đó, và
// .on() thêm vào một channel ĐÃ subscribe() sẽ ném lỗi "cannot add
// postgres_changes callbacks... after subscribe()". Nhiều nơi độc lập cùng
// gọi các hàm subscribe dưới đây (vd. twoWaySync.js chạy nền toàn app +
// UsersTab.jsx của Admin) nên mỗi lần gọi phải tạo 1 tên channel RIÊNG,
// không dùng chung 1 tên cố định.
let channelSeq = 0;
const nextChannelName = (prefix) => `${prefix}:${Date.now()}:${++channelSeq}`;

export function subscribeSupabaseUsersTable(callback) {
  const channel = supabase
    .channel(nextChannelName('public:users'))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users' },
      (payload) => {
        if (typeof callback === 'function') {
          callback(payload);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Kênh realtime lọc theo đúng 1 user_id - dùng cho AuthContext để nhận cập
// nhật balance/total_deposited/balance_version của chính phiên đăng nhập,
// thay cho subscribeUserFromRTDB (RTDB không còn là nguồn số dư đáng tin).
export function subscribeSupabaseUserRow(userId, callback) {
  if (!userId) return () => {};
  const channel = supabase
    .channel(nextChannelName(`public:users:id=eq.${userId}`))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users', filter: `id=eq.${userId}` },
      (payload) => {
        if (typeof callback === 'function') {
          callback(payload);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeSupabaseWalletTransactionsTable(callback) {
  const channel = supabase
    .channel(nextChannelName('public:wallet_transactions'))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'wallet_transactions' },
      (payload) => {
        if (typeof callback === 'function') {
          callback(payload);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Kênh realtime lọc theo đúng 1 user_id cho wallet_transactions - dùng cho
// useWithdrawalSync (theo dõi trạng thái rút tiền của chính người dùng) thay
// vì phải nhận TOÀN BỘ thay đổi bảng (subscribeSupabaseWalletTransactionsTable
// ở trên) rồi tự lọc user_id ở client.
export function subscribeSupabaseWalletTransactionsForUser(userId, callback) {
  if (!userId) return () => {};
  const channel = supabase
    .channel(nextChannelName(`public:wallet_transactions:user_id=eq.${userId}`))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${userId}` },
      (payload) => {
        if (typeof callback === 'function') {
          callback(payload);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ==========================================
// 4. WRITE-THROUGH BỀN VỮNG CHO CÁC THỰC THỂ CÒN LẠI
// ==========================================
// Message, Notification, Project, BankAccount, Signature, Transaction,
// AuditLog trước đây chỉ tồn tại trong localStorage + Firebase (mất dữ
// liệu vĩnh viễn nếu người dùng/Admin xóa cache trình duyệt hoặc đổi
// thiết bị). Các hàm dưới đây ghi (write-through) mọi thay đổi của các
// thực thể này xuống Postgres như một lớp lưu trữ bền vững bổ sung -
// KHÔNG thay thế luồng đọc/localStorage/Firebase hiện có, chỉ cộng thêm
// một bản sao đáng tin cậy ở phía sau. Lỗi ghi Supabase ở đây luôn được
// nuốt (catch) và không bao giờ chặn luồng chính của ứng dụng.

const ENTITY_TABLE_MAP = {
  Message: 'messages',
  Notification: 'notifications',
  Project: 'investment_projects',
  BankAccount: 'bank_accounts',
  Signature: 'signatures',
  Transaction: 'transactions',
  AuditLog: 'audit_logs',
  News: 'news',
};

// Whitelist cột thật của từng bảng - field nào không nằm trong danh sách
// này sẽ được gom vào cột JSONB "extra" thay vì làm hỏng câu lệnh upsert
// với lỗi "column does not exist" khi phía client gửi field lạ/mới.
const ENTITY_COLUMNS = {
  Message: ['id', 'user_id', 'sender', 'content', 'attachments', 'conversation_id', 'is_read', 'created_date'],
  Notification: ['id', 'user_id', 'title', 'content', 'image', 'type', 'is_read', 'created_date'],
  Project: ['id', 'title', 'name', 'category', 'location', 'image', 'price_per_m2', 'price_str', 'rate', 'annual_yield', 'area', 'progress', 'min_amount', 'duration', 'scale', 'is_active', 'description', 'created_date'],
  BankAccount: ['id', 'user_id', 'bank_name', 'bank_code', 'account_number', 'account_holder', 'is_default', 'created_date'],
  Signature: ['id', 'user_id', 'type', 'content', 'label', 'created_date'],
  Transaction: ['id', 'user_id', 'user_email', 'user_name', 'project_id', 'project_name', 'project_title', 'category', 'amount', 'shares', 'method', 'rate', 'duration_days', 'profit', 'total', 'status', 'payout_status', 'contract_status', 'signature_type', 'signature_content', 'note', 'created_date'],
  AuditLog: ['id', 'action', 'tx_code', 'amount', 'user_id', 'user_name', 'admin_email', 'notes', 'created_date'],
  News: ['id', 'title', 'excerpt', 'category', 'author', 'image', 'featured', 'tags', 'sections', 'date', 'time', 'views', 'created_date'],
};

/** Tách một object thành {cột thật theo whitelist..., extra: {phần còn lại}} */
function shapeRowForTable(entityName, row) {
  const columns = ENTITY_COLUMNS[entityName] || [];
  const shaped = {};
  const extra = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    if (columns.includes(key)) shaped[key] = value;
    else extra[key] = value;
  });
  if (Object.keys(extra).length > 0) shaped.extra = extra;
  return shaped;
}

async function genericUpsertEntity(entityName, row) {
  const table = ENTITY_TABLE_MAP[entityName];
  if (!table || !row || !row.id) return null;
  try {
    const { data, error } = await supabase
      .from(table)
      .upsert(shapeRowForTable(entityName, row), { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (error) {
      console.warn(`[SupabaseDb] upsert ${entityName} error:`, error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.warn(`[SupabaseDb] upsert ${entityName} exception:`, e);
    return null;
  }
}

async function genericDeleteEntity(entityName, id) {
  const table = ENTITY_TABLE_MAP[entityName];
  if (!table || !id) return false;
  try {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      console.warn(`[SupabaseDb] delete ${entityName} error:`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[SupabaseDb] delete ${entityName} exception:`, e);
    return false;
  }
}

// LƯU Ý: hàm này NÉM LỖI (throw) thay vì nuốt lỗi + trả về [] như phần lớn
// hàm khác trong file - đây là hàm ĐỌC duy nhất được base44Client.js dùng
// làm nguồn sự thật (xem fetchFromSupabase), cần phân biệt được "bảng rỗng
// thật" với "truy vấn lỗi" (vd. RLS policy trên project lỗi đệ quy), nếu
// không phân biệt được, 1 bảng đang lỗi truy vấn sẽ trông giống hệt "đã bị
// xóa hết", xóa sạch luôn dữ liệu cache cục bộ đang có. listSupabaseEntity()
// hiện không có nơi gọi nào khác ngoài base44Client.js nên đổi hành vi ở đây
// an toàn, không ảnh hưởng chỗ khác.
async function genericListEntity(entityName, filter = {}, sort = '-created_date', limit = 500) {
  const table = ENTITY_TABLE_MAP[entityName];
  if (!table) return [];
  let query = supabase.from(table).select('*');
  Object.entries(filter || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) query = query.eq(key, value);
  });
  const isDesc = sort.startsWith('-');
  const sortField = isDesc ? sort.slice(1) : sort;
  query = query.order(sortField || 'created_date', { ascending: !isDesc });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    console.warn(`[SupabaseDb] list ${entityName} error:`, error.message);
    throw new Error(error.message);
  }
  return data || [];
}

/** Ghi (tạo mới hoặc cập nhật) một bản ghi của entityName xuống Postgres. */
export function upsertSupabaseEntity(entityName, row) {
  return genericUpsertEntity(entityName, row);
}

/** Xóa một bản ghi của entityName khỏi Postgres. */
export function deleteSupabaseEntity(entityName, id) {
  return genericDeleteEntity(entityName, id);
}

/** Đọc danh sách bản ghi của entityName từ Postgres (dùng cho hydrate/khôi phục). */
export function listSupabaseEntity(entityName, filter, sort, limit) {
  return genericListEntity(entityName, filter, sort, limit);
}

/**
 * Kênh Realtime tổng quát cho 1 trong 7 entity dùng ENTITY_TABLE_MAP (Message,
 * Notification, Project, BankAccount, Signature, Transaction, AuditLog).
 * Dùng chung mẫu với subscribeSupabaseUsersTable/subscribeSupabaseWalletTransactionsTable
 * ở trên - callback nhận payload sự kiện thô, bên gọi tự quyết định tải lại gì.
 */
export function subscribeSupabaseEntityTable(entityName, callback) {
  const table = ENTITY_TABLE_MAP[entityName];
  if (!table) return () => {};
  const channel = supabase
    .channel(nextChannelName(`public:${table}`))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        if (typeof callback === 'function') {
          callback(payload);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
