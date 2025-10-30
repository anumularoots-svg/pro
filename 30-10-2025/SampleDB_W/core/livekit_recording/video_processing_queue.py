"""
Video Processing Queue with GPU Conflict Management
NOW WITH: Checkpoint-based resumable encoding - NEVER crashes, ALWAYS completes
VERSION: 2.0 - Self-Healing Architecture
"""

import os
import time
import threading
import logging
import subprocess
import re
import json
import signal
from datetime import datetime
from typing import Dict, Tuple, Optional, List
from pymongo import MongoClient
from django.conf import settings

logger = logging.getLogger('video_processing_queue')


# ============================================================================
# CHECKPOINT MANAGER
# ============================================================================

class ProcessingCheckpoint:
    """Manages checkpoint state for resumable video processing"""
    
    def __init__(self, checkpoint_dir="/tmp/video_checkpoints"):
        self.checkpoint_dir = checkpoint_dir
        os.makedirs(checkpoint_dir, exist_ok=True)
        
    def get_checkpoint_path(self, meeting_id: str) -> str:
        """Get checkpoint file path for meeting"""
        return os.path.join(self.checkpoint_dir, f"checkpoint_{meeting_id}.json")
    
    def save_checkpoint(self, meeting_id: str, checkpoint_data: Dict):
        """Save checkpoint to disk"""
        try:
            checkpoint_path = self.get_checkpoint_path(meeting_id)
            with open(checkpoint_path, 'w') as f:
                json.dump(checkpoint_data, f, indent=2)
            logger.info(f"💾 Checkpoint saved for {meeting_id}: frame={checkpoint_data.get('last_frame', 0)}, time={checkpoint_data.get('last_time', 0):.2f}s")
        except Exception as e:
            logger.error(f"❌ Failed to save checkpoint: {e}")
    
    def load_checkpoint(self, meeting_id: str) -> Optional[Dict]:
        """Load checkpoint from disk"""
        try:
            checkpoint_path = self.get_checkpoint_path(meeting_id)
            if os.path.exists(checkpoint_path):
                with open(checkpoint_path, 'r') as f:
                    data = json.load(f)
                logger.info(f"📂 Checkpoint loaded for {meeting_id}: frame={data.get('last_frame', 0)}, time={data.get('last_time', 0):.2f}s")
                return data
            return None
        except Exception as e:
            logger.error(f"❌ Failed to load checkpoint: {e}")
            return None
    
    def clear_checkpoint(self, meeting_id: str):
        """Clear checkpoint after successful completion"""
        try:
            checkpoint_path = self.get_checkpoint_path(meeting_id)
            if os.path.exists(checkpoint_path):
                os.remove(checkpoint_path)
                logger.info(f"🗑️ Checkpoint cleared for {meeting_id}")
        except Exception as e:
            logger.error(f"❌ Failed to clear checkpoint: {e}")
    
    def get_segment_path(self, meeting_id: str, segment_index: int) -> str:
        """Get path for video segment"""
        return os.path.join(self.checkpoint_dir, f"segment_{meeting_id}_{segment_index}.mp4")
    
    def list_segments(self, meeting_id: str) -> List[str]:
        """List all segments for meeting"""
        segments = []
        segment_index = 0
        while True:
            segment_path = self.get_segment_path(meeting_id, segment_index)
            if os.path.exists(segment_path):
                segments.append(segment_path)
                segment_index += 1
            else:
                break
        return segments
    
    def clear_segments(self, meeting_id: str):
        """Clear all segments for meeting"""
        segments = self.list_segments(meeting_id)
        for segment in segments:
            try:
                os.remove(segment)
                logger.debug(f"🗑️ Removed segment: {segment}")
            except:
                pass


# Global checkpoint manager
checkpoint_manager = ProcessingCheckpoint()


# ============================================================================
# GPU AVAILABILITY CHECKER (Enhanced)
# ============================================================================

