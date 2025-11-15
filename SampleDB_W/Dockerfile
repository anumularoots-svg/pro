FROM python:3.10-bullseye

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install FFmpeg 6.x (works with av >= 12)
RUN apt-get update && apt-get install -y \
    software-properties-common && \
    add-apt-repository -y ppa:savoury1/ffmpeg6 && \
    apt-get update && apt-get install -y \
    ffmpeg \
    gcc g++ make pkg-config \
    libavcodec-dev libavformat-dev libavdevice-dev libavfilter-dev \
    libswscale-dev libswresample-dev libavutil-dev \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --upgrade pip setuptools wheel

# Install PyAV (latest available)
RUN pip install av --only-binary=:all:

# Install remaining requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

EXPOSE 8221
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
