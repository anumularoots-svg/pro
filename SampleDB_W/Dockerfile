FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Install FFmpeg + build deps
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libavcodec-dev \
    libavdevice-dev \
    libavfilter-dev \
    libavformat-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    libpostproc-dev \
    build-essential \
    pkg-config \
    default-libmysqlclient-dev \
    && rm -rf /var/lib/apt/lists/*

# Install correct PyAV build deps
RUN pip install --upgrade pip setuptools wheel

# CRITICAL: lock Cython to PyAV-compatible version
RUN pip install "cython==0.29.36"

# Copy requirements
COPY requirements.txt .

# Install requirements
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

EXPOSE 8221
ENV PYTHONUNBUFFERED=1

CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
