'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Clock3 } from 'lucide-react';

interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
  /** Tin nhắn người dùng hiển thị nguyên văn; câu trả lời AI render markdown nhẹ. */
  renderMarkdown?: boolean;
  /** Bong bóng nền đậm (tin nhắn người dùng) cần chữ sáng. */
  inverted?: boolean;
  /**
   * Có callback thì mọi mốc [mm:ss–mm:ss] trong câu trả lời trở thành nút tua
   * video tới đúng thời điểm. Không có callback (nguồn thuộc bài học khác) thì
   * giữ nguyên văn bản để tránh nút bấm không tác dụng.
   */
  onTimestampSeek?: (seconds: number) => void;
}

// Mốc thời gian dạng mm:ss hoặc hh:mm:ss, có thể là một mốc hoặc một khoảng.
const CLOCK = String.raw`\d{1,3}:\d{2}(?::\d{2})?`;
const CITATION_RE = new RegExp(String.raw`\[\s*(${CLOCK})\s*(?:[–—−-]\s*(${CLOCK}))?\s*\]`, 'g');

/** Đổi "01:20" / "1:01:20" thành số giây. */
export function clockToSeconds(value: string): number | null {
  const parts = value.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/**
 * Biến trích dẫn [01:20–01:42] thành link markdown nội bộ `#seek=80`.
 * Chỉ thay khi đã đủ cặp ngoặc nên văn bản đang stream dở vẫn hiển thị bình thường.
 */
function linkifyCitations(content: string): string {
  return content.replace(CITATION_RE, (match, start: string, end?: string) => {
    const seconds = clockToSeconds(start);
    if (seconds === null) return match;
    const label = end ? `${start}–${end}` : start;
    return `[${label}](#seek=${seconds})`;
  });
}

export default function StreamingText({
  content,
  isStreaming,
  renderMarkdown = true,
  inverted = false,
  onTimestampSeek,
}: StreamingTextProps) {
  // Một số model chèn ngoặc full-width 【】 quanh mốc thời gian; chuẩn hóa để
  // trích dẫn hiển thị nhất quán dạng [00:12–00:38].
  const normalizedContent = content
    .replace(/【/g, '[')
    .replace(/】/g, ']')
    .replace(/\[\[/g, '[')
    .replace(/\]\]/g, ']');

  const preparedContent = onTimestampSeek
    ? linkifyCitations(normalizedContent)
    : normalizedContent;

  const cursor = isStreaming ? (
    <span
      className={`ml-1 inline-block h-4 w-2 animate-pulse rounded-sm align-middle ${
        inverted ? 'bg-primary-foreground' : 'bg-brand-600'
      }`}
    />
  ) : null;

  if (!renderMarkdown) {
    return (
      <div
        className={`whitespace-pre-wrap leading-relaxed ${
          inverted ? 'text-primary-foreground' : 'text-stone-800'
        }`}
      >
        {content}
        {cursor}
      </div>
    );
  }

  return (
    <div className="prose prose-sm max-w-none leading-relaxed text-stone-800 prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:font-serif prose-headings:text-stone-900 prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-strong:text-stone-900 prose-code:rounded prose-code:bg-stone-100 prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-stone-900 prose-pre:p-3 prose-pre:text-[12px] prose-pre:text-stone-100">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            // Link nội bộ do linkifyCitations tạo ra → tua video, không mở tab mới.
            if (href?.startsWith('#seek=')) {
              const seconds = Number(href.slice('#seek='.length));
              if (Number.isFinite(seconds) && onTimestampSeek) {
                return (
                  <button
                    type="button"
                    onClick={() => onTimestampSeek(seconds)}
                    title="Bấm để tua video tới đoạn giảng viên nhắc tới"
                    className="mx-0.5 inline-flex items-baseline gap-1 rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 align-baseline font-mono text-[0.78em] font-semibold text-brand-800 no-underline transition-colors hover:border-brand-400 hover:bg-brand-100"
                  >
                    <Clock3 className="h-3 w-3 self-center" aria-hidden />
                    {children}
                  </button>
                );
              }
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-700 underline underline-offset-2"
              >
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-stone-200 bg-stone-50 px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-stone-200 px-2 py-1 align-top">{children}</td>
          ),
        }}
      >
        {preparedContent}
      </ReactMarkdown>
      {cursor}
    </div>
  );
}
