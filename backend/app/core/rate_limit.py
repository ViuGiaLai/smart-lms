import time
from collections import deque
from typing import Callable

from fastapi import HTTPException, Request, status

from app.core.config import settings


class SlidingWindowRateLimiter:
    """Gioi han so request theo IP trong cua so truot, luu trong bo nho tien trinh.

    Dung cho cac endpoint nhay cam (dang nhap, dang ky, refresh token) de chan
    brute-force. Moi worker/instance dem rieng, nen gioi han thuc te = limit x so
    worker; khi can chinh xac tuyet doi hay chuyen sang Redis.
    """

    def __init__(self, limit_getter: Callable[[], int], window_seconds: int = 60) -> None:
        self._limit_getter = limit_getter
        self._window = window_seconds
        self._hits: dict[str, deque[float]] = {}

    def reset(self) -> None:
        """Xoa lich su dem (dung cho test)."""
        self._hits.clear()

    async def __call__(self, request: Request) -> None:
        limit = int(self._limit_getter())
        if not settings.RATE_LIMIT_ENABLED or limit <= 0:
            return

        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window_start = now - self._window

        hits = self._hits.get(client_ip)
        if hits is None:
            hits = deque()
            self._hits[client_ip] = hits

        while hits and hits[0] <= window_start:
            hits.popleft()

        if len(hits) >= limit:
            retry_after = max(1, int(self._window - (now - hits[0])) + 1)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.",
                headers={"Retry-After": str(retry_after)},
            )

        hits.append(now)

        # Don IP khong con hoat dong de dict khong phinh mai theo thoi gian.
        if len(self._hits) > 10_000:
            for key in [k for k, v in self._hits.items() if not v or v[-1] <= window_start]:
                self._hits.pop(key, None)


login_rate_limiter = SlidingWindowRateLimiter(
    lambda: settings.LOGIN_RATE_LIMIT_PER_MINUTE
)
register_rate_limiter = SlidingWindowRateLimiter(
    lambda: settings.REGISTER_RATE_LIMIT_PER_MINUTE
)
refresh_rate_limiter = SlidingWindowRateLimiter(
    lambda: settings.REFRESH_RATE_LIMIT_PER_MINUTE
)
forgot_rate_limiter = SlidingWindowRateLimiter(
    lambda: settings.FORGOT_RATE_LIMIT_PER_MINUTE
)
