"""
GPU State Checker - Simple polling-based safety system
No time limits - waits forever until GPU is safe to use
"""

import os
import time
import logging
import subprocess

logger = logging.getLogger('gpu_state_checker')


def is_face_model_loaded():
    """
    Check if face model is currently loaded in GPU memory
    
    Returns:
        bool: True if loaded, False if not loaded
    """
    try:
        # Method 1: Check if model instance exists
        try:
            from face_model_shared import _global_face_model
            if _global_face_model is None:
                logger.debug("Face model instance is None")
                return False
            
            # Check if model is ready
            if not _global_face_model.is_ready():
                logger.debug("Face model exists but not ready")
                return False
            
            logger.debug("Face model instance exists and is ready")
            return True
            
        except ImportError:
            logger.debug("Could not import face_model_shared")
            pass
        
        # Method 2: Check GPU memory usage (comprehensive check)
        current_pid = os.getpid()
        
        result = subprocess.run(
            ['nvidia-smi', '--query-compute-apps=pid,used_memory,process_name', 
             '--format=csv,noheader'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0:
            output = result.stdout.strip()
            if output:
                lines = output.split('\n')
                for line in lines:
                    # Check if any Python process (not current) has significant GPU usage
                    if 'python' in line.lower():
                        try:
                            parts = line.split(',')
                            if len(parts) >= 2:
                                pid_str = parts[0].strip()
                                pid = int(pid_str) if pid_str else 0
                                
                                # Skip our own process
                                if pid == current_pid:
                                    continue
                                
                                memory_str = parts[1].strip()
                                memory_mb = int(memory_str.split()[0]) if memory_str else 0
                                
                                # Face model typically uses 1500-3000MB
                                # Any Python process using >1GB is likely face model
                                if memory_mb > 1000:
                                    logger.debug(f"Found Python process PID {pid} using {memory_mb}MB GPU")
                                    return True
                        except Exception as e:
                            logger.debug(f"Error parsing line '{line}': {e}")
                            continue
        
        # If all checks pass, model is not loaded
        logger.debug("No face model detected in GPU")
        return False
        
    except subprocess.TimeoutExpired:
        logger.warning("nvidia-smi timeout, assuming face model loaded (safe default)")
        return True
    except FileNotFoundError:
        logger.warning("nvidia-smi not found, assuming face model loaded (safe default)")
        return True
    except Exception as e:
        logger.warning(f"Error checking face model status: {e}, assuming loaded (safe default)")
        return True


def wait_for_face_model_unload(meeting_id):
    """
    Wait FOREVER until face model is unloaded from GPU
    NO TIME LIMIT - will wait indefinitely until safe
    
    Args:
        meeting_id: Meeting ID (for logging)
    
    Returns:
        None (always succeeds, waits forever if needed)
    """
    logger.info(f"⏳ Waiting for face model to unload before processing {meeting_id}")
    logger.info(f"⚠️  NO TIME LIMIT - will wait as long as needed")
    
    start_time = time.time()
    check_count = 0
    
    while True:
        # Check if face model is loaded
        if not is_face_model_loaded():
            elapsed = time.time() - start_time
            logger.info(f"✅ Face model unloaded after {elapsed:.1f}s ({check_count} checks)")
            return
        
        elapsed = time.time() - start_time
        
        # Log progress every 30 seconds
        if check_count % 6 == 0:
            minutes_elapsed = int(elapsed / 60)
            seconds_elapsed = int(elapsed % 60)
            logger.info(f"⏳ Still waiting for face model unload... ({minutes_elapsed}m {seconds_elapsed}s elapsed, {check_count} checks)")
        
        check_count += 1
        time.sleep(5)  # Check every 5 seconds


def wait_for_gpu_available(meeting_id):
    """
    Comprehensive GPU availability check - waits FOREVER
    Checks for:
    1. Face model not loaded
    2. No other GPU operations active
    3. GPU memory stabilized
    
    Args:
        meeting_id: Meeting ID (for logging)
    
    Returns:
        None (always succeeds, waits forever if needed)
    """
    logger.info(f"🔍 Comprehensive GPU check for {meeting_id}")
    
    # Step 1: Wait for face model unload
    wait_for_face_model_unload(meeting_id)
    
    # Step 2: Additional GPU stabilization
    logger.info(f"⏳ Waiting 3 seconds for GPU to stabilize...")
    time.sleep(3)
    
    # Step 3: Final verification
    if is_face_model_loaded():
        logger.warning(f"⚠️  Face model detected again after stabilization - waiting again...")
        wait_for_face_model_unload(meeting_id)
    
    logger.info(f"✅ GPU is ready for processing {meeting_id}")


def monitor_face_model_during_processing(meeting_id, check_interval=10):
    """
    Generator that yields True while face model stays unloaded
    Yields False if face model gets loaded (conflict detected)
    
    Usage:
        for is_safe in monitor_face_model_during_processing(meeting_id):
            if not is_safe:
                # Face model loaded - stop processing
                break
            # Continue processing
            time.sleep(1)
    
    Args:
        meeting_id: Meeting ID (for logging)
        check_interval: How often to check (seconds)
    
    Yields:
        bool: True if safe to continue, False if conflict detected
    """
    logger.info(f"👁️  Starting face model monitoring for {meeting_id}")
    last_check = time.time()
    check_count = 0
    
    while True:
        current_time = time.time()
        
        if current_time - last_check >= check_interval:
            check_count += 1
            
            if is_face_model_loaded():
                logger.error(f"🚨 CONFLICT: Face model loaded during processing of {meeting_id}!")
                logger.error(f"🛑 GPU conflict detected after {check_count} checks")
                yield False  # Signal conflict
                return
            else:
                logger.debug(f"✅ Check {check_count}: Face model still unloaded")
            
            last_check = current_time
        
        yield True  # Signal safe to continue
        time.sleep(1)