FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# ----------------------------
# Install system dependencies
# ----------------------------
RUN apt-get update && apt-get install -y \
    pkg-config \
    build-essential \
    ffmpeg \
    libavcodec-dev \
    libavdevice-dev \
    libavfilter-dev \
    libavformat-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    libpostproc-dev \
    default-libmysqlclient-dev \
    && rm -rf /var/lib/apt/lists/*

# ----------------------------
# Install Python dependencies
# ----------------------------
COPY requirements.txt .

# Fix PyAV build issue: requires Cython < 3
RUN pip install --upgrade pip
RUN pip install "cython<3"

RUN pip install --no-cache-dir -r requirements.txt

# ----------------------------
# Copy backend project
# ----------------------------
COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 8221

CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
