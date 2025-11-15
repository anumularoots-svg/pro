# Use stable Python base image
FROM python:3.10-slim

# Prevent Python from writing .pyc files & enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set working directory
WORKDIR /app

# Install system dependencies required for most Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Expose backend port
EXPOSE 8000

# Command to start FastAPI app (update main:app if needed)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
