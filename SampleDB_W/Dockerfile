FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install required system libraries for PyAV + MySQL
RUN apt-get update && apt-get install -y \
    pkg-config \
    ffmpeg \
    libavdevice-dev libavformat-dev libavfilter-dev libavcodec-dev \
    libavutil-dev libswscale-dev libswresample-dev libpostproc-dev \
    default-libmysqlclient-dev build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

EXPOSE 8221

CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
