import { appParams } from '@/lib/app-params';
import { pushUserToRTDB } from '@/lib/rtdbSync';
import {
  upsertSupabaseUser,
  updateSupabaseUser,
  createSupabaseWalletTransaction,
  updateSupabaseWalletTransaction,
  deleteSupabaseWalletTransaction,
  upsertSupabaseEntity,
  deleteSupabaseEntity,
} from '@/lib/supabaseDb';

// Các entity được ghi write-through xuống Postgres (Supabase) như một lớp
// lưu trữ bền vững bổ sung - xem chi tiết trong supabaseDb.js mục 4.
const SUPABASE_BACKED_ENTITIES = new Set([
  'Message', 'Notification', 'Project', 'BankAccount', 'Signature', 'Transaction', 'AuditLog',
]);

// LocalStorage fallback implementation
const entityNames = [
  'AuditLog',
  'BankAccount',
  'Message',
  'Notification',
  'Project',
  'Signature',
  'Transaction',
  'User',
  'WalletTransaction'
];

// Seed initial data if empty
const seedData = {
  Project: [
    {
      id: 'p_ocean_park',
      title: 'Vinhomes Ocean Park',
      name: 'Vinhomes Ocean Park',
      category: 'VinHomes',
      location: 'Gia Lâm, Hà Nội',
      image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&h=400&fit=crop',
      price_per_m2: 35000000,
      priceStr: '35 triệu/m²',
      rate: '0.5%/ngày',
      annual_yield: 0.5,
      area: '80-120m²',
      progress: 88,
      minAmount: '2800000000',
      duration: '30 ngày',
      scale: '420 ha - Đại đô thị biển hồ',
      is_active: true,
      description: 'Hệ thống phân lô đất nền & biệt thự biển hồ nhân tạo chuẩn quốc tế tại Gia Lâm, Hà Nội.'
    },
    {
      id: 'p_grand_park',
      title: 'Vinhomes Grand Park',
      name: 'Vinhomes Grand Park',
      category: 'VinHomes',
      location: 'TP. Thủ Đức, TP.HCM',
      image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&h=400&fit=crop',
      price_per_m2: 42000000,
      priceStr: '42 triệu/m²',
      rate: '0.6%/ngày',
      annual_yield: 0.6,
      area: '60-100m²',
      progress: 92,
      minAmount: '2520000000',
      duration: '45 ngày',
      scale: '271 ha - Công viên 36ha',
      is_active: true,
      description: 'Đại đô thị thông minh dẫn đầu tiềm năng tăng trưởng bứt phá tại trung tâm TP. Thủ Đức.'
    },
    {
      id: 'p_smart_city',
      title: 'Vinhomes Smart City',
      name: 'Vinhomes Smart City',
      category: 'VinHomes',
      location: 'Nam Từ Liêm, Hà Nội',
      image: 'https://images.unsplash.com/photo-1460317442991-0ec209397118?w=600&h=400&fit=crop',
      price_per_m2: 38000000,
      priceStr: '38 triệu/m²',
      rate: '0.4%/ngày',
      annual_yield: 0.4,
      area: '70-110m²',
      progress: 85,
      minAmount: '2660000000',
      duration: '30 ngày',
      scale: '280 ha - Đô thị thông minh',
      is_active: true,
      description: 'Thành phố thông minh đẳng cấp quốc tế cửa ngõ phía Tây thủ đô Hà Nội.'
    },
    {
      id: 'p_cozon_city',
      title: 'Vinhomes Cozon City',
      name: 'Vinhomes Cozon City',
      category: 'VinHomes',
      location: 'Long Biên, Hà Nội',
      image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&h=400&fit=crop',
      price_per_m2: 40000000,
      priceStr: '40 triệu/m²',
      rate: '0.5%/ngày',
      annual_yield: 0.5,
      area: '75-105m²',
      progress: 90,
      minAmount: '3000000000',
      duration: '60 ngày',
      scale: '180 ha - Quần thể ven sông',
      is_active: true,
      description: 'Dự án biệt thự & đất nền sinh thái đẳng cấp ven sông Hồng với pháp lý Sổ hồng vĩnh viễn.'
    },
    {
      id: 'p_vinpearl_nhatrang',
      title: 'Vinpearl Condotel Nha Trang',
      name: 'Vinpearl Condotel Nha Trang',
      category: 'Đầu tư nghỉ dưỡng',
      location: 'Nha Trang, Khánh Hòa',
      image: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=600&h=400&fit=crop',
      price_per_m2: 45000000,
      priceStr: '2.5 tỷ',
      rate: '0.025%/giờ',
      annual_yield: 0.025,
      area: '45-85m²',
      progress: 95,
      minAmount: '500000000',
      duration: '24 giờ',
      scale: 'Resort 5 sao trực diện biển',
      is_active: true,
      description: 'Condotel & biệt thự resort 5 sao tầm nhìn biển trực diện, cam kết chia sẻ lợi nhuận chi trả theo giờ.'
    },
    {
      id: 'p_vinpearl_phuquoc',
      title: 'Vinpearl Condotel Phú Quốc',
      name: 'Vinpearl Condotel Phú Quốc',
      category: 'Đầu tư nghỉ dưỡng',
      location: 'Phú Quốc, Kiên Giang',
      image: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&h=400&fit=crop',
      price_per_m2: 50000000,
      priceStr: '3.2 tỷ',
      rate: '0.030%/giờ',
      annual_yield: 0.030,
      area: '50-90m²',
      progress: 96,
      minAmount: '650000000',
      duration: '48 giờ',
      scale: 'Quần thể Grand World & Safari',
      is_active: true,
      description: 'Condotel & biệt thự đảo ngọc đẳng cấp quốc tế phân phối lợi nhuận hấp dẫn chi trả theo giờ.'
    },
    {
      id: 'p_vinpearl_hoian',
      title: 'Vinpearl Resort Hội An',
      name: 'Vinpearl Resort Hội An',
      category: 'Đầu tư nghỉ dưỡng',
      location: 'Hội An, Quảng Nam',
      image: 'https://images.unsplash.com/photo-1602002418082-a4443e081dd1?w=600&h=400&fit=crop',
      price_per_m2: 40000000,
      priceStr: '1.8 tỷ',
      rate: '0.020%/giờ',
      annual_yield: 0.020,
      area: '60-100m²',
      progress: 91,
      minAmount: '360000000',
      duration: '24 giờ',
      scale: 'Biệt thự ven sông di sản',
      is_active: true,
      description: 'Khu nghỉ dưỡng kết hợp không gian văn hóa di sản và kênh đầu tư bất động sản sinh lời theo giờ.'
    },
    {
      id: 'p_vinpearl_danang',
      title: 'Vinpearl Đà Nẵng',
      name: 'Vinpearl Đà Nẵng',
      category: 'Đầu tư nghỉ dưỡng',
      location: 'Đà Nẵng',
      image: 'https://images.unsplash.com/photo-1559508551-44bff1de756b?w=600&h=400&fit=crop',
      price_per_m2: 48000000,
      priceStr: '2.1 tỷ',
      rate: '0.022%/giờ',
      annual_yield: 0.022,
      area: '55-95m²',
      progress: 94,
      minAmount: '420000000',
      duration: '36 giờ',
      scale: 'Tổ hợp ven biển Non Nước',
      is_active: true,
      description: 'Resort cao cấp vị trí đắc địa bờ biển Non Nước với lợi nhuận chi trả tự động từng giờ.'
    },
    {
      id: 'p_vinpearl_halong',
      title: 'Vinpearl Ha Long',
      name: 'Vinpearl Ha Long',
      category: 'Đầu tư nghỉ dưỡng',
      location: 'Hạ Long, Quảng Ninh',
      image: 'https://images.unsplash.com/photo-1601918774946-25832a4be0d6?w=600&h=400&fit=crop',
      price_per_m2: 42000000,
      priceStr: '2.8 tỷ',
      rate: '0.028%/giờ',
      annual_yield: 0.028,
      area: '50-90m²',
      progress: 93,
      minAmount: '560000000',
      duration: '48 giờ',
      scale: 'Khu biệt thự đảo Đảo Rều',
      is_active: true,
      description: 'Kiệt tác resort biệt lập 360 độ view Vịnh Hạ Long di sản thiên nhiên thế giới, sinh lời liên tục từng giờ.'
    },
    {
      id: 'p_tech_industry_fund',
      title: 'Quỹ dự án phát triển công nghệ công nghiệp',
      name: 'Quỹ dự án phát triển công nghệ công nghiệp',
      category: 'Dự Án',
      location: 'Tổ hợp Công nghệ & Công nghiệp Vingroup',
      image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop',
      price_per_m2: 500000,
      priceStr: '500.000 ₫/Suất',
      rate: '0.05%/phút',
      annual_yield: 0.05,
      area: '1 Suất đầu tư',
      progress: 88,
      minAmount: '500000',
      duration: '60 phút',
      scale: 'Quỹ công nghệ cao, tự động hóa & AI',
      is_active: true,
      description: 'Quỹ tài trợ và đầu tư phát triển công nghệ công nghiệp cao, tự động hóa, trí tuệ nhân tạo và công nghiệp hiện đại chuẩn quốc tế.'
    },
    {
      id: 'p_green_future_fund',
      title: 'Quỹ Vì tương lai Xanh',
      name: 'Quỹ Vì tương lai Xanh',
      category: 'Dự Án',
      location: 'Toàn Quốc',
      image: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=600&h=400&fit=crop',
      price_per_m2: 1000000,
      priceStr: '1.000.000 ₫/Suất',
      rate: '0.04%/phút',
      annual_yield: 0.04,
      area: '1 Suất phát triển xanh',
      progress: 92,
      minAmount: '1000000',
      duration: '120 phút',
      scale: 'Hành động vì môi trường & năng lượng tái tạo',
      is_active: true,
      description: 'Quỹ hành động vì môi trường xanh, hỗ trợ chuyển đổi năng lượng xanh, trồng rừng và phát triển kinh tế bền vững không phát thải.'
    },
    {
      id: 'p_thien_tam_fund',
      title: 'Quỹ Thiện Tâm',
      name: 'Quỹ Thiện Tâm',
      category: 'Dự Án',
      location: 'Toàn Quốc',
      image: 'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=600&h=400&fit=crop',
      price_per_m2: 500000,
      priceStr: '500.000 ₫/Suất',
      rate: '0.025%/phút',
      annual_yield: 0.025,
      area: '1 Suất nhân ái',
      progress: 99,
      minAmount: '500000',
      duration: '30 phút',
      scale: 'Quỹ từ thiện xã hội phi lợi nhuận Tập đoàn Vingroup',
      is_active: true,
      description: 'Quỹ từ thiện xã hội phi lợi nhuận của Tập đoàn Vingroup, triển khai các chương trình nhân đạo vì cộng đồng.'
    },
    {
      id: 'p_vinmec_healthcare_fund',
      title: 'QUỸ CHĂM SÓC SỨC KHỎE Y TẾ CỘNG ĐỒNG VINMEC',
      name: 'QUỸ CHĂM SÓC SỨC KHỎE Y TẾ CỘNG ĐỒNG VINMEC',
      category: 'Dự Án',
      location: 'Hệ thống Bệnh viện Vinmec Toàn Quốc',
      image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=400&fit=crop',
      price_per_m2: 1000000,
      priceStr: '1.000.000 ₫/Suất',
      rate: '0.045%/phút',
      annual_yield: 0.045,
      area: '1 Suất y tế cộng đồng',
      progress: 91,
      minAmount: '1000000',
      duration: '90 phút',
      scale: 'Hệ thống Y tế Vinmec tiêu chuẩn JCI quốc tế',
      is_active: true,
      description: 'Quỹ nâng cao sức khỏe cộng đồng, bảo trợ y tế kỹ thuật cao và nghiên cứu y học tiên tiến tại hệ thống Vinmec.'
    },
    {
      id: 'p_vinschool_education_fund',
      title: 'QUỸ PHÁT TRIỂN GIÁO DỤC LIÊN CẤP VINSCHOOL',
      name: 'QUỸ PHÁT TRIỂN GIÁO DỤC LIÊN CẤP VINSCHOOL',
      category: 'Dự Án',
      location: 'Hệ thống trường Vinschool Toàn Quốc',
      image: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600&h=400&fit=crop',
      price_per_m2: 1000000,
      priceStr: '1.000.000 ₫/Suất',
      rate: '0.038%/phút',
      annual_yield: 0.038,
      area: '1 Suất giáo dục liên cấp',
      progress: 94,
      minAmount: '1000000',
      duration: '120 phút',
      scale: 'Hệ thống giáo dục phổ thông liên cấp chuẩn CIS hàng đầu Việt Nam',
      is_active: true,
      description: 'Hệ thống giáo dục phổ thông liên cấp chất lượng cao hàng đầu Việt Nam, ươm mầm thế hệ công dân toàn cầu.'
    },
    {
      id: 'p_vinuni_education',
      title: 'VinUni (Đại học đẳng cấp quốc tế)',
      name: 'VinUni (Đại học đẳng cấp quốc tế)',
      category: 'Dự Án',
      location: 'Gia Lâm, Hà Nội',
      image: 'https://images.unsplash.com/photo-1562774053-701939374585?w=600&h=400&fit=crop',
      price_per_m2: 2000000,
      priceStr: '2.000.000 ₫/Suất',
      rate: '0.035%/phút',
      annual_yield: 0.035,
      area: '1 Suất giáo dục tinh hoa',
      progress: 95,
      minAmount: '2000000',
      duration: '180 phút',
      scale: 'Đại học tinh hoa chuẩn quốc tế hợp tác Cornell & UPenn',
      is_active: true,
      description: 'Đại học VinUniversity đào tạo nhân tài chuẩn quốc tế, cơ sở vật chất hiện đại hàng đầu thế giới.'
    },
    {
      id: 'p_stock_vic',
      title: 'Quỹ Cổ Phiếu Vingroup (VIC)',
      name: 'Quỹ Cổ Phiếu Vingroup (VIC)',
      category: 'Đầu tư chứng khoán',
      location: 'Sàn HOSE / Vingroup',
      image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=400&fit=crop',
      price_per_m2: 45200,
      priceStr: '45.200 ₫/CP',
      rate: '15.5%/năm',
      annual_yield: 15.5,
      area: '1.000 CP/Lô',
      progress: 98,
      minAmount: '10000000',
      duration: '21600',
      scale: 'Tập đoàn đa ngành Vingroup',
      is_active: true,
      description: 'Đầu tư chứng khoán tích sản cổ phiếu VIC - Tập đoàn Vingroup sinh lời bền vững.'
    },
    {
      id: 'p_stock_vhm',
      title: 'Quỹ Cổ Phiếu Vinhomes (VHM)',
      name: 'Quỹ Cổ Phiếu Vinhomes (VHM)',
      category: 'Đầu tư chứng khoán',
      location: 'Sàn HOSE / Vinhomes',
      image: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=600&h=400&fit=crop',
      price_per_m2: 42800,
      priceStr: '42.800 ₫/CP',
      rate: '14.2%/năm',
      annual_yield: 14.2,
      area: '1.000 CP/Lô',
      progress: 96,
      minAmount: '10000000',
      duration: '21600',
      scale: 'Nhà phát triển BĐS số 1 Việt Nam',
      is_active: true,
      description: 'Cổ phiếu VHM dẫn đầu ngành bất động sản với quỹ đất vàng khổng lồ và lợi nhuận cổ tức cao.'
    }
  ],
  BankAccount: [
    { id: 'b1', user_id: 'u_admin1', bank_name: 'Techcombank', account_number: '19038291028012', account_holder: 'NGUYEN CAO LONG', is_default: true },
    { id: 'b2', user_id: 'u_admin1', bank_name: 'Vietcombank', account_number: '0011002938475', account_holder: 'NGUYEN CAO LONG', is_default: false }
  ],
  WalletTransaction: [
    { id: 'wt1', user_id: 'u_admin1', type: 'deposit', amount: 50000000, status: 'completed', description: 'Initial deposit via Techcombank', created_date: new Date(Date.now() - 86400000 * 3).toISOString() },
    { id: 'wt2', user_id: 'u_admin1', type: 'investment', amount: 15000000, status: 'completed', description: 'Investment in Vinhomes Grand Park', created_date: new Date(Date.now() - 86400000 * 2).toISOString() }
  ],
  Transaction: [
    { id: 'tx1', user_id: 'u_admin1', project_id: 'p_grand_park', project_name: 'Vinhomes Grand Park', amount: 15000000, status: 'completed', contract_status: 'approved', created_date: new Date(Date.now() - 86400000 * 2).toISOString() }
  ],
  Notification: [
    { id: 'n1', user_id: 'u_admin1', title: 'Welcome to Vin Platform', message: 'Your account has been successfully verified and credited.', is_read: false, created_date: new Date().toISOString() }
  ],
  Message: [
    { id: 'm1', user_id: 'u_admin1', sender: 'support', text: 'Hello! How can we assist you with your investments today?', created_date: new Date().toISOString() }
  ],
  Signature: [
    { id: 's1', user_id: 'u_admin1', title: 'Default Digital Signature', signature_data: 'data:image/png;base64,...', created_date: new Date().toISOString() }
  ],
  User: [
    { id: 'u_admin1', email: 'admin1@gmail.com', name: 'Quản trị viên (admin1)', role: 'admin', balance: 999999999 }
  ]
};

