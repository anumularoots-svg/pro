FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# ---- System Dependencies ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev python3-distutils \
    ffmpeg libsm6 libxext6 libgl1-mesa-glx libglib2.0-0 \
    libavformat-dev libavcodec-dev libavdevice-dev libavfilter-dev \
    libswscale-dev libswresample-dev libavutil-dev \
    build-essential pkg-config git wget curl \
    unixodbc-dev \
    && rm -rf /var/lib/apt/lists/*

# ---- Upgrade pip ----
RUN pip3 install --upgrade pip setuptools wheel

# ---- Install Python Dependencies ----
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# ---- Copy Project Files ----
COPY . .

EXPOSE 8221
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
