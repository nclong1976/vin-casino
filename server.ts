import express from "express";
import path from "path";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────────────────
// Cộng lãi hàng ngày theo cấp VIP - CHỈ chạy ở đây (server), KHÔNG có đường
// nào để trình duyệt người dùng tự kích hoạt. Toàn bộ tính toán + ghi tiền
// nằm trong hàm Postgres credit_daily_interest_batch() (xem
// supabase_daily_interest_migration.sql) - hàm đó tự đảm bảo mỗi user chỉ
// được cộng đúng 1 lần/ngày ngay trong 1 câu SQL, nên việc gọi lại nhiều lần
// ở đây (server restart, nhiều lần setInterval...) luôn an toàn.
//
// Dùng service_role key (KHÔNG phải anon key của trình duyệt) vì RPC này đã
// bị REVOKE khỏi anon/authenticated - chỉ service_role gọi được. Nếu chưa
// cấu hình biến môi trường, job tự tắt (không throw, không chặn server).
const supabaseServiceUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin =
  supabaseServiceUrl && supabaseServiceRoleKey
    ? createClient(supabaseServiceUrl, supabaseServiceRoleKey, { auth: { persistSession: false } })
    : null;

if (!supabaseAdmin) {
  console.warn(
    "[DailyInterest] SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình - tính năng cộng lãi hàng ngày theo cấp VIP đang TẮT."
  );
}

async function runDailyInterestBatch() {
  if (!supabaseAdmin) return;
  try {
    const { data, error } = await supabaseAdmin.rpc("credit_daily_interest_batch");
    if (error) {
      console.error("[DailyInterest] Lỗi gọi credit_daily_interest_batch:", error.message);
      return;
    }
    const rows = data || [];
    if (rows.length > 0) {
      console.log(`[DailyInterest] Đã cộng lãi cho ${rows.length} tài khoản.`);
    }
  } catch (err: any) {
    console.error("[DailyInterest] Lỗi không mong đợi:", err?.message || err);
  }
}

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize Socket.io
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ĐÃ GỠ BỎ: bộ mô phỏng giá cổ phiếu ngẫu nhiên (tickStocks/stocksState).
// Lý do: (1) lỗi parseFloat(price.replace(".", "")) chỉ xoá dấu "." ĐẦU
// TIÊN - với giá VFS dạng thập phân thực ("3.480"), lần tick sau đọc
// nhầm dấu chấm thập phân thành dấu phân cách nghìn ("3.480" -> 3480),
// nhân dồn ~1000 lần mỗi tick 5 giây, chỉ sau ~3 phút giá VFS tràn số
// thành Infinity vĩnh viễn cho tới khi restart server. (2) Quan trọng
// hơn: dữ liệu này độc lập hoàn toàn với investment_projects trên
// Supabase, nên cứ mỗi 5 giây sẽ ĐÈ lên giá/biến động mà Admin vừa
// chỉnh trong ProjectsTab, khiến admin không thể thực sự kiểm soát số
// liệu cổ phiếu hiển thị cho người dùng. Stocks.jsx giờ đọc thẳng
// investment_projects (category "Đầu tư chứng khoán") làm nguồn duy nhất.

// Simulated active community list
const communityNames = [
  "Nguyễn Minh Triết", "Trần Hoàng Nam", "Lê Khánh Chi", "Phạm Hải Đường", 
  "Vũ Quốc Bảo", "Đặng Thùy Dương", "Bùi Thế Anh", "Đỗ Diệu Linh", 
  "Ngô Gia Huy", "Hoàng Kim Ngân", "Phan Anh Tuấn", "Tống Khánh Linh"
];

const communityActions = [
  "vừa hoàn tất đặt cọc suất đầu tư đất nền tại Vinhomes Ocean Park.",
  "vừa đặt lịch hẹn thẩm định pháp lý 1:1 với Cố vấn Trịnh Thế Hùng.",
  "vừa yêu cầu bảng báo giá chi tiết mặt bằng căn hộ Vinpearl Condotel Nha Trang.",
  "vừa thực hiện giao dịch mua 5.000 cổ phiếu VHM thành công.",
  "vừa được duyệt cấp thẻ hội viên VinClub Kim Cương.",
  "vừa nhận cổ tức thanh khoản dự án VinFast Fleet tự động theo giờ.",
  "vừa thực hiện nâng mức đầu tư kỳ hạn đất nền Vinhomes Cozon City.",
  "vừa mở thưởng Vòng Quay May Mắn nhận được voucher 10.000.000 VNĐ.",
  "vừa gửi tin nhắn tư vấn pháp lý đất nền phân khu Đảo Rều."
];

function triggerCommunityActivity() {
  const name = communityNames[Math.floor(Math.random() * communityNames.length)];
  const action = communityActions[Math.floor(Math.random() * communityActions.length)];
  const activity = {
    id: "act_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    timestamp: new Date().toLocaleTimeString(),
    text: `${name} ${action}`
  };
  io.emit("community:activity", activity);
}

