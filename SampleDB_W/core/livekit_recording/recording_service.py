# Add this at the very top of your recording_service.py file, before any other imports
import os

# IMMEDIATELY set comprehensive CUDA blocking for LiveKit — but KEEP GPU free for FFmpeg
os.environ.update({
    # ===== KEEP THESE (LiveKit must stay on CPU for stability) =====
    'LIVEKIT_FORCE_SOFTWARE_ONLY': '1',
    'OPENCV_DISABLE_CUDA': '1',  # OpenCV stays on CPU
    'WEBRTC_FORCE_SOFTWARE_RENDERING': '1',
    'WEBRTC_FORCE_SOFTWARE_DECODER': '1',
    'WEBRTC_FORCE_SOFTWARE_DECODING': '1',
    'LIVEKIT_DISABLE_HARDWARE_DECODER': '1',
    'LIVEKIT_FORCE_SOFTWARE_DECODER': '1',
    'LIVEKIT_SOFTWARE_ONLY': '1',
    'OPENCV_VIDEOIO_PRIORITY_FFMPEG': '0',

    # ===== FIXED: DO NOT DISABLE GPU GLOBALLY =====
    # 'LIVEKIT_DISABLE_GPU': '1',   # ❌ remove or comment this line
    'LIVEKIT_DISABLE_GPU': '0',     # ✅ allow GPU for FFmpeg (NVDEC/NVENC)

    # ===== GPU context ordering =====
    'CUDA_VISIBLE_DEVICES': '0',
    'CUDA_DEVICE_ORDER': 'PCI_BUS_ID',

    # ===== KEEP THESE (Logging and SSL) =====
    'LIVEKIT_LOG_LEVEL': 'error',
    'RUST_LOG': 'error',
    'LIVEKIT_DISABLE_STATS': '1',
    'LIVEKIT_DISABLE_VERBOSE_LOGGING': '1',
    'PYTHONHTTPSVERIFY': '0',
    'CURL_CA_BUNDLE': '',
    'REQUESTS_CA_BUNDLE': '',
    'SSL_CERT_FILE': '',
    'SSL_VERIFY': 'false',
    'NODE_TLS_REJECT_UNAUTHORIZED': '0'
})

# Additional CUDA prevention at ctypes level
try:
    import ctypes
    import ctypes.util
    
    original_find_library = ctypes.util.find_library
    
    def patched_find_library(name):
        if name and any(cuda_lib in name.lower() for cuda_lib in ['cuda', 'nvidia', 'nvcuda', 'nvrtc']):
            return None
        return original_find_library(name)
    
    ctypes.util.find_library = patched_find_library
    
except Exception as e:
    print(f"Warning: Could not patch CUDA library loading: {e}")

# Now safe to do other imports
from core.WebSocketConnection import enhanced_logging_config
import asyncio
import threading
import time
import logging
import weakref
from functools import wraps
import json
import tempfile
from datetime import datetime, timedelta
from typing import Dict, Optional, List, Tuple
import subprocess
from pathlib import Path
import signal
import queue
from concurrent.futures import ThreadPoolExecutor, as_completed
import cv2
import numpy as np
from PIL import Image
import ssl
import wave
import struct
from collections import deque
import math

# ADD THIS AT THE TOP (after imports):
import boto3
import io

# Configure S3
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET", "connectly-storage")

s3_client = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION
)

S3_FOLDERS = {
    "videos": os.getenv("S3_FOLDER_VIDEOS", "videos"),
    "recordings_temp": os.getenv("S3_FOLDER_RECORDINGS_TEMP", "recordings_temp")
}

# Configure SSL to trust self-signed certificates BEFORE importing LiveKit
def configure_ssl_bypass():
    """Configure SSL to accept self-signed certificates"""
    try:
        import ssl
        import urllib3
        from urllib3.exceptions import InsecureRequestWarning
        
        # Disable SSL warnings
        urllib3.disable_warnings(InsecureRequestWarning)
        
        # Create unverified SSL context
        ssl._create_default_https_context = ssl._create_unverified_context
        
        # Set additional environment variables for Rust/WebRTC
        os.environ.update({
            'LIVEKIT_ACCEPT_INVALID_CERTS': '1',
            'LIVEKIT_SKIP_CERT_VERIFICATION': '1',
            'LIVEKIT_DISABLE_SSL_VERIFICATION': '1',
            'RUSTLS_DANGEROUS_INSECURE_CLIENT': '1',
            'RUST_TLS_DANGEROUS_DISABLE_VERIFICATION': '1',
            'WEBRTC_IGNORE_SSL_ERRORS': '1',
            'WEBSOCKET_SSL_VERIFY': 'false'
        })
        
        logging.info("✅ SSL bypass configured for self-signed certificates")
        return True
        
    except Exception as e:
        logging.error(f"❌ Failed to configure SSL bypass: {e}")
        return False

# Configure SSL BEFORE importing LiveKit
configure_ssl_bypass()

# Force LiveKit to use a more compatible event loop policy
if hasattr(asyncio, 'WindowsSelectorEventLoopPolicy'):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
elif hasattr(asyncio, 'DefaultEventLoopPolicy'):
    asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())

# Patch asyncio to handle closed loop errors more gracefully
original_put_nowait = getattr(asyncio.Queue, 'put_nowait', None)

def safe_put_nowait(self, item):
    """Safe version of put_nowait that handles closed loops"""
    try:
        if hasattr(asyncio.Queue, '_put_nowait_original'):
            return self._put_nowait_original(item)
        else:
            return self._put_nowait(item)
    except RuntimeError as e:
        if "Event loop is closed" in str(e):
            pass
        else:
            raise

if original_put_nowait and not hasattr(asyncio.Queue, '_put_nowait_original'):
    asyncio.Queue._put_nowait_original = original_put_nowait
    asyncio.Queue.put_nowait = safe_put_nowait

from pymongo import MongoClient
from django.db import connection
from django.conf import settings

try:
    from livekit import api, rtc
    import jwt
    LIVEKIT_SDK_AVAILABLE = True
    logging.info("✅ LiveKit SDK loaded successfully")
except ImportError:
    LIVEKIT_SDK_AVAILABLE = False
    logging.error("❌ LiveKit SDK not available. Install with: pip install livekit")

logger = logging.getLogger('recording_service_module')

def setup_livekit_logging():
    """Set up logging to reduce LiveKit noise"""
    livekit_loggers = [
        'livekit',
        'livekit.rtc',
        'livekit.api',
        'livekit_ffi'
    ]
    
    for logger_name in livekit_loggers:
        lk_logger = logging.getLogger(logger_name)
        lk_logger.setLevel(logging.ERROR)
        
        class EventLoopErrorFilter(logging.Filter):
            def filter(self, record):
                message = record.getMessage()
                return not ("Event loop is closed" in message or 
                          "error putting to queue" in message)
        
        lk_logger.addFilter(EventLoopErrorFilter())

setup_livekit_logging()

class LiveKitEventLoopManager:
    """Manages LiveKit event loops to prevent 'Event loop is closed' errors"""
    
    def __init__(self):
        self._active_loops = weakref.WeakSet()
        self._cleanup_locks = {}
        self._shutdown_event = threading.Event()
        
    def register_loop(self, loop, identifier):
        """Register a loop for management"""
        self._active_loops.add(loop)
        self._cleanup_locks[identifier] = threading.Lock()
        
    def safe_run_until_complete(self, loop, coro, timeout=30, identifier=None):
        """Run coroutine with timeout and proper error handling"""
        if identifier and identifier in self._cleanup_locks:
            with self._cleanup_locks[identifier]:
                return self._run_with_timeout(loop, coro, timeout)
        else:
            return self._run_with_timeout(loop, coro, timeout)
    
    def _run_with_timeout(self, loop, coro, timeout):
        """Internal method to run coroutine with timeout"""
        try:
            if loop.is_closed():
                return None
                
            task = asyncio.ensure_future(coro, loop=loop)
            return loop.run_until_complete(
                asyncio.wait_for(task, timeout=timeout)
            )
            
        except asyncio.TimeoutError:
            logger.warning(f"Operation timed out after {timeout}s")
            return None
        except RuntimeError as e:
            if "Event loop is closed" in str(e):
                logger.debug("Event loop was already closed - this is expected during cleanup")
                return None
            raise
        except Exception as e:
            logger.warning(f"Operation failed: {e}")
            return None
    
    def force_cleanup_loop(self, loop, identifier=None):
        """Force cleanup of a loop with maximum effort"""
        if not loop or loop.is_closed():
            return
            
        try:
            if identifier and identifier in self._cleanup_locks:
                with self._cleanup_locks[identifier]:
                    self._do_force_cleanup(loop)
            else:
                self._do_force_cleanup(loop)
                
        except Exception as e:
            logger.warning(f"Force cleanup error: {e}")
        finally:
            if identifier and identifier in self._cleanup_locks:
                del self._cleanup_locks[identifier]
    
    def cleanup_all_loops(self):
        """Cleanup all managed loops"""
        try:
            logger.info("Cleaning up all event loops...")
            for loop in list(self._active_loops):
                try:
                    if not loop.is_closed():
                        self._do_force_cleanup(loop)
                except:
                    pass
            
            self._active_loops.clear()
            self._cleanup_locks.clear()
            logger.info("All event loops cleaned up")
        except Exception as e:
            logger.warning(f"Error during cleanup_all_loops: {e}")
    
    def _do_force_cleanup(self, loop):
        """Perform the actual force cleanup"""
        try:
            if not loop.is_closed():
                pending = asyncio.all_tasks(loop)
                if pending:
                    for task in pending:
                        if not task.done():
                            task.cancel()
                    
                    try:
                        loop.run_until_complete(
                            asyncio.wait_for(
                                asyncio.gather(*pending, return_exceptions=True),
                                timeout=5.0
                            )
                        )
                    except:
                        pass
            
            time.sleep(2.0)
            
            if not loop.is_closed():
                loop.close()
                
        except Exception:
            try:
                if not loop.is_closed():
                    loop.close()
            except:
                pass

