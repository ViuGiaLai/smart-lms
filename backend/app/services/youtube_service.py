"""YouTube Data API v3: phân tích URL và lấy metadata video/playlist/kênh.

Chỉ dùng API chính thức để lấy metadata. Không tải video, không tải phụ đề
(phụ đề do giảng viên cung cấp hoặc công cụ hỗ trợ riêng).
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

from app.core.cache import cache_get_json, cache_set_json
from app.core.config import settings

logger = logging.getLogger(__name__)

API_ROOT = "https://www.googleapis.com/youtube/v3"
ANALYZE_CACHE_TTL = 600  # 10 phút

_ALLOWED_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
    "youtu.be",
}
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_PLAYLIST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{10,80}$")
_CHANNEL_ID_RE = re.compile(r"^UC[A-Za-z0-9_-]{20,30}$")
_HANDLE_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,80}$")
_ISO_DURATION_RE = re.compile(
    r"^P(?:(?P<days>\d+)D)?T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?$"
)


class YouTubeError(Exception):
    """Lỗi có mã để API trả về thông báo thân thiện, không lộ chi tiết nội bộ."""

    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def is_enabled() -> bool:
    return bool(settings.YOUTUBE_IMPORT_ENABLED and settings.YOUTUBE_API_KEY)


def _require_config() -> None:
    if not settings.YOUTUBE_IMPORT_ENABLED:
        raise YouTubeError(
            "disabled",
            "Chức năng nhập học liệu YouTube đang tắt trên máy chủ.",
            503,
        )
    if not settings.YOUTUBE_API_KEY:
        raise YouTubeError(
            "missing_key",
            "Máy chủ chưa cấu hình YOUTUBE_API_KEY.",
            503,
        )


def parse_youtube_url(raw_url: str) -> dict[str, str]:
    """Nhận diện loại URL và trả về {type, id} — không gọi mạng.

    Chỉ chấp nhận hostname YouTube để tránh SSRF; mọi request sau đó đều dựng
    từ ID đã validate, không dùng URL của người dùng.
    """
    value = (raw_url or "").strip()
    if not value:
        raise YouTubeError("invalid_url", "Vui lòng nhập liên kết YouTube.")
    if len(value) > 2048:
        raise YouTubeError("invalid_url", "Liên kết quá dài.")
    if not re.match(r"^https?://", value, re.IGNORECASE):
        value = "https://" + value

    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_HOSTS:
        raise YouTubeError(
            "unsupported_host",
            "Chỉ hỗ trợ liên kết thuộc youtube.com hoặc youtu.be.",
        )
    if parsed.scheme not in ("http", "https"):
        raise YouTubeError("invalid_url", "Liên kết không hợp lệ.")

    path = parsed.path or "/"
    query = parse_qs(parsed.query)
    video_id = (query.get("v") or [""])[0].strip()

    if host == "youtu.be":
        candidate = path.strip("/").split("/")[0]
        if _VIDEO_ID_RE.match(candidate):
            return {"type": "video", "id": candidate}

    for prefix in ("/shorts/", "/embed/", "/live/", "/v/"):
        if path.startswith(prefix):
            candidate = path[len(prefix) :].split("/")[0]
            if _VIDEO_ID_RE.match(candidate):
                return {"type": "video", "id": candidate}

    if path.startswith("/watch") and _VIDEO_ID_RE.match(video_id or ""):
        return {"type": "video", "id": video_id}

    playlist_id = (query.get("list") or [""])[0].strip()
    if (path.rstrip("/") == "/playlist" or path.startswith("/playlist")) and playlist_id:
        if _PLAYLIST_ID_RE.match(playlist_id):
            return {"type": "playlist", "id": playlist_id}
        raise YouTubeError("invalid_id", "ID playlist không hợp lệ.")

    if path.startswith("/channel/"):
        channel_id = path[len("/channel/") :].split("/")[0]
        if _CHANNEL_ID_RE.match(channel_id):
            return {"type": "channel", "id": channel_id}
        raise YouTubeError("invalid_id", "ID kênh YouTube không hợp lệ.")

    if path.startswith("/@"):
        handle = path[2:].split("/")[0]
        if _HANDLE_RE.match(handle):
            return {"type": "channel_handle", "id": f"@{handle}"}

    if path.startswith("/c/") or path.startswith("/user/"):
        name = path.split("/", 2)[2].split("/")[0]
        if _HANDLE_RE.match(name):
            return {"type": "channel_custom", "id": name}

    if playlist_id and _PLAYLIST_ID_RE.match(playlist_id):
        return {"type": "playlist", "id": playlist_id}

    raise YouTubeError(
        "unrecognized_url",
        "Không nhận diện được liên kết. Hỗ trợ video, playlist hoặc kênh YouTube.",
    )


def _parse_duration(value: str | None) -> int:
    if not value:
        return 0
    match = _ISO_DURATION_RE.match(value)
    if not match:
        return 0
    parts = {key: int(val or 0) for key, val in match.groupdict().items()}
    return (
        parts["days"] * 86400
        + parts["hours"] * 3600
        + parts["minutes"] * 60
        + parts["seconds"]
    )


def _best_thumbnail(thumbnails: dict[str, Any] | None) -> str:
    if not thumbnails:
        return ""
    for key in ("maxres", "standard", "high", "medium", "default"):
        item = thumbnails.get(key) or {}
        url = item.get("url")
        if url:
            return url
    return ""


def _video_from_api(item: dict[str, Any]) -> dict[str, Any]:
    snippet = item.get("snippet") or {}
    content = item.get("contentDetails") or {}
    status = item.get("status") or {}
    video_id = item.get("id") or snippet.get("resourceId", {}).get("videoId") or ""
    title = snippet.get("title") or ""
    privacy = status.get("privacyStatus")
    unavailable_reason = ""
    if title in ("Deleted video", "Private video"):
        unavailable_reason = "Video đã bị xóa hoặc ở chế độ riêng tư."
    elif status.get("uploadStatus") not in (None, "processed"):
        unavailable_reason = "Video chưa xử lý xong hoặc không khả dụng."
    elif privacy == "private":
        unavailable_reason = "Video ở chế độ riêng tư."

    return {
        "videoId": video_id,
        "title": title,
        "description": (snippet.get("description") or "")[:2000],
        "thumbnail": _best_thumbnail(snippet.get("thumbnails")),
        "durationSeconds": _parse_duration(content.get("duration")),
        "channelTitle": snippet.get("channelTitle") or "",
        "publishedAt": snippet.get("publishedAt"),
        "url": f"https://www.youtube.com/watch?v={video_id}" if video_id else "",
        "available": not unavailable_reason,
        "unavailableReason": unavailable_reason,
    }


async def _api_get(
    client: httpx.AsyncClient,
    path: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    request_params = {**params, "key": settings.YOUTUBE_API_KEY}
    try:
        response = await client.get(f"{API_ROOT}/{path}", params=request_params)
    except httpx.RequestError as exc:
        raise YouTubeError(
            "network",
            "Không kết nối được YouTube Data API. Vui lòng thử lại.",
            502,
        ) from exc

    if response.status_code < 400:
        try:
            return response.json()
        except ValueError as exc:
            raise YouTubeError("bad_response", "YouTube trả về dữ liệu không hợp lệ.", 502) from exc

    reason = ""
    message = ""
    try:
        error = response.json().get("error") or {}
        message = error.get("message") or ""
        errors = error.get("errors") or []
        if errors:
            reason = errors[0].get("reason") or ""
    except ValueError:
        pass

    # Không log URL (chứa key) hay nội dung thô của Google.
    logger.warning(
        "YouTube API lỗi path=%s status=%s reason=%s", path, response.status_code, reason
    )

    if reason in ("quotaExceeded", "dailyLimitExceeded"):
        raise YouTubeError(
            "quota_exceeded",
            "Đã hết hạn mức YouTube Data API hôm nay. Vui lòng thử lại sau hoặc dùng khóa khác.",
            429,
        )
    if reason in ("keyInvalid", "badRequest") and "API key" in message:
        raise YouTubeError("invalid_key", "YOUTUBE_API_KEY không hợp lệ.", 503)
    if response.status_code == 404:
        raise YouTubeError("not_found", "Không tìm thấy nội dung YouTube.", 404)
    if response.status_code == 403:
        raise YouTubeError(
            "forbidden",
            "YouTube từ chối yêu cầu (kiểm tra quyền hoặc hạn mức API).",
            403,
        )
    raise YouTubeError("api_error", "YouTube Data API trả về lỗi. Vui lòng thử lại.", 502)


async def fetch_video_details(
    client: httpx.AsyncClient, video_ids: list[str]
) -> dict[str, dict[str, Any]]:
    """Lấy metadata theo lô 50 video/lần, trả về map videoId → metadata."""
    unique_ids = [vid for vid in dict.fromkeys(video_ids) if _VIDEO_ID_RE.match(vid)]
    result: dict[str, dict[str, Any]] = {}
    for index in range(0, len(unique_ids), 50):
        batch = unique_ids[index : index + 50]
        payload = await _api_get(
            client,
            "videos",
            {
                "part": "snippet,contentDetails,status",
                "id": ",".join(batch),
                "maxResults": 50,
            },
        )
        for item in payload.get("items") or []:
            data = _video_from_api(item)
            if data["videoId"]:
                result[data["videoId"]] = data
    return result


async def _playlist_details(
    client: httpx.AsyncClient, playlist_id: str
) -> dict[str, Any] | None:
    payload = await _api_get(
        client,
        "playlists",
        {"part": "snippet", "id": playlist_id, "maxResults": 1},
    )
    items = payload.get("items") or []
    if not items:
        return None
    snippet = items[0].get("snippet") or {}
    return {
        "title": snippet.get("title") or "Playlist YouTube",
        "channelTitle": snippet.get("channelTitle") or "",
    }


async def _collect_playlist_video_ids(
    client: httpx.AsyncClient, playlist_id: str, limit: int
) -> tuple[list[dict[str, str]], list[dict[str, str]], bool]:
    """Trả về (video đã có ID, video lỗi/không khả dụng, bị cắt bớt?)."""
    entries: list[dict[str, str]] = []
    skipped: list[dict[str, str]] = []
    page_token: str | None = None
    truncated = False

    while True:
        params: dict[str, Any] = {
            "part": "snippet,contentDetails",
            "playlistId": playlist_id,
            "maxResults": 50,
        }
        if page_token:
            params["pageToken"] = page_token
        payload = await _api_get(client, "playlistItems", params)

        for item in payload.get("items") or []:
            snippet = item.get("snippet") or {}
            video_id = (item.get("contentDetails") or {}).get("videoId") or (
                snippet.get("resourceId") or {}
            ).get("videoId")
            title = snippet.get("title") or ""
            if not video_id or not _VIDEO_ID_RE.match(video_id):
                skipped.append({"videoId": "", "title": title, "reason": "Không đọc được video ID."})
                continue
            if title in ("Deleted video", "Private video"):
                skipped.append({"videoId": video_id, "title": title, "reason": "Video riêng tư hoặc đã bị xóa."})
                continue
            entries.append({"videoId": video_id, "title": title})
            if len(entries) >= limit:
                truncated = True
                break

        if truncated:
            break
        page_token = payload.get("nextPageToken")
        if not page_token:
            break

    return entries, skipped, truncated


async def _resolve_channel(
    client: httpx.AsyncClient, source_type: str, source_id: str
) -> dict[str, Any]:
    if source_type == "channel":
        payload = await _api_get(
            client,
            "channels",
            {"part": "snippet,contentDetails", "id": source_id, "maxResults": 1},
        )
    elif source_type == "channel_handle":
        payload = await _api_get(
            client,
            "channels",
            {"part": "snippet,contentDetails", "forHandle": source_id, "maxResults": 1},
        )
    elif source_type == "channel_custom":
        # /c/<tên> không có endpoint tra trực tiếp; dùng search rồi lấy channel đầu tiên.
        search = await _api_get(
            client,
            "search",
            {"part": "snippet", "type": "channel", "q": source_id, "maxResults": 1},
        )
        items = search.get("items") or []
        channel_id = ((items[0].get("id") or {}).get("channelId")) if items else None
        if not channel_id:
            raise YouTubeError("channel_not_found", "Không tìm thấy kênh YouTube.", 404)
        payload = await _api_get(
            client,
            "channels",
            {"part": "snippet,contentDetails", "id": channel_id, "maxResults": 1},
        )
    else:
        raise YouTubeError("invalid_source", "Loại nguồn không hợp lệ.")

    items = payload.get("items") or []
    if not items:
        raise YouTubeError("channel_not_found", "Không tìm thấy kênh YouTube.", 404)
    item = items[0]
    uploads = ((item.get("contentDetails") or {}).get("relatedPlaylists") or {}).get("uploads")
    if not uploads:
        raise YouTubeError("channel_not_found", "Kênh không có playlist video tải lên.", 404)
    snippet = item.get("snippet") or {}
    return {
        "channelId": item.get("id"),
        "title": snippet.get("title") or "Kênh YouTube",
        "channelTitle": snippet.get("title") or "",
        "uploadsPlaylistId": uploads,
    }


async def analyze_source(raw_url: str) -> dict[str, Any]:
    """Phân tích URL YouTube và trả về danh sách video kèm metadata."""
    _require_config()
    source = parse_youtube_url(raw_url)
    limit = max(1, min(int(settings.YOUTUBE_MAX_ITEMS or 200), 500))

    cache_key = f"yt:analyze:{source['type']}:{source['id']}:{limit}"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        return {**cached, "cached": True}

    async with httpx.AsyncClient(timeout=20) as client:
        source_type = source["type"]
        source_id = source["id"]

        if source_type == "video":
            details = await fetch_video_details(client, [source_id])
            video = details.get(source_id)
            if not video:
                raise YouTubeError(
                    "video_not_found",
                    "Không tìm thấy video hoặc video không công khai.",
                    404,
                )
            payload = {
                "sourceType": "video",
                "sourceId": source_id,
                "title": video["title"],
                "channelTitle": video["channelTitle"],
                "videos": [video],
                "skipped": [],
                "total": 1,
                "truncated": False,
            }
        elif source_type == "playlist":
            meta = await _playlist_details(client, source_id)
            if meta is None:
                raise YouTubeError("playlist_not_found", "Không tìm thấy playlist.", 404)
            entries, skipped, truncated = await _collect_playlist_video_ids(
                client, source_id, limit
            )
            details = await fetch_video_details(client, [e["videoId"] for e in entries])
            videos: list[dict[str, Any]] = []
            for entry in entries:
                video = details.get(entry["videoId"])
                if video is None:
                    skipped.append(
                        {
                            "videoId": entry["videoId"],
                            "title": entry["title"],
                            "reason": "Video không công khai hoặc đã bị xóa.",
                        }
                    )
                    continue
                if not video["available"]:
                    skipped.append(
                        {
                            "videoId": video["videoId"],
                            "title": video["title"],
                            "reason": video["unavailableReason"],
                        }
                    )
                    continue
                videos.append(video)
            payload = {
                "sourceType": "playlist",
                "sourceId": source_id,
                "title": meta["title"],
                "channelTitle": meta["channelTitle"],
                "videos": videos,
                "skipped": skipped,
                "total": len(videos) + len(skipped),
                "truncated": truncated,
            }
        else:
            channel = await _resolve_channel(client, source_type, source_id)
            entries, skipped, truncated = await _collect_playlist_video_ids(
                client, channel["uploadsPlaylistId"], limit
            )
            details = await fetch_video_details(client, [e["videoId"] for e in entries])
            videos = []
            for entry in entries:
                video = details.get(entry["videoId"])
                if video is None:
                    skipped.append(
                        {
                            "videoId": entry["videoId"],
                            "title": entry["title"],
                            "reason": "Video không công khai hoặc đã bị xóa.",
                        }
                    )
                    continue
                if not video["available"]:
                    skipped.append(
                        {
                            "videoId": video["videoId"],
                            "title": video["title"],
                            "reason": video["unavailableReason"],
                        }
                    )
                    continue
                videos.append(video)
            payload = {
                "sourceType": "channel",
                "sourceId": channel["channelId"],
                "title": channel["title"],
                "channelTitle": channel["channelTitle"],
                "videos": videos,
                "skipped": skipped,
                "total": len(videos) + len(skipped),
                "truncated": truncated,
            }

    await cache_set_json(cache_key, payload, ttl=ANALYZE_CACHE_TTL)
    return {**payload, "cached": False}


async def fetch_single_video(video_id: str) -> dict[str, Any]:
    """Lấy metadata một video (dùng khi import để không tin dữ liệu client gửi)."""
    _require_config()
    if not _VIDEO_ID_RE.match(video_id or ""):
        raise YouTubeError("invalid_id", "Video ID không hợp lệ.")
    async with httpx.AsyncClient(timeout=20) as client:
        details = await fetch_video_details(client, [video_id])
    video = details.get(video_id)
    if video is None:
        raise YouTubeError("video_not_found", "Không tìm thấy video hoặc video không công khai.", 404)
    if not video["available"]:
        raise YouTubeError("video_unavailable", video["unavailableReason"], 422)
    return video
