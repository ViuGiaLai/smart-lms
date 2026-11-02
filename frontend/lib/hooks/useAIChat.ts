'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatMessage, ChatSourceRef } from '@/types';

interface UseAIChatOptions {
  courseId: string;
  lessonId?: string;
  sessionId?: string;
  tutorMode?: 'socratic' | 'direct' | 'practice';
}

interface UseAIChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  currentSessionId: string | null;
}

const MAX_SAVED_MESSAGES = 40;

/**
 * Phiên trò chuyện thuộc về đúng người dùng, khóa học và bài học. Không dùng
 * session id ngẫu nhiên để việc đóng/mở panel vẫn khôi phục được hội thoại.
 */
function getHistoryStorageKey(courseId: string, lessonId?: string): string | null {
  if (typeof window === 'undefined' || !lessonId) return null;
  try {
    const storedUser = window.localStorage.getItem('currentUser');
    const user = storedUser ? JSON.parse(storedUser) : null;
    const userScope = user?.id || user?.email;
    if (!userScope) return null;
    return `smart-lms:ai-tutor:${encodeURIComponent(String(userScope))}:${courseId}:${lessonId}`;
  } catch {
    return null;
  }
}

function readSavedMessages(storageKey: string | null): ChatMessage[] {
  if (!storageKey || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (message): message is ChatMessage =>
          message &&
          (message.role === 'user' || message.role === 'assistant') &&
          typeof message.content === 'string' &&
          typeof message.id === 'string',
      )
      .slice(-MAX_SAVED_MESSAGES)
      .map((message) => ({ ...message, isStreaming: false }));
  } catch {
    return [];
  }
}

/**
 * Đọc lỗi thật từ Response của backend thay vì luôn báo "AI Service chưa sẵn sàng".
 * Backend trả JSON `{detail}` cho lỗi 401/403/404/422, hoặc SSE `{error}` khi AI lỗi.
 */
async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `Trợ lý AI trả về lỗi ${response.status}. Vui lòng thử lại.`;
  try {
    const text = await response.text();
    if (!text.trim()) return fallback;
    try {
      const parsed = JSON.parse(text);
      const detail = parsed?.detail ?? parsed?.error ?? parsed?.message;
      if (typeof detail === 'string' && detail.trim()) return detail;
      if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
    } catch {
      return text.trim().slice(0, 300);
    }
  } catch {
    /* không đọc được body: dùng thông báo mặc định */
  }
  return fallback;
}

