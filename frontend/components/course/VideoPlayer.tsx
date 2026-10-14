'use client';

import React, { useRef } from 'react';
import { Play, ExternalLink, Video as VideoIcon } from 'lucide-react';

interface VideoPlayerProps {
  videoUrl?: string;
  title?: string;
  onProgress?: (progressPercent: number) => void;
  onEnded?: () => void;
}

/**
 * Trích xuất YouTube Video ID từ link bất kỳ
 */
export function getYouTubeVideoId(url?: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

export default function VideoPlayer({ videoUrl, title, onProgress, onEnded }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const youtubeId = getYouTubeVideoId(videoUrl);

  const handleTimeUpdate = () => {
    if (!videoRef.current || !onProgress) return;
    const { currentTime, duration } = videoRef.current;
    if (duration > 0) {
      const percent = Math.min(100, Math.round((currentTime / duration) * 100));
      onProgress(percent);
    }
  };

  return (
    <div className="relative w-full aspect-video bg-slate-950 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 group">
      {youtubeId ? (
        // Trường hợp 1: Video YouTube
        <div className="w-full h-full relative">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1&enablejsapi=1`}
            title={title || 'YouTube video player'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full border-0"
          />
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/70 hover:bg-black text-white text-xs font-medium backdrop-blur-sm shadow"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Mở trên YouTube
            </a>
          </div>
        </div>
      ) : videoUrl ? (
        // Trường hợp 2: Video HTML5 trực tiếp (MP4, WebM, ...)
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onEnded={onEnded}
        />
      ) : (
        // Trường hợp 3: Chưa có video bài giảng
        <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 space-y-3 p-6 text-center bg-gradient-to-b from-slate-900 to-slate-950">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-400 shadow-inner">
            <VideoIcon className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-300">Bài giảng đang được chuẩn bị hoặc dùng Slide</p>
            <p className="text-xs text-slate-500 mt-1">Giảng viên có thể dán liên kết video YouTube hoặc tải lên học liệu ở mục quản lý</p>
          </div>
        </div>
      )}
    </div>
  );
}
