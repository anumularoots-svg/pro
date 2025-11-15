FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# ---- Install system dependencies ----
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

# ---- Copy only requirements first ----
COPY requirements.txt .

# ---- IMPORTANT: Install stable PyAV wheels (no compiling) ----
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir "av==10.0.0"

# ---- Install remaining requirements ----
RUN pip install --no-cache-dir -r requirements.txt

# ---- Copy backend project ----
COPY . .

EXPOSE 8221

CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
