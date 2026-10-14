import asyncio
import sys
import os
from decimal import Decimal

import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ── KIỂM TRA BẢO MẬT: CHỈ CHỦ HỆ THỐNG / ADMIN CÓ KEY MỚI ĐƯỢC PHÉP SEED ──
EXPECTED_SECRET = "smartlms_super_admin_seed_secure_987654321"
passed_secret = os.getenv("SEED_SECRET_KEY", "")
for arg in sys.argv:
    if arg.startswith("--secret="):
        passed_secret = arg.split("=", 1)[1]

if passed_secret != EXPECTED_SECRET:
    print("\n[BẢO MẬT] ⛔ TRUY CẬP BỊ TỪ CHỐI!")
    print("Bạn không có quyền thực thi thao tác seed dữ liệu vào Database của Smart LMS.")
    print("Chỉ quản trị viên sở hữu SEED_SECRET_KEY hợp lệ mới có thể thao tác.")
    sys.exit(1)

from sqlalchemy import select, text
from app.core.database import engine, Base, AsyncSessionLocal
import app.models
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus
from app.models.lesson import Lesson
from app.models.quiz import Quiz, QuizQuestion
from app.models.progress import Progress
from app.core.security import hash_password

LESSONS_DATA = [
    {
        "id": 1,
        "course_id": 1,
        "order_index": 1,
        "title": "Bài 1: Giới thiệu kiến trúc Python Async & Event Loop",
        "description": "Tìm hiểu cơ chế hoạt động của Single-threaded Event Loop trong Python, cách áp dụng cú pháp Async/Await để xử lý hàng nghìn kết nối đồng thời mà không bị nghẽn I/O.",
        "video_url": "https://www.youtube.com/watch?v=tSLZXqY3X_0",
        "duration": 2700, # 45m
        "transcript": """[00:00 - 02:30] Giới thiệu khái niệm kiến trúc Asynchronous và nguyên lý hoạt động của Single-threaded Event Loop trong Python.
[02:31 - 10:45] So sánh sự khác biệt về hiệu năng giữa Multi-threading truyền thống và Asynchronous I/O.
[10:46 - 25:00] Hướng dẫn cú pháp async def và lệnh await để ủy quyền cho Event Loop xử lý truy vấn mạng và cơ sở dữ liệu.
[25:01 - 45:00] Thực hành tối ưu hóa truy vấn cơ sở dữ liệu kết hợp pgvector trong kiến trúc phần mềm hiệu năng cao.""",
        "resources_url": "Slide_01_Python_Async_EventLoop.pdf",
    },
    {
        "id": 2,
        "course_id": 1,
        "order_index": 2,
        "title": "Bài 2: Tối ưu hóa bộ nhớ với Generators và Decorators",
        "description": "Nắm vững cơ chế sinh dữ liệu theo yêu cầu (Lazy Evaluation) với từ khóa yield và kỹ thuật viết Decorators mở rộng chức năng hàm an toàn.",
        "video_url": "https://www.youtube.com/watch?v=bD05uGo_sVI",
        "duration": 3000, # 50m
        "transcript": """[00:00 - 05:00] Khái niệm Generator Function và cách thức hoạt động của lệnh yield trong việc tiết kiệm RAM.
[05:01 - 18:30] Phân biệt Generator Object và Iterator Protocol trong cấu trúc dữ liệu Python.
[18:31 - 35:00] Xây dựng Custom Decorators để đo lường thời gian thực thi (Timing) và kiểm tra quyền truy cập (Authentication).
[35:01 - 50:00] Ứng dụng Generators trong việc đọc các dataset lớn hàng triệu dòng phục vụ huấn luyện mô hình AI.""",
        "resources_url": "Slide_02_Generators_Decorators.pdf",
    },
    {
        "id": 3,
        "course_id": 2,
        "order_index": 1,
        "title": "Bài 1: Xây dựng RESTful API tốc độ cao với FastAPI & Pydantic v2",
        "description": "Thiết kế và triển khai API bất đồng bộ theo chuẩn RESTful với FastAPI, xác thực dữ liệu qua Pydantic và sinh Swagger UI tự động.",
        "video_url": "https://www.youtube.com/watch?v=0sOvCWFmrtA",
        "duration": 3900, # 65m
        "transcript": """[00:00 - 08:00] Tổng quan về chuẩn ASGI và lý do FastAPI đạt hiệu năng vượt trội so với Flask/Django.
[08:01 - 22:30] Định nghĩa Schema xác thực dữ liệu đầu vào và đầu ra sử dụng Pydantic v2.
[22:31 - 40:00] Xây dựng hệ thống Dependency Injection quản lý phiên làm việc Database Session an toàn.
[40:01 - 65:00] Triển khai bảo mật JWT Token và phân quyền vai trò (Role-based Access Control).""",
        "resources_url": "Slide_01_FastAPI_RESTful_Architecture.pdf",
    },
    {
        "id": 4,
        "course_id": 2,
        "order_index": 2,
        "title": "Bài 2: Tích hợp Vector Database (pgvector) và RAG Pipeline",
        "description": "Xây dựng quy trình RAG hoàn chỉnh kết hợp pgvector trong PostgreSQL, số hóa tài liệu PDF/Transcript và kết nối Gemini LLM.",
        "video_url": "https://www.youtube.com/watch?v=2TJxpyO3ei4",
        "duration": 4800, # 80m
        "transcript": """[00:00 - 10:00] Giới thiệu nguyên lý Retrieval-Augmented Generation (RAG) và vai trò của Vector Database.
[10:01 - 25:00] Kỹ thuật phân đoạn văn bản (Text Chunking) và tạo embeddings 768 chiều với text-embedding-004.
[25:01 - 50:00] Cấu hình chỉ mục HNSW trong PostgreSQL và thực hiện truy vấn độ tương đồng Cosine Similarity.
[50:01 - 80:00] Ràng buộc ngữ cảnh bài học (Lesson-Bounded) để triệt tiêu hoàn toàn ảo giác (Zero-Hallucination) cho trợ lý AI.""",
        "resources_url": "Slide_02_pgvector_RAG_Architecture.pdf",
    },
    {
        "id": 5,
        "course_id": 3,
        "order_index": 1,
        "title": "Bài 1: Khởi tạo Kiến trúc Next.js 14 App Router & Server Components",
        "description": "Làm chủ kiến trúc App Router thế hệ mới, tối ưu hóa bundle size với React Server Components và xử lý Server Actions.",
        "video_url": "https://www.youtube.com/watch?v=wm5gMKuwSYk",
        "duration": 2700, # 45m
        "transcript": """[00:00 - 05:00] Giới thiệu kiến trúc Next.js 14 App Router và sự khác biệt với Pages Router truyền thống.
[05:01 - 18:30] Tìm hiểu cơ chế React Server Components (RSC) giúp tối ưu thời gian tải trang và giảm bundle size.
[18:31 - 32:00] Hướng dẫn xây dựng Server Actions và truyền dữ liệu bất đồng bộ giữa Client và Server.
[32:01 - 45:00] Thực hành thiết kế Streaming SSR kết hợp giao diện Skeleton Shimmer thân thiện với người dùng.""",
        "resources_url": "Slide_01_Nextjs14_AppRouter.pdf",
    },
    {
        "id": 6,
        "course_id": 3,
        "order_index": 2,
        "title": "Bài 2: Thiết kế Giao diện Hiện đại với Tailwind CSS & Focus Player",
        "description": "Ứng dụng Tailwind CSS xây dựng trình xem bài giảng Focus Player Full HD, thanh điều hướng linh hoạt và Chat Drawer AI.",
        "video_url": "https://www.youtube.com/watch?v=kYJv6W786aU",
        "duration": 3000, # 50m
        "transcript": """[00:00 - 08:00] Nguyên lý thiết kế giao diện giáo dục số (EdTech UX) và cấu hình Tailwind CSS chuẩn responsive.
[08:01 - 22:00] Xây dựng Focus Video Player tối ưu độ tập trung cho học viên, hỗ trợ tự động đánh dấu hoàn thành.
[22:01 - 35:00] Thiết kế Sidebar danh sách bài học và tích hợp Drawer hỏi đáp trợ lý ảo AI Tutor 24/7.
[35:01 - 50:00] Tối ưu hóa khả năng truy cập (Accessibility) và kiểm thử giao diện trên thiết bị di động (Mobile).""",
        "resources_url": "Slide_02_TailwindCSS_UI_Design.pdf",
    },
]