function getLocalStore(name) {
  try {
    const val = localStorage.getItem(`base44_entity_${name}`);
    if (!val) {
      const initial = seedData[name] || [];
      localStorage.setItem(`base44_entity_${name}`, JSON.stringify(initial));
      return initial;
    }
    let items = JSON.parse(val);
    if (name === 'Project') {
      let modified = false;
      const obsoleteIds = new Set(['p_vinfast_mobility', 'p_vincom_megamall', 'p_vinclub_internal_fund', 'p_vinclub_startup_fund']);
      const pruned = items.filter(p => !obsoleteIds.has(p.id));
      if (pruned.length !== items.length) {
        items = pruned;
        modified = true;
      }
      const defaultProjects = seedData.Project;
      for (const defP of defaultProjects) {
        const idx = items.findIndex(
          p => p.id === defP.id || 
          (p.title && p.title.toLowerCase() === defP.title.toLowerCase()) || 
          (p.name && p.name.toLowerCase() === defP.name.toLowerCase())
        );
        if (idx === -1) {
          items.push(defP);
          modified = true;
        } else {
          // Fill missing default fields without overwriting user/admin modifications
          const existing = items[idx];
          const merged = { ...defP, ...existing };
          // Preserve any fields explicitly saved by admin
          if (existing.rate !== undefined && existing.rate !== null && existing.rate !== '') {
            merged.rate = existing.rate;
          }
          if (existing.category !== undefined && existing.category !== null && existing.category !== '') {
            merged.category = existing.category;
          }
          if (existing.description !== undefined && existing.description !== null && existing.description !== '') {
            merged.description = existing.description;
          }
          if (existing.title !== undefined && existing.title !== null && existing.title !== '') {
            merged.title = existing.title;
          }
          if (existing.name !== undefined && existing.name !== null && existing.name !== '') {
            merged.name = existing.name;
          }
          if (existing.priceStr !== undefined && existing.priceStr !== null && existing.priceStr !== '') {
            merged.priceStr = existing.priceStr;
          }
          if (existing.price_per_m2 !== undefined && existing.price_per_m2 !== null) {
            merged.price_per_m2 = existing.price_per_m2;
          }
          if (existing.is_active !== undefined) {
            merged.is_active = existing.is_active;
          }

          if (JSON.stringify(items[idx]) !== JSON.stringify(merged)) {
            items[idx] = merged;
            modified = true;
          }
        }
      }
      if (modified) {
        localStorage.setItem(`base44_entity_${name}`, JSON.stringify(items));
      }
    }
    if (name === 'User') {
      const regUsers = getRegisteredUsers();
      let modified = false;
      for (const ru of regUsers) {
        if (!ru || !ru.id) continue;
        const idx = items.findIndex(u => u.id === ru.id || (u.email && u.email === ru.email));
        if (idx === -1) {
          items.push(ru);
          modified = true;
        } else {
          // Synchronize balance if updated in registered users
          if (items[idx].balance !== ru.balance || items[idx].total_deposited !== ru.total_deposited) {
            items[idx] = { ...items[idx], balance: ru.balance, total_deposited: ru.total_deposited };
            modified = true;
          }
        }
      }
      if (modified) {
        localStorage.setItem(`base44_entity_${name}`, JSON.stringify(items));
      }
    }
    return items;
  } catch (e) {
    return seedData[name] || [];
  }
}

