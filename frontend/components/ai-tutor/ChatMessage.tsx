'use client';

import React from 'react';
import Link from 'next/link';
import { Clock3, FileText, Play, User } from 'lucide-react';
import StreamingText from './StreamingText';
import { ChatMessage as ChatMessageType, ChatSourceRef } from '@/types';

interface ChatMessageProps {
  message: ChatMessageType;
  /** Tua video tới mốc trích dẫn khi đoạn trích thuộc bài học đang mở. */
  onSeek?: (seconds: number) => void;
  /** ID bài học đang mở trong trình phát. */
  currentLessonId?: string;
}

function asSource(value: string | ChatSourceRef): ChatSourceRef | null {
  return typeof value === 'string' ? null : value;
}

export default function ChatMessage({ message, onSeek, currentLessonId }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const sources = message.metadata?.sources ?? [];
  // Tin nhắn cũ có thể thuộc bài học khác bài đang mở; khi đó bấm mốc thời gian
  // phải điều hướng sang bài đó thay vì tua trình phát hiện tại.
  const messageLessonId = message.metadata?.lessonId ? String(message.metadata.lessonId) : '';
  const seekHere =
    onSeek && (!messageLessonId || !currentLessonId || messageLessonId === String(currentLessonId))
      ? onSeek
      : undefined;
  const sourceLessonTitle = sources
    .map((item) => asSource(item)?.lesson_title)
    .find((title): title is string => Boolean(title));

  return (
    <div className={`my-3 flex ${isUser ? 'flex-row-reverse gap-3' : 'flex-row'}`}>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <User className="h-4 w-4" />
        </div>
      )}

      <div
        className={`rounded-lg py-3 text-sm ${
          isUser
            ? 'max-w-[85%] rounded-tr-none bg-primary px-4 text-primary-foreground'
            : 'w-full max-w-none rounded-tl-none border border-border bg-card px-3 text-foreground sm:px-4'
        }`}
      >
        <StreamingText
          content={message.content}
          isStreaming={message.isStreaming}
          renderMarkdown={!isUser}
          inverted={isUser}
          onTimestampSeek={isUser ? undefined : seekHere}
        />

        {!isUser && sources.length > 0 && (
          <div className="mt-2.5 border-t border-border pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {sourceLessonTitle ? `Nguồn tham khảo · ${sources.length}` : `Nguồn trong bài giảng · ${sources.length}`}
            </p>
            <div className="scrollbar-slim mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
              {sources.map((item, idx) => {
                const source = asSource(item);
                if (!source) {
                  return (
                    <span
                      key={idx}
                      className="rounded border border-border bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {String(item)}
                    </span>
                  );
                }

                const label =
                  source.video_title ||
                  source.filename ||
                  source.document_id ||
                  `Đoạn ${source.chunk_index ?? idx + 1}`;
                const startSeconds =
                  typeof source.start_seconds === 'number' ? source.start_seconds : null;
                const timestamp = source.start_timestamp;
                const timeLabel =
                  timestamp && source.end_timestamp
                    ? `${timestamp}–${source.end_timestamp}`
                    : timestamp;
                const courseId = source.course_id ?? message.metadata?.courseId;
                const lessonId = source.lesson_id ?? message.metadata?.lessonId;
                const canReplay = Boolean(
                  timestamp && startSeconds !== null && courseId && lessonId,
                );
                const snippet =
                  typeof source.content === 'string'
                    ? source.content.replace(/\s+/g, ' ').trim()
                    : '';

                const content = (
                  <>
                    {timestamp ? (
                      <Play className="h-3 w-3 shrink-0" aria-hidden />
                    ) : source.page ? (
                      <FileText className="h-3 w-3 shrink-0" aria-hidden />
                    ) : null}
                    {timestamp ? (
                      <span className="inline-flex items-center gap-0.5 whitespace-nowrap font-medium text-brand-700">
                        <Clock3 className="h-3 w-3" aria-hidden />
                        Video · {timeLabel}
                      </span>
                    ) : source.page ? (
                      <span className="whitespace-nowrap text-muted-foreground">{label} · trang {source.page}</span>
                    ) : <span className="max-w-[150px] truncate" title={label}>{label}</span>}
                  </>
                );

                const className =
                  'inline-flex shrink-0 items-center gap-1.5 rounded border border-border bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground';
                const interactiveClass = `${className} transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800`;
                const title = snippet ? `${label}${snippet ? ` — ${snippet}` : ''}` : label;

                // Đoạn trích thuộc bài đang mở → tua ngay tại chỗ.
                if (seekHere && startSeconds !== null) {
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => seekHere(startSeconds)}
                      title={`${title} · bấm để tua video tới đoạn này`}
                      className={interactiveClass}
                    >
                      {content}
                    </button>
                  );
                }

                return canReplay ? (
                  <Link
                    key={idx}
                    href={`/courses/${courseId}/learn?lessonId=${lessonId}&t=${startSeconds}`}
                    title={`${title} · bấm để xem lại đoạn video`}
                    className={interactiveClass}
                  >
                    {content}
                  </Link>
                ) : (
                  <span key={idx} className={className} title={title}>
                    {content}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