QUIZ_DATA = [
    {
        "course_id": 1,
        "title": "Bài 1: Kiến trúc Python Async & Event Loop",
        "description": "Bộ câu hỏi kiểm tra độ hiểu biết về cơ chế Asynchronous I/O, Event Loop và lệnh await.",
        "pass_score": 0.75,
        "questions": [
            {
                "question_text": "Thành phần nào điều phối việc thực thi các coroutines trong Python AsyncIO?",
                "options": [
                    {"key": "A", "text": "Thread Pool Manager"},
                    {"key": "B", "text": "Event Loop"},
                    {"key": "C", "text": "Garbage Collector"},
                    {"key": "D", "text": "Global Interpreter Lock (GIL)"}
                ],
                "correct_answer": "B",
                "explanation": "Event Loop là vòng lặp vô tận theo dõi hàng đợi sự kiện và điều phối thực thi các tác vụ async mà không chặn luồng chính.",
                "order_index": 1,
            },
            {
                "question_text": "Từ khóa nào được sử dụng để tạm dừng việc thực thi một coroutine cho đến khi có kết quả?",
                "options": [
                    {"key": "A", "text": "defer"},
                    {"key": "B", "text": "yield"},
                    {"key": "C", "text": "await"},
                    {"key": "D", "text": "pause"}
                ],
                "correct_answer": "C",
                "explanation": "Lệnh await được đặt trước một awaitable (coroutine, Task, Future) để chuyển quyền kiểm soát lại cho Event Loop.",
                "order_index": 2,
            },
            {
                "question_text": "Lợi ích chính của kiến trúc Asynchronous so với Multi-threading truyền thống là gì?",
                "options": [
                    {"key": "A", "text": "Tiêu thụ ít RAM hơn và giảm chi phí chuyển đổi ngữ cảnh (Context Switching)"},
                    {"key": "B", "text": "Tự động bỏ qua lỗi cú pháp runtime"},
                    {"key": "C", "text": "Tăng xung nhịp phần cứng của CPU"},
                    {"key": "D", "text": "Không cần khai báo biến môi trường"}
                ],
                "correct_answer": "A",
                "explanation": "Kiến trúc bất đồng bộ chạy trên single thread, loại bỏ chi phí chuyển đổi ngữ cảnh nặng nề của OS thread và tiết kiệm bộ nhớ RAM.",
                "order_index": 3,
            },
            {
                "question_text": "Lệnh nào sau đây không nên sử dụng bên trong một hàm async def vì sẽ gây nghẽn toàn bộ Event Loop?",
                "options": [
                    {"key": "A", "text": "await asyncio.sleep(1)"},
                    {"key": "B", "text": "await client.get(url)"},
                    {"key": "C", "text": "time.sleep(5)"},
                    {"key": "D", "text": "return True"}
                ],
                "correct_answer": "C",
                "explanation": "time.sleep là một blocking call đồng bộ, sẽ chặn đứng thread chính khiến Event Loop không thể chuyển qua xử lý các request khác.",
                "order_index": 4,
            }
        ]
    },
    {
        "course_id": 1,
        "title": "Bài 2: Tối ưu hóa bộ nhớ với Generators và Decorators",
        "description": "Bộ câu hỏi kiểm tra cơ chế Lazy Evaluation, yield và xây dựng Custom Decorators trong Python.",
        "pass_score": 0.66,
        "questions": [
            {
                "question_text": "Từ khóa nào trong Python biến một hàm bình thường thành Generator function?",
                "options": [
                    {"key": "A", "text": "return"},
                    {"key": "B", "text": "yield"},
                    {"key": "C", "text": "generate"},
                    {"key": "D", "text": "next"}
                ],
                "correct_answer": "B",
                "explanation": "Khi một hàm chứa từ khóa yield, Python sẽ biến hàm đó thành Generator sinh giá trị theo cơ chế Lazy Evaluation.",
                "order_index": 1,
            },
            {
                "question_text": "Cơ chế Lazy Evaluation của Generator mang lại ưu điểm gì lớn nhất?",
                "options": [
                    {"key": "A", "text": "Tiết kiệm bộ nhớ RAM khi xử lý tập dữ liệu lớn hàng triệu dòng"},
                    {"key": "B", "text": "Tăng tốc độ mạng"},
                    {"key": "C", "text": "Tự động mã hóa tệp tin"},
                    {"key": "D", "text": "Bỏ qua kiểm tra kiểu dữ liệu"}
                ],
                "correct_answer": "A",
                "explanation": "Generator chỉ sinh ra phần tử tiếp theo khi được gọi (on-demand), không tải toàn bộ dữ liệu vào RAM cùng lúc.",
                "order_index": 2,
            },
            {
                "question_text": "Decorators trong Python về bản chất là gì?",
                "options": [
                    {"key": "A", "text": "Một module đồ họa"},
                    {"key": "B", "text": "Một hàm nhận vào một hàm khác và trả về hàm đã được bổ sung chức năng"},
                    {"key": "C", "text": "Một cú pháp chỉ dùng trong lớp đối tượng"},
                    {"key": "D", "text": "Một trình biên dịch mã nguồn CPython"}
                ],
                "correct_answer": "B",
                "explanation": "Decorator nhận đối số là một hàm, bọc thêm hành vi (wrapper) và trả về hàm mới mà không thay đổi mã nguồn gốc.",
                "order_index": 3,
            }
        ]
    },
    {
        "course_id": 2,
        "title": "Bài 1: Xây dựng RESTful API tốc độ cao với FastAPI",
        "description": "Bộ câu hỏi củng cố kỹ năng xác thực Pydantic, ASGI Uvicorn và thiết kế RESTful endpoints.",
        "pass_score": 0.66,
        "questions": [
            {
                "question_text": "Thư viện nào được FastAPI sử dụng để xác thực (validation) dữ liệu đầu vào và đầu ra?",
                "options": [
                    {"key": "A", "text": "Pydantic"},
                    {"key": "B", "text": "Marshmallow"},
                    {"key": "C", "text": "Django Forms"},
                    {"key": "D", "text": "Cerberus"}
                ],
                "correct_answer": "A",
                "explanation": "FastAPI tích hợp Pydantic v2 để tự động parse, validate dữ liệu dựa trên Type Hints và sinh tài liệu OpenAPI/Swagger.",
                "order_index": 1,
            },
            {
                "question_text": "Máy chủ ASGI phổ biến nào thường được dùng để chạy ứng dụng FastAPI?",
                "options": [
                    {"key": "A", "text": "Uvicorn"},
                    {"key": "B", "text": "Apache Sync Worker"},
                    {"key": "C", "text": "WSGI Standard"},
                    {"key": "D", "text": "Node Runner"}
                ],
                "correct_answer": "A",
                "explanation": "Uvicorn là một máy chủ web ASGI siêu nhanh xây dựng trên uvloop và httptools, chuẩn mực cho các ứng dụng bất đồng bộ.",
                "order_index": 2,
            },
            {
                "question_text": "Phương thức HTTP nào được khuyến nghị để cập nhật một phần tài nguyên theo chuẩn RESTful?",
                "options": [
                    {"key": "A", "text": "POST"},
                    {"key": "B", "text": "PATCH"},
                    {"key": "C", "text": "GET"},
                    {"key": "D", "text": "DELETE"}
                ],
                "correct_answer": "B",
                "explanation": "PATCH dùng để cập nhật từng phần (partial update), còn PUT dùng để thay thế toàn bộ tài nguyên.",
                "order_index": 3,
            }
        ]
    },
    {
        "course_id": 2,
        "title": "Bài 2: Tích hợp Vector Database (pgvector) và RAG",
        "description": "Bộ câu hỏi về Cosine Similarity, HNSW Indexing và cơ chế Lesson-Bounded RAG chống ảo giác.",
        "pass_score": 0.66,
        "questions": [
            {
                "question_text": "Khoảng cách toán học nào thường được sử dụng trong pgvector để đo độ tương đồng ngữ nghĩa giữa câu hỏi và tài liệu?",
                "options": [
                    {"key": "A", "text": "Cosine Distance (<=>)"},
                    {"key": "B", "text": "Hamming Distance"},
                    {"key": "C", "text": "Manhattan Distance"},
                    {"key": "D", "text": "Jaccard Distance"}
                ],
                "correct_answer": "A",
                "explanation": "Cosine Similarity / Distance đo góc giữa hai vector trong không gian nhiều chiều, phản ánh chính xác nhất độ tương đồng ngữ nghĩa.",
                "order_index": 1,
            },
            {
                "question_text": "Tại sao cần áp dụng kỹ thuật Lesson-Bounded RAG trong hệ thống Smart LMS?",
                "options": [
                    {"key": "A", "text": "Để giới hạn phạm vi truy vấn chỉ trong tài liệu của bài học hiện tại, triệt tiêu ảo giác (Anti-Hallucination)"},
                    {"key": "B", "text": "Để giảm độ dài của video"},
                    {"key": "C", "text": "Để bắt buộc sinh viên phải thi lại"},
                    {"key": "D", "text": "Để xóa dữ liệu sau khi học xong"}
                ],
                "correct_answer": "A",
                "explanation": "Ràng buộc ngữ cảnh theo từng bài học (Lesson-Bounded) giúp AI Tutor chỉ trả lời các kiến thức có trong giáo trình bài đó, không đưa thông tin bịa đặt.",
                "order_index": 2,
            },
            {
                "question_text": "Loại index nào trong pgvector cho tốc độ tìm kiếm láng giềng gần nhất (ANN) nhanh và độ chính xác cao hơn IVFFlat?",
                "options": [
                    {"key": "A", "text": "B-tree"},
                    {"key": "B", "text": "HNSW (Hierarchical Navigable Small World)"},
                    {"key": "C", "text": "GIN"},
                    {"key": "D", "text": "Hash"}
                ],
                "correct_answer": "B",
                "explanation": "HNSW xây dựng đồ thị nhiều tầng giúp tìm kiếm vector xấp xỉ nhanh vượt trội và không cần phải train trước như IVFFlat.",
                "order_index": 3,
            }
        ]
    },
    {
        "course_id": 3,
        "title": "Bài 1: Kiến trúc Next.js 14 App Router & Server Components",
        "description": "Bộ câu hỏi kiểm tra kiến thức về Server Components, Client Components và Server Actions trong Next.js 14.",
        "pass_score": 0.66,
        "questions": [
            {
                "question_text": "Thành phần nào trong Next.js 14 App Router được render hoàn toàn trên server theo mặc định?",
                "options": [
                    {"key": "A", "text": "React Server Components (RSC)"},
                    {"key": "B", "text": "Client Components có gắn 'use client'"},
                    {"key": "C", "text": "Redux Store state"},
                    {"key": "D", "text": "LocalStorage storage"}
                ],
                "correct_answer": "A",
                "explanation": "Trong Next.js 14 App Router, mọi component mặc định đều là React Server Component, giúp giảm thiểu Javascript gửi xuống trình duyệt.",
                "order_index": 1,
            },
            {
                "question_text": "Chỉ thị (directive) nào được đặt ở đầu tệp để khai báo một component tương tác phía Client?",
                "options": [
                    {"key": "A", "text": "'use client'"},
                    {"key": "B", "text": "'use server'"},
                    {"key": "C", "text": "'use state'"},
                    {"key": "D", "text": "'use browser'"}
                ],
                "correct_answer": "A",
                "explanation": "Chỉ thị 'use client' báo hiệu cho bundler biết rằng component này cần nạp JavaScript để xử lý tương tác sự kiện và state.",
                "order_index": 2,
            },
            {
                "question_text": "Kỹ thuật nào của Next.js 14 cho phép truyền tải giao diện theo từng luồng nhỏ (Streaming) kết hợp Suspense?",
                "options": [
                    {"key": "A", "text": "Streaming SSR with Suspense"},
                    {"key": "B", "text": "Static HTML Zip Archive"},
                    {"key": "C", "text": "Flash Media Loader"},
                    {"key": "D", "text": "Synchronous I/O Blocking"}
                ],
                "correct_answer": "A",
                "explanation": "Streaming SSR kết hợp thẻ Suspense cho phép server gửi trước các phần UI đã sẵn sàng đến trình duyệt mà không cần chờ toàn bộ API trả về.",
                "order_index": 3,
            }
        ]
    },
    {
        "course_id": 3,
        "title": "Bài 2: Thiết kế Giao diện Hiện đại với Tailwind CSS",
        "description": "Bộ câu hỏi về Utility-First CSS, responsive layout và tối ưu trải nghiệm học tập số.",
        "pass_score": 0.66,
        "questions": [
            {
                "question_text": "Ưu điểm nổi bật nhất của triết lý Utility-First trong Tailwind CSS là gì?",
                "options": [
                    {"key": "A", "text": "Xây dựng giao diện nhanh chóng bằng các class tiện ích mà không tốn công đặt tên CSS class trừu tượng"},
                    {"key": "B", "text": "Bắt buộc phải nhúng thẻ iframe từ bên ngoài"},
                    {"key": "C", "text": "Tự động dịch website sang nhiều ngôn ngữ"},
                    {"key": "D", "text": "Không thể tùy biến màu sắc"}
                ],
                "correct_answer": "A",
                "explanation": "Tailwind CSS cung cấp các utility class có sẵn giúp phát triển UI tốc độ cao, dễ bảo trì và loại bỏ xung đột CSS.",
                "order_index": 1,
            },
            {
                "question_text": "Trong Tailwind CSS, prefix nào áp dụng kiểu dáng cho màn hình có chiều rộng từ 768px trở lên?",
                "options": [
                    {"key": "A", "text": "md:"},
                    {"key": "B", "text": "sm:"},
                    {"key": "C", "text": "lg:"},
                    {"key": "D", "text": "xl:"}
                ],
                "correct_answer": "A",
                "explanation": "Prefix 'md:' trong Tailwind đại diện cho breakpoint màn hình máy tính bảng / tablet trở lên (min-width: 768px).",
                "order_index": 2,
            },
            {
                "question_text": "Kỹ thuật Skeleton Shimmer UI mang lại giá trị gì cho trải nghiệm người dùng?",
                "options": [
                    {"key": "A", "text": "Tạo khung hình chuyển động mô phỏng bố cục, giảm cảm giác chờ đợi khi đang tải dữ liệu từ API"},
                    {"key": "B", "text": "Tự động tắt âm thanh của video"},
                    {"key": "C", "text": "Xóa bộ nhớ đệm của trình duyệt"},
                    {"key": "D", "text": "Ngăn chặn người dùng đăng nhập"}
                ],
                "correct_answer": "A",
                "explanation": "Skeleton Shimmer cung cấp phản hồi thị giác ngay lập tức, giúp người dùng nắm được cấu trúc trang trong khi chờ đợi dữ liệu mạng.",
                "order_index": 3,
            }
        ]
    }
]

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8001")


