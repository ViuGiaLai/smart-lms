'use client';

import React from 'react';
import { Bot, User } from 'lucide-react';
import StreamingText from './StreamingText';
import { ChatMessage as ChatMessageType } from '@/types';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const sources = message.metadata?.sources;

  return (
    <div className={`flex gap-3 my-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
          isUser
            ? 'bg-indigo-600 text-white'
            : 'bg-emerald-600 text-white shadow-emerald-200'
        }`}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
          isUser
            ? 'bg-indigo-600 text-white rounded-tr-none'
            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
        }`}
      >
        <StreamingText content={message.content} isStreaming={message.isStreaming} />

        {/* Trích dẫn nguồn tài liệu nếu có */}
        {!isUser && sources && sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1 text-xs text-slate-500">
            <span className="font-semibold text-slate-600">Nguồn bài giảng:</span>
            {sources.map((ref, idx) => (
              <span
                key={idx}
                className="bg-slate-100 px-2 py-0.5 rounded text-[11px] text-slate-600 border border-slate-200"
              >
                {ref}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