export function useAIChat({
  courseId,
  lessonId,
  tutorMode = 'socratic',
}: UseAIChatOptions): UseAIChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const storageKeyRef = useRef<string | null>(null);

  // Khôi phục sau hydration để không tạo khác biệt HTML giữa server và client.
  useEffect(() => {
    const storageKey = getHistoryStorageKey(courseId, lessonId);
    storageKeyRef.current = storageKey;
    setHistoryReady(false);
    setMessages(readSavedMessages(storageKey));
    setHistoryReady(true);
  }, [courseId, lessonId]);

  // Lưu tối đa 40 tin nhắn, chỉ sau khi AI hoàn thành. Không ghi token đang
  // stream hoặc một câu hỏi đơn lẻ chưa nhận được phản hồi.
  useEffect(() => {
    const storageKey = storageKeyRef.current;
    if (!historyReady || !storageKey || typeof window === 'undefined') return;

    const completed = messages.filter((message) => !message.isStreaming);
    const lastCompleted = completed[completed.length - 1];
    const finishedConversation =
      lastCompleted?.role === 'user' ? completed.slice(0, -1) : completed;

    try {
      if (finishedConversation.length === 0) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(finishedConversation.slice(-MAX_SAVED_MESSAGES)),
      );
    } catch {
      // Không làm gián đoạn việc học nếu trình duyệt chặn localStorage.
    }
  }, [historyReady, messages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    try {
      if (storageKeyRef.current && typeof window !== 'undefined') {
        window.localStorage.removeItem(storageKeyRef.current);
      }
    } catch {
      // Trạng thái trên màn hình vẫn được xóa kể cả khi storage bị chặn.
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      const numericLessonId = Number(lessonId);
      if (!content.trim() || isStreaming) return;
      if (!Number.isInteger(numericLessonId) || numericLessonId <= 0) {
        setError('Không xác định được bài học hiện tại. Vui lòng mở lại bài học rồi thử lại.');
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setError(null);

      // Lịch sử gần nhất giúp AI hiểu câu hỏi tiếp nối ("nó", "ví dụ đó"...).
      // Chỉ gửi nội dung hội thoại, không gửi metadata/nguồn.
      const history = messages
        .filter((message) => !message.isStreaming && message.content.trim())
        .slice(-6)
        .map((message) => ({
          role: message.role,
          content: message.content.slice(0, 1500),
        }));

      // 1. Thêm tin nhắn của User
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // 2. Tạo tin nhắn phản hồi đang streaming của Assistant
      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
        // Giữ ngữ cảnh để nguồn trích dẫn có thể mở lại đúng khóa/bài học.
        metadata: { courseId: String(courseId), lessonId: String(lessonId ?? '') },
      };
      setMessages((prev) => [...prev, assistantMessage]);

      try {
        setIsLoading(false);
        setIsStreaming(true);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
        const numericCourseId = Number(courseId);

        let accumulated = '';
        let responseHandled = false;
        let streamError: string | null = null;

        const appendText = (piece: string) => {
          accumulated += piece;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessageId ? { ...m, content: accumulated } : m)),
          );
        };

        const applySources = (rawSources: unknown) => {
          if (!Array.isArray(rawSources)) return;
          // Giữ nguyên object nguồn (filename, start_seconds…) để ChatMessage
          // dựng được liên kết xem lại đoạn video; chuỗi cũ vẫn được chấp nhận.
          const refs: Array<string | ChatSourceRef> = rawSources
            .filter((s) => s !== null && s !== undefined)
            .map((s) => (typeof s === 'string' ? s : (s as ChatSourceRef)));
          if (refs.length === 0) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, metadata: { ...(m.metadata || {}), sources: refs } }
                : m,
            ),
          );
        };

        /**
         * Xử lý MỘT dòng `data:` của SSE. Tách riêng khỏi vòng đọc để có thể
         * xử lý cả dòng cuối còn dở trong buffer.
         */
        const handleDataLine = (line: string) => {
          if (!line.startsWith('data:')) return;
          const dataStr = line.slice(5).trim();
          if (!dataStr) return;
          if (dataStr === '[DONE]') {
            responseHandled = true;
            return;
          }
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.done || parsed.type === 'done') {
              responseHandled = true;
              return;
            }
            if (parsed.type === 'error' || parsed.error) {
              streamError = String(parsed.error || 'Trợ lý AI gặp lỗi không xác định.');
              responseHandled = true;
              return;
            }
            if (parsed.type === 'sources') {
              applySources(Array.isArray(parsed.data) ? parsed.data : parsed.sources);
              return;
            }
            const textPiece =
              parsed.token || parsed.content || (parsed.type === 'chunk' ? parsed.content : null);
            if (textPiece) {
              appendText(String(textPiece));
              responseHandled = true;
              return;
            }
            // Backend cũ trả thẳng {answer: "..."} (không streaming)
            if (typeof parsed.answer === 'string' && parsed.answer) {
              appendText(parsed.answer);
              responseHandled = true;
            }
          } catch {
            // Không phải JSON: coi là văn bản thuần đã stream
            appendText(dataStr);
            responseHandled = true;
          }
        };

        const res = await fetch(`${apiUrl}/api/v1/ai-tutor/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            question: content.trim(),
            // Không gửi course_id nếu client không có mã khóa hợp lệ: backend sẽ
            // đối chiếu với khóa thật của bài học, tránh gán nhầm ngữ cảnh.
            ...(Number.isInteger(numericCourseId) && numericCourseId > 0
              ? { course_id: numericCourseId }
              : {}),
            lesson_id: numericLessonId,
            tutor_mode: tutorMode,
            ...(history.length > 0 ? { chat_history: history } : {}),
          }),
          signal: abortControllerRef.current?.signal,
        });

        if (!res.ok || !res.body) {
          streamError = await readErrorMessage(res);
        } else {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          // SSE frame có thể bị cắt ngang giữa hai lần đọc mạng → phải giữ
          // lại phần dòng dở, nếu không JSON sẽ vỡ và rơi vào nhánh văn bản thuần.
          let lineBuffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            lineBuffer += decoder.decode(value, { stream: true });
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() ?? '';
            for (const line of lines) {
              handleDataLine(line.trim());
            }
          }

          lineBuffer += decoder.decode();
          if (lineBuffer.trim()) {
            handleDataLine(lineBuffer.trim());
          }
        }

        if (streamError) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: accumulated.trim()
                      ? `${accumulated}\n\n⚠️ ${streamError}`
                      : `⚠️ ${streamError}`,
                  }
                : m,
            ),
          );
        } else if (!responseHandled) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId && !m.content
                ? { ...m, content: '⚠️ Trợ lý AI không trả về nội dung. Vui lòng thử lại.' }
                : m,
            ),
          );
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setError('Không thể kết nối đến Trợ lý AI. Vui lòng thử lại.');
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId && !m.content
                ? {
                    ...m,
                    content:
                      '⚠️ Không kết nối được tới Trợ lý AI. Kiểm tra backend (port 8000) và AI Service (port 8001).',
                  }
                : m,
            ),
          );
        }
      } finally {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
        );
        setIsStreaming(false);
        setIsLoading(false);
      }
    },
    [courseId, lessonId, tutorMode, isStreaming, messages],
  );

  return {
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    clearMessages,
    currentSessionId: null,
  };
}
