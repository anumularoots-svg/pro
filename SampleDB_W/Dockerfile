# backend/Dockerfile
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system deps needed for mysqlclient / opencv / builds
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    default-libmysqlclient-dev \
    pkg-config \
    ffmpeg \
    libsm6 \
    libxext6 \
    libgl1 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --upgrade pip setuptools wheel
RUN pip install --no-cache-dir -r requirements.txt

# Copy app source (assumes manage.py at repo root of backend/)
COPY . .

EXPOSE 8221

# Start with Uvicorn (Django ASGI) or Gunicorn for WSGI
# Use appropriate entry command depending on your Django setup.
CMD ["gunicorn", "SampleDB_W.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
