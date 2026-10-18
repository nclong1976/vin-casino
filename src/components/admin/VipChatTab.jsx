import React, { useState, useEffect, useRef, useMemo } from "react";
import { MessageSquare, Plus, Search, Send, Loader2, AlertTriangle, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdminUser } from "@/lib/isAdminUser";
import { toast } from "sonner";

export default function VipChatTab() {
  const { user: currentAdmin } = useAuth();
  const isSuperAdmin = isSuperAdminUser(currentAdmin);

  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [searchPlayers, setSearchPlayers] = useState("");

  const messagesEndRef = useRef(null);

  // Fetch VIP conversations
  const fetchConversations = async () => {
    if (!isSuperAdmin) return;

    try {
      const { data, error } = await supabase
        .from("vip_conversations")
        .select("*")
        .eq("super_admin_id", currentAdmin?.id || "")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (err) {
      console.error("Error fetching VIP conversations:", err);
      toast.error("Không thể tải cuộc trò chuyện VIP");
    }
  };

  // Fetch messages for selected conversation
  const fetchMessages = async (convId) => {
    if (!convId) return;

    try {
      const { data, error } = await supabase
        .from("vip_messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);

      // Scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      console.error("Error fetching VIP messages:", err);
    }
  };

  // Fetch all players for new conversation modal
  const fetchAllPlayers = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, role")
        .neq("role", "admin")
        .neq("role", "ADMIN")
        .order("full_name", { ascending: true });

      if (error) throw error;
      setAllPlayers(data || []);
    } catch (err) {
      console.error("Error fetching players:", err);
    }
  };

  // Load initial data
  useEffect(() => {
    if (!isSuperAdmin) {
      return;
    }
    setLoading(true);
    Promise.all([fetchConversations(), fetchAllPlayers()]).finally(() =>
      setLoading(false)
    );
  }, [isSuperAdmin, currentAdmin?.id]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!selectedConv?.id) return;

    const subscription = supabase
      .channel(`vip_messages_${selectedConv.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vip_messages",
          filter: `conversation_id=eq.${selectedConv.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMessages((prev) => [...prev, payload.new]);
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [selectedConv?.id]);

  // Send message
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConv || sending) return;

    setSending(true);
    try {
      const { error } = await supabase.from("vip_messages").insert({
        conversation_id: selectedConv.id,
        sender_id: currentAdmin?.id,
        content: messageInput.trim(),
      });

      if (error) throw error;
      setMessageInput("");
      toast.success("Gửi tin nhắn thành công");
    } catch (err) {
      console.error("Error sending message:", err);
      toast.error("Không thể gửi tin nhắn");
    } finally {
      setSending(false);
    }
  };

  // Create new VIP conversation
  const handleCreateConversation = async () => {
    if (!selectedPlayer) {
      toast.error("Vui lòng chọn người chơi");
      return;
    }

    try {
      const { data, error } = await supabase.from("vip_conversations").insert({
        super_admin_id: currentAdmin?.id,
        player_id: selectedPlayer.id,
      });

      if (error) {
        if (error.code === "23505") {
          toast.error("Cuộc trò chuyện với người chơi này đã tồn tại");
        } else {
          throw error;
        }
      } else {
        setShowNewConvModal(false);
        setSelectedPlayer(null);
        fetchConversations();
        toast.success("Tạo cuộc trò chuyện VIP thành công");
      }
    } catch (err) {
      console.error("Error creating conversation:", err);
      toast.error("Không thể tạo cuộc trò chuyện");
    }
  };

  // Get player name from conversations
  const getPlayerName = (playerId) => {
    const player = allPlayers.find((p) => p.id === playerId);
    return player?.full_name || player?.email || "Người chơi";
  };

  // Filter conversations
  const filteredConversations = useMemo(
    () =>
      conversations.filter((conv) =>
        getPlayerName(conv.player_id)
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      ),
    [conversations, searchQuery]
  );

  // Filter players in modal
  const filteredPlayers = useMemo(
    () =>
      allPlayers.filter(
        (p) =>
          (p.full_name?.toLowerCase() || "").includes(searchPlayers.toLowerCase()) ||
          (p.email?.toLowerCase() || "").includes(searchPlayers.toLowerCase())
      ),
    [allPlayers, searchPlayers]
  );

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-full text-amber-600">
        <AlertTriangle className="mr-2" /> Chỉ Super Admin có quyền truy cập
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin mr-2" /> Đang tải...
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50">
      {/* Conversation List */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg flex items-center">
              <MessageSquare className="w-5 h-5 mr-2" />
              VIP Chat
            </h2>
            <button
              onClick={() => setShowNewConvModal(true)}
              className="p-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <input
            type="text"
            placeholder="Tìm kiếm cuộc trò chuyện..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              Không có cuộc trò chuyện VIP nào
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => {
                  setSelectedConv(conv);
                  fetchMessages(conv.id);
                }}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-100 transition ${
                  selectedConv?.id === conv.id ? "bg-blue-50 border-l-4 border-l-blue-500" : ""
                }`}
              >
                <div className="font-medium text-sm text-gray-900">
                  {getPlayerName(conv.player_id)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Cập nhật: {new Date(conv.updated_at).toLocaleString("vi-VN")}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConv ? (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-4">
              <h3 className="font-bold text-gray-900">
                {getPlayerName(selectedConv.player_id)}
              </h3>
              <p className="text-xs text-gray-500">
                VIP Conversation
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.sender_id === currentAdmin?.id ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-xs px-4 py-2 rounded-lg ${
                      msg.sender_id === currentAdmin?.id
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-gray-900"
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                    <p
                      className={`text-xs mt-1 ${
                        msg.sender_id === currentAdmin?.id
                          ? "text-blue-100"
                          : "text-gray-500"
                      }`}
                    >
                      {new Date(msg.created_at).toLocaleTimeString("vi-VN")}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nhập tin nhắn..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={sending}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm disabled:bg-gray-50"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sending || !messageInput.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 transition flex items-center"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>Chọn một cuộc trò chuyện để bắt đầu</p>
            </div>
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
      {showNewConvModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Tạo cuộc trò chuyện VIP mới</h3>
              <button
                onClick={() => {
                  setShowNewConvModal(false);
                  setSelectedPlayer(null);
                  setSearchPlayers("");
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              type="text"
              placeholder="Tìm kiếm người chơi..."
              value={searchPlayers}
              onChange={(e) => setSearchPlayers(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded mb-4 text-sm"
            />

            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded mb-4">
              {filteredPlayers.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  Không tìm thấy người chơi
                </div>
              ) : (
                filteredPlayers.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => setSelectedPlayer(player)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition ${
                      selectedPlayer?.id === player.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="font-medium text-sm">{player.full_name}</div>
                    <div className="text-xs text-gray-500">{player.email}</div>
                  </button>
                ))
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowNewConvModal(false);
                  setSelectedPlayer(null);
                  setSearchPlayers("");
                }}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateConversation}
                disabled={!selectedPlayer}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 transition"
              >
                Tạo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
