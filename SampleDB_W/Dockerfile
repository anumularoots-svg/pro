FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3.10 python3.10-distutils python3-pip build-essential \
    libmysqlclient-dev pkg-config \
    libgl1-mesa-glx libglib2.0-0 ffmpeg \
    libavdevice-dev libavformat-dev libavfilter-dev libavcodec-dev \
    libavutil-dev libswscale-dev libswresample-dev libpostproc-dev \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.10 /usr/bin/python
RUN python3.10 -m pip install --upgrade pip

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt   # <<< FIX

COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 8221

CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
