import sys
import json
import urllib.request
import urllib.error

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = "http://localhost:8000/api/v1"

def api_post(url, data):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def api_get(url, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def test_login(email, role_name):
    try:
        data = api_post(f"{BASE}/auth/login", {"email": email, "password": "password123"})
    except urllib.error.HTTPError as e:
        print(f"FAILED to login {email}: HTTP {e.code} - {e.read().decode('utf-8')}")
        return

    token = data["data"]["accessToken"]
    user = data["data"]["user"]
    print(f"\n==========================================")
    print(f"=== {role_name} ===")
    print(f"Tên: {user['name']} | Vai trò: {user['role']} | User ID: {user['id']}")

    if user["role"] in ["instructor", "admin"]:
        inst_res = api_get(f"{BASE}/instructor/courses", token)
        courses = inst_res.get("data", [])
        print(f"Danh sách khóa học trong Instructor Dashboard ({len(courses)} khóa):")
        for c in courses:
            print(f"  - [Khóa #{c['id']}] {c['title']} | Giảng viên: {c['instructor']['fullName']} (GV ID: {c['instructor']['id']})")

    if user["role"] == "student":
        stu_res = api_get(f"{BASE}/courses/enrolled", token)
        enrolls = stu_res.get("data", [])
        print(f"Khóa học đang học của Sinh viên ({len(enrolls)} khóa):")
        for e in enrolls:
            print(f"  - [Khóa #{e['courseId']}] {e['course']['title']} | Tiến độ: {e['progress']}% | UserID: {e['userId']}")

if __name__ == "__main__":
    test_login("giangvien@donga.edu.vn", "Giảng viên 1 (TS. Nguyễn Văn Minh)")
    test_login("giangvien2@donga.edu.vn", "Giảng viên 2 (TS. Lê Hoàng Long)")
    test_login("giangvien3@donga.edu.vn", "Giảng viên 3 (ThS. Trần Thị Mai Lan)")
    test_login("admin@donga.edu.vn", "Quản trị viên (Ban Quản trị)")
    test_login("sinhvien@donga.edu.vn", "Sinh viên (Nguyễn Văn An)")