loop_manager = LiveKitEventLoopManager()

# ====== ADD THESE TWO NEW CLASSES HERE ======
class S3ChunkUploader:
    """
    Uploads file chunks to S3 using MULTIPART UPLOAD.
    This properly concatenates chunks instead of overwriting.
    """
    
    def __init__(self, bucket: str, s3_key: str, chunk_size_mb: int = 5):
        self.bucket = bucket
        self.s3_key = s3_key
        self.chunk_size = chunk_size_mb * 1024 * 1024  # Convert to bytes
        
        self.last_uploaded_size = 0
        self.total_uploaded = 0
        self.is_uploading = True
        self.upload_thread = None
        self.lock = threading.Lock()
        
        # Multipart upload tracking
        self.multipart_upload_id = None
        self.part_number = 0
        self.uploaded_parts = []  # List of {'ETag': ..., 'PartNumber': ...}
        
        logger.info(f"🚀 S3 Chunk Uploader (Multipart) initialized: {s3_key} ({chunk_size_mb}MB chunks)")
    
    def start_chunk_monitor(self, local_file_path: str):
        """Start background thread to monitor and upload chunks"""
        self.upload_thread = threading.Thread(
            target=self._chunk_upload_loop,
            args=(local_file_path,),
            daemon=False
        )
        self.upload_thread.start()
        logger.info(f"📤 Chunk upload monitor started for: {local_file_path}")
    
    def _chunk_upload_loop(self, local_file_path: str):
        """
        Continuously monitor local file and upload new chunks to S3 using multipart
        """
        try:
            check_interval = 0.5  # Check every 500ms
            last_log_time = time.time()
            
            while self.is_uploading:
                try:
                    # Get current file size
                    if not os.path.exists(local_file_path):
                        time.sleep(check_interval)
                        continue
                    
                    current_size = os.path.getsize(local_file_path)
                    
                    # Check if file grew enough for new chunk
                    if current_size >= self.last_uploaded_size + self.chunk_size:
                        # Upload chunk
                        self.part_number += 1
                        self._upload_chunk_multipart(
                            local_file_path,
                            self.last_uploaded_size,
                            current_size,
                            self.part_number
                        )
                        self.last_uploaded_size = current_size
                    
                    # Log progress every 5 seconds
                    now = time.time()
                    if now - last_log_time >= 5:
                        logger.info(
                            f"📊 Upload progress: {self.total_uploaded / (1024*1024):.1f}MB uploaded, "
                            f"Local file: {current_size / (1024*1024):.1f}MB, "
                            f"Parts: {len(self.uploaded_parts)}"
                        )
                        last_log_time = now
                    
                    time.sleep(check_interval)
                    
                except Exception as e:
                    logger.warning(f"⚠️ Chunk monitor error: {e}")
                    time.sleep(check_interval)
        
        except Exception as e:
            logger.error(f"❌ Chunk upload loop failed: {e}")
        finally:
            logger.info("🛑 Chunk upload monitor stopped")
    
    def _upload_chunk_multipart(self, local_file_path: str, start_byte: int, end_byte: int, part_number: int):
        """Upload a chunk using S3 multipart upload"""
        try:
            # Initiate multipart upload if first chunk
            if self.multipart_upload_id is None:
                response = s3_client.create_multipart_upload(
                    Bucket=self.bucket,
                    Key=self.s3_key
                )
                self.multipart_upload_id = response['UploadId']
                logger.info(f"✅ Initiated multipart upload: {self.multipart_upload_id}")
            
            # Read chunk from local file
            with open(local_file_path, 'rb') as f:
                f.seek(start_byte)
                chunk_data = f.read(end_byte - start_byte)
            
            if not chunk_data:
                return
            
            chunk_size_mb = len(chunk_data) / (1024 * 1024)
            
            # Upload part
            response = s3_client.upload_part(
                Bucket=self.bucket,
                Key=self.s3_key,
                PartNumber=part_number,
                UploadId=self.multipart_upload_id,
                Body=chunk_data
            )
            
            etag = response['ETag']
            part_info = {
                'ETag': etag,
                'PartNumber': part_number
            }
            self.uploaded_parts.append(part_info)
            
            with self.lock:
                self.total_uploaded += len(chunk_data)
            
            logger.info(
                f"✅ Part {part_number} uploaded: {chunk_size_mb:.1f}MB "
                f"(Total: {self.total_uploaded / (1024*1024):.1f}MB) | ETag: {etag[:20]}..."
            )
        
        except Exception as e:
            logger.error(f"❌ Part {part_number} upload failed: {e}")
    
    def stop_and_upload_final(self, local_file_path: str):
        """Stop monitoring, upload final chunk, and complete multipart upload"""
        self.is_uploading = False
        
        # Wait for upload thread to finish
        if self.upload_thread and self.upload_thread.is_alive():
            logger.info("⏳ Waiting for chunk upload thread to finish...")
            self.upload_thread.join(timeout=60)
        
        # Upload final chunk if any remaining data
        try:
            if os.path.exists(local_file_path):
                current_size = os.path.getsize(local_file_path)
                
                if current_size > self.last_uploaded_size:
                    logger.info(f"📤 Uploading final chunk: {current_size - self.last_uploaded_size} bytes")
                    self.part_number += 1
                    self._upload_chunk_multipart(
                        local_file_path,
                        self.last_uploaded_size,
                        current_size,
                        self.part_number
                    )
                
                logger.info(f"✅ All chunks uploaded: {self.total_uploaded / (1024*1024):.1f}MB total")
        except Exception as e:
            logger.error(f"❌ Final chunk upload failed: {e}")
        
        # Complete multipart upload
        try:
            if self.multipart_upload_id and len(self.uploaded_parts) > 0:
                logger.info(f"🔗 Completing multipart upload with {len(self.uploaded_parts)} parts...")
                
                # Sort parts by part number
                self.uploaded_parts.sort(key=lambda x: x['PartNumber'])
                
                response = s3_client.complete_multipart_upload(
                    Bucket=self.bucket,
                    Key=self.s3_key,
                    UploadId=self.multipart_upload_id,
                    MultipartUpload={
                        'Parts': self.uploaded_parts
                    }
                )
                
                logger.info(f"✅ Multipart upload completed: {response['Key']}")
                logger.info(f"📊 Final file ETag: {response['ETag']}")
            else:
                logger.warning("⚠️ No multipart upload to complete")
        
        except Exception as e:
            logger.error(f"❌ Multipart upload completion failed: {e}")
            # Try to abort on error
            try:
                if self.multipart_upload_id:
                    s3_client.abort_multipart_upload(
                        Bucket=self.bucket,
                        Key=self.s3_key,
                        UploadId=self.multipart_upload_id
                    )
                    logger.info(f"🛑 Aborted multipart upload")
            except Exception as abort_error:
                logger.warning(f"⚠️ Could not abort multipart upload: {abort_error}")

