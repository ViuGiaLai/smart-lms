"""Kiểm thử end-to-end bằng Chrome headless (CDP): đăng nhập demo, duyệt các trang,
theo dõi lỗi console/exception và các request API thất bại.

Chạy: <venv>/Scripts/python.exe .e2e_browser_check.py
"""
import asyncio
import json
import subprocess
import sys
import tempfile
import time
import urllib.request

import websockets

sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE = "http://127.0.0.1:3000"
PORT = 9222


def wait_for_devtools(timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=2) as r:
                return json.load(r)
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("Không kết nối được Chrome DevTools")


class CDP:
    def __init__(self, ws):
        self.ws = ws
        self._id = 0
        self.console_errors = []
        self.failed_requests = []
        self.exceptions = []

    async def send(self, method, params=None):
        self._id += 1
        msg_id = self._id
        await self.ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
        while True:
            raw = await self.ws.recv()
            msg = json.loads(raw)
            if msg.get("id") == msg_id:
                if "error" in msg:
                    raise RuntimeError(f"{method} -> {msg['error']}")
                return msg.get("result", {})
            self._collect(msg)

    def _collect(self, msg):
        method = msg.get("method")
        params = msg.get("params", {})
        if method == "Runtime.consoleAPICalled" and params.get("type") == "error":
            self.console_errors.append(
                " ".join(str(a.get("value", a.get("description", ""))) for a in params.get("args", []))
            )
        elif method == "Runtime.exceptionThrown":
            d = params.get("exceptionDetails", {})
            self.exceptions.append(d.get("exception", {}).get("description") or d.get("text", ""))
        elif method == "Log.entryAdded":
            entry = params.get("entry", {})
            if entry.get("level") == "error":
                self.console_errors.append(f"{entry.get('text')} ({entry.get('url', '')})")
        elif method == "Network.responseReceived":
            resp = params.get("response", {})
            if resp.get("status", 0) >= 400:
                self.failed_requests.append(f"{resp.get('status')} {resp.get('url')}")

    async def drain(self, seconds=1.0):
        end = time.time() + seconds
        while time.time() < end:
            try:
                raw = await asyncio.wait_for(self.ws.recv(), timeout=max(0.05, end - time.time()))
            except asyncio.TimeoutError:
                return
            self._collect(json.loads(raw))

    async def evaluate(self, expression, await_promise=False):
        res = await self.send(
            "Runtime.evaluate",
            {"expression": expression, "returnByValue": True, "awaitPromise": await_promise},
        )
        if res.get("exceptionDetails"):
            return {"__error__": res["exceptionDetails"].get("text")}
        return res.get("result", {}).get("value")

    async def goto(self, url, wait=4.0):
        await self.send("Page.navigate", {"url": url})
        await self.drain(wait)


