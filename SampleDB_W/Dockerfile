FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3.11 python3-pip build-essential libmysqlclient-dev \
    libgl1-mesa-glx libglib2.0-0 ffmpeg \
    pkg-config \
    libavdevice-dev libavformat-dev libavfilter-dev libavcodec-dev \
    libavutil-dev libswscale-dev libswresample-dev libpostproc-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python3.11 -m pip install --upgrade pip

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 8221

CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
