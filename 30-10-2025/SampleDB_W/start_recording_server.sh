#!/bin/bash

# Completely disable NVIDIA/CUDA
export CUDA_VISIBLE_DEVICES=""
export NVIDIA_VISIBLE_DEVICES="none"
export NVIDIA_DRIVER_CAPABILITIES=""
export CUDA_DEVICE_ORDER="PCI_BUS_ID"

# LiveKit specific disables
export LIVEKIT_DISABLE_HARDWARE_DECODER=1
export WEBRTC_DISABLE_H264_HARDWARE_DECODER=1
export WEBRTC_FORCE_SOFTWARE_DECODER=1
export LIVEKIT_FORCE_SOFTWARE_ONLY=1

# Activate virtual environment
source venv/bin/activate

# Start Django
python manage.py runserver_plus --cert-file cert.pem --key-file key.pem 0.0.0.0:8221
