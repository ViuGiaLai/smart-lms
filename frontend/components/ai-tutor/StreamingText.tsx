'use client';

import React from 'react';

interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
}

export default function StreamingText({ content, isStreaming }: StreamingTextProps) {
  return (
    <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed whitespace-pre-wrap">
      {content}
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-1 bg-indigo-600 animate-pulse rounded-sm align-middle" />
      )}
    </div>
  );
}
