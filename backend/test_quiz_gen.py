import sys
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)

import urllib.request
import urllib.error
import json

print("1. Kiểm tra Health AI Service (8001)...")
try:
    with urllib.request.urlopen('http://localhost:8001/health', timeout=5) as r:
        print("Health status:", r.status, r.read().decode('utf-8'))
except Exception as e:
    print("Health error:", e)

print("\n2. Gọi trực tiếp AI Service /api/v1/quiz/generate...")
payload = {
    'content': 'Khóa học Lập trình Python Nâng cao và Xây dựng Microservices với FastAPI và PostgreSQL. Tối ưu hóa truy vấn cơ sở dữ liệu và xử lý bất đồng bộ Async Event Loop.',
    'num_questions': 3,
    'difficulty': 'medium',
    'language': 'vi'
}
data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request('http://localhost:8001/api/v1/quiz/generate', data=data, headers={'Content-Type': 'application/json'}, method='POST')

try:
    # Gemini có thể mất 30-60s để sinh xong 3 câu hỏi, đặt timeout rộng để tránh flaky test
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.loads(r.read().decode('utf-8'))
        print("Sinh đề thành công! Số câu:", res.get('total_questions'))
        for idx, q in enumerate(res.get('questions', [])):
            print(f"Câu {idx+1}: {q.get('question')}")
            print(f"  Các đáp án: {q.get('options')}")
            print(f"  Đáp án đúng index: {q.get('correct_answer')}")
            print(f"  Giải thích: {q.get('explanation')}")
except urllib.error.HTTPError as e:
    print("Lỗi HTTP:", e.code, e.read().decode('utf-8'))
except Exception as e:
    print("Lỗi:", e)

print("\n3. Kiểm tra gọi qua Backend API /api/v1/ai-quiz-gen/preview (Port 8000)...")
# Login as instructor
login_data = json.dumps({'email': 'giangvien@donga.edu.vn', 'password': 'password123'}).encode('utf-8')
req_login = urllib.request.Request('http://localhost:8000/api/v1/auth/login', data=login_data, headers={'Content-Type': 'application/json'}, method='POST')
with urllib.request.urlopen(req_login, timeout=5) as r:
    token = json.loads(r.read().decode('utf-8'))['data']['accessToken']

backend_payload = {
    'topic': 'Lập trình Python Nâng cao & FastAPI Backend',
    'course_id': 1,
    'num_questions': 3,
    'difficulty': 'medium',
}
req_backend = urllib.request.Request(
    'http://localhost:8000/api/v1/ai-quiz-gen/preview',
    data=json.dumps(backend_payload).encode('utf-8'),
    headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'},
    method='POST'
)

try:
    with urllib.request.urlopen(req_backend, timeout=120) as r:
        b_res = json.loads(r.read().decode('utf-8'))
        print("Backend Preview thành công! Tiêu đề:", b_res.get('title'))
        print("Tổng số câu hỏi:", b_res.get('total_questions'))
        for idx, q in enumerate(b_res.get('questions', [])):
            print(f"Câu {q.get('question_number')}: {q.get('question_text')}")
            print(f"  Đáp án đúng: {q.get('correct_option')}")
            print(f"  Phương án: {[opt.get('text') for opt in q.get('options', [])]}")
except urllib.error.HTTPError as e:
    print("Lỗi Backend API:", e.code, e.read().decode('utf-8'))
except Exception as e:
    print("Lỗi Backend:", e)