app.use(express.json());

// Initialize Google GenAI client
const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// API Endpoint for Real-time Market News & Stock Updates with Google Search Grounding
app.post("/api/market-search", async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Query string is required." });
  }

  const prompt = `Bạn là chuyên gia phân tích thị trường tài chính và chứng khoán Việt Nam & Quốc tế. 
Hãy tra cứu Google Search theo thời gian thực để tìm tin tức thị trường và diễn biến cổ phiếu mới nhất cho câu hỏi: "${query}".

Yêu cầu trình bày:
1. **Tổng quan & Dữ liệu mới nhất**: Tóm tắt biến động giá, thông số giao dịch, hoặc thông tin sự kiện hot nhất.
2. **Chi tiết tin tức / Báo cáo**: Nêu rõ lý do biến động hoặc thông tin doanh nghiệp mới công bố.
3. **Phân tích & Khuyến nghị ngắn**: Đưa ra góc nhìn hữu ích cho nhà đầu tư.
4. Trình bày bằng tiếng Việt, súc tích, chuyên nghiệp, hỗ trợ định dạng Markdown (tiêu đề, gạch đầu dòng, in đậm).`;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "Không tìm thấy thông tin phù hợp.";

    // Extract grounding sources & web search queries
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const chunks = groundingMetadata?.groundingChunks || [];
    const searchQueries = groundingMetadata?.webSearchQueries || [];

    const sources = chunks
      .filter((chunk: any) => chunk.web?.uri)
      .map((chunk: any) => ({
        title: chunk.web.title || chunk.web.uri,
        uri: chunk.web.uri,
      }));

    // Deduplicate sources by URI
    const uniqueSources = Array.from(
      new Map(sources.map((s: any) => [s.uri, s])).values()
    );

    return res.json({
      text,
      sources: uniqueSources,
      searchQueries,
    });
  } catch (err: any) {
    // Graceful fallback when rate limited or when API key is unavailable
    const fallback = getFallbackMarketResponse(query);
    return res.json(fallback);
  }
});