function setLocalStore(name, items) {
  try {
    localStorage.setItem(`base44_entity_${name}`, JSON.stringify(items));
  } catch (e) {}
}

const subscribers = {};

class LocalEntityClient {
  constructor(entityName) {
    this.entityName = entityName;
  }

  async list(sort, limit) {
    let items = getLocalStore(this.entityName);
    if (sort && sort.startsWith('-')) {
      const field = sort.slice(1);
      items = [...items].sort((a, b) => new Date(b[field] || b.created_date || 0) - new Date(a[field] || a.created_date || 0));
    } else if (sort) {
      items = [...items].sort((a, b) => new Date(a[sort] || a.created_date || 0) - new Date(b[sort] || b.created_date || 0));
    }
    if (limit) {
      items = items.slice(0, limit);
    }
    return items;
  }

  async get(id) {
    const items = getLocalStore(this.entityName);
    return items.find(i => i.id === id) || null;
  }

  async create(data) {
    const items = getLocalStore(this.entityName);
    const newItem = {
      id: 'id_' + Math.random().toString(36).substr(2, 9),
      created_date: new Date().toISOString(),
      ...data
    };
    items.unshift(newItem);
    setLocalStore(this.entityName, items);
    this.notifySubscribers();

    // Đẩy thay đổi lên Supabase Database, Firestore & Realtime Database
    try {
      if (this.entityName === 'User') {
        upsertSupabaseUser(newItem).catch(() => null);
        import('@/lib/rtdbSync').then(({ pushUserToRTDB }) => {
          pushUserToRTDB(newItem);
        });
      } else if (this.entityName === 'WalletTransaction') {
        createSupabaseWalletTransaction(newItem).catch(() => null);
        import('@/lib/rtdbSync').then(({ pushWalletTransactionToRTDB }) => {
          pushWalletTransactionToRTDB(newItem);
        });
      } else if (this.entityName === 'Message') {
        import('@/lib/rtdbSync').then(({ pushMessageToRTDB }) => {
          pushMessageToRTDB(newItem);
        });
      } else if (this.entityName === 'Notification') {
        import('@/lib/rtdbSync').then(({ pushNotificationToRTDB }) => {
          pushNotificationToRTDB(newItem);
        });
      } else if (this.entityName === 'Project') {
        import('@/lib/rtdbSync').then(({ pushProjectToRTDB }) => {
          pushProjectToRTDB(newItem);
        });
      }

      if (SUPABASE_BACKED_ENTITIES.has(this.entityName)) {
        upsertSupabaseEntity(this.entityName, newItem).catch(() => null);
      }

      import('@/lib/firebaseSync').then(({ pushEntityToFirestore }) => {
        pushEntityToFirestore(this.entityName, newItem.id, newItem, 'upsert');
      });
      import('@/lib/rtdbSync').then(({ pushGenericEntityToRTDB }) => {
        pushGenericEntityToRTDB(this.entityName, newItem.id, newItem);
      });
    } catch (e) {
      console.error("Lỗi đồng bộ Supabase/Firestore/RTDB (create):", e);
    }

    return newItem;
  }

