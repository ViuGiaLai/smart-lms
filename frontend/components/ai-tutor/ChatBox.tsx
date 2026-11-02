'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, RefreshCw, AlertCircle, Bot, ShieldCheck, HelpCircle, Lightbulb, BookOpen, PenTool } from 'lucide-react';
import ChatMessage from './ChatMessage';
import { useAIChat } from '@/lib/hooks/useAIChat';
import { TutorMode } from '@/types';

interface ChatBoxProps {
  lessonId: string;
  courseId?: string;
  lessonTitle?: string;
  initialPrompt?: string;
  /** Tua trình phát tới mốc trích dẫn khi người học bấm timestamp trong câu trả lời. */
  onSeek?: (seconds: number) => void;
}

export default function ChatBox({
  lessonId,
  courseId = '1',
  lessonTitle,
  initialPrompt,
  onSeek,
}: ChatBoxProps) {
  const [input, setInput] = useState('');
  const [tutorMode, setTutorMode] = useState<TutorMode>('socratic');

  const { messages, isStreaming, sendMessage, clearMessages } = useAIChat({
    courseId,
    lessonId,
    tutorMode,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoPromptSentRef = useRef(false);

  useEffect(() => {
    const prompt = initialPrompt?.trim();
    if (!prompt || autoPromptSentRef.current) return;
    autoPromptSentRef.current = true;
    sendMessage(prompt);
  }, [initialPrompt, sendMessage]);

  const quickPromptsByMode: Record<TutorMode, string[]> = {
    socratic: [
      'Gợi ý cho mình hướng giải hoặc suy nghĩ bài này',
      'Mình hiểu thế này có đúng bản chất không?',
      'Tại sao bước này lại thực hiện phép biến đổi như vậy?',
      'Hãy chỉ ra chỗ sai trong cách tư duy của mình',
    ],
    direct: [
      'Tóm tắt 3 ý chính trọng tâm của bài giảng này',
      'Giải thích từng bước công thức và ví dụ minh họa',
      'Cho mình một ví dụ thực tế liên hệ đời sống',
      'Lỗi phổ biến nhất mà học viên hay gặp ở phần này là gì?',
    ],
    practice: [
      'Cho mình một bài tập tương tự kèm gợi ý từng bước',
      'Đố mình 1 câu hỏi kiểm tra nhanh mức độ hiểu bài',
      'Cho mình một tình huống thực hành áp dụng kiến thức',
    ],
  };

  // Sau mỗi lượt trả lời, học viên luôn có đường đi tiếp theo thay vì phải
  // tự nghĩ một câu hỏi mới. Các câu này vẫn đi qua RAG của chính bài học.
  const followUpPromptsByMode: Record<TutorMode, string[]> = {
    socratic: [
      'Hãy cho mình một gợi ý tiếp theo, chưa cần đáp án.',
      'Bạn hãy kiểm tra cách mình hiểu phần này bằng một câu hỏi ngắn.',
      'Mình nên xem lại khái niệm nào trước khi làm tiếp?',
    ],
    direct: [
      'Tóm tắt phần vừa giải thích thành 3 ý dễ nhớ.',
      'Cho mình một ví dụ khác đơn giản hơn từ bài học.',
      'Điểm nào trong phần này dễ nhầm nhất?',
    ],
    practice: [
      'Cho mình một bài tập tương tự với độ khó vừa phải.',
      'Hỏi mình một câu kiểm tra nhanh về phần này.',
      'Gợi ý bước đầu tiên để mình tự làm bài tiếp theo.',
    ],
  };

  const latestCompletedAssistantMessageId = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === 'assistant' &&
        !message.isStreaming &&
        Boolean(message.content.trim()) &&
        !message.content.trim().startsWith('⚠️'),
    )?.id;

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
    <div className="flex flex-col h-full bg-stone-50 border-l border-stone-200 font-sans">
      {/* ── Header ── */}
      <div className="px-4 py-2.5 bg-white border-b border-stone-200 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-white">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-bold text-stone-900">Gia sư AI 24/7</h3>
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Online
              </span>
            </div>
            <p className="text-[10px] text-stone-500 truncate max-w-[200px]" title={lessonTitle}>
              {lessonTitle ? `Bài: ${lessonTitle}` : 'Theo ngữ cảnh học liệu'}
            </p>
          </div>
        </div>

        <button
          onClick={clearMessages}
          title="Xóa lịch sử trò chuyện"
          className="text-stone-400 hover:text-stone-600 hover:bg-stone-100 p-1.5 rounded-lg transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Tutor Mode Selector (Socratic vs Direct vs Practice) ── */}
      <div className="px-3 py-1.5 bg-stone-100 border-b border-stone-200 flex items-center justify-between text-[11px]">
        <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">Chế độ:</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTutorMode('socratic')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition flex items-center gap-1 ${
              tutorMode === 'socratic'
                ? 'bg-brand-600 text-white shadow-xs'
                : 'bg-white text-stone-600 hover:bg-stone-200'
            }`}
            title="Dạy theo tư duy: Gợi ý từng bước, hỏi ngược để học viên tự ngộ ra"
          >
            <Lightbulb className="w-3 h-3" /> Gợi mở (Socratic)
          </button>
          <button
            type="button"
            onClick={() => setTutorMode('direct')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition flex items-center gap-1 ${
              tutorMode === 'direct'
                ? 'bg-brand-600 text-white shadow-xs'
                : 'bg-white text-stone-600 hover:bg-stone-200'
            }`}
            title="Giải thích trực tiếp toàn diện"
          >
            <BookOpen className="w-3 h-3" /> Trực tiếp
          </button>
          <button
            type="button"
            onClick={() => setTutorMode('practice')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition flex items-center gap-1 ${
              tutorMode === 'practice'
                ? 'bg-brand-600 text-white shadow-xs'
                : 'bg-white text-stone-600 hover:bg-stone-200'
            }`}
            title="Luyện tập & bài tập tương tự"
          >
            <PenTool className="w-3 h-3" /> Luyện tập
          </button>
        </div>
      </div>

      {/* ── Anti-hallucination Badge ── */}
      <div className="px-3.5 py-1.5 bg-brand-50/70 border-b border-brand-100/60 flex items-center gap-1.5 text-[11px] text-brand-700 font-medium">
        <ShieldCheck className="w-3.5 h-3.5 text-brand-600 shrink-0" />
        <span className="truncate">
          {tutorMode === 'socratic'
            ? 'Triết lý Socratic: Dạy theo tư duy · Không giải hộ'
            : 'Bám sát học liệu bài học · Trích dẫn mốc thời gian'}
        </span>
      </div>

      {/* ── Messages Container ── */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-stone-400 space-y-3">
            <div className="w-11 h-11 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-stone-800">
                {tutorMode === 'socratic' ? 'Gia sư Gợi mở Tư duy' : 'Gia sư Trực tiếp'}
              </p>
              <p className="text-[11px] text-stone-500 max-w-[260px] leading-relaxed">
                {tutorMode === 'socratic'
                  ? 'Mình sẽ không giải hộ ngay mà đồng hành cùng bạn tìm ra gốc rễ vấn đề, gợi ý từng bước cho đến khi bạn tự giải được.'
                  : 'Mình giải thích chi tiết dựa trên video, slide bài học và trích dẫn mốc thời gian chính xác.'}
              </p>
            </div>

            {/* Quick Prompts tailored to active mode */}
            <div className="w-full space-y-1.5 pt-2">
              <p className="text-[10px] uppercase font-bold text-stone-400 tracking-wider text-left">
                Gợi ý câu hỏi:
              </p>
              {quickPromptsByMode[tutorMode].map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickPrompt(qp)}
                  className="w-full text-left text-xs bg-white hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 border border-stone-200 text-stone-700 px-3 py-2 rounded-lg transition shadow-xs flex items-center gap-2 group"
                >
                  <Sparkles className="w-3 h-3 text-brand-500 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="truncate">{qp}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <React.Fragment key={msg.id}>
              <ChatMessage
                message={msg}
                onSeek={onSeek}
                currentLessonId={lessonId}
              />
              {msg.id === latestCompletedAssistantMessageId && !isStreaming && (
                <div className="ml-11 mr-2 mb-4 rounded-lg border border-brand-100 bg-brand-50/50 p-2.5">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-700">
                    Bạn có thể hỏi tiếp
                  </p>
                  <div className="space-y-1.5">
                    {followUpPromptsByMode[tutorMode].map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleQuickPrompt(prompt)}
                        className="flex w-full items-start gap-1.5 rounded-md border border-brand-100 bg-card px-2.5 py-2 text-left text-[11px] leading-snug text-foreground transition hover:border-brand-300 hover:bg-brand-50"
                      >
                        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-brand-600" />
                        <span>{prompt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </React.Fragment>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Form ── */}
      <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-stone-200 shrink-0">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              tutorMode === 'socratic'
                ? 'Nhập câu hỏi hoặc bài tập bạn muốn được gợi mở...'
                : 'Hỏi về nội dung slide hoặc video bài giảng...'
            }
            disabled={isStreaming}
            className="w-full bg-stone-100 text-stone-800 text-xs rounded-lg pl-3.5 pr-11 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className={`absolute right-1.5 p-1.5 rounded-lg transition ${
              input.trim() && !isStreaming
                ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm'
                : 'text-stone-300 cursor-not-allowed'
            }`}
            title="Gửi câu hỏi"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-stone-400 mt-1.5 text-center">
          Bấm mốc thời gian ở nguồn để xem lại đúng đoạn video
        </p>
      </form>
    </div>
  );
}
