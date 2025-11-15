### STAGE 1 — FFmpeg + dependencies
FROM jrottenberg/ffmpeg:6.0-ubuntu2204 AS ffmpeg

### STAGE 2 — Python App
FROM python:3.10-ubuntu22.04

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Copy FFmpeg from stage 1
COPY --from=ffmpeg /usr/local /usr/local

# Install build tools + FFmpeg dev libs
RUN apt-get update && apt-get install -y \
    gcc g++ make pkg-config \
    libavcodec-dev libavformat-dev libavdevice-dev \
    libavfilter-dev libswscale-dev libswresample-dev libavutil-dev \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --upgrade pip setuptools wheel

# Install PyAV (prebuilt wheels exist for FFmpeg 6.x)
RUN pip install av --only-binary=:all:

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy your Django project
COPY . .

EXPOSE 8221
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
