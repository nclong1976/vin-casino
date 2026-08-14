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

    if (error) {
      console.warn(`[SupabaseDb] updateSupabaseUser error:`, error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.warn(`[SupabaseDb] updateSupabaseUser exception:`, e);
    return null;
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

// ==========================================
// 3. REALTIME SUBSCRIPTION FOR SUPABASE
// ==========================================

export function subscribeSupabaseUsersTable(callback) {
  const channel = supabase
    .channel('public:users')
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

export function subscribeSupabaseWalletTransactionsTable(callback) {
  const channel = supabase
    .channel('public:wallet_transactions')
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
