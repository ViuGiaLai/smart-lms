'use client';

import { useState, useCallback, useRef } from 'react';
import { ChatMessage } from '@/types';

interface UseAIChatOptions {
  courseId: string;
  lessonId?: string;
  sessionId?: string;
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

export function useAIChat({
  courseId,
  lessonId,
}: UseAIChatOptions): UseAIChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
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
      };
      setMessages((prev) => [...prev, assistantMessage]);

      try {
        setIsLoading(false);
        setIsStreaming(true);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

        let responseHandled = false;

        // Thử gọi API Backend thật nếu có kết nối
        try {
          const res = await fetch(`${apiUrl}/api/v1/ai-tutor/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              question: content.trim(),
              course_id: parseInt(courseId, 10) || 1,
              lesson_id: numericLessonId,
            }),
            signal: abortControllerRef.current?.signal,
          });

          if (res.ok && res.body) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';
            // Lỗi thật do AI Service báo về (ví dụ hết quota Gemini, thiếu API key)
            let streamError: string | null = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const dataStr = line.replace('data: ', '').trim();
                  if (dataStr === '[DONE]' || dataStr === '{"done": true}') {
                    responseHandled = true;
                    break;
                  }
                  try {
                    const parsed = JSON.parse(dataStr);
                    if (parsed.done || parsed.type === 'done') {
                      responseHandled = true;
                      break;
                    }
                    if (parsed.type === 'error' || parsed.error) {
                      // Hiển thị đúng lý do lỗi thật thay vì thông báo chung chung
                      streamError = String(parsed.error || 'Trợ lý AI gặp lỗi không xác định.');
                      responseHandled = true;
                      break;
                    }
                    if (parsed.type === 'sources') {
                      // AI service stream sự kiện nguồn trích dẫn: {type:"sources", data:[{content, similarity}]}
                      // Trước đây hook bỏ qua sự kiện này nên khối "Nguồn bài giảng" không bao giờ hiện.
                      const rawSources = Array.isArray(parsed.data)
                        ? parsed.data
                        : Array.isArray(parsed.sources)
                          ? parsed.sources
                          : [];
                      const refs: string[] = rawSources.map((s: any, i: number) => {
                        if (typeof s === 'string') return s;
                        const sim =
                          typeof s?.similarity === 'number' ? ` · liên quan ${s.similarity.toFixed(2)}` : '';
                        const snippet =
                          typeof s?.content === 'string' ? s.content.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
                        return snippet ? `Đoạn ${i + 1}${sim}: ${snippet}…` : `Đoạn ${i + 1}${sim}`;
                      });
                      if (refs.length > 0) {
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === assistantMessageId
                              ? { ...m, metadata: { ...(m.metadata || {}), sources: refs } }
                              : m
                          )
                        );
                      }
                      responseHandled = true;
                    }
                    const textPiece = parsed.token || parsed.content || (parsed.type === 'chunk' ? parsed.content : null);
                    if (textPiece) {
                      accumulated += textPiece;
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === assistantMessageId ? { ...m, content: accumulated } : m
                        )
                      );
                      responseHandled = true;
                    }
                  } catch {
                    // Nếu là raw text
                    if (dataStr) {
                      accumulated += dataStr;
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === assistantMessageId ? { ...m, content: accumulated } : m
                        )
                      );
                      responseHandled = true;
                    }
                  }
                }
              }
            }

            if (streamError && !accumulated.trim()) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId ? { ...m, content: `⚠️ ${streamError}` } : m
                )
              );
            }
          }
        } catch (apiErr) {
          // Bắt lỗi nếu Backend hoặc AI service chưa sẵn sàng
          console.info('Kích hoạt RAG streaming engine dự phòng:', apiErr);
        }

        // 3. Nếu API chưa trả kết quả do AI-service chưa sẵn sàng
        if (!responseHandled) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content:
                      '⚠️ Không thể kết nối với dịch vụ Trí tuệ Nhân tạo (AI Tutor). Vui lòng kiểm tra lại AI Service (port 8001) hoặc thử lại sau.',
                  }
                : m
            )
          );
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError('Không thể kết nối đến Trợ lý AI. Vui lòng thử lại.');
        }
      } finally {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m))
        );
        setIsStreaming(false);
        setIsLoading(false);
      }
    },
    [courseId, lessonId, isStreaming]
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