async def sync_rag_chunks_into_ai_service() -> None:
    """Nạp transcript vào pgvector bằng embedding THẬT của Gemini (qua AI Service).

    Trước đây bước này sinh "vector băm" giả từ từ khóa, khiến truy xuất RAG không
    còn là tìm kiếm ngữ nghĩa. Nay việc sinh embedding được giao hẳn cho AI Service
    (document_processor/embedder.py); nếu AI Service hoặc Gemini lỗi thì seed dừng
    và báo lỗi rõ ràng thay vì nạp vector sai vào cơ sở tri thức.
    """
    print("=== NẠP VECTOR CHUNKS VÀO PGVECTOR (EMBEDDING GEMINI THẬT) ===")
    url = f"{AI_SERVICE_URL}/api/v1/documents/ingest-text"
    total_chunks = 0

    async with httpx.AsyncClient(timeout=300.0) as client:
        for l_data in LESSONS_DATA:
            lesson_id = l_data["id"]
            chunks = [line.strip() for line in l_data["transcript"].split("\n") if line.strip()]
            doc_name = l_data["resources_url"]
            payload = {
                "lesson_id": lesson_id,
                "document_id": doc_name,
                "replace_existing": True,
                "chunks": chunks,
                "metadata": [
                    {"lesson_id": lesson_id, "filename": doc_name, "timestamp_range": c[:15]}
                    for c in chunks
                ],
            }

            res = await client.post(url, json=payload)
            if res.status_code != 200:
                raise RuntimeError(
                    f"AI Service trả về HTTP {res.status_code} khi nhúng học liệu Bài #{lesson_id}: {res.text[:300]}"
                )

            body = res.json()
            total_chunks += int(body.get("total_chunks", 0))
            print(
                f"[OK] Bài #{lesson_id}: {body.get('total_chunks')} vector chunks "
                f"(đã thay thế {body.get('deleted_chunks')} chunk cũ)"
            )

    print(f"[OK] Tổng cộng {total_chunks} vector chunks đã được Gemini embedding và nạp vào pgvector")


