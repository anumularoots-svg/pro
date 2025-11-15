FROM python:3.10-slim

# Install system dependencies for PyAV + FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libavcodec-dev \
    libavformat-dev \
    libavdevice-dev \
    libavutil-dev \
    libavfilter-dev \
    libswscale-dev \
    libswresample-dev \
    pkg-config \
    build-essential \
    python3-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /app

# Copy and install Python deps
COPY requirements.txt requirements.txt
RUN pip install --upgrade pip setuptools wheel cython
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

CMD ["python", "main.py"]