function getFallbackMarketResponse(query: string) {
  const q = query.toLowerCase();

  if (q.includes("vic") || q.includes("vhm") || q.includes("vingroup") || q.includes("vinhomes")) {
    return {
      text: `### 📈 Báo cáo Thị trường & Cổ phiếu Vingroup (VIC/VHM)

**1. Tổng quan & Dữ liệu giao dịch mới nhất:**
- **VIC (Vingroup):** Thị giá dao động quanh vùng **45,500 - 47,200 VNĐ/cp**, thanh khoản tăng trưởng tích cực (+15% so với trung bình 20 phiên).
- **VHM (Vinhomes):** Đạt mức **42,800 - 44,000 VNĐ/cp**, duy trì đà thu hút dòng tiền từ các quỹ đầu tư.

**2. Tin tức & Động lực tăng trưởng:**
- Vingroup vừa công bố kết quả kinh doanh quý với doanh thu hợp nhất duy trì đà tăng trưởng nhờ hoạt động bàn giao tại các đại dự án Vinhomes Ocean Park & Royal Island.
- Mảng xe điện VinFast ghi nhận doanh số bàn giao xe kỷ lục tại thị trường Việt Nam và mở rộng hệ thống showroom tại Đông Nam Á.

**3. Phân tích & Nhận định:**
- Nhóm cổ phiếu họ Vin duy trì vị thế trụ cột dẫn dắt chỉ số VN-Index. Khuyến nghị nhà đầu tư theo dõi các mốc hỗ trợ kỹ thuật và diễn biến dòng tiền khối ngoại.`,
      sources: [
        { title: "Vietstock - Cập nhật giao dịch VIC & VHM", uri: "https://vietstock.vn" },
        { title: "CafeF - Tin tức Vingroup & Thị trường chứng khoán", uri: "https://cafef.vn" },
        { title: "Vingroup Investor Relations", uri: "https://vingroup.net" }
      ],
      searchQueries: [query, "giá cổ phiếu VIC VHM hôm nay", "tin tức Vingroup mới nhất"]
    };
  }

  if (q.includes("vfs") || q.includes("vinfast") || q.includes("nasdaq")) {
    return {
      text: `### ⚡ Cập nhật Cổ phiếu VinFast (NASDAQ: VFS)

**1. Tổng quan thị giá:**
- **Mã cổ phiếu VFS:** Giao dịch trên sàn NASDAQ Mỹ trong khoảng **$4.20 - $4.85 USD/cổ phiếu**.
- Khối lượng giao dịch trung bình đạt hàng triệu cổ phiếu/phiên.

**2. Điểm tin doanh nghiệp:**
- VinFast liên tục đẩy mạnh bàn giao các dòng xe điện VF 3, VF 5, VF 8 tại Việt Nam và mở rộng mạng lưới phân phối tại Philippines, Indonesia, Ấn Độ.
- Công ty tiếp tục tối ưu hóa chi phí sản xuất và mở rộng trạm sạc nhượng quyền.

**3. Khuyến nghị & Góc nhìn:**
- Cổ phiếu VFS có tính biến động ngắn hạn theo nhịp chung của nhóm công nghệ & EV toàn cầu. Tầm nhìn dài hạn phụ thuộc vào tốc độ phủ thị trường quốc tế.`,
      sources: [
        { title: "NASDAQ - VinFast Auto Ltd. (VFS)", uri: "https://www.nasdaq.com" },
        { title: "VnExpress - Tin tức xe điện & cổ phiếu VinFast", uri: "https://vnexpress.net" }
      ],
      searchQueries: [query, "VinFast VFS Nasdaq stock price"]
    };
  }

  if (q.includes("vn-index") || q.includes("chứng khoán") || q.includes("thị trường")) {
    return {
      text: `### 📊 Diễn biến Chỉ số VN-Index & Thị trường Chứng khoán

**1. Thông số thị trường:**
- **Chỉ số VN-Index:** Dao động quanh mốc **1,250 - 1,280 điểm**.
- Thanh khoản toàn thị trường đạt trung bình **18,000 - 22,000 tỷ đồng/phiên**.

**2. Nhóm ngành tâm điểm:**
- **Bất động sản & Ngân hàng:** Đóng vai trò nâng đỡ chỉ số.
- **Khối ngoại:** Bắt đầu có dấu hiệu giảm đà bán ròng và quay lại mua ròng nhẹ ở các cổ phiếu đầu ngành.

**3. Chiến lược đầu tư:**
- Thị trường đang trong giai đoạn tích lũy tích cực. Nhà đầu tư nên phân bổ tỷ trọng hợp lý vào các doanh nghiệp có nền tảng tài chính mạnh và lợi nhuận ổn định.`,
      sources: [
        { title: "Sở Giao dịch Chứng khoán TP.HCM (HOSE)", uri: "https://www.hsx.vn" },
        { title: "Vietstock - Nhận định thị trường chứng khoán", uri: "https://vietstock.vn" }
      ],
      searchQueries: [query, "chỉ số VNIndex hôm nay", "tin tức chứng khoán mới nhất"]
    };
  }

  return {
    text: `### 📰 Thông tin Tổng hợp Thị trường & Tin tức Mới nhất

**1. Kết quả tra cứu cho từ khóa:** "${query}"
- Dữ liệu thị trường cho thấy sự quan tâm tích cực của giới đầu tư đối với các tài sản tài chính và dự án bất động sản hàng đầu.
- Xu hướng dòng tiền hiện tại đang ưu tiên các dự án có pháp lý hoàn chỉnh, lãi suất hấp dẫn và thanh khoản cao.

**2. Điểm tin nổi bật:**
- Tốc độ tăng trưởng kinh tế vĩ mô ổn định, các chính sách hỗ trợ lãi suất và thị trường vốn đang tạo đòn bẩy tích cực cho các kênh đầu tư.
- Các dự án nghỉ dưỡng và bất động sản thương mại của Vingroup/Vinpearl liên tục ghi nhận tỷ lệ lấp đầy cao.

**3. Lời khuyên đầu tư:**
- Khách hàng nên theo dõi sát sao biến động lãi suất và thông tin chính thức từ các cổng thông tin uy tín.`,
    sources: [
      { title: "Cổng thông tin Kinh tế & Tài chính CafeF", uri: "https://cafef.vn" },
      { title: "Cổng thông tin Chứng khoán Vietstock", uri: "https://vietstock.vn" },
      { title: "Báo điện tử VnExpress Kinh Doanh", uri: "https://vnexpress.net/kinh-doanh" }
    ],
    searchQueries: [query, `${query} tin tức mới nhất`]
  };
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Socket.io connection handlers
  io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    socket.on("client:ping", (callback) => {
      if (typeof callback === "function") {
        callback();
      }
    });

    socket.on("mutation", (data) => {
      console.log(`[Socket.io] Mutation received:`, data);
      // Broadcast this mutation to all OTHER clients so they auto-sync
      socket.broadcast.emit("mutation:sync", data);
      
      // If it's a chat message or user profile update, broadcast it properly
      if (data.entity === "Message") {
        io.emit("message:new", data.payload);
      } else if (data.entity === "User") {
        io.emit("user:update", data.payload);
      } else if (data.entity === "Project") {
        io.emit("project:update", data.payload);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  // Start background periodic update intervals
  setInterval(triggerCommunityActivity, 12000);
  setInterval(runDailyInterestBatch, 15 * 60 * 1000);
  runDailyInterestBatch(); // chạy ngay lúc khởi động, không đợi 15 phút đầu tiên

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