async def sync_all_data():
    print("=== BẮT ĐẦU KHỞI TẠO VÀ ĐỒNG BỘ CƠ SỞ DỮ LIỆU SMART LMS ===")
    
    # 0. Kích hoạt extension & tạo toàn bộ bảng nếu Database mới hoàn toàn
    async with engine.begin() as conn:
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception as e:
            print(f"[LƯU Ý EXTENSION vector] {e}")
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        except Exception as e:
            print(f"[LƯU Ý EXTENSION pgcrypto] {e}")

        await conn.run_sync(Base.metadata.create_all)
        print("[OK] Đã khởi tạo cấu trúc bảng (users, courses, lessons, quizzes, progress)")

    async with engine.begin() as conn:
        # Tạo bảng document_chunks phục vụ RAG nếu chưa có
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    lesson_id INTEGER NOT NULL,
                    document_id VARCHAR(255),
                    content TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL DEFAULT 0,
                    embedding vector(768) NOT NULL,
                    chunk_metadata JSON
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_chunks_lesson_id ON document_chunks(lesson_id)"))
            print("[OK] Đã khởi tạo bảng vector document_chunks trong pgvector")
        except Exception as e:
            print(f"[LƯU Ý VECTOR TABLE] {e}")

    async with AsyncSessionLocal() as db:
        # 1. Khởi tạo các Tài khoản chuẩn hóa với mật khẩu bảo mật của chủ hệ thống
        MASTER_PWD = "rmahviu@852005"
        users_preset = [
            {
                "email": "admin@smartlms.edu.vn",
                "name": "Quản trị viên Hệ thống",
                "role": UserRole.admin,
                "password": MASTER_PWD,
            },
            {
                "email": "admin@donga.edu.vn",
                "name": "Ban Quản trị Hệ thống",
                "role": UserRole.admin,
                "password": MASTER_PWD,
            },
            {
                "email": "giangvien@smartlms.edu.vn",
                "name": "TS. Nguyễn Văn Minh",
                "role": UserRole.instructor,
                "password": MASTER_PWD,
            },
            {
                "email": "giangvien@donga.edu.vn",
                "name": "TS. Nguyễn Văn Minh (Giảng viên)",
                "role": UserRole.instructor,
                "password": MASTER_PWD,
            },
            {
                "email": "hocvien@smartlms.edu.vn",
                "name": "Nguyễn Thanh Phước (ST23D)",
                "role": UserRole.student,
                "password": MASTER_PWD,
            },
            {
                "email": "sinhvien@donga.edu.vn",
                "name": "Nguyễn Văn An (Sinh viên)",
                "role": UserRole.student,
                "password": MASTER_PWD,
            },
        ]

        instructor_user = None
        for u_data in users_preset:
            stmt = select(User).where(User.email == u_data["email"])
            res = await db.execute(stmt)
            user = res.scalar_one_or_none()
            if not user:
                user = User(
                    email=u_data["email"],
                    name=u_data["name"],
                    role=u_data["role"],
                    hashed_password=hash_password(u_data["password"]),
                    is_active=True,
                )
                db.add(user)
                print(f"[OK] Tạo tài khoản mới: {u_data['email']} ({u_data['role'].value})")
            else:
                user.name = u_data["name"]
                user.role = u_data["role"]
                user.hashed_password = hash_password(u_data["password"])
                user.is_active = True
                print(f"[OK] Cập nhật tài khoản: {u_data['email']} ({u_data['role'].value})")

            if u_data["role"] == UserRole.instructor:
                instructor_user = user

        await db.commit()

        # Lấy lại instructor_id
        inst_stmt = select(User).where(User.email == "giangvien@smartlms.edu.vn")
        inst_res = await db.execute(inst_stmt)
        instructor = inst_res.scalar_one()

        # 2. Khởi tạo Khóa học mẫu
        courses_preset = [
            {
                "id": 1,
                "title": "Lập trình Python Nâng cao & Ứng dụng Trí tuệ Nhân tạo",
                "description": "Làm chủ kiến trúc bất đồng bộ AsyncIO, FastAPI và tích hợp mô hình RAG Vector Embedding với pgvector.",
                "price": Decimal("0.00"),
                "thumbnail": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&fit=crop",
                "category": "Trí tuệ Nhân tạo & Python",
                "level": "intermediate",
                "status": CourseStatus.published,
            },
            {
                "id": 2,
                "title": "Thiết kế RESTful API Chuẩn Quốc tế với FastAPI & PostgreSQL",
                "description": "Xây dựng dịch vụ Backend siêu tốc, bảo mật JWT Token, phân quyền người dùng và kiểm thử tự động.",
                "price": Decimal("299000.00"),
                "thumbnail": "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&fit=crop",
                "category": "Lập trình Backend",
                "level": "beginner",
                "status": CourseStatus.published,
            },
            {
                "id": 3,
                "title": "Xây dựng Ứng dụng Web Hiện đại với Next.js 14 & Tailwind CSS",
                "description": "Thực hành phát triển giao diện người dùng theo chuẩn App Router, Server Components và Streaming SSE.",
                "price": Decimal("399000.00"),
                "thumbnail": "https://images.unsplash.com/photo-1618401471353-b98aedd04e11?w=600&fit=crop",
                "category": "Lập trình Frontend",
                "level": "advanced",
                "status": CourseStatus.published,
            },
        ]

        for c_data in courses_preset:
            stmt = select(Course).where(Course.id == c_data["id"])
            res = await db.execute(stmt)
            course = res.scalar_one_or_none()
            if not course:
                course = Course(
                    instructor_id=instructor.id,
                    **c_data,
                )
                db.add(course)
                print(f"[OK] Tạo Khóa học #{c_data['id']}: {c_data['title']}")
            else:
                course.title = c_data["title"]
                course.description = c_data["description"]
                course.thumbnail = c_data["thumbnail"]
                course.status = c_data["status"]
                print(f"[OK] Cập nhật Khóa học #{c_data['id']}: {c_data['title']}")

        await db.commit()

        # 3. Cập nhật bài học (Lessons)
        for l_data in LESSONS_DATA:
            stmt = select(Lesson).where(Lesson.id == l_data["id"])
            res = await db.execute(stmt)
            lesson = res.scalar_one_or_none()
            if lesson:
                lesson.course_id = l_data["course_id"]
                lesson.order_index = l_data["order_index"]
                lesson.title = l_data["title"]
                lesson.description = l_data["description"]
                lesson.video_url = l_data["video_url"]
                lesson.duration = l_data["duration"]
                lesson.transcript = l_data["transcript"]
                lesson.resources_url = l_data["resources_url"]
                print(f"[OK] Cập nhật Bài #{lesson.id}: {lesson.title}")
            else:
                new_l = Lesson(**l_data)
                db.add(new_l)
                print(f"[OK] Thêm mới Bài #{l_data['id']}: {l_data['title']}")
        await db.commit()

        # 4. Cập nhật Quizzes & Questions
        for q_data in QUIZ_DATA:
            stmt = select(Quiz).where(Quiz.course_id == q_data["course_id"], Quiz.title == q_data["title"])
            res = await db.execute(stmt)
            quiz = res.scalar_one_or_none()
            if not quiz:
                quiz = Quiz(
                    course_id=q_data["course_id"],
                    title=q_data["title"],
                    description=q_data["description"],
                    pass_score=q_data["pass_score"],
                    is_ai_generated=True,
                )
                db.add(quiz)
                await db.flush()
                print(f"[OK] Khởi tạo Quiz ID #{quiz.id} cho Khóa #{quiz.course_id}")
            else:
                quiz.title = q_data["title"]
                quiz.description = q_data["description"]
                print(f"[OK] Cập nhật Quiz ID #{quiz.id}")

            # Xóa questions cũ và nạp lại câu hỏi chuẩn
            await db.execute(text(f"DELETE FROM quiz_questions WHERE quiz_id = {quiz.id}"))
            for q_item in q_data["questions"]:
                qq = QuizQuestion(
                    quiz_id=quiz.id,
                    question_text=q_item["question_text"],
                    options=q_item["options"],
                    correct_answer=q_item["correct_answer"],
                    explanation=q_item["explanation"],
                    order_index=q_item["order_index"],
                )
                db.add(qq)
            print(f"[OK] Nạp {len(q_data['questions'])} câu hỏi trắc nghiệm chuẩn Bloom cho Quiz #{quiz.id}")
        await db.commit()

        # 4.5. Khởi tạo Tiến độ học tập thực tế (Progress) & Bài nộp Quiz (QuizSubmission) vào PostgreSQL
        try:
            from app.models.quiz import QuizSubmission
            st_res = await db.execute(select(User).where(User.role == UserRole.student))
            students = st_res.scalars().all()
            for st in students:
                await db.execute(text(f"DELETE FROM progress WHERE user_id = {st.id}"))
                await db.execute(text(f"DELETE FROM quiz_submissions WHERE user_id = {st.id}"))
                p1 = Progress(
                    user_id=st.id,
                    lesson_id=1,
                    percent_complete=100.0,
                    is_completed=True,
                    last_position=2700,
                )
                p2 = Progress(
                    user_id=st.id,
                    lesson_id=2,
                    percent_complete=65.0,
                    is_completed=False,
                    last_position=1950,
                )
                db.add_all([p1, p2])

                # Tìm Quiz đầu tiên để thêm lượt nộp mẫu
                q_first = (await db.execute(select(Quiz).where(Quiz.course_id == 1).order_by(Quiz.id.asc()))).scalars().first()
                if q_first:
                    sub = QuizSubmission(
                        quiz_id=q_first.id,
                        user_id=st.id,
                        answers={"1": "B", "2": "C", "3": "A", "4": "C"},
                        score=1.0,
                        passed=True,
                        time_spent=180,
                    )
                    db.add(sub)
            await db.commit()
            print(f"[OK] Đã nạp tiến độ học tập (Progress) & Lượt làm bài (QuizSubmission) cho {len(students)} học viên vào PostgreSQL")
        except Exception as e:
            print(f"[LƯU Ý PROGRESS & SUBMISSION SEED] {e}")

        # 5. Nạp Vector Chunks vào PostgreSQL pgvector (document_chunks)
        try:
            await sync_rag_chunks_into_ai_service()
        except Exception as e:
            print(f"[LỖI PGVECTOR CHUNKS] {e}")
            print(
                "[DỪNG SEED] Cần bật AI Service (http://localhost:8001) và cấu hình GOOGLE_API_KEY "
                "để tạo embedding thật cho học liệu trước khi seed lại."
            )
            raise

        # 6. Đồng bộ toàn bộ Sequence Primary Key trong PostgreSQL
        print("=== ĐỒNG BỘ TOÀN BỘ SEQUENCE PRIMARY KEY POSTGRESQL ===")
        tables = ['courses', 'lessons', 'progress', 'quiz_submissions', 'quiz_questions', 'quizzes', 'users']
        for t in tables:
            try:
                res = await db.execute(text(f"SELECT setval(pg_get_serial_sequence('{t}', 'id'), COALESCE(MAX(id), 1)) FROM {t};"))
                val = res.scalar()
                print(f"[OK] Sequence cho bảng '{t}' đã đồng bộ tới ID: {val}")
            except Exception as e:
                print(f"[NOTE {t}] {e}")
        await db.commit()

        print("=== HOÀN TẤT ĐỒNG BỘ HÓA TOÀN BỘ CƠ SỞ DỮ LIỆU ===")


if __name__ == "__main__":
    asyncio.run(sync_all_data())