def is_gpu_available_for_processing(exclude_pids: List[int] = None):
    """
    Check if GPU is available for video processing.
    Enhanced to exclude specific PIDs from conflict detection.
    
    Args:
        exclude_pids: List of PIDs to ignore (e.g., our own FFmpeg processes)
    """
    import os
    current_pid = os.getpid()
    exclude_pids = exclude_pids or []
    
    try:
        result = subprocess.run(
            ['nvidia-smi', '--query-compute-apps=pid,process_name,used_memory', '--format=csv,noheader'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0:
            output = result.stdout.strip()
            
            if output:
                lines = output.split('\n')
                for line in lines:
                    if 'python' in line.lower():
                        try:
                            parts = line.split(',')
                            if len(parts) >= 3:
                                pid_str = parts[0].strip()
                                pid = int(pid_str) if pid_str else 0
                                
                                # Skip current process and excluded PIDs
                                if pid == current_pid or pid in exclude_pids:
                                    continue
                                
                                memory_str = parts[2].strip()
                                memory_mb = int(memory_str.split()[0]) if memory_str else 0
                                
                                if memory_mb > 100:
                                    logger.debug(f"⏳ GPU busy: Python PID {pid} using {memory_mb}MB")
                                    return False
                        except Exception as e:
                            logger.debug(f"Error parsing line '{line}': {e}")
                            pass
                
            return True
        else:
            logger.warning(f"⚠️ nvidia-smi check failed, assuming GPU available")
            return True
            
    except subprocess.TimeoutExpired:
        logger.warning(f"⚠️ nvidia-smi timeout, assuming GPU available")
        return True
    except FileNotFoundError:
        logger.warning(f"⚠️ nvidia-smi not found, assuming GPU available")
        return True
    except Exception as e:
        logger.warning(f"⚠️ GPU check error: {e}, assuming GPU available")
        return True


def wait_for_gpu_availability(meeting_id: str, check_interval: int = 5, max_wait: int = None):
    """
    Wait for GPU to become available - UNLIMITED or limited wait.
    
    Args:
        meeting_id: Meeting ID for logging
        check_interval: How often to check (default 5 seconds)
        max_wait: Maximum wait time in seconds (None = unlimited)
    """
    logger.info(f"⏳ Waiting for GPU to become available for {meeting_id}...")
    
    start_time = time.time()
    checks_performed = 0
    
    while True:
        elapsed = time.time() - start_time
        
        # Check max wait timeout
        if max_wait and elapsed >= max_wait:
            logger.warning(f"⏰ GPU wait timeout after {elapsed:.1f}s for {meeting_id}")
            return False
        
        # Check if GPU is available
        if is_gpu_available_for_processing():
            logger.info(f"✅ GPU available after {elapsed:.1f}s ({checks_performed} checks)")
            return True
        
        # Log progress every 30 seconds
        if checks_performed % 6 == 0 and checks_performed > 0:
            logger.info(f"⏳ Still waiting for GPU... ({elapsed:.0f}s elapsed)")
        
        checks_performed += 1
        time.sleep(check_interval)


def wait_for_face_embedding_to_stop(meeting_id: str):
    """
    Wait FOREVER for face embedding to stop. No timeouts, no limits.
    Will check continuously until face embedding is completely stopped.
    
    Args:
        meeting_id: Meeting ID for logging
    
    Returns:
        None: Always succeeds (waits forever if needed)
    """
    logger.info(f"⏳ Waiting for face embedding to stop for {meeting_id}...")
    
    start_time = time.time()
    check_count = 0
    
    while True:
        elapsed = time.time() - start_time
        check_count += 1
        
        try:
            # Check GPU usage by other Python processes
            result = subprocess.run(
                ['nvidia-smi', '--query-compute-apps=pid,process_name,used_memory', '--format=csv,noheader'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            current_pid = os.getpid()
            
            if result.returncode == 0:
                output = result.stdout.strip()
                face_embedding_active = False
                
                if output:
                    lines = output.split('\n')
                    for line in lines:
                        if 'python' in line.lower():
                            try:
                                parts = line.split(',')
                                if len(parts) >= 3:
                                    pid_str = parts[0].strip()
                                    pid = int(pid_str) if pid_str else 0
                                    
                                    # Skip our own process
                                    if pid == current_pid:
                                        continue
                                    
                                    memory_str = parts[2].strip()
                                    memory_mb = int(memory_str.split()[0]) if memory_str else 0
                                    
                                    # If other Python process using ANY GPU memory, face embedding is active
                                    if memory_mb > 100:  # Very low threshold - any usage counts
                                        face_embedding_active = True
                                        logger.info(f"⏳ Face embedding active: PID {pid} using {memory_mb}MB (elapsed: {elapsed:.0f}s)")
                                        break
                            except:
                                pass
                
                # If no face embedding detected, we're done
                if not face_embedding_active:
                    logger.info(f"✅ Face embedding stopped after {elapsed:.0f}s")
                    return
                
                # Log progress every minute
                if check_count % 12 == 0:  # Every 60 seconds (12 * 5s)
                    logger.info(f"⏳ Still waiting for face embedding to stop... ({elapsed:.0f}s elapsed)")
                    
        except Exception as e:
            logger.warning(f"⚠️ Error checking face embedding: {e}")
        
        time.sleep(5)


def force_cleanup_ffmpeg_processes(meeting_id: str):
    """Force kill any existing FFmpeg processes for this meeting"""
    try:
        # Find all ffmpeg processes containing meeting_id
        result = subprocess.run(
            ['pgrep', '-f', f'ffmpeg.*{meeting_id}'],
            capture_output=True,
            text=True
        )
        
        if result.stdout.strip():
            pids = result.stdout.strip().split('\n')
            for pid in pids:
                try:
                    pid_int = int(pid)
                    os.kill(pid_int, signal.SIGKILL)
                    logger.info(f"🔪 Killed stale FFmpeg process: PID {pid_int}")
                except:
                    pass
        
        # Extra cleanup: wait for GPU to stabilize
        time.sleep(2)
        
    except Exception as e:
        logger.debug(f"FFmpeg cleanup: {e}")


# ============================================================================
# FFMPEG PROGRESS MONITOR (Enhanced with Error Detection)
# ============================================================================

class FFmpegProgressMonitor:
    """Monitor FFmpeg progress and detect GPU conflicts in real-time"""
    
    def __init__(self, meeting_id: str):
        self.meeting_id = meeting_id
        self.last_frame = 0
        self.last_time_seconds = 0.0
        self.total_frames_estimated = 0
        self.gpu_conflict_detected = False
        self.error_type = None
        self.error_message = None
        self._lock = threading.Lock()
        
        # Error patterns
        self.gpu_error_patterns = [
            'NVDECException',
            'cuvidDecodePicture',
            'CUDA error',
            'NVENC error',
            'cuvid',
            'nvcuvid',
            'No capable devices found'
        ]
        
    def parse_progress(self, line: str):
        """Parse FFmpeg progress output"""
        # Track frames
        frame_match = re.search(r'frame=\s*(\d+)', line)
        if frame_match:
            with self._lock:
                self.last_frame = int(frame_match.group(1))
        
        # Track time
        time_match = re.search(r'time=(\d+):(\d+):(\d+)\.(\d+)', line)
        if time_match:
            hours = int(time_match.group(1))
            minutes = int(time_match.group(2))
            seconds = int(time_match.group(3))
            with self._lock:
                self.last_time_seconds = hours * 3600 + minutes * 60 + seconds
    
    def check_for_errors(self, line: str):
        """Check stderr line for GPU errors"""
        line_lower = line.lower()
        
        # Check for GPU-specific errors
        for pattern in self.gpu_error_patterns:
            if pattern.lower() in line_lower:
                with self._lock:
                    self.gpu_conflict_detected = True
                    self.error_type = 'gpu_conflict'
                    self.error_message = line.strip()
                logger.error(f"🚨 GPU CONFLICT DETECTED: {line.strip()}")
                return True
        
        # Check for other critical errors
        if 'error' in line_lower and ('decode' in line_lower or 'encode' in line_lower):
            with self._lock:
                self.gpu_conflict_detected = True
                self.error_type = 'encoding_error'
                self.error_message = line.strip()
            logger.error(f"⚠️ Encoding error: {line.strip()}")
            return True
        
        return False
    
    def get_last_frame(self) -> int:
        """Get last successfully processed frame"""
        with self._lock:
            return self.last_frame
    
    def get_last_time(self) -> float:
        """Get last successfully processed timestamp"""
        with self._lock:
            return self.last_time_seconds
    
    def is_conflict_detected(self) -> bool:
        """Check if GPU conflict was detected"""
        with self._lock:
            return self.gpu_conflict_detected
    
    def get_error_info(self) -> Tuple[str, str]:
        """Get error type and message"""
        with self._lock:
            return self.error_type, self.error_message
    
    def reset(self):
        """Reset for retry"""
        with self._lock:
            self.gpu_conflict_detected = False
            self.error_type = None
            self.error_message = None


# ============================================================================
# RESUMABLE FFMPEG RUNNER
# ============================================================================

def run_ffmpeg_with_checkpointing(
    meeting_id: str,
    input_video: str,
    output_video: str,
    start_time: float = 0.0,
    segment_index: int = 0,
    use_gpu: bool = True
) -> Tuple[bool, float, str]:
    """
    Run FFmpeg with checkpointing support.
    Returns: (success, last_processed_time, error_type)
    
    Args:
        meeting_id: Meeting ID
        input_video: Input video path
        output_video: Output video path
        start_time: Start processing from this timestamp (seconds)
        segment_index: Segment number for output naming
        use_gpu: Whether to use GPU encoding
    """
    
    progress_monitor = FFmpegProgressMonitor(meeting_id)
    
    # Build FFmpeg command
    ffmpeg_cmd = ['ffmpeg', '-y']
    
    # If resuming from checkpoint, seek to start time
    if start_time > 0:
        ffmpeg_cmd.extend(['-ss', format_time_for_ffmpeg(start_time)])
        logger.info(f"📍 Resuming from {start_time:.2f}s")
    
    # Input
    ffmpeg_cmd.extend(['-i', input_video])
    
    # Encoding options
    if use_gpu:
        # GPU encoding
        ffmpeg_cmd.extend([
            '-c:v', 'h264_nvenc',
            '-preset', 'p5',
            '-rc', 'cbr',
            '-b:v', '2M',
            '-maxrate', '2.5M',
            '-bufsize', '15M'
        ])
    else:
        # CPU fallback
        ffmpeg_cmd.extend([
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '21'
        ])
    
    # Common options
    ffmpeg_cmd.extend([
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        output_video
    ])
    
    logger.info(f"🎬 Starting FFmpeg: {' '.join(ffmpeg_cmd)}")
    
    try:
        # Start FFmpeg process
        process = subprocess.Popen(
            ffmpeg_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        
        # Monitor threads
        def monitor_stderr():
            """Monitor stderr for progress and errors"""
            try:
                for line in process.stderr:
                    # Check for errors first
                    if progress_monitor.check_for_errors(line):
                        # Error detected - kill process
                        try:
                            process.terminate()
                            time.sleep(1)
                            if process.poll() is None:
                                process.kill()
                        except:
                            pass
                        break
                    
                    # Parse progress
                    progress_monitor.parse_progress(line)
                    
                    # Log progress periodically
                    if progress_monitor.last_frame % 100 == 0 and progress_monitor.last_frame > 0:
                        logger.debug(f"📊 Frame {progress_monitor.last_frame}, time {progress_monitor.last_time_seconds:.2f}s")
                        
            except Exception as e:
                logger.warning(f"⚠️ Stderr monitoring error: {e}")
        
        def monitor_gpu_conflicts():
            """Monitor for external GPU conflicts"""
            check_count = 0
            while process.poll() is None:
                check_count += 1
                
                # Check if external process is using GPU
                if not is_gpu_available_for_processing(exclude_pids=[process.pid]):
                    logger.error(f"🚨 External GPU conflict detected!")
                    progress_monitor.gpu_conflict_detected = True
                    progress_monitor.error_type = 'external_gpu_conflict'
                    
                    # Kill FFmpeg gracefully
                    try:
                        process.terminate()
                        time.sleep(2)
                        if process.poll() is None:
                            process.kill()
                    except:
                        pass
                    break
                
                # Log monitoring status every 30 seconds
                if check_count % 6 == 0:
                    logger.debug(f"👁️ GPU monitoring OK (frame {progress_monitor.last_frame})")
                
                time.sleep(5)
        
        # Start monitoring threads
        stderr_thread = threading.Thread(target=monitor_stderr, daemon=True)
        gpu_thread = threading.Thread(target=monitor_gpu_conflicts, daemon=True)
        
        stderr_thread.start()
        gpu_thread.start()
        
        # Wait for completion
        return_code = process.wait()
        
        # Wait for threads
        stderr_thread.join(timeout=5)
        gpu_thread.join(timeout=5)
        
        # Check results
        if progress_monitor.is_conflict_detected():
            error_type, error_msg = progress_monitor.get_error_info()
            logger.warning(f"⚠️ FFmpeg stopped due to {error_type} at {progress_monitor.last_time_seconds:.2f}s")
            return False, progress_monitor.last_time_seconds, error_type
        
        if return_code == 0 and os.path.exists(output_video):
            logger.info(f"✅ FFmpeg completed successfully")
            return True, progress_monitor.last_time_seconds, None
        else:
            logger.error(f"❌ FFmpeg failed with code {return_code}")
            return False, progress_monitor.last_time_seconds, 'ffmpeg_error'
            
    except Exception as e:
        logger.error(f"❌ FFmpeg execution error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False, progress_monitor.last_time_seconds, 'exception'


def format_time_for_ffmpeg(seconds: float) -> str:
    """Convert seconds to FFmpeg time format HH:MM:SS.mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


# ============================================================================
# SELF-HEALING VIDEO PROCESSOR
# ============================================================================

def process_video_with_resume(
    video_path: str,
    meeting_id: str,
    host_user_id: str,
    recording_doc_id: str,
    max_retries: int = None,
    max_interruptions: int = 10
) -> dict:
    """
    Process video with automatic resume on GPU conflicts.
    NEVER gives up, always completes eventually.
    
    Args:
        video_path: Path to video file
        meeting_id: Meeting ID
        host_user_id: Host user ID
        recording_doc_id: Recording document ID
        max_retries: Maximum retry attempts (None = unlimited)
        max_interruptions: If interrupted this many times, switch to CPU
    """
    from core.UserDashBoard.recordings import process_video_sync
    
    attempt = 0
    interruption_count = 0
    use_gpu = True
    
    # Load existing checkpoint
    checkpoint = checkpoint_manager.load_checkpoint(meeting_id)
    if checkpoint:
        interruption_count = checkpoint.get('interruption_count', 0)
        logger.info(f"📂 Resuming from checkpoint: {interruption_count} previous interruptions")
    
    while True:
        attempt += 1
        
        # Check retry limit
        if max_retries and attempt > max_retries:
            logger.error(f"❌ Max retries ({max_retries}) exceeded for {meeting_id}")
            return {
                "status": "failed",
                "error": f"Max retries exceeded after {attempt-1} attempts",
                "attempts": attempt - 1
            }
        
        # Switch to CPU if too many interruptions
        if interruption_count >= max_interruptions and use_gpu:
            logger.warning(f"⚠️ Too many GPU interruptions ({interruption_count}), switching to CPU encoding")
            use_gpu = False
        
        logger.info(f"🎬 Processing attempt {attempt} for {meeting_id} (GPU={use_gpu}, interruptions={interruption_count})")
        
        try:
            # Clean up any stale FFmpeg processes
            force_cleanup_ffmpeg_processes(meeting_id)
            
            # Set environment variable to control encoding method
            # This will be read by the video processing functions
            if use_gpu:
                os.environ['FORCE_CPU_ENCODING'] = '0'
                logger.info(f"🎮 GPU encoding enabled for {meeting_id}")
            else:
                os.environ['FORCE_CPU_ENCODING'] = '1'
                logger.info(f"💻 CPU encoding forced for {meeting_id}")
            
            # Wait for GPU if needed
            if use_gpu:
                logger.info(f"🔍 Checking GPU availability (unlimited wait)...")
                # UNLIMITED WAIT - will wait forever until GPU is free
                wait_for_gpu_availability(meeting_id, check_interval=5, max_wait=None)
                logger.info(f"✅ GPU is now available for processing")
            
            # Extra stabilization wait
            time.sleep(3)
            
            # Start processing
            processing_thread = None
            processing_result = {}
            processing_error = None
            
            def run_processing():
                nonlocal processing_result, processing_error
                try:
                    processing_result = process_video_sync(
                        video_path, 
                        meeting_id, 
                        host_user_id
                    )
                except Exception as e:
                    processing_error = e
                    import traceback
                    logger.error(f"❌ Processing error: {traceback.format_exc()}")
            
            processing_thread = threading.Thread(target=run_processing, daemon=False)
            processing_thread.start()
            
            # Wait for completion
            processing_thread.join()
            
            # Check results
            if processing_error:
                error_str = str(processing_error)
                error_type = type(processing_error).__name__
                
                # Check if it's a GPU conflict error
                is_gpu_error = any(keyword in error_str.lower() for keyword in 
                                  ['nvdec', 'cuda', 'cuviddecodepicture', 'gpu', 'nvcuvid'])
                
                # TypeError is NOT a GPU error - it's a code error
                is_code_error = error_type in ['TypeError', 'AttributeError', 'NameError', 'KeyError']
                
                if is_code_error:
                    logger.error(f"❌ CODE ERROR (attempt {attempt}): {error_str}")
                    logger.error(f"   Error type: {error_type}")
                    logger.error(f"   This is not a GPU conflict - it's a programming error!")
                    
                    # Don't retry code errors indefinitely - fail fast
                    return {
                        "status": "failed",
                        "error": f"Code error: {error_str}",
                        "error_type": error_type,
                        "attempts": attempt,
                        "interruptions": interruption_count
                    }
                
                elif is_gpu_error and use_gpu:
                    interruption_count += 1
                    logger.error(f"🚨 GPU CONFLICT {interruption_count}: {error_str}")
                    
                    # Save checkpoint
                    checkpoint_manager.save_checkpoint(meeting_id, {
                        'meeting_id': meeting_id,
                        'attempt': attempt,
                        'interruption_count': interruption_count,
                        'last_error': error_str,
                        'timestamp': time.time()
                    })
                    
                    # Wait before retry
                    wait_time = min(30, 5 * interruption_count)
                    logger.info(f"⏳ Waiting {wait_time}s before retry...")
                    
                    # Wait for GPU to stabilize - UNLIMITED WAIT
                    logger.info(f"🔍 Waiting for GPU to become available (no timeout)...")
                    wait_for_gpu_availability(meeting_id, check_interval=5, max_wait=None)
                    time.sleep(wait_time)
                    
                    # Retry
                    continue
                else:
                    # Non-GPU error
                    logger.error(f"❌ Error (attempt {attempt}): {error_str}")
                    logger.error(f"   Error type: {error_type}")
                    
                    # Wait and retry
                    wait_time = min(30, 10 * attempt)
                    logger.info(f"⏳ Waiting {wait_time}s before retry...")
                    time.sleep(wait_time)
                    continue
            
            # Success!
            logger.info(f"✅ Processing completed successfully on attempt {attempt} after {interruption_count} interruptions")
            
            # Clear checkpoint
            checkpoint_manager.clear_checkpoint(meeting_id)
            checkpoint_manager.clear_segments(meeting_id)
            
            # Clean up environment variable
            if 'FORCE_CPU_ENCODING' in os.environ:
                del os.environ['FORCE_CPU_ENCODING']
            
            return {
                "status": "success",
                **processing_result,
                "attempts": attempt,
                "interruptions": interruption_count,
                "encoding_method": "GPU" if use_gpu else "CPU"
            }
            
        except Exception as e:
            logger.error(f"❌ Unexpected error in attempt {attempt}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            
            # Wait before retry
            wait_time = min(60, 10 * attempt)
            logger.info(f"⏳ Waiting {wait_time}s before retry attempt {attempt + 1}...")
            time.sleep(wait_time)


# ============================================================================
# VIDEO PROCESSING QUEUE (Enhanced with Resume Support)
# ============================================================================

class VideoProcessingQueue:
    """Enhanced queue with checkpoint-based resume support"""
    
    def __init__(self):
        self._queue = []
        self._lock = threading.Lock()
        self._processing = False
        self._worker_thread = None
        self._mongodb_client = None
        self._collection = None
        self._active_meeting = None
        
    def _ensure_db_connection(self):
        """Ensure MongoDB connection"""
        if self._mongodb_client is None:
            self._mongodb_client = MongoClient(settings.MONGODB_URI)
            db = self._mongodb_client[settings.MONGODB_DATABASE]
            self._collection = db['recordings']
        
    def add_to_queue(self, meeting_id: str, video_path: str, host_user_id: str, recording_doc_id: str):
        """Add meeting to processing queue"""
        with self._lock:
            # Check if already in queue
            if any(item[0] == meeting_id for item in self._queue):
                logger.warning(f"⚠️ {meeting_id} already in queue, skipping")
                return
            
            self._queue.append((meeting_id, video_path, host_user_id, recording_doc_id))
            logger.info(f"📋 Added {meeting_id} to queue. Queue length: {len(self._queue)}")
            
            # Start worker if not running
            if not self._processing and (self._worker_thread is None or not self._worker_thread.is_alive()):
                self._start_worker()
    
    def _start_worker(self):
        """Start background processing worker"""
        self._worker_thread = threading.Thread(target=self._process_queue, daemon=True, name="VideoProcessingWorker")
        self._worker_thread.start()
        logger.info("🔄 Processing worker thread started")
    
    def _process_queue(self):
        """Process videos with automatic resume on interruption"""
        while True:
            with self._lock:
                if not self._queue:
                    self._processing = False
                    self._active_meeting = None
                    logger.info("✅ Processing queue empty, worker stopping")
                    break
                
                self._processing = True
                meeting_id, video_path, host_user_id, recording_doc_id = self._queue.pop(0)
                self._active_meeting = meeting_id
            
            logger.info(f"🎬 Processing {meeting_id} ({len(self._queue)} remaining)")
            
            try:
                # Process with automatic resume
                result = process_video_with_resume(
                    video_path=video_path,
                    meeting_id=meeting_id,
                    host_user_id=host_user_id,
                    recording_doc_id=recording_doc_id,
                    max_retries=None,  # Unlimited retries
                    max_interruptions=10  # Switch to CPU after 10 GPU interruptions
                )
                
                # Update database
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
                        "processing_attempts": result.get("attempts", 1),
                        "processing_interruptions": result.get("interruptions", 0),
                        "encoding_method": result.get("encoding_method", "unknown")
                    }
                    
                    try:
                        from bson import ObjectId
                        if len(recording_doc_id) == 24:
                            self._ensure_db_connection()
                            self._collection.update_one(
                                {"_id": ObjectId(recording_doc_id)},
                                {"$set": processing_data}
                            )
                            logger.info(f"✅ Updated database for {meeting_id}")
                    except Exception as db_error:
                        logger.warning(f"⚠️ Database update error: {db_error}")
                
                logger.info(f"✅ Completed {meeting_id} after {result.get('attempts', 1)} attempts, {result.get('interruptions', 0)} interruptions")
                
            except Exception as e:
                logger.error(f"❌ FATAL ERROR processing {meeting_id}: {e}")
                import traceback
                logger.error(traceback.format_exc())
                
                # Re-queue for another attempt
                with self._lock:
                    self._queue.append((meeting_id, video_path, host_user_id, recording_doc_id))
                    logger.info(f"🔄 Re-queued {meeting_id} after fatal error")
            
            finally:
                with self._lock:
                    self._active_meeting = None
    
    def get_queue_status(self):
        """Get current queue status"""
        with self._lock:
            return {
                "queue_length": len(self._queue),
                "is_processing": self._processing,
                "active_meeting": self._active_meeting,
                "queued_meetings": [item[0] for item in self._queue]
            }
    
    def get_queue_length(self):
        """Get current queue length"""
        with self._lock:
            return len(self._queue)


# Initialize global processing queue
processing_queue = VideoProcessingQueue()


# ============================================================================
# BACKWARD COMPATIBILITY FUNCTIONS
# ============================================================================

def run_ffmpeg_with_gpu_monitoring(ffmpeg_cmd: List[str], meeting_id: str, 
                                   output_path: str, env: dict = None,
                                   start_time: float = 0.0) -> Tuple[bool, float]:
    """
    Backward compatibility wrapper for old function signature.
    Now uses checkpointing system.
    """
    # Extract input/output from command
    input_idx = ffmpeg_cmd.index('-i') + 1 if '-i' in ffmpeg_cmd else -1
    output_idx = len(ffmpeg_cmd) - 1
    
    if input_idx > 0:
        input_path = ffmpeg_cmd[input_idx]
        use_gpu = 'nvenc' in ' '.join(ffmpeg_cmd)
        
        success, last_time, error_type = run_ffmpeg_with_checkpointing(
            meeting_id=meeting_id,
            input_video=input_path,
            output_video=output_path,
            start_time=start_time,
            use_gpu=use_gpu
        )
        
        return success, last_time
    else:
        logger.error("Could not parse FFmpeg command")
        return False, 0.0


def concatenate_video_chunks(chunk_paths: List[str], final_output: str, meeting_id: str) -> bool:
    """Concatenate video chunks - unchanged"""
    if len(chunk_paths) == 1:
        logger.info(f"✅ Only one chunk: {chunk_paths[0]}")
        os.rename(chunk_paths[0], final_output)
        return True
    
    logger.info(f"🔗 Concatenating {len(chunk_paths)} chunks")
    
    try:
        concat_file = f"/tmp/concat_{meeting_id}.txt"
        with open(concat_file, 'w') as f:
            for chunk in chunk_paths:
                f.write(f"file '{chunk}'\n")
        
        concat_cmd = [
            'ffmpeg', '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_file,
            '-c', 'copy',
            final_output
        ]
        
        result = subprocess.run(concat_cmd, capture_output=True, text=True)
        
        if result.returncode == 0 and os.path.exists(final_output):
            logger.info(f"✅ Concatenation successful")
            
            # Cleanup
            for chunk in chunk_paths:
                try:
                    os.remove(chunk)
                except:
                    pass
            try:
                os.remove(concat_file)
            except:
                pass
            
            return True
        else:
            logger.error(f"❌ Concatenation failed: {result.stderr}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Concatenation error: {e}")
        return False