async def main():
    profile = tempfile.mkdtemp(prefix="cdp-profile-")
    chrome = subprocess.Popen(
        [
            CHROME, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
            f"--remote-debugging-port={PORT}", f"--user-data-dir={profile}", "--window-size=1440,900",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        targets = wait_for_devtools()
        page = next(t for t in targets if t.get("type") == "page")
        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=20_000_000) as ws:
            cdp = CDP(ws)
            await cdp.send("Page.enable")
            await cdp.send("Runtime.enable")
            await cdp.send("Log.enable")
            await cdp.send("Network.enable")

            print("=" * 60)
            print("BƯỚC 0: Trang chủ phải hiển thị số liệu thật từ DB (không còn số bịa)")
            print("=" * 60)
            await cdp.goto(f"{BASE}/", wait=6)
            landing_text = await cdp.evaluate("document.body.innerText") or ""
            has_fake_stat = "5.000+" in landing_text
            has_real_stat = "Học viên đã đăng ký" in landing_text
            has_testimonial = "Được tin tưởng bởi sinh viên" in landing_text
            stat_values = await cdp.evaluate(
                """(() => {
                    const ps=[...document.querySelectorAll('p')];
                    const labels=['Học viên đã đăng ký','Khóa học đã xuất bản','Bài giảng đã số hóa','Giảng viên phụ trách'];
                    return labels.map(l=>{
                        const lp=ps.find(p=>p.textContent.trim()===l);
                        if(!lp) return l+'=MISSING';
                        const v=lp.previousElementSibling;
                        return l+'='+(v?v.textContent.trim():'?');
                    });
                })()"""
            )
            print("Còn số liệu bịa '5.000+':", has_fake_stat)
            print("Có nhãn số liệu thật 'Học viên đã đăng ký':", has_real_stat)
            print("Còn khối testimonial bịa:", has_testimonial)
            print("Giá trị số liệu render ra:", stat_values)
            stats_real = isinstance(stat_values, list) and all(
                isinstance(s, str) and '=MISSING' not in s and not s.endswith('=—') for s in stat_values
            )
            landing_ok = (not has_fake_stat) and has_real_stat and (not has_testimonial) and stats_real

            print()
            print("=" * 60)
            print("BƯỚC 1: Đăng nhập nhanh bằng tài khoản Admin (nút demo trên UI)")
            print("=" * 60)
            await cdp.goto(f"{BASE}/login", wait=5)
            clicked = await cdp.evaluate(
                """(() => {
                    const btn = [...document.querySelectorAll('button')]
                        .find(b => (b.getAttribute('title') || '').includes('Quản trị viên'));
                    if (!btn) return 'KHÔNG tìm thấy nút Admin';
                    btn.click();
                    return 'đã click';
                })()"""
            )
            print("Nút demo Admin:", clicked)

            state = None
            for _ in range(20):
                await cdp.drain(1.0)
                state = await cdp.evaluate(
                    "({token: !!localStorage.getItem('accessToken'), role: (JSON.parse(localStorage.getItem('currentUser')||'{}').role)||null, path: location.pathname})"
                )
                if state and state.get("token"):
                    break
            print("Trạng thái sau đăng nhập:", state)
            login_ok = bool(state and state.get("token"))

            print()
            print("=" * 60)
            print("BƯỚC 2: Duyệt các trang chính và thu thập lỗi runtime")
            print("=" * 60)
            pages = [
                "/admin-dashboard", "/instructor-dashboard", "/dashboard",
                "/courses", "/courses/1", "/courses/1/manage", "/courses/1/learn",
                "/quiz/bank", "/quiz/generate", "/progress", "/quiz/1",
            ]
            for path in pages:
                cdp.console_errors, cdp.exceptions, cdp.failed_requests = [], [], []
                await cdp.goto(f"{BASE}{path}", wait=4)
                await cdp.drain(1.0)
                title = await cdp.evaluate("document.body.innerText.slice(0,60).replace(/\\n/g,' | ')")
                print(f"\n[{path}] render: {title!r}")
                if cdp.exceptions:
                    print("  ❌ Exception:", cdp.exceptions[:2])
                if cdp.console_errors:
                    print("  ⚠️  Console error:", cdp.console_errors[:3])
                if cdp.failed_requests:
                    print("  ⚠️  HTTP >=400:", sorted(set(cdp.failed_requests))[:4])

            print()
            print("=" * 60)
            print("BƯỚC 3: Gửi câu hỏi cho AI Tutor trên trang học tập (SSE thật)")
            print("=" * 60)
            await cdp.goto(f"{BASE}/courses/1/learn", wait=6)
            await cdp.evaluate(
                """(() => {
                    const ta = document.querySelector('textarea') ||
                               [...document.querySelectorAll('input[type=text]')].pop();
                    if (!ta) return 'không thấy ô nhập';
                    const setter = Object.getOwnPropertyDescriptor(
                        ta instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
                        'value').set;
                    setter.call(ta, 'Event Loop trong Python hoạt động như thế nào?');
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                    const form = ta.closest('form');
                    if (form) { form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true})); return 'đã submit form'; }
                    const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('Gửi'));
                    if (btn) { btn.click(); return 'đã click nút gửi'; }
                    return 'không tìm thấy nút gửi';
                })()"""
            )
            cdp.failed_requests = []
            await cdp.drain(12)
            chat_text = await cdp.evaluate(
                "(document.body.innerText.match(/Event Loop|Xin lỗi|Bài học|trích dẫn|Asynchronous/is) || ['(không phát hiện nội dung trả lời)'])[0]"
            )
            print("Nội dung phản hồi AI phát hiện được:", chat_text)
            if cdp.failed_requests:
                print("  ⚠️  HTTP >=400 trong lúc chat:", sorted(set(cdp.failed_requests))[:4])

            print()
            print("=" * 60)
            print("KẾT LUẬN")
            print("=" * 60)
            print("Đăng nhập demo lấy được token:", "PASS" if login_ok else "FAIL")
            print("Trang chủ dùng số liệu thật & bỏ testimonial bịa:", "PASS" if landing_ok else "FAIL")
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=10)
        except Exception:
            chrome.kill()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
