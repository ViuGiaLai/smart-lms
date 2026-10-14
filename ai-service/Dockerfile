FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libpq-dev \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Cài đặt và khóa setuptools<70 để hỗ trợ pkg_resources
RUN pip install --no-cache-dir --upgrade pip "setuptools<70.0.0" wheel

# Cài đặt openai-whisper với cờ --no-build-isolation để sử dụng setuptools<70
RUN pip install --no-cache-dir --no-build-isolation openai-whisper==20240930

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