  async update(id, data) {
    let items = getLocalStore(this.entityName);
    let updated = null;
    items = items.map(i => {
      if (i.id === id) {
        updated = { ...i, ...data };
        return updated;
      }
      return i;
    });

    // Bản ghi có thể không có trong cache cục bộ của THIẾT BỊ NÀY dù vẫn
    // tồn tại thật trên Supabase/Firestore/RTDB (ví dụ: Admin duyệt một
    // giao dịch mà Firestore listener của máy đó vừa lọc/ghi đè cache -
    // xem firebaseSync.js). Trước đây update() im lặng bỏ qua toàn bộ đồng
    // bộ trong trường hợp này: Admin thấy toast "thành công", tiền đã được
    // cộng/trừ qua adjustUserBalance, nhưng trạng thái giao dịch không được
    // ghi ở đâu cả. Vẫn đẩy đi một bản vá (partial patch) thay vì bỏ qua -
    // các hàm upsert/merge phía dưới đều an toàn với dữ liệu thiếu field.
    if (!updated) {
      updated = { id, ...data };
    }
    setLocalStore(this.entityName, items);
    this.notifySubscribers();

    try {
      if (this.entityName === 'User') {
        updateSupabaseUser(id, updated).catch(() => null);
        import('@/lib/rtdbSync').then(({ pushUserToRTDB }) => {
          pushUserToRTDB(updated);
        });
      } else if (this.entityName === 'WalletTransaction') {
        updateSupabaseWalletTransaction(id, updated).catch(() => null);
        import('@/lib/rtdbSync').then(({ pushWalletTransactionToRTDB }) => {
          pushWalletTransactionToRTDB(updated);
        });
      }

      if (SUPABASE_BACKED_ENTITIES.has(this.entityName)) {
        upsertSupabaseEntity(this.entityName, updated).catch(() => null);
      }

      import('@/lib/firebaseSync').then(({ pushEntityToFirestore }) => {
        pushEntityToFirestore(this.entityName, id, updated, 'upsert');
      });
      import('@/lib/rtdbSync').then(({ pushGenericEntityToRTDB }) => {
        // "update" (merge), không phải "set": khi bản ghi không có trong
        // cache cục bộ, `updated` chỉ có id + field vừa sửa - "set" sẽ xoá
        // mọi field khác đang có trên RTDB. "update" an toàn trong cả 2
        // trường hợp (đủ field hay chỉ vá thiếu).
        pushGenericEntityToRTDB(this.entityName, id, updated, 'update');
      });
    } catch (e) {
      console.error("Lỗi đồng bộ Supabase/Firestore/RTDB (update):", e);
    }

    return updated;
  }

