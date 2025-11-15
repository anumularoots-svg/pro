FROM jrottenberg/ffmpeg:6.1-ubuntu2204 as ffmpeg

FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Copy ffmpeg binaries from first image
COPY --from=ffmpeg /usr/local /usr/local

# Install OS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ make build-essential pkg-config \
    libavformat-dev libavcodec-dev libavdevice-dev \
    libavfilter-dev libavutil-dev libswscale-dev libswresample-dev \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --upgrade pip setuptools wheel cython

# Copy requirements
COPY requirements.txt .

# IMPORTANT: Install PyAV with version that works
RUN pip install --no-cache-dir av==10.0.0 --verbose || pip install av==9.2.0

# Install remaining dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy your project
COPY . .

EXPOSE 8221
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
