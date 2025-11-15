FROM jrottenberg/ffmpeg:6.0-python3.10-bullseye

ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y \
    default-libmysqlclient-dev \
    build-essential \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip setuptools wheel

# Don't install av manually — wheels will work here
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8221
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8221", "--workers", "3"]