  async delete(id) {
    let items = getLocalStore(this.entityName);
    items = items.filter(i => i.id !== id);
    setLocalStore(this.entityName, items);
    this.notifySubscribers();

    try {
      if (this.entityName === 'Message') {
        import('@/lib/rtdbSync').then(({ deleteMessageFromRTDB }) => {
          deleteMessageFromRTDB(id);
        });
      } else if (this.entityName === 'WalletTransaction') {
        deleteSupabaseWalletTransaction(id).catch(() => null);
        import('@/lib/rtdbSync').then(({ deleteWalletTransactionFromRTDB }) => {
          deleteWalletTransactionFromRTDB(id);
        });
      }
      if (SUPABASE_BACKED_ENTITIES.has(this.entityName)) {
        deleteSupabaseEntity(this.entityName, id).catch(() => null);
      }
      import('@/lib/firebaseSync').then(({ pushEntityToFirestore }) => {
        pushEntityToFirestore(this.entityName, id, {}, 'delete');
      });
    } catch (e) {
      console.error("Lỗi đồng bộ Firestore (delete):", e);
    }

    return true;
  }

  async filter(query, sort, limit) {
    let items = getLocalStore(this.entityName);
    if (query) {
      items = items.filter(item => {
        if (query.$or && Array.isArray(query.$or)) {
          const passesOr = query.$or.some(subQ => {
            return Object.entries(subQ).every(([k, v]) => item[k] === v);
          });
          if (!passesOr) return false;
        }
        for (const [k, v] of Object.entries(query)) {
          if (k === '$or') continue;
          if (v && typeof v === 'object' && v.$exists !== undefined) {
            const exists = item[k] !== undefined && item[k] !== null && item[k] !== '';
            if (v.$exists !== exists) return false;
          } else if (item[k] !== v) {
            return false;
          }
        }
        return true;
      });
    }
    if (sort) {
      const desc = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      items = [...items].sort((a, b) => {
        const valA = a[field] || 0;
        const valB = b[field] || 0;
        return desc ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
      });
    }
    if (limit) {
      items = items.slice(0, limit);
    }
    return items;
  }

