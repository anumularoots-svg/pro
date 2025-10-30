#!/bin/bash
# Block CUDA at system level

# Create fake CUDA libraries that do nothing
mkdir -p /tmp/fake_cuda
cat > /tmp/fake_cuda_stub.c << 'INNER_EOF'
// Fake CUDA functions that do nothing
int cuInit(unsigned int Flags) { return 1; }  // Return error
int cuDriverGetVersion(int *driverVersion) { return 1; }
int cuDeviceGetCount(int *count) { *count = 0; return 1; }
INNER_EOF

# Compile fake CUDA library
gcc -shared -fPIC /tmp/fake_cuda_stub.c -o /tmp/fake_cuda/libcuda.so.1

# Set library path to use fake CUDA
export LD_LIBRARY_PATH="/tmp/fake_cuda:$LD_LIBRARY_PATH"
export LD_PRELOAD="/tmp/fake_cuda/libcuda.so.1"

# Set all CUDA blocking environment variables
export CUDA_VISIBLE_DEVICES=""
export NVIDIA_VISIBLE_DEVICES="none"
export LIVEKIT_DISABLE_HARDWARE_DECODER=1
export FFMPEG_DISABLE_CUDA=1
export OPENCV_DISABLE_CUDA=1
export LIBAV_DISABLE_CUDA=1
export WEBRTC_FORCE_SOFTWARE_DECODER=1

# Start Django
cd /lanciere/devstorage/sreedhar/SampleDB_W
source venv/bin/activate
python manage.py runserver_plus --cert-file cert.pem --key-file key.pem 0.0.0.0:8221
