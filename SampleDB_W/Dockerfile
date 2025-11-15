FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install OS dependencies + FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    libavfilter-dev \
    gcc \
    g++ \
    make \
    build-essential \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --upgrade pip setuptools wheel

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy your project
COPY . .

EXPOSE 8221
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