class StreamingRecordingWithChunks:
    """Recording with streaming chunk uploads to S3"""
    
    def __init__(self, meeting_id: str):
        self.meeting_id = meeting_id
        self.s3_prefix = f"{S3_FOLDERS['recordings_temp']}/{meeting_id}"
        
        # Temp file for FFmpeg output
        self.temp_video_fd, self.temp_video_path = tempfile.mkstemp(
            suffix='.avi',
            prefix=f'recording_{meeting_id}_'
        )
        os.close(self.temp_video_fd)
        
        self.s3_video_key = f"{self.s3_prefix}/raw_video_{meeting_id}.avi"
        self.chunk_uploader = None
        
        # Video frames and audio
        self.video_frames = []
        self.raw_audio_data = []
        self.start_time = None
        self.start_perf_counter = None
        self.is_recording = False
        self.frame_lock = threading.Lock()
        self.audio_lock = threading.Lock()
        
        # Audio tracking
        self.active_audio_tracks = {}
        self.participant_audio_buffers = {}
        self.processing_tracks = set()
        
        self.AUDIO_BUFFER_SIZE = 4800
        self.frame_lookup = None
        self.frame_lookup_built = False
        self.TARGET_FPS = 24.0
        
        logger.info(f"✅ Streaming Recorder Initialized - Prefix: {self.s3_prefix}")
        logger.info(f"📝 Temp file: {self.temp_video_path}")
    
    def start_recording(self):
        """Start recording and chunk uploader"""
        self.start_time = time.time()
        self.start_perf_counter = time.perf_counter()
        self.is_recording = True
        self.video_frames = []
        self.raw_audio_data = []
        self.frame_lookup = None
        self.frame_lookup_built = False
        
        # Start chunk uploader
        self.chunk_uploader = S3ChunkUploader(
            bucket=AWS_S3_BUCKET,
            s3_key=self.s3_video_key,
            chunk_size_mb=5  # 5MB chunks
        )
        self.chunk_uploader.start_chunk_monitor(self.temp_video_path)
        
        logger.info("🎬 Recording started with streaming chunk upload to S3")
    
    def stop_recording(self):
        """Stop recording and finalize uploads"""
        self.is_recording = False
        
        with self.audio_lock:
            if hasattr(self, 'participant_audio_buffers'):
                for participant_id, participant_buffer in self.participant_audio_buffers.items():
                    if len(participant_buffer['buffer']) > 0:
                        buffer_data = participant_buffer['buffer'].copy()
                        self.raw_audio_data.append({
                            'timestamp': participant_buffer['buffer_start_time'],
                            'samples': buffer_data,
                            'participant': participant_id
                        })
                
                self.participant_audio_buffers = {}
            
            self.active_audio_tracks = {}
        
        logger.info("⏹️ Recording stopped")
    
    def add_video_frame(self, frame, source_type="video"):
        """Add video frame with HIGH-PRECISION timestamp"""
        if not self.is_recording:
            return
            
        timestamp = time.perf_counter() - self.start_perf_counter
        
        with self.frame_lock:
            class TimestampedFrame:
                def __init__(self, frame, timestamp, source_type="placeholder"):
                    self.frame = frame
                    self.timestamp = timestamp
                    self.source_type = source_type
                    self.capture_time = time.perf_counter()
            
            timestamped_frame = TimestampedFrame(frame, timestamp, source_type)
            self.video_frames.append(timestamped_frame)
            
            if source_type in ["video", "screen_share"] and frame is not None:
                self.current_screen_frame = frame.copy() if hasattr(self, 'current_screen_frame') else frame
    
    def add_audio_samples(self, samples, participant_id="unknown", track_id=None, track_source=None):
        """Add audio samples with FIXED-SIZE buffering for smooth playback"""
        if not self.is_recording or not samples:
            return
        
        with self.audio_lock:
            if track_source:
                track_key = f"{participant_id}_{track_source}"
            else:
                track_key = f"{participant_id}_microphone"
            
            if track_id:
                if track_key in self.active_audio_tracks:
                    if self.active_audio_tracks[track_key] != track_id:
                        return
                else:
                    self.active_audio_tracks[track_key] = track_id
                    source_name = track_source or "microphone"
                    logger.info(f"✅ Using {source_name} audio track {track_id} for {participant_id}")
            
            timestamp = time.perf_counter() - self.start_perf_counter
            
            if track_key not in self.participant_audio_buffers:
                self.participant_audio_buffers[track_key] = {
                    'buffer': [],
                    'buffer_start_time': timestamp,
                    'participant': participant_id,
                    'source': track_source or 'microphone'
                }
            
            participant_buffer = self.participant_audio_buffers[track_key]
            
            if isinstance(samples, list):
                participant_buffer['buffer'].extend(samples)
            else:
                participant_buffer['buffer'].extend(samples.tolist() if hasattr(samples, 'tolist') else list(samples))
            
            buffer_size = len(participant_buffer['buffer'])
            
            if buffer_size >= self.AUDIO_BUFFER_SIZE:
                chunk_to_flush = participant_buffer['buffer'][:self.AUDIO_BUFFER_SIZE]
                
                self.raw_audio_data.append({
                    'timestamp': participant_buffer['buffer_start_time'],
                    'samples': chunk_to_flush,
                    'participant': participant_id,
                    'source': track_source or 'microphone'
                })
                
                participant_buffer['buffer'] = participant_buffer['buffer'][self.AUDIO_BUFFER_SIZE:]
                
                chunk_duration = self.AUDIO_BUFFER_SIZE / (48000 * 2)
                participant_buffer['buffer_start_time'] += chunk_duration
    
    def get_current_screen_frame(self):
        """Get current screen frame for placeholder generation"""
        with self.frame_lock:
            if hasattr(self, 'current_screen_frame'):
                return self.current_screen_frame.copy() if self.current_screen_frame is not None else None
            return None
    
    def create_placeholder_frame(self, frame_number, timestamp):
        """Create placeholder frame with current screen content or default"""
        current_screen = self.get_current_screen_frame()
        
        if current_screen is not None:
            return current_screen
        else:
            frame = np.zeros((720, 1280, 3), dtype=np.uint8)
            
            for y in range(720):
                intensity = int(30 + (y / 720) * 60)
                frame[y, :] = [intensity, intensity, intensity]
            
            cv2.putText(frame, f"Recording: Frame {frame_number}", 
                       (400, 360), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2)
            cv2.putText(frame, f"Time: {timestamp:.1f}s", 
                       (400, 420), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (200, 200, 200), 2)
            
            return frame
    
    def _build_optimized_frame_lookup(self):
        """⭐ FIXED: Build frame lookup using TARGET_FPS (24) instead of hardcoded 30"""
        logger.info("🔨 Building optimized frame lookup index...")
        start_build = time.time()
        
        # Sort frames by timestamp for better cache locality
        sorted_frames = sorted(self.video_frames, key=lambda f: f.timestamp)
        
        # Create multi-resolution lookup table
        self.frame_lookup = {}
        self.last_real_frame = None
        
        # ⭐ Build index using TARGET_FPS (24 FPS) - CRITICAL FIX
        for frame_obj in sorted_frames:
            frame_key = int(frame_obj.timestamp * self.TARGET_FPS)  # Was: * 30
            
            # Store real frames (not placeholders)
            if frame_obj.source_type in ["video", "screen_share"]:
                if frame_key not in self.frame_lookup:
                    self.frame_lookup[frame_key] = frame_obj.frame
                self.last_real_frame = frame_obj.frame
        
        build_time = time.time() - start_build
        logger.info(f"✅ Frame index built: {len(self.frame_lookup)} entries in {build_time:.2f}s")
        logger.info(f"📊 Index size: ~{len(self.frame_lookup) * 8 / 1024 / 1024:.1f}MB in RAM")
        
        self.frame_lookup_built = True
    
    def _find_best_frame_fast(self, target_timestamp, frame_interval):
        """Find best matching frame WITHOUT repeating frames"""
        if not self.frame_lookup_built:
            return None
        
        frame_key = int(target_timestamp * self.TARGET_FPS)
        
        # Try exact match first
        if frame_key in self.frame_lookup:
            return self.frame_lookup[frame_key]
        
        # Search for closest frame within a WIDER tolerance
        tolerance_frames = max(3, int(frame_interval * self.TARGET_FPS * 3))
        
        closest_frame = None
        min_distance = float('inf')
        
        # Search both directions
        for offset in range(-tolerance_frames, tolerance_frames + 1):
            test_key = frame_key + offset
            if test_key in self.frame_lookup:
                distance = abs(offset)
                if distance < min_distance:
                    min_distance = distance
                    closest_frame = self.frame_lookup[test_key]
        
        # Return closest frame OR None (not self.last_real_frame!)
        return closest_frame
    
    def generate_synchronized_video(self, target_fps=24.0):
        """Generate video with streaming chunk uploads"""
        
        if not self.video_frames and not self.raw_audio_data:
            logger.error("❌ No frames or audio recorded")
            return None, None
        
        self.TARGET_FPS = 24.0
        target_fps = 24.0
        
        max_video_time = max([f.timestamp for f in self.video_frames]) if self.video_frames else 0
        max_audio_time = max([d['timestamp'] for d in self.raw_audio_data]) if self.raw_audio_data else 0
        recording_duration = max(max_video_time, max_audio_time, 1.0)
        
        logger.info(f"🎬 Generating video: {recording_duration:.1f}s at {target_fps} FPS")
        logger.info(f"📊 Total video frames: {len(self.video_frames)}")
        logger.info(f"📊 Total audio chunks: {len(self.raw_audio_data)}")
        
        frame_interval = 1.0 / target_fps
        total_frames = int(recording_duration * target_fps)
        
        audio_s3_key = f"{self.s3_prefix}/raw_audio_{self.meeting_id}.wav"
        
        # Generate video with streaming chunks
        return self._generate_video_with_streaming_chunks(
            total_frames, frame_interval, audio_s3_key, recording_duration, target_fps
        )
    
    def _generate_video_with_streaming_chunks(self, total_frames, frame_interval, 
                                             audio_s3_key, recording_duration, target_fps):
        """
        Generate video with FFmpeg writing to temp file
        Chunks are uploaded to S3 as they arrive
        """
        try:
            if not self.frame_lookup_built:
                self._build_optimized_frame_lookup()
            
            # Check GPU availability
            nvenc_available = False
            try:
                check_nvenc = subprocess.run(
                    ['ffmpeg', '-h', 'encoder=h264_nvenc'],
                    capture_output=True, text=True, timeout=5
                )
                nvenc_available = (check_nvenc.returncode == 0)
            except Exception:
                nvenc_available = False
            
            # Build FFmpeg command to write to LOCAL temp file
            base_ffmpeg_cmd = [
                'ffmpeg', '-y',
                '-f', 'rawvideo',
                '-vcodec', 'rawvideo',
                '-pix_fmt', 'bgr24',
                '-s', '1280x720',
                '-r', str(target_fps),
                '-i', '-'
            ]
            
            if nvenc_available:
                logger.info(f"🚀 GPU ACCELERATION - NVENC CBR @ {target_fps} FPS")
                base_ffmpeg_cmd += [
                    '-c:v', 'h264_nvenc',
                    '-preset', 'p5',
                    '-rc', 'cbr',
                    '-b:v', '2M',
                    '-maxrate', '2.5M',
                    '-bufsize', '15M',
                    '-r', str(target_fps),
                    '-pix_fmt', 'yuv420p',
                    '-f', 'avi',
                    self.temp_video_path  # ✅ Write to temp file
                ]
            else:
                logger.info(f"ℹ️ CPU Fallback - libx264 @ {target_fps} FPS")
                base_ffmpeg_cmd += [
                    '-c:v', 'libx264',
                    '-preset', 'medium',
                    '-crf', '21',
                    '-r', str(target_fps),
                    '-pix_fmt', 'yuv420p',
                    '-f', 'avi',
                    self.temp_video_path  # ✅ Write to temp file
                ]
            
            # Setup environment
            ffmpeg_env = os.environ.copy()
            ffmpeg_env['CUDA_VISIBLE_DEVICES'] = '0'
            ffmpeg_env['CUDA_DEVICE_ORDER'] = 'PCI_BUS_ID'
            ffmpeg_env.pop('NVIDIA_DISABLE', None)
            
            logger.info(f"🎯 Starting FFmpeg to temp file: {self.temp_video_path}")
            logger.info(f"📤 Chunks will stream to S3: {self.s3_video_key}")
            
            # Start FFmpeg process
            process = subprocess.Popen(
                base_ffmpeg_cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=ffmpeg_env,
                bufsize=10485760
            )
            
            logger.info(f"🎞️ FFmpeg started - streaming chunks to S3 in background")
            
            start_time = time.time()
            total_frames_written = 0
            last_log_time = start_time
            
            # Stream frames to FFmpeg
            for frame_num in range(total_frames):
                target_timestamp = frame_num * frame_interval
                best_frame = self._find_best_frame_fast(target_timestamp, frame_interval)
                
                if best_frame is None:
                    best_frame = self.create_placeholder_frame(frame_num, target_timestamp)
                
                if best_frame.shape[:2] != (720, 1280):
                    best_frame = cv2.resize(best_frame, (1280, 720))
                
                try:
                    process.stdin.write(best_frame.tobytes())
                    total_frames_written += 1
                    
                    if frame_num % 500 == 0:
                        try:
                            process.stdin.flush()
                        except Exception:
                            pass
                    
                    now = time.time()
                    if now - last_log_time >= 2:
                        elapsed = now - start_time
                        fps = total_frames_written / elapsed if elapsed > 0 else 0
                        progress = (frame_num / total_frames) * 100
                        eta = (total_frames - frame_num) / fps / 60 if fps > 0 else 0
                        logger.info(
                            f"Progress: {progress:.1f}% | Speed: {fps:.0f} fps | ETA: {eta:.1f} min | "
                            f"Chunks uploaded: {self.chunk_uploader.total_uploaded / (1024*1024):.1f}MB"
                        )
                        last_log_time = now
                
                except (BrokenPipeError, IOError) as e:
                    logger.error(f"❌ Pipe write error at frame {frame_num}: {e}")
                    break
            
            logger.info("🔚 Closing FFmpeg stream...")
            try:
                process.stdin.close()
                process.wait(timeout=60)
            except Exception as e:
                logger.warning(f"FFmpeg finalization issue: {e}")
            
            # Stop chunk uploader and finalize uploads
            logger.info("⏳ Finalizing chunk uploads...")
            self.chunk_uploader.stop_and_upload_final(self.temp_video_path)
            
            # Verify final file in S3
            try:
                response = s3_client.head_object(Bucket=AWS_S3_BUCKET, Key=self.s3_video_key)
                video_size = response['ContentLength']
                logger.info(f"✅ Video complete in S3: {video_size:,} bytes - {self.s3_video_key}")
            except Exception as e:
                logger.error(f"❌ Video verification failed: {e}")
                return None, None
            
            # Clean up temp file
            try:
                os.remove(self.temp_video_path)
                logger.info(f"🧹 Deleted temp file: {self.temp_video_path}")
            except Exception as e:
                logger.warning(f"⚠️ Could not delete temp file: {e}")
            
            # Generate audio to S3
            self._generate_smooth_audio_to_s3(audio_s3_key, recording_duration)
            
            return self.s3_video_key, audio_s3_key
        
        except Exception as e:
            logger.error(f"❌ Video generation failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None, None
    
    def _generate_smooth_audio_to_s3(self, audio_s3_key, duration):
        """Generate audio and upload to S3"""
        try:
            sample_rate = 48000
            total_samples = int(duration * sample_rate * 2)
            
            if not self.raw_audio_data or len(self.raw_audio_data) == 0:
                logger.warning("No audio data available, creating silent audio in S3")
                self._create_silent_audio_s3(audio_s3_key, duration)
                return
            
            final_audio = np.zeros(total_samples, dtype=np.float64)
            sample_count = np.zeros(total_samples, dtype=np.int32)
            
            logger.info(f"Processing {len(self.raw_audio_data)} audio chunks with sub-sample precision")
            
            sorted_audio = sorted(self.raw_audio_data, key=lambda x: x['timestamp'])
            
            successful_chunks = 0
            skipped_chunks = 0
            participants_detected = set()
            audio_sources = {'microphone': 0, 'screen_share_audio': 0}
            
            for audio_chunk in sorted_audio:
                timestamp = audio_chunk['timestamp']
                samples = audio_chunk['samples']
                participant = audio_chunk.get('participant', 'unknown')
                source = audio_chunk.get('source', 'microphone')
                
                participants_detected.add(participant)
                audio_sources[source] = audio_sources.get(source, 0) + 1
                
                if not samples or len(samples) == 0:
                    skipped_chunks += 1
                    continue
                
                try:
                    if isinstance(samples, list):
                        audio_data = np.array(samples, dtype=np.float64)
                    else:
                        audio_data = samples.astype(np.float64)
                    
                    if len(audio_data) == 0:
                        skipped_chunks += 1
                        continue
                    
                    if len(audio_data) % 2 != 0:
                        audio_data = np.append(audio_data, 0)
                    
                    start_sample_float = timestamp * sample_rate * 2
                    start_sample = int(start_sample_float)
                    sub_sample_offset = start_sample_float - start_sample
                    
                    if start_sample >= total_samples:
                        skipped_chunks += 1
                        continue
                    
                    end_sample = min(start_sample + len(audio_data), total_samples)
                    audio_length = end_sample - start_sample
                    
                    if audio_length > 0:
                        if sub_sample_offset > 0.01:
                            interpolated = audio_data[:audio_length].copy()
                            if audio_length > 1:
                                interpolated[1:] = (1 - sub_sample_offset) * audio_data[:audio_length-1] + \
                                                sub_sample_offset * audio_data[1:audio_length]
                            final_audio[start_sample:end_sample] += interpolated
                        else:
                            final_audio[start_sample:end_sample] += audio_data[:audio_length]
                        
                        sample_count[start_sample:end_sample] += 1
                        successful_chunks += 1
                    else:
                        skipped_chunks += 1
                        
                except Exception as chunk_error:
                    logger.debug(f"Skipping audio chunk: {chunk_error}")
                    skipped_chunks += 1
                    continue
            
            logger.info(f"Audio: {successful_chunks} chunks processed, {skipped_chunks} skipped")
            logger.info(f"👥 Participants: {len(participants_detected)}")
            logger.info(f"🎤 Sources: {audio_sources['microphone']} mic, {audio_sources.get('screen_share_audio', 0)} screen")
            
            max_amplitude_before = np.max(np.abs(final_audio))
            if max_amplitude_before == 0:
                logger.warning("No audio signal detected")
                self._create_silent_audio_s3(audio_s3_key, duration)
                return
            
            overlap_mask = sample_count > 1
            if np.any(overlap_mask):
                final_audio[overlap_mask] = final_audio[overlap_mask] / np.sqrt(sample_count[overlap_mask])
                max_overlap = np.max(sample_count)
                overlap_percentage = (np.sum(overlap_mask) / len(final_audio)) * 100
                logger.info(f"🎵 Audio mixing: {max_overlap} max speakers, {overlap_percentage:.1f}% overlap")
            
            max_amplitude_after = np.max(np.abs(final_audio))
            target_amplitude = 18000.0
            
            if max_amplitude_after > 28000:
                threshold = 20000.0
                ratio = 0.7
                mask_above = np.abs(final_audio) > threshold
                final_audio[mask_above] = np.sign(final_audio[mask_above]) * (
                    threshold + (np.abs(final_audio[mask_above]) - threshold) * ratio
                )
                logger.info(f"🔊 AGC: Soft-knee compression applied")
            elif max_amplitude_after < 8000:
                boost_ratio = target_amplitude / max_amplitude_after
                final_audio = final_audio * boost_ratio
                logger.info(f"🔊 AGC: Boosted {max_amplitude_after:.0f} → {target_amplitude:.0f}")
            elif max_amplitude_after > 20000:
                compression_ratio = 18000.0 / max_amplitude_after
                final_audio = final_audio * compression_ratio
                logger.info(f"🔊 AGC: Gentle compression")
            else:
                logger.info(f"🔊 AGC: Optimal range ({max_amplitude_after:.0f})")
            
            final_audio_int16 = np.clip(final_audio, -32768, 32767).astype(np.int16)
            
            clipped_samples = np.sum((final_audio < -32768) | (final_audio > 32767))
            if clipped_samples > 0:
                clipped_percentage = (clipped_samples / len(final_audio)) * 100
                if clipped_percentage > 0.1:
                    logger.warning(f"⚠️ Audio clipping: {clipped_percentage:.3f}%")
                else:
                    logger.info(f"✅ Minimal clipping: {clipped_percentage:.3f}%")
            else:
                logger.info(f"✅ Perfect audio - no clipping")
            
            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(2)
                wav_file.setsampwidth(2)
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(final_audio_int16.tobytes())
            
            wav_buffer.seek(0)
            audio_bytes = wav_buffer.read()
            
            s3_client.put_object(
                Bucket=AWS_S3_BUCKET,
                Key=audio_s3_key,
                Body=audio_bytes,
                ContentType='audio/wav'
            )
            
            audio_duration = len(final_audio_int16) / (sample_rate * 2)
            file_size = len(audio_bytes)
            final_max = np.max(np.abs(final_audio_int16))
            logger.info(f"✅ Audio uploaded to S3: {audio_duration:.1f}s, {file_size:,} bytes, amplitude: {final_max:.0f}")
            
        except Exception as e:
            logger.error(f"Error generating audio: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            self._create_silent_audio_s3(audio_s3_key, duration)

    def _create_silent_audio_s3(self, audio_s3_key, duration):
        try:
            sample_rate = 48000
            total_samples = int(duration * sample_rate)
            
            silent_audio = np.zeros(total_samples * 2, dtype=np.int16)
            
            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(2)
                wav_file.setsampwidth(2)
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(silent_audio.tobytes())
            
            wav_buffer.seek(0)
            audio_bytes = wav_buffer.read()
            
            s3_client.put_object(
                Bucket=AWS_S3_BUCKET,
                Key=audio_s3_key,
                Body=audio_bytes,
                ContentType='audio/wav'
            )
            
            logger.info(f"Created silent audio in S3: {duration:.1f}s - {audio_s3_key}")
            
        except Exception as e:
            logger.error(f"Error creating silent audio: {e}")

class TimestampedFrame:
    """Frame with HIGH-PRECISION timestamp for proper synchronization"""
    def __init__(self, frame, timestamp, source_type="placeholder"):
        self.frame = frame
        self.timestamp = timestamp  # Use microsecond precision
        self.source_type = source_type
        self.capture_time = time.perf_counter()  # High-resolution capture time
     
class FixedRecordingBot:
    """Fixed recording bot with proper HTTPS/WSS support - NO CHANGES NEEDED"""
    
    def __init__(self, room_url: str, token: str, room_name: str, meeting_id: str,
                 result_queue: queue.Queue, stop_event: threading.Event):
        
        self.room_url = room_url
        self.token = token
        self.room_name = room_name
        self.meeting_id = meeting_id
        # self.output_dir = output_dir
        self.result_queue = result_queue
        self.stop_event = stop_event
        
        self.room = None
        self.is_connected = False
        
        self.stream_recorder = StreamingRecordingWithChunks(meeting_id)  # ✅ Updated!
        
        self.active_video_streams = {}
        self.active_audio_streams = {}
        
        logger.info(f"✅ Fixed Recording Bot initialized for meeting: {meeting_id}")

    async def run_recording(self):
        """Main recording method with proper HTTPS/WSS connection"""
        try:
            self.room = rtc.Room()
            self.room.on("track_subscribed", self._on_track_subscribed)
            self.room.on("track_unsubscribed", self._on_track_unsubscribed)
            self.room.on("connected", self._on_connected)
            self.room.on("disconnected", self._on_disconnected)
            
            logger.info(f"🔗 Attempting WSS connection to: {self.room_url}")
            
            try:
                await asyncio.wait_for(
                    self.room.connect(self.room_url, self.token),
                    timeout=60.0
                )
                logger.info("✅ Connected via WSS successfully")
                
            except Exception as e:
                logger.error(f"❌ WSS connection failed: {e}")
                logger.info("🔄 Trying direct HTTP fallback...")
                
                http_url = "ws://127.0.0.1:8880"
                try:
                    await asyncio.wait_for(
                        self.room.connect(http_url, self.token),
                        timeout=30.0
                    )
                    logger.info("✅ Connected via HTTP fallback successfully")
                except Exception as fallback_error:
                    logger.error(f"❌ HTTP fallback also failed: {fallback_error}")
                    raise Exception("Both WSS and HTTP connections failed")
            
            logger.info("✅ Room connection established")
            self.result_queue.put_nowait((True, None))
            
            await self._start_simple_recording()
            
        except Exception as e:
            logger.error(f"❌ Recording error: {e}")
            try:
                self.result_queue.put_nowait((False, str(e)))
            except:
                pass
        finally:
            await self._finalize()

    async def _start_simple_recording(self):
        """Start simple continuous recording"""
        logger.info("Starting simple continuous recording")
        
        self.stream_recorder.start_recording()
        
        asyncio.create_task(self._placeholder_generation_loop())
        
        while not self.stop_event.is_set():
            await asyncio.sleep(0.1)
        
        self.stream_recorder.stop_recording()
        
        logger.info("Simple recording completed - generating output")

    async def _placeholder_generation_loop(self):
        """MINIMAL placeholder generation - only when NO video at all"""
        frame_count = 0
        TARGET_FPS = 24
        FRAME_INTERVAL = 1.0 / TARGET_FPS
        
        while not self.stop_event.is_set():
            current_time = time.perf_counter() - self.stream_recorder.start_perf_counter if self.stream_recorder.start_perf_counter else 0
            
            # Check if we have ANY real video frames recently
            has_any_video = False
            if self.stream_recorder.video_frames:
                latest_real_frame_time = max([
                    f.timestamp for f in self.stream_recorder.video_frames 
                    if f.source_type in ["video", "screen_share"]
                ], default=0)
                has_any_video = (current_time - latest_real_frame_time) < 2.0  # 2 second timeout
            
            # Only generate placeholder if NO video for 2+ seconds
            if not has_any_video:
                placeholder = self.stream_recorder.create_placeholder_frame(frame_count, current_time)
                self.stream_recorder.add_video_frame(placeholder, "placeholder")
                await asyncio.sleep(FRAME_INTERVAL)
                frame_count += 1
            else:
                # Have video, sleep longer
                await asyncio.sleep(0.5)

    def _on_track_subscribed(self, track, publication, participant):
        """Handle new track subscription with strict duplicate prevention"""
        try:
            if track.sid in self.stream_recorder.processing_tracks:
                logger.debug(f"⏩ Already processing track {track.sid}, skipping")
                return
            
            self.stream_recorder.processing_tracks.add(track.sid)
            
            if track.kind == rtc.TrackKind.KIND_VIDEO:
                existing_video_count = sum(
                    1 for k in self.active_video_streams.keys() 
                    if participant.identity in k
                )
                
                if existing_video_count >= 1:
                    logger.debug(f"⏩ Participant {participant.identity} already has video track")
                    self.stream_recorder.processing_tracks.discard(track.sid)
                    return
                
                task = asyncio.create_task(self._capture_video_stream(track, participant))
                self.active_video_streams[f"video_{participant.identity}_{track.sid}"] = task
                logger.info(f"✅ Started video capture from {participant.identity}")
                
            elif track.kind == rtc.TrackKind.KIND_AUDIO:
                track_source = "microphone"
                try:
                    if hasattr(track, 'source'):
                        if track.source == rtc.TrackSource.SOURCE_SCREEN_SHARE_AUDIO:
                            track_source = "screen_share_audio"
                    
                    if track_source == "microphone" and hasattr(track, 'name'):
                        track_name_lower = track.name.lower()
                        if any(keyword in track_name_lower for keyword in ['screen', 'desktop', 'system', 'share']):
                            track_source = "screen_share_audio"
                except:
                    pass
                
                track_type_prefix = f"audio_{participant.identity}_{track_source}_"
                existing_audio_count = sum(
                    1 for k in self.active_audio_streams.keys() 
                    if k.startswith(track_type_prefix)
                )
                
                if existing_audio_count >= 1:
                    logger.debug(f"⏩ Participant {participant.identity} already has {track_source} track")
                    self.stream_recorder.processing_tracks.discard(track.sid)
                    return
                
                task = asyncio.create_task(
                    self._capture_audio_stream(track, participant, track_source)
                )
                self.active_audio_streams[f"{track_type_prefix}{track.sid}"] = task
                logger.info(f"✅ Started {track_source} capture from {participant.identity}")
                
        except Exception as e:
            logger.error(f"❌ Track subscription error: {e}")
            self.stream_recorder.processing_tracks.discard(track.sid)

    def _on_track_unsubscribed(self, track, publication, participant):
        """Handle track unsubscription with cleanup"""
        try:
            self.stream_recorder.processing_tracks.discard(track.sid)
            
            if track.kind == rtc.TrackKind.KIND_VIDEO:
                for key in list(self.active_video_streams.keys()):
                    if track.sid in key:
                        self.active_video_streams[key].cancel()
                        del self.active_video_streams[key]
                        logger.info(f"Stopped video capture from {participant.identity}")
                        break
                    
            elif track.kind == rtc.TrackKind.KIND_AUDIO:
                for key in list(self.active_audio_streams.keys()):
                    if track.sid in key:
                        self.active_audio_streams[key].cancel()
                        del self.active_audio_streams[key]
                        logger.info(f"Stopped audio capture from {participant.identity}")
                        break
                    
        except Exception as e:
            logger.error(f"Track unsubscription error: {e}")

    async def _capture_video_stream(self, track, participant):
        """Capture video at EXACTLY 24 FPS with precise timestamps"""
        try:
            stream = rtc.VideoStream(track)
            frame_count = 0
            last_capture_time = time.perf_counter()
            TARGET_FPS = 24.0
            MIN_FRAME_INTERVAL = 1.0 / TARGET_FPS  # 0.04166... seconds
            
            # Track actual FPS for logging
            capture_start_time = time.perf_counter()
            
            async for frame_event in stream:
                if self.stop_event.is_set():
                    break
                
                current_time = time.perf_counter()
                time_since_last = current_time - last_capture_time
                
                # ⚡ CRITICAL: Only capture at 24 FPS, skip all extra frames
                if time_since_last < MIN_FRAME_INTERVAL * 0.95:  # 95% threshold
                    continue
                
                frame = frame_event.frame if hasattr(frame_event, 'frame') else frame_event
                
                if frame:
                    cv_frame = self._convert_frame_to_opencv(frame)
                    
                    if cv_frame is not None:
                        try:
                            if hasattr(track, 'source') and hasattr(track.source, 'name'):
                                source_type = "screen_share" if "screen" in track.source.name.lower() else "video"
                            elif hasattr(publication, 'source'):
                                source_type = "screen_share" if publication.source == rtc.TrackSource.SOURCE_SCREEN_SHARE else "video"
                            else:
                                track_name = getattr(track, 'name', '').lower()
                                source_type = "screen_share" if any(x in track_name for x in ['screen', 'display', 'desktop']) else "video"
                        except:
                            source_type = "video"
                        
                        self.stream_recorder.add_video_frame(cv_frame, source_type)
                        last_capture_time = current_time
                        frame_count += 1
                        
                        if frame_count % 100 == 0:
                            elapsed = current_time - capture_start_time
                            actual_fps = frame_count / elapsed if elapsed > 0 else 0
                            logger.info(f"Captured {frame_count} {source_type} frames from {participant.identity} (avg {actual_fps:.1f} fps)")
            
            logger.info(f"Video capture completed: {frame_count} frames from {participant.identity}")
            
        except Exception as e:
            logger.error(f"Video capture error: {e}")

    async def _capture_audio_stream(self, track, participant, track_source="microphone"):
        """Capture audio stream with proper source detection"""
        try:
            stream = rtc.AudioStream(track)
            sample_count = 0
            
            logger.info(f"Starting {track_source} capture from {participant.identity}")
            
            async for frame_event in stream:
                if self.stop_event.is_set():
                    break
                
                frame = frame_event.frame if hasattr(frame_event, 'frame') else frame_event
                
                if frame:
                    samples = self._convert_frame_to_audio_simple(frame)
                    
                    if samples:
                        self.stream_recorder.add_audio_samples(
                            samples, 
                            participant.identity,
                            track.sid,
                            track_source
                        )
                        sample_count += len(samples)
                        
                        if sample_count % 48000 == 0:
                            logger.info(f"Captured {sample_count} {track_source} samples from {participant.identity}")
            
            logger.info(f"Audio capture completed: {sample_count} {track_source} samples from {participant.identity}")
            
            self.stream_recorder.processing_tracks.discard(track.sid)
            
        except Exception as e:
            logger.error(f"Audio capture error: {e}")
            self.stream_recorder.processing_tracks.discard(track.sid)
                
    def _convert_frame_to_opencv(self, frame):
        """Convert LiveKit frame to OpenCV format"""
        try:
            if not frame or not hasattr(frame, 'width') or not hasattr(frame, 'height'):
                return None
            
            width, height = frame.width, frame.height
            
            try:
                rgba_frame = frame.convert(rtc.VideoBufferType.RGBA)
                if rgba_frame and rgba_frame.data:
                    rgba_data = rgba_frame.data
                    rgba_array = np.frombuffer(rgba_data, dtype=np.uint8)
                    expected_size = height * width * 4
                    
                    if len(rgba_array) >= expected_size:
                        rgba_array = rgba_array[:expected_size].reshape((height, width, 4))
                        bgr_frame = cv2.cvtColor(rgba_array, cv2.COLOR_RGBA2BGR)
                        return bgr_frame
            except:
                pass
            
            try:
                rgb_frame = frame.convert(rtc.VideoBufferType.RGB24)
                if rgb_frame and rgb_frame.data:
                    rgb_data = rgb_frame.data
                    rgb_array = np.frombuffer(rgb_data, dtype=np.uint8)
                    expected_size = height * width * 3
                    
                    if len(rgb_array) >= expected_size:
                        rgb_array = rgb_array[:expected_size].reshape((height, width, 3))
                        bgr_frame = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
                        return bgr_frame
            except:
                pass
            
            return None
            
        except Exception as e:
            logger.debug(f"Frame conversion error: {e}")
            return None

    def _convert_frame_to_audio_simple(self, frame):
        """Convert LiveKit audio frame to samples with proper format detection"""
        try:
            if not frame or not hasattr(frame, 'data') or not frame.data:
                return None
            
            sample_rate = getattr(frame, 'sample_rate', 48000)
            num_channels = getattr(frame, 'num_channels', 1)
            samples_per_channel = getattr(frame, 'samples_per_channel', 0)
            
            if not hasattr(self, '_logged_audio_format'):
                logger.info(f"🎵 Audio: {sample_rate}Hz, {num_channels}ch, {samples_per_channel} samples/ch")
                self._logged_audio_format = True
            
            try:
                audio_array = np.frombuffer(frame.data, dtype=np.int16)
                
                if len(audio_array) == 0:
                    return None
                
                if num_channels == 1:
                    stereo_audio = np.repeat(audio_array, 2)
                    return stereo_audio.tolist()
                elif num_channels == 2:
                    return audio_array.tolist()
                else:
                    reshaped = audio_array.reshape(-1, num_channels)
                    stereo_audio = reshaped[:, :2].flatten()
                    return stereo_audio.tolist()
                
            except:
                try:
                    audio_array = np.frombuffer(frame.data, dtype=np.float32)
                    audio_array = np.clip(audio_array, -1.0, 1.0)
                    audio_array = (audio_array * 32767.0).astype(np.int16)
                    
                    if len(audio_array) == 0:
                        return None
                    
                    if num_channels == 1:
                        stereo_audio = np.repeat(audio_array, 2)
                        return stereo_audio.tolist()
                    elif num_channels == 2:
                        return audio_array.tolist()
                    else:
                        reshaped = audio_array.reshape(-1, num_channels)
                        stereo_audio = reshaped[:, :2].flatten()
                        return stereo_audio.tolist()
                    
                except:
                    return None
            
        except Exception as e:
            logger.debug(f"Audio conversion error: {e}")
            return None

    def _on_connected(self):
        """Handle room connection"""
        logger.info("✅ Connected to room")
        self.is_connected = True

    def _on_disconnected(self, reason):
        """Handle room disconnection"""
        logger.warning(f"⚠️ Room disconnected: {reason}")

    async def _finalize(self):
        """Finalize recording and generate synchronized output"""
        try:
            logger.info("Finalizing recording...")
            
            for task in list(self.active_video_streams.values()):
                task.cancel()
            for task in list(self.active_audio_streams.values()):
                task.cancel()
            
            await asyncio.sleep(1.0)
            
            video_path, audio_path = self.stream_recorder.generate_synchronized_video(target_fps=30.0)
            
            self.final_video_path = video_path
            self.final_audio_path = audio_path
            
            if self.room and self.is_connected:
                try:
                    await asyncio.wait_for(self.room.disconnect(), timeout=30.0)
                except:
                    pass
            
            logger.info("Recording finalized successfully")
            
        except Exception as e:
            logger.error(f"Finalization error: {e}")
            
class FixedGoogleMeetRecorder:
    """Fixed Google Meet style recorder with proper HTTPS support"""
    
    def __init__(self):
        # CORRECTED: Use HTTPS URL for API calls, WSS for WebSocket
        self.livekit_url = os.getenv("LIVEKIT_URL", "https://192.168.48.201:8881")
        self.livekit_wss_url = os.getenv("LIVEKIT_WSS_URL", "wss://192.168.48.201:8881")
        
        # Get API credentials from environment
        self.api_key = os.getenv("LIVEKIT_API_KEY", "sridhar_ec9969265170a7d374da49d6b55f8ff4")
        self.api_secret = os.getenv("LIVEKIT_API_SECRET", "409150d1e2f40c1ebfcdd414c9c7b25c662d3770c08c1a6a945db8209ebfff3c")
        
        logger.info(f"🌐 LiveKit HTTPS URL: {self.livekit_url}")
        logger.info(f"🔌 LiveKit WSS URL: {self.livekit_wss_url}")
        logger.info(f"🔑 API Key: {self.api_key}")
        
        mongo_uri = os.getenv("MONGO_URI", "mongodb://connectly:LT%40connect25@192.168.48.201:27017/connectlydb?authSource=admin")
        self.mongo_client = MongoClient(mongo_uri)
        self.db = self.mongo_client[os.getenv("MONGO_DB", "connectlydb")]
        self.collection = self.db["test"]
        
        self.s3_recordings_prefix = S3_FOLDERS['recordings_temp']
        
        self.active_recordings = {}
        self._global_lock = threading.RLock()
        
        self.thread_pool = ThreadPoolExecutor(max_workers=10, thread_name_prefix="FixedRecorder")
        
        logger.info(f"✅ Fixed Google Meet Style Recorder initialized")

    def generate_recorder_token(self, room_name: str, recorder_identity: str) -> str:
        """Generate JWT token for the recording bot"""
        try:
            now = int(time.time())
            payload = {
                'iss': self.api_key,
                'sub': recorder_identity,
                'iat': now,
                'nbf': now,
                'exp': now + 7200,
                'video': {
                    'room': room_name,
                    'roomJoin': True,
                    'roomList': True,
                    'roomAdmin': True,
                    'roomCreate': False,
                    'roomRecord': True,
                    'canPublish': False,
                    'canSubscribe': True,
                    'canPublishData': False,
                    'canUpdateOwnMetadata': True,
                    'canPublishSources': [],
                    'canSubscribeSources': ['camera', 'microphone', 'screen_share', 'screen_share_audio'],
                    'hidden': True,
                    'recorder': True
                }
            }
            
            token = jwt.encode(payload, self.api_secret, algorithm='HS256')
            logger.info(f"✅ Generated recorder token for room: {room_name}")
            return token
            
        except Exception as e:
            logger.error(f"❌ Token generation failed: {e}")
            raise

    def start_stream_recording(self, meeting_id: str, host_user_id: str, room_name: str = None) -> Dict:
        """Start simple Google Meet style recording"""
        if not room_name:
            room_name = f"meeting_{meeting_id}"
        
        with self._global_lock:
            if meeting_id in self.active_recordings:
                return {
                    "status": "already_active",
                    "message": "Recording already in progress",
                    "meeting_id": meeting_id
                }
        
        try:
            timestamp = int(time.time())
            recording_metadata = {
                "meeting_id": meeting_id,
                "host_user_id": host_user_id,
                "room_name": room_name,
                "recording_status": "starting",
                "recording_type": "simple_google_meet",
                "start_time": datetime.now(),
                "created_at": datetime.now()
            }
            
            result = self.collection.insert_one(recording_metadata)
            recording_doc_id = str(result.inserted_id)
            
            recorder_identity = f"simple_recorder_{meeting_id}_{timestamp}"
            
            success, error_msg = self._start_simple_recording(
                room_name, meeting_id, host_user_id, recording_doc_id, recorder_identity
            )
            
            if success:
                self.collection.update_one(
                    {"_id": result.inserted_id},
                    {"$set": {"recording_status": "active", "recorder_identity": recorder_identity}}
                )
                
                return {
                    "status": "success",
                    "message": "Simple Google Meet style recording started",
                    "meeting_id": meeting_id,
                    "recording_id": recording_doc_id,
                    "recorder_identity": recorder_identity
                }
            else:
                self.collection.update_one(
                    {"_id": result.inserted_id},
                    {"$set": {"recording_status": "failed", "error": error_msg}}
                )
                return {
                    "status": "error",
                    "message": error_msg,
                    "meeting_id": meeting_id
                }
                
        except Exception as e:
            logger.error(f"❌ Error starting recording: {e}")
            return {
                "status": "error",
                "message": f"Recording start failed: {str(e)}",
                "meeting_id": meeting_id
            }

    def _start_simple_recording(self, room_name: str, meeting_id: str, host_user_id: str,
                               recording_doc_id: str, recorder_identity: str) -> Tuple[bool, Optional[str]]:
        """Start simple recording process"""
        try:
            recorder_token = self.generate_recorder_token(room_name, recorder_identity)
            
            result_queue = queue.Queue()
            stop_event = threading.Event()
            
            future = self.thread_pool.submit(
                self._run_simple_recording_task,
                self.livekit_wss_url, recorder_token, room_name, meeting_id,
                result_queue, stop_event
            )
            
            try:
                success, error_msg = result_queue.get(timeout=60)
                
                if success:
                    with self._global_lock:
                        self.active_recordings[meeting_id] = {
                            "room_name": room_name,
                            "recording_doc_id": recording_doc_id,
                            "recorder_identity": recorder_identity,
                            "start_time": datetime.now(),
                            "host_user_id": host_user_id,
                            "stop_event": stop_event,
                            "recording_future": future
                        }
                    
                    return True, None
                else:
                    stop_event.set()
                    return False, error_msg
                    
            except queue.Empty:
                stop_event.set()
                return False, "Recording connection timeout"
                
        except Exception as e:
            logger.error(f"❌ Error starting simple recording: {e}")
            return False, str(e)

    def _run_simple_recording_task(self, room_url: str, token: str, room_name: str,
                                  meeting_id: str, result_queue: queue.Queue, 
                                  stop_event: threading.Event):
        """Run simple recording task"""
        identifier = f"simple_recording_{meeting_id}"
        loop = None
        
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop_manager.register_loop(loop, identifier)
            
            bot = FixedRecordingBot(
                room_url=room_url,
                token=token,
                room_name=room_name,
                meeting_id=meeting_id,
                # output_dir=output_dir,
                result_queue=result_queue,
                stop_event=stop_event
            )
            
            result = loop_manager.safe_run_until_complete(
                loop, 
                bot.run_recording(),
                timeout=None,
                identifier=identifier
            )
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Simple recording task error: {e}")
            try:
                result_queue.put_nowait((False, str(e)))
            except:
                pass
        finally:
            if loop:
                loop_manager.force_cleanup_loop(loop, identifier)

    def stop_stream_recording(self, meeting_id: str) -> Dict:
        with self._global_lock:
            if meeting_id not in self.active_recordings:
                return {
                    "status": "error",
                    "message": "No active recording found",
                    "meeting_id": meeting_id
                }
            
            recording_info = self.active_recordings[meeting_id].copy()
        
        try:
            logger.info(f"🛑 Stopping simple recording for meeting {meeting_id}")
            
            stop_event = recording_info.get("stop_event")
            if stop_event:
                stop_event.set()
            
            recording_future = recording_info.get("recording_future")
            
            if recording_future:
                logger.info("✅ Stop signal sent. Finalization will continue in background...")

                # Run heavy finalization in background thread
                threading.Thread(
                    target=self._async_finalize_recording,
                    args=(meeting_id, recording_info),
                    daemon=True
                ).start()

                # Respond immediately without waiting
                return {
                    "status": "success",
                    "message": "Recording stopped. Processing will continue in background.",
                    "meeting_id": meeting_id
                }

            # In case there is no recording_future (edge case)
            with self._global_lock:
                if meeting_id in self.active_recordings:
                    del self.active_recordings[meeting_id]

            return {
                "status": "success",
                "message": "Recording stopped (no future to finalize).",
                "meeting_id": meeting_id
            }

        except Exception as e:
            logger.error(f"❌ Error stopping recording: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return {
                "status": "error",
                "message": f"Failed to stop recording: {str(e)}",
                "meeting_id": meeting_id
            }

    def _async_finalize_recording(self, meeting_id: str, recording_info: dict):
        """Run full S3/FFmpeg finalization in the background."""
        try:
            recording_future = recording_info.get("recording_future")
            if recording_future:
                logger.info(f"🎬 Background finalization started for {meeting_id}")
                recording_future.result()  # runs full sync finalize
                logger.info(f"✅ Background finalization done for {meeting_id}")
            else:
                logger.warning(f"⚠️ No recording_future found for {meeting_id}")

            # ====== CONTINUE FULL POST-PROCESSING ======
            s3_prefix = f"{S3_FOLDERS['recordings_temp']}/{meeting_id}"
            raw_video_s3_key = f"{s3_prefix}/raw_video_{meeting_id}.avi"
            raw_audio_s3_key = f"{s3_prefix}/raw_audio_{meeting_id}.wav"

            # 1️⃣ Create final MP4 file
            final_video_s3_key = self._create_final_video_simple_s3(
                raw_video_s3_key, raw_audio_s3_key, meeting_id
            )

            if not final_video_s3_key:
                logger.error(f"❌ Failed to create final video for {meeting_id}")
                return

            # 2️⃣ Trigger pipeline
            processing_result = None
            try:
                processing_result = self._trigger_processing_pipeline(
                    final_video_s3_key, meeting_id,
                    recording_info.get("host_user_id"),
                    recording_info.get("recording_doc_id")
                )
                logger.info(f"✅ Triggered processing pipeline for {meeting_id}")
            except Exception as e:
                logger.error(f"⚠️ Pipeline trigger failed for {meeting_id}: {e}")

            # 3️⃣ Clean up temp S3 folder
            try:
                logger.info(f"🧹 Deleting temp S3 folder: {s3_prefix}")
                self._delete_s3_folder(s3_prefix)
            except Exception as e:
                logger.warning(f"⚠️ Could not delete temp folder: {e}")

            # 4️⃣ Update DB
            try:
                self.collection.update_one(
                    {"_id": recording_info.get("recording_doc_id")},
                    {"$set": {
                        "recording_status": "completed",
                        "completed_at": datetime.now(),
                        "file_path": final_video_s3_key,
                        "processing_result": processing_result
                    }}
                )
                logger.info(f"✅ DB updated for {meeting_id}")
            except Exception as db_err:
                logger.warning(f"⚠️ DB update failed: {db_err}")

        except Exception as e:
            logger.error(f"❌ Background finalization failed for {meeting_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())

    def _create_final_video_simple_s3(self, video_s3_key: str, audio_s3_key: Optional[str] = None, 
                              meeting_id: Optional[str] = None) -> Optional[str]:
        """
        Create final MP4 by:
        1. Download raw AVI from S3 to temp file
        2. Download raw WAV from S3 to temp file
        3. Use FFmpeg to merge locally
        4. Upload final MP4 to S3
        5. Clean up everything
        """
        temp_video_file = None
        temp_audio_file = None
        temp_final_file = None
        
        try:
            import tempfile
            
            final_output_key = video_s3_key.replace('.avi', '_final.mp4')
            
            logger.info(f"Creating final video with PERFECT SYNC from S3")
            
            # STEP 1: Create temp files
            temp_video_fd, temp_video_file = tempfile.mkstemp(suffix='.avi', prefix='raw_video_')
            os.close(temp_video_fd)
            
            temp_audio_fd, temp_audio_file = tempfile.mkstemp(suffix='.wav', prefix='raw_audio_')
            os.close(temp_audio_fd)
            
            temp_final_fd, temp_final_file = tempfile.mkstemp(suffix='.mp4', prefix='final_video_')
            os.close(temp_final_fd)
            
            logger.info(f"📥 Downloading raw video from S3...")
            # STEP 2: Download video from S3
            try:
                s3_client.download_file(AWS_S3_BUCKET, video_s3_key, temp_video_file)
                video_local_size = os.path.getsize(temp_video_file)
                logger.info(f"✅ Downloaded video: {video_local_size:,} bytes")
            except Exception as e:
                logger.error(f"❌ Failed to download video from S3: {e}")
                return None
            
            logger.info(f"📥 Downloading raw audio from S3...")
            # STEP 3: Download audio from S3
            try:
                s3_client.download_file(AWS_S3_BUCKET, audio_s3_key, temp_audio_file)
                audio_local_size = os.path.getsize(temp_audio_file)
                logger.info(f"✅ Downloaded audio: {audio_local_size:,} bytes")
            except Exception as e:
                logger.error(f"❌ Failed to download audio from S3: {e}")
                return None
            
            # STEP 4: Check GPU availability
            nvenc_available = False
            try:
                result = subprocess.run(
                    ['ffmpeg', '-hide_banner', '-encoders'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                nvenc_available = 'h264_nvenc' in result.stdout
                logger.info(f"NVENC availability: {nvenc_available}")
            except Exception as e:
                logger.warning(f"Could not check NVENC: {e}")
            
            # STEP 5: Build FFmpeg command to merge locally
            if nvenc_available:
                logger.info("🚀 GPU ACCELERATION - PERFECT SYNC MODE")
                ffmpeg_cmd = [
                    'ffmpeg', '-y',
                    '-i', temp_video_file,
                    '-i', temp_audio_file,
                    '-c:v', 'h264_nvenc',
                    '-preset', 'p5',
                    '-rc', 'cbr',
                    '-b:v', '2M',
                    '-maxrate', '2.5M',
                    '-bufsize', '15M',
                    '-pix_fmt', 'yuv420p',
                    '-fps_mode', 'cfr',
                    '-vsync', 'cfr',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-ar', '48000',
                    '-ac', '2',
                    '-af', 'asetpts=PTS-STARTPTS',
                    '-video_track_timescale', '24',
                    '-movflags', '+faststart',
                    '-max_interleave_delta', '0',
                    temp_final_file
                ]
            else:
                logger.info("⚙️ Using CPU encoding - PERFECT SYNC MODE")
                ffmpeg_cmd = [
                    'ffmpeg', '-y',
                    '-i', temp_video_file,
                    '-i', temp_audio_file,
                    '-c:v', 'libx264',
                    '-preset', 'medium',
                    '-crf', '21',
                    '-pix_fmt', 'yuv420p',
                    '-fps_mode', 'cfr',
                    '-vsync', 'cfr',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-ar', '48000',
                    '-ac', '2',
                    '-af', 'asetpts=PTS-STARTPTS',
                    '-video_track_timescale', '24',
                    '-movflags', '+faststart',
                    '-max_interleave_delta', '0',
                    temp_final_file
                ]
            
            logger.info(f"🎬 Running FFmpeg locally to merge video + audio...")
            logger.info(f"   Input video: {temp_video_file}")
            logger.info(f"   Input audio: {temp_audio_file}")
            logger.info(f"   Output: {temp_final_file}")
            
            # STEP 6: Run FFmpeg
            ffmpeg_env = os.environ.copy()
            ffmpeg_env['CUDA_VISIBLE_DEVICES'] = '0'
            ffmpeg_env['CUDA_DEVICE_ORDER'] = 'PCI_BUS_ID'
            ffmpeg_env.pop('NVIDIA_DISABLE', None)
            
            result = subprocess.run(
                ffmpeg_cmd,
                capture_output=True,
                text=True,
                env=ffmpeg_env,
                timeout=None
            )
            
            if result.returncode != 0:
                logger.error(f"❌ FFmpeg failed with return code: {result.returncode}")
                logger.error(f"FFmpeg stderr: {result.stderr[-1000:]}")
                return None
            
            # STEP 7: Verify final file created
            if not os.path.exists(temp_final_file) or os.path.getsize(temp_final_file) == 0:
                logger.error(f"❌ FFmpeg did not create final video file")
                return None
            
            final_size = os.path.getsize(temp_final_file)
            logger.info(f"✅ Final video created locally: {final_size:,} bytes")
            
            # STEP 8: Upload final MP4 to S3
            logger.info(f"📤 Uploading final MP4 to S3: {final_output_key}")
            try:
                with open(temp_final_file, 'rb') as f:
                    s3_client.upload_fileobj(f, AWS_S3_BUCKET, final_output_key)
                logger.info(f"✅ Final video uploaded to S3: {final_output_key}")
            except Exception as e:
                logger.error(f"❌ Failed to upload final video to S3: {e}")
                return None
            
            # STEP 9: Verify in S3
            try:
                response = s3_client.head_object(Bucket=AWS_S3_BUCKET, Key=final_output_key)
                s3_size = response['ContentLength']
                logger.info(f"✅ Final video verified in S3: {s3_size:,} bytes - {final_output_key}")
            except Exception as e:
                logger.error(f"❌ Could not verify final video in S3: {e}")
                return None
            
            # STEP 10: Clean up intermediate S3 files
            logger.info("🧹 Cleaning up intermediate S3 files...")
            try:
                s3_client.delete_object(Bucket=AWS_S3_BUCKET, Key=video_s3_key)
                logger.info(f"✅ Deleted intermediate video: {video_s3_key}")
            except Exception as e:
                logger.warning(f"⚠️ Could not delete intermediate video: {e}")
            
            try:
                s3_client.delete_object(Bucket=AWS_S3_BUCKET, Key=audio_s3_key)
                logger.info(f"✅ Deleted intermediate audio: {audio_s3_key}")
            except Exception as e:
                logger.warning(f"⚠️ Could not delete intermediate audio: {e}")
            
            logger.info("✅ Intermediate cleanup completed")
            
            return final_output_key
        
        except Exception as e:
            logger.error(f"Error creating final video: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None
        
        finally:
            # STEP 11: Clean up all temp files
            try:
                if temp_video_file and os.path.exists(temp_video_file):
                    os.remove(temp_video_file)
                    logger.info(f"🧹 Deleted temp video file")
            except Exception as e:
                logger.warning(f"⚠️ Could not delete temp video file: {e}")
            
            try:
                if temp_audio_file and os.path.exists(temp_audio_file):
                    os.remove(temp_audio_file)
                    logger.info(f"🧹 Deleted temp audio file")
            except Exception as e:
                logger.warning(f"⚠️ Could not delete temp audio file: {e}")
            
            try:
                if temp_final_file and os.path.exists(temp_final_file):
                    os.remove(temp_final_file)
                    logger.info(f"🧹 Deleted temp final file")
            except Exception as e:
                logger.warning(f"⚠️ Could not delete temp final file: {e}")

    # ADD THIS NEW METHOD TO FixedGoogleMeetRecorder CLASS:

    def _delete_s3_folder(self, prefix: str):
        try:
            paginator = s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=AWS_S3_BUCKET, Prefix=prefix)
            
            for page in pages:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        s3_client.delete_object(Bucket=AWS_S3_BUCKET, Key=obj['Key'])
                        logger.info(f"✅ Deleted: {obj['Key']}")
            
            logger.info(f"✅ Deleted S3 folder: {prefix}")
        except Exception as e:
            logger.error(f"Error deleting S3 folder: {e}")
            
    def _trigger_processing_pipeline(self, video_file_path: str, meeting_id: str,
                               host_user_id: str, recording_doc_id: str) -> Dict:
        """Trigger the video processing pipeline - DOWNLOAD FROM S3 FIRST"""
        try:
            import tempfile
            import os
            
            logger.info(f"🎬 Processing pipeline triggered for: {meeting_id}")
            logger.info(f"📝 Video path: {video_file_path}")
            
            # ✅ FIX: Check if video_file_path is S3 key or local path
            if video_file_path.startswith('s3://'):
                # Already full S3 URL
                s3_key = video_file_path.replace('s3://' + AWS_S3_BUCKET + '/', '')
            elif video_file_path.startswith('recordings_temp/'):
                # Relative S3 key - make it full path
                s3_key = video_file_path
            else:
                # Assume it's already a full path
                s3_key = video_file_path
            
            logger.info(f"📍 S3 Key: {s3_key}")
            
            # ✅ FIX: Download S3 file to temp location before processing
            logger.info(f"📥 Downloading video from S3...")
            
            # Create temp file for downloaded video
            temp_fd, temp_video_path = tempfile.mkstemp(
                suffix='.mp4',
                prefix=f'process_video_{meeting_id}_'
            )
            os.close(temp_fd)
            
            try:
                # Download from S3
                s3_client.download_file(
                    Bucket=AWS_S3_BUCKET,
                    Key=s3_key,
                    Filename=temp_video_path
                )
                
                file_size = os.path.getsize(temp_video_path)
                logger.info(f"✅ Downloaded video: {file_size:,} bytes from S3")
                
                if file_size == 0:
                    raise Exception("Downloaded video file is empty")
                
            except Exception as download_error:
                logger.error(f"❌ Failed to download video from S3: {download_error}")
                raise Exception(f"S3 download failed: {str(download_error)}")
            
            # ✅ NOW pass local file path to process_video_sync
            logger.info(f"🎬 Passing local file to video processing: {temp_video_path}")
            
            from core.UserDashBoard.recordings import process_video_sync
            
            result = process_video_sync(temp_video_path, meeting_id, host_user_id)
            
            # Clean up temp file after processing
            try:
                if os.path.exists(temp_video_path):
                    os.remove(temp_video_path)
                    logger.info(f"🧹 Deleted temp video file: {temp_video_path}")
            except Exception as cleanup_error:
                logger.warning(f"⚠️ Could not delete temp file: {cleanup_error}")
            
            # Process result
            if result.get("status") == "success":
                processing_data = {
                    "recording_status": "completed",
                    "processing_completed": True,
                    "video_url": result.get("video_url"),
                    "transcript_url": result.get("transcript_url"),
                    "summary_url": result.get("summary_url"),
                    "image_url": result.get("summary_image_url"),
                    "subtitles": result.get("subtitle_urls", {}),
                    "file_size": result.get("file_size", 0),
                    "processing_end_time": datetime.now(),
                    "encoder_used": result.get("encoder_used"),
                    "gpu_accelerated": result.get("gpu_accelerated")
                }
                
                try:
                    from bson import ObjectId
                    if len(recording_doc_id) == 24:
                        self.collection.update_one(
                            {"_id": ObjectId(recording_doc_id)},
                            {"$set": processing_data}
                        )
                        logger.info(f"✅ Updated MongoDB with processing results")
                except Exception as db_error:
                    logger.warning(f"Database update error: {db_error}")
                
                return {
                    "status": "success",
                    "processing_completed": True,
                    "video_url": result.get("video_url"),
                    "transcript_url": result.get("transcript_url"),
                    "summary_url": result.get("summary_url")
                }
            else:
                error_msg = result.get("error", "Unknown processing error")
                logger.error(f"❌ Processing failed: {error_msg}")
                return {
                    "status": "error",
                    "error": error_msg
                }
                
        except Exception as e:
            logger.error(f"❌ Processing pipeline error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "status": "error",
                "error": str(e)
            }

    def get_recording_status(self, meeting_id: str) -> Dict:
        """Get current recording status"""
        with self._global_lock:
            if meeting_id in self.active_recordings:
                recording_info = self.active_recordings[meeting_id]
                return {
                    "meeting_id": meeting_id,
                    "status": "active",
                    "start_time": recording_info["start_time"].isoformat(),
                    "room_name": recording_info["room_name"],
                    "is_active": True
                }
        
        return {
            "meeting_id": meeting_id,
            "status": "no_recording",
            "is_active": False
        }

    def list_active_recordings(self) -> List[Dict]:
        """List all active recordings"""
        with self._global_lock:
            return [
                {
                    "meeting_id": meeting_id,
                    "recording_id": info.get("recording_doc_id"),
                    "start_time": info.get("start_time").isoformat() if info.get("start_time") else None,
                    "room_name": info.get("room_name"),
                    "host_user_id": info.get("host_user_id")
                }
                for meeting_id, info in self.active_recordings.items()
            ]

# Initialize the service
fixed_google_meet_recorder = FixedGoogleMeetRecorder()
stream_recording_service = fixed_google_meet_recorder

# Cleanup handler
import atexit

def cleanup_recording_service():
    """Cleanup function to properly shut down recordings on exit"""
    try:
        logger.info("🛑 Shutting down recording service...")
        with fixed_google_meet_recorder._global_lock:
            for meeting_id in list(fixed_google_meet_recorder.active_recordings.keys()):
                try:
                    fixed_google_meet_recorder.stop_stream_recording(meeting_id)
                except Exception as e:
                    logger.error(f"Error stopping recording {meeting_id}: {e}")
        
        fixed_google_meet_recorder.thread_pool.shutdown(wait=False)
        loop_manager.cleanup_all_loops()
        logger.info("✅ Recording service shutdown completed")
        
    except Exception as e:
        logger.error(f"Error during recording service shutdown: {e}")

atexit.register(cleanup_recording_service)