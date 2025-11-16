FROM nvidia/cuda:12.6.0-devel-ubuntu22.04

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    default-libmysqlclient-dev \
    pkg-config \
    ffmpeg \
    ca-certificates \
    python3.10 \
    python3.10-dev \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN python3.10 -m pip install --upgrade pip setuptools wheel

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Expose Django port
EXPOSE 8000

# Start Django server
CMD ["python3", "manage.py", "runserver", "0.0.0.0:8000"]
