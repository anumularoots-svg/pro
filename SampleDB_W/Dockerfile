FROM python:3.10-bullseye

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install FFmpeg + build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    gcc g++ make build-essential \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --upgrade pip setuptools wheel

# Install PyAV from prebuilt wheel (no build, no Cython)
RUN pip install av==10.0.0 --only-binary=:all:

# Copy requirements
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

EXPOSE 8221
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