  async bulkCreate(records) {
    const created = [];
    for (const rec of records) {
      const res = await this.create(rec);
      created.push(res);
    }
    return created;
  }

  async bulkUpdate(updates) {
    for (const up of updates) {
      if (up.id) {
        await this.update(up.id, up);
      }
    }
    return true;
  }

  subscribe(callback) {
    if (!subscribers[this.entityName]) {
      subscribers[this.entityName] = [];
    }
    subscribers[this.entityName].push(callback);
    return () => {
      subscribers[this.entityName] = subscribers[this.entityName].filter(cb => cb !== callback);
    };
  }

  notifySubscribers() {
    if (subscribers[this.entityName]) {
      const items = getLocalStore(this.entityName);
      subscribers[this.entityName].forEach(cb => {
        try { cb(items); } catch (e) {}
      });
    }
  }
}

function getRegisteredUsers() {
  try {
    const raw = localStorage.getItem('base44_registered_users');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return [
    {
      id: 'u_demo1',
      identifier: '0901234567',
      email: 'user1@vinclub.com',
      username: 'user1',
      phone: '0901234567',
      password: '123456',
      name: 'NGUYỄN VĂN A',
      full_name: 'NGUYỄN VĂN A',
      role: 'user',
      balance: 50000000
    },
    {
      id: 'u_nclong',
      identifier: 'nclong1976@gmail.com',
      email: 'nclong1976@gmail.com',
      username: 'nclong',
      phone: '0912345678',
      password: '123456',
      name: 'Nguyen Cao Long',
      full_name: 'Nguyen Cao Long',
      role: 'admin',
      balance: 50000000
    }
  ];
}

class FallbackBase44Client {
  constructor() {
    this.entities = {};
    entityNames.forEach(name => {
      this.entities[name] = new LocalEntityClient(name);
    });

    this.integrations = {
      Core: {
        UploadFile: async ({ file }) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ file_url: reader.result });
            reader.onerror = () => resolve({ file_url: null });
            reader.readAsDataURL(file);
          });
        }
      }
    };

    this.auth = {
      async me() {
        const localUser = localStorage.getItem('base44_local_user');
        const localToken = localStorage.getItem('base44_local_token');
        if (localUser && localToken) {
          return JSON.parse(localUser);
        }
        throw { status: 401, message: 'Authentication required' };
      },
      async loginViaEmailPassword(email, password) {
        const cleanIdentifier = (email || '').trim();
        const cleanPassword = (password || '').trim();

        if (!cleanIdentifier || !cleanPassword) {
          throw new Error("Vui lòng nhập đầy đủ thông tin");
        }

        const lowerId = cleanIdentifier.toLowerCase();

        // Check registered accounts (supports username, phone, or email)
        const registeredUsers = getRegisteredUsers();
        const foundUser = registeredUsers.find(u => {
          if (!u) return false;
          const uId = (u.identifier || '').toLowerCase();
          const uEmail = (u.email || '').toLowerCase();
          const uPhone = (u.phone || '').trim();
          const uUsername = (u.username || '').toLowerCase();

          return (
            uId === lowerId ||
            uEmail === lowerId ||
            uPhone === cleanIdentifier ||
            uUsername === lowerId
          );
        });

        // Reject unregistered accounts or invalid password
        if (!foundUser || foundUser.password !== cleanPassword) {
          throw new Error("Tài khoản hoặc mật khẩu không chính xác");
        }

        localStorage.setItem('base44_local_user', JSON.stringify(foundUser));
        localStorage.setItem('base44_local_token', 'local_token_' + Date.now());
        return { access_token: 'local_token_' + Date.now(), user: foundUser };
      },
      async register(data) {
        const identifier = (data.email || '').trim();
        const password = (data.password || '').trim();
        const name = (data.name || identifier.split('@')[0]).trim();
        const referralCode = (data.referral_code || data.referralCode || '').trim().toUpperCase();

        if (!identifier || !password) {
          throw new Error("Vui lòng nhập đầy đủ thông tin");
        }

        if (referralCode !== 'E-CUV') {
          throw new Error("Mã giới thiệu không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ Admin để nhận mã giới thiệu.");
        }

        const registeredUsers = getRegisteredUsers();
        const lowerId = identifier.toLowerCase();

        // Check duplicate
        const exists = registeredUsers.find(u => {
          if (!u) return false;
          return (
            (u.identifier || '').toLowerCase() === lowerId ||
            (u.email || '').toLowerCase() === lowerId ||
            (u.phone || '').trim() === identifier ||
            (u.username || '').toLowerCase() === lowerId
          );
        });

        if (exists) {
          throw new Error("Tài khoản hoặc số điện thoại đã tồn tại trong hệ thống");
        }

        const newUser = {
          id: 'u_' + Date.now(),
          identifier: identifier,
          email: identifier.includes('@') ? identifier : `${identifier}@vinclub.com`,
          phone: /^\d+$/.test(identifier) ? identifier : '',
          username: identifier.includes('@') ? identifier.split('@')[0] : identifier,
          password: password,
          name: name || 'Khách hàng VinClub',
          full_name: name || 'Khách hàng VinClub',
          role: 'user',
          balance: 0,
          total_deposited: 0,
          membership_tier: 'Member',
          vip_level: 'VIP 0',
          created_at: new Date().toISOString()
        };

        registeredUsers.push(newUser);
        localStorage.setItem('base44_registered_users', JSON.stringify(registeredUsers));

        // Đẩy user lên Supabase Database (PostgreSQL) và Firebase RTDB
        try {
          upsertSupabaseUser(newUser).catch(() => null);
          await pushUserToRTDB(newUser);
        } catch (e) {
          console.warn("pushUserToRTDB registration error:", e);
        }

        // Create welcome notification in bell inbox for the new user
        try {
          const welcomeNotif = {
            id: 'n_welcome_' + Date.now(),
            title: 'Chào mừng đến với VinClub',
            message: 'Chào mừng bạn đã đến với Vinclub — hành trình đặc quyền dành riêng cho bạn, nơi mỗi trải nghiệm đều được nâng tầm và trọn vẹn hơn bao giờ hết.',
            content: 'Chào mừng bạn đã đến với Vinclub — hành trình đặc quyền dành riêng cho bạn, nơi mỗi trải nghiệm đều được nâng tầm và trọn vẹn hơn bao giờ hết.',
            user_id: newUser.id,
            type: 'admin',
            is_read: false,
            created_date: new Date().toISOString()
          };
          const rawNotifs = localStorage.getItem('base44_entity_Notification');
          const notifList = rawNotifs ? JSON.parse(rawNotifs) : [];
          notifList.unshift(welcomeNotif);
          localStorage.setItem('base44_entity_Notification', JSON.stringify(notifList));
        } catch (e) {
          console.error("Welcome notif error:", e);
        }

        localStorage.setItem('base44_local_user', JSON.stringify(newUser));
        localStorage.setItem('base44_local_token', 'local_token_' + Date.now());
        return { access_token: 'local_token_' + Date.now(), user: newUser };
      },
      async logout() {
        try {
          const { signOut } = await import('@/lib/supabaseAuth');
          await signOut();
        } catch (e) {}
        localStorage.removeItem('base44_local_user');
        localStorage.removeItem('base44_local_token');
        localStorage.removeItem('vinclub_supabase_session');
        sessionStorage.setItem('vinclub_welcome_seen', 'true');
        window.location.href = '/login';
      },
      setToken(token) {
        localStorage.setItem('base44_local_token', token);
      },
      getToken() {
        return localStorage.getItem('base44_local_token') || 'local_token_123';
      },
      async resetPasswordRequest(email) {
        return { success: true };
      },
      async resetPassword(data) {
        return { success: true };
      },
      async verifyOtp(data) {
        return { access_token: 'local_token_123' };
      },
      async resendOtp(email) {
        return { success: true };
      },
      loginWithProvider(provider, redirectUrl) {
        localStorage.setItem('base44_local_user', JSON.stringify({ email: 'nclong1976@gmail.com', name: 'Nguyen Cao Long', role: 'admin' }));
        localStorage.setItem('base44_local_token', 'google_token_123');
        window.location.href = redirectUrl || '/';
      }
    };
  }
}

export const base44 = new FallbackBase44Client();
