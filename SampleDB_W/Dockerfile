FROM jrottenberg/ffmpeg:6.0-python3.10-slim

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# -------- Install build tools + MySQL libs --------
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    build-essential \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# -------- Copy requirements --------
COPY requirements.txt .

# -------- Install Python deps --------
# PyAV installs cleanly on this image (precompiled wheels)
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

RUN pip install --no-cache-dir -r requirements.txt

# -------- Copy backend --------
COPY . .

EXPOSE 8221

CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
