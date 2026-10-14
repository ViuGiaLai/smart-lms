'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, RefreshCw, AlertCircle, Bot, ShieldCheck, HelpCircle } from 'lucide-react';
import ChatMessage from './ChatMessage';
import { useAIChat } from '@/lib/hooks/useAIChat';

interface ChatBoxProps {
  lessonId: string;
  courseId?: string;
  lessonTitle?: string;
}

export default function ChatBox({ lessonId, courseId = '1', lessonTitle }: ChatBoxProps) {
  const [input, setInput] = useState('');
  const { messages, isStreaming, sendMessage, clearMessages } = useAIChat({
    courseId,
    lessonId,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    'Tóm tắt 3 ý chính của bài giảng này',
    'Giải thích rõ hơn khái niệm trong video',
    'Đoạn nào trong tài liệu quan trọng nhất?',
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleQuickPrompt = (prompt: string) => {
    if (isStreaming) return;
    sendMessage(prompt);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 border-l border-slate-200 font-sans">
      {/* ── Header ── */}
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-bold text-slate-900">Trợ lý Gia sư AI 24/7</h3>
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Online
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate max-w-[210px]" title={lessonTitle}>
              {lessonTitle ? `Ngữ cảnh: ${lessonTitle}` : 'Theo ngữ cảnh bài học'}
            </p>
          </div>
        </div>

        <button
          onClick={clearMessages}
          title="Xóa lịch sử trò chuyện"
          className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Anti-hallucination Badge ── */}
      <div className="px-3.5 py-1.5 bg-indigo-50/70 border-b border-indigo-100/60 flex items-center gap-1.5 text-[11px] text-indigo-700 font-medium">
        <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
        <span className="truncate">Chống ảo giác (RAG): Bám sát học liệu {lessonTitle ? `"${lessonTitle}"` : 'bài học'}</span>
      </div>

      {/* ── Messages Container ── */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-800">Xin chào! Mình là Gia sư ảo AI</p>
              <p className="text-[11px] text-slate-500 max-w-[240px] leading-relaxed">
                Mình đã đọc toàn bộ slide và transcript video của bài học này. Bạn có câu hỏi nào cần giải đáp không?
              </p>
            </div>

            {/* Quick Prompts */}
            <div className="w-full space-y-1.5 pt-2">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider text-left">
                Gợi ý câu hỏi nhanh:
              </p>
              {quickPrompts.map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickPrompt(qp)}
                  className="w-full text-left text-xs bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-slate-200 text-slate-700 px-3 py-2 rounded-xl transition shadow-xs flex items-center gap-2 group"
                >
                  <Sparkles className="w-3 h-3 text-indigo-500 group-hover:scale-110 transition-transform" />
                  <span className="truncate">{qp}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Form ── */}
      <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-slate-200 shrink-0">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Hỏi về nội dung slide hoặc video..."
            disabled={isStreaming}
            className="w-full bg-slate-100 text-slate-800 text-xs rounded-xl pl-3.5 pr-11 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className={`absolute right-1.5 p-1.5 rounded-lg transition ${
              input.trim() && !isStreaming
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                : 'text-slate-300 cursor-not-allowed'
            }`}
            title="Gửi câu hỏi"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 text-center">
          Smart LMS AI • Tự động trích dẫn nội dung bài giảng
        </p>
      </form>
    </div>
  );
}
