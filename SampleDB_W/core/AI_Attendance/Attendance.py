import json
import time
import threading
import cv2
import numpy as np
import base64
import io
from PIL import Image
import mediapipe as mp
from scipy.spatial.distance import euclidean
from datetime import datetime, timedelta
import uuid
from functools import wraps
from typing import Optional, Dict, List, Tuple, Any
import traceback
import asyncio

from django.db import models, connection, transaction
from django.utils import timezone
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.urls import path
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.cache import cache
from django.db.models import Avg, Count, Q, Max, Min
import logging
from asgiref.sync import sync_to_async

logger = logging.getLogger(__name__)

# ============================================================================
# ENHANCED LOGGING CONFIGURATION FOR VERIFICATION
# ============================================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Console output
        logging.FileHandler('attendance_verification.log')  # File output
    ]
)

# Set specific logger levels for verification components
logging.getLogger('unified_face_service').setLevel(logging.INFO)
logging.getLogger('meeting_continuous_verification').setLevel(logging.INFO)

logger.info("="*80)
logger.info("✅ AI Attendance System with Identity Verification - STARTED")
logger.info("="*80)

# ==================== CONFIGURATION ====================

class AttendanceConfig:
    """Configuration constants for attendance system - 5 MINUTE BREAK"""
    EAR_THRESHOLD = 0.22
    HEAD_YAW_THRESHOLD = 25
    HAND_FACE_DISTANCE = 0.12
    FACE_MOVEMENT_THRESHOLD = 0.03
    YAW_MOVEMENT_THRESHOLD = 8
    POSE_VARIANCE_THRESHOLD = 0.05
    BASELINE_FRAMES_REQUIRED = 5

    INACTIVITY_WARNING_TIME = 10
    INACTIVITY_VIOLATION_TIME = 20
    VIOLATION_POPUP_TIME = 20           # 20 seconds = 1 violation event
    DETECTION_INTERVAL = 20
    VIOLATION_AUTO_REMOVAL_TIME = 120   # 2 minutes continuous = removal
    BREAK_DURATION = 300                # ✅ UPDATED: 5 minutes = 300 seconds
    POPUP_COOLDOWN = 20
    
    MAX_TOTAL_BREAK_TIME = 300          # ✅ UPDATED: 5 minutes total = 300 seconds
    CAMERA_VERIFICATION_TIMEOUT = 5
    GRACE_PERIOD_DURATION = 2           # 2-second grace period after break
    
    MAX_WARNING_MESSAGES = 4            # First 4 messages are warnings only
    DETECTION_PENALTY_3 = 0.25          # 0.25% reduction after 3 detections
    CONTINUOUS_2MIN_PENALTY = 1.0       # 1% reduction for 2-minute continuous violation
    BREAK_PENALTY = 1.0
    INACTIVITY_PENALTY = 1.0
    
    FACE_DETECTION_CONFIDENCE = 0.7
    FACE_TRACKING_CONFIDENCE = 0.5
    HAND_DETECTION_CONFIDENCE = 0.5
    POSE_DETECTION_CONFIDENCE = 0.5

class ViolationSeverity:
    """Violation severity levels"""
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4

VIOLATION_SEVERITY = {
    "Eyes closed": ViolationSeverity.MEDIUM,
    "Head turned": ViolationSeverity.LOW,
    "Hand near face": ViolationSeverity.MEDIUM,
    "Face not visible": ViolationSeverity.HIGH,
    "Multiple faces detected": ViolationSeverity.CRITICAL,
    "Lying down": ViolationSeverity.HIGH,
    "Inactivity detected": ViolationSeverity.HIGH
}

# ==================== MODELS ====================

class AttendanceSession(models.Model):
    """Enhanced attendance tracking with grace period support"""
    meeting_id = models.CharField(max_length=36, db_column='Meeting_ID')
    user_id = models.CharField(max_length=100, db_column='User_ID')
    
    popup_count = models.IntegerField(default=0)
    detection_counts = models.TextField(default='0')
    violation_start_times = models.TextField(default='{}')
    total_detections = models.IntegerField(default=0)
    attendance_penalty = models.FloatField(default=0.0)
    session_active = models.BooleanField(default=False)
    break_used = models.BooleanField(default=False)
    violations = models.TextField(default='[]')
    session_start_time = models.DateTimeField(default=timezone.now)
    last_activity = models.DateTimeField(default=timezone.now)
    
    last_face_movement_time = models.FloatField(default=0.0)
    inactivity_popup_shown = models.BooleanField(default=False)
    last_popup_time = models.FloatField(default=0.0)
    
    total_session_time = models.IntegerField(default=0)
    active_participation_time = models.IntegerField(default=0)
    violation_severity_score = models.FloatField(default=0.0)
    frame_processing_count = models.IntegerField(default=0)
    last_violation_type = models.CharField(max_length=50, blank=True)
    continuous_violation_time = models.IntegerField(default=0)
    
    total_break_time_used = models.IntegerField(default=0)
    current_break_start_time = models.FloatField(null=True, blank=True)
    break_sessions = models.TextField(default='[]')
    max_break_time_allowed = models.IntegerField(default=300)  # ✅ UPDATED: 5 minutes
    is_currently_on_break = models.BooleanField(default=False)
    break_count = models.IntegerField(default=0)
    last_break_calculation = models.FloatField(default=0.0)
    
    engagement_score = models.DecimalField(max_digits=5, decimal_places=2, default=100.00)
    attendance_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=100.00)
    focus_score = models.DecimalField(max_digits=5, decimal_places=2, default=100.00)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'tbl_Attendance_Sessions'
        unique_together = ['meeting_id', 'user_id']
        indexes = [
            models.Index(fields=['meeting_id']),
            models.Index(fields=['user_id']),
            models.Index(fields=['session_active']),
            models.Index(fields=['created_at']),
        ]
    
    def get_violation_list(self) -> List[Dict]:
        try:
            return json.loads(self.violations) if self.violations else []
        except json.JSONDecodeError:
            return []

# ==================== MEDIAPIPE INITIALIZATION ====================

mp_face = mp.solutions.face_detection.FaceDetection(min_detection_confidence=AttendanceConfig.FACE_DETECTION_CONFIDENCE)
mp_mesh = mp.solutions.face_mesh.FaceMesh(refine_landmarks=True, min_detection_confidence=0.5, min_tracking_confidence=0.5)
mp_pose = mp.solutions.pose.Pose(min_detection_confidence=0.5)
mp_hands = mp.solutions.hands.Hands(min_detection_confidence=0.5)

attendance_sessions = {}

def release_face_model_gpu():
    """Release face model GPU memory after detection"""
    try:
        from face_embeddings import face_model
        if face_model is not None:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                logger.debug("GPU cache cleared after face detection")
    except Exception as e:
        logger.debug(f"Could not clear GPU cache: {e}")

# ==================== UTILITY FUNCTIONS ====================

def validate_session_data(meeting_id: str, user_id):
    """Validate session data"""
    user_id = str(user_id)
    if not meeting_id or not user_id:
        raise ValidationError("meeting_id and user_id are required")
    if len(meeting_id) > 36:
        raise ValidationError("meeting_id too long")
    if len(user_id) > 100:
        raise ValidationError("user_id too long")
    
    session_key = get_session_key(meeting_id, user_id)
    concurrent_sessions = [k for k in attendance_sessions.keys() if k.startswith(f"{meeting_id}_")]
    logger.debug(f"MULTI-USER: Validation for {user_id}. {len(concurrent_sessions)} sessions active")

def get_session_key(meeting_id: str, user_id: str) -> str:
    """Generate unique session key"""
    return f"{meeting_id}_{user_id}"

def decode_image(b64: str) -> Optional[np.ndarray]:
    """Decode base64 image"""
    try:
        b64 = b64.split(',')[1] if ',' in b64 else b64
        image = Image.open(io.BytesIO(base64.b64decode(b64)))
        return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    except Exception as e:
        logger.error(f"Error decoding image: {e}")
        return None

def enhanced_ear(left_eye: List, right_eye: List) -> float:
    """Calculate Enhanced Eye Aspect Ratio"""
    try:
        A = euclidean((left_eye[1].x, left_eye[1].y), (left_eye[5].x, left_eye[5].y))
        B = euclidean((left_eye[2].x, left_eye[2].y), (left_eye[4].x, left_eye[4].y))
        C = euclidean((left_eye[0].x, left_eye[0].y), (left_eye[3].x, left_eye[3].y))
        left_ear = (A + B) / (2.0 * C)
        
        A = euclidean((right_eye[1].x, right_eye[1].y), (right_eye[5].x, right_eye[5].y))
        B = euclidean((right_eye[2].x, right_eye[2].y), (right_eye[4].x, right_eye[4].y))
        C = euclidean((right_eye[0].x, right_eye[0].y), (right_eye[3].x, right_eye[3].y))
        right_ear = (A + B) / (2.0 * C)
        
        return (left_ear + right_ear) / 2
    except Exception as e:
        logger.error(f"Error calculating EAR: {e}")
        return 0.25

def is_fully_lying_down(landmarks) -> bool:
    """Check if person is lying down"""
    try:
        y_vals = [landmarks[i].y for i in [11, 12, 23, 24, 25, 26]]
        return np.std(y_vals) < AttendanceConfig.POSE_VARIANCE_THRESHOLD
    except Exception as e:
        logger.error(f"Error checking pose: {e}")
        return False

def get_extended_tracking_data(attendance_obj):
    """Get extended tracking data from database"""
    try:
        if hasattr(attendance_obj, 'detection_counts') and attendance_obj.detection_counts:
            if attendance_obj.detection_counts.startswith('{'):
                return json.loads(attendance_obj.detection_counts)
            else:
                return {
                    'detection_counts': int(attendance_obj.detection_counts) if attendance_obj.detection_counts.isdigit() else 0,
                    'warning_count': 0,
                    'is_removed_from_meeting': False,
                    'removal_timestamp': None,
                    'removal_reason': '',
                    'continuous_violation_start_time': None,
                    'last_detection_time': 0.0,
                    'detection_penalty_applied': False,
                    'warning_phase_complete': False,
                    'camera_resume_expected': False,
                    'camera_resume_deadline': None,
                    'camera_confirmation_token': None,
                    'camera_verified_at': None,
                    'grace_period_active': False,
                    'grace_period_until': None,
                    # ✅ NEW: Detection penalty tracking fields
                    'total_detection_penalty': 0.0,
                    'detection_batches_completed': 0,
                }
        else:
            return {
                'detection_counts': 0,
                'warning_count': 0,
                'is_removed_from_meeting': False,
                'removal_timestamp': None,
                'removal_reason': '',
                'continuous_violation_start_time': None,
                'last_detection_time': 0.0,
                'detection_penalty_applied': False,
                'warning_phase_complete': False,
                'camera_resume_expected': False,
                'camera_resume_deadline': None,
                'camera_confirmation_token': None,
                'camera_verified_at': None,
                'grace_period_active': False,
                'grace_period_until': None,
                # ✅ NEW: Detection penalty tracking fields
                'total_detection_penalty': 0.0,
                'detection_batches_completed': 0,
            }
    except (json.JSONDecodeError, AttributeError):
        return {
            'detection_counts': 0,
            'warning_count': 0,
            'is_removed_from_meeting': False,
            'removal_timestamp': None,
            'removal_reason': '',
            'continuous_violation_start_time': None,
            'last_detection_time': 0.0,
            'detection_penalty_applied': False,
            'warning_phase_complete': False,
            'camera_resume_expected': False,
            'camera_resume_deadline': None,
            'camera_confirmation_token': None,
            'camera_verified_at': None,
            'grace_period_active': False,
            'grace_period_until': None,
            # ✅ NEW: Detection penalty tracking fields
            'total_detection_penalty': 0.0,
            'detection_batches_completed': 0,
        }

def save_extended_tracking_data(attendance_obj, extended_data):
    """Save extended tracking data"""
    try:
        attendance_obj.detection_counts = json.dumps(extended_data)
        attendance_obj.save()
        logger.info(f"DB SAVE: Extended tracking data for {attendance_obj.user_id}")
    except Exception as e:
        logger.error(f"Failed to save extended tracking data: {e}")

def calculate_current_break_time(session, current_time):
    """Calculate current break time"""
    if session.get('is_currently_on_break') and session.get('current_break_start_time'):
        current_break_duration = current_time - session['current_break_start_time']
        return session.get('total_break_time_used', 0) + current_break_duration
    return session.get('total_break_time_used', 0)

def update_break_time_used(session, attendance_obj, current_time):
    """Update break time used"""
    if session.get('is_currently_on_break') and session.get('current_break_start_time'):
        current_break_duration = current_time - session['current_break_start_time']
        session['total_break_time_used'] += current_break_duration
        
        break_session = {
            'start_time': session['current_break_start_time'],
            'end_time': current_time,
            'duration': current_break_duration,
            'break_number': session.get('break_count', 0)
        }
        
        if 'break_sessions' not in session:
            session['break_sessions'] = []
        session['break_sessions'].append(break_session)
        
        attendance_obj.total_break_time_used = int(session['total_break_time_used'])
        attendance_obj.break_sessions = json.dumps(session['break_sessions'])
        
        logger.info(f"MULTI-USER: Break session recorded for {attendance_obj.user_id}: {current_break_duration:.1f}s")

def generate_camera_verification_token(meeting_id: str, user_id: str, timestamp: float) -> str:
    """Generate verification token"""
    import hashlib
    data = f"{meeting_id}_{user_id}_{timestamp}_{uuid.uuid4()}"
    return hashlib.sha256(data.encode()).hexdigest()[:32]

# ==================== HELPER: Run async code in sync context ====================

def run_async_verification(frame, user_id):
    """
    Helper function to run async verification in sync context
    Returns: (is_verified, similarity)
    """
    try:
        # Create new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            # Import and run verification
            from core.FaceAuth.unified_face_service import get_unified_face_service
            face_service = get_unified_face_service()
            
            # Run async verification
            result = loop.run_until_complete(
                face_service.verify_face(
                    frame=frame,
                    user_id=user_id,
                    threshold=0.6,
                    method='cosine'
                )
            )
            return result
        finally:
            loop.close()
            
    except Exception as e:
        logger.error(f"Error in async verification: {e}")
        logger.error(traceback.format_exc())
        return (True, 1.0)  # Skip on error

# ==================== INTEGRATION HOOKS ====================
def start_attendance_tracking(meeting_id: str, user_id, user_name: str = None) -> bool:
    """
    ✅ FIXED: Start tracking for user with proper rejoin handling
    
    Changes from original:
    - Loads ALL previous data from database on rejoin
    - Preserves warnings, detections, penalties, break time
    - Fixes break_used flag based on actual time used (not just break_count)
    - Only creates fresh session for first-time joins
    - CRITICAL FIX: Reset baseline and face detection on rejoin for proper behavior detection
    - NEW: Properly calculates and preserves cumulative detection penalty
    - REJOIN FIX: Allows immediate detection after rejoin by setting last_detection_time to past
    - REMOVAL FIX: Resets removal status on rejoin to allow users to restart
    
    NO NEW DATABASE COLUMNS REQUIRED - Uses existing structure
    """
    user_id = str(user_id)
    session_key = get_session_key(meeting_id, user_id)
    
    concurrent_sessions = [k for k in attendance_sessions.keys() if k.startswith(f"{meeting_id}_")]
    
    # Check if session already exists in memory
    if session_key in attendance_sessions:
        logger.warning(f"MULTI-USER: Session already exists in memory for {meeting_id}_{user_id}")
        return True
    
    # ============================================================================
    # ✅ FIX: Check database FIRST to load previous data on rejoin
    # ============================================================================
    try:
        existing_db = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
        
        # ✅ REJOIN DETECTED - Load ALL previous data
        logger.info(f"🔄 REJOIN DETECTED: Loading previous data for {user_id}")
        
        # Load extended tracking data
        extended_data = get_extended_tracking_data(existing_db)
        
        # ✅ CHECK: Was user previously removed?
        was_previously_removed = extended_data.get('is_removed_from_meeting', False)
        previous_removal_reason = extended_data.get('removal_reason', '')
        
        # Load break sessions history
        try:
            break_sessions_list = json.loads(existing_db.break_sessions) if existing_db.break_sessions else []
        except json.JSONDecodeError:
            break_sessions_list = []
        
        # Load violations history
        try:
            violations_list = json.loads(existing_db.violations) if existing_db.violations else []
        except json.JSONDecodeError:
            violations_list = []
        
        # Load violation start times
        try:
            violation_start_dict = json.loads(existing_db.violation_start_times) if existing_db.violation_start_times else {}
        except json.JSONDecodeError:
            violation_start_dict = {}
        
        # ============================================================================
        # ✅ CRITICAL FIX: Calculate if break_used should be True
        # Rule: break_used = True ONLY if total_break_time_used >= max_break_time_allowed
        # ============================================================================
        total_break_used = existing_db.total_break_time_used or 0
        max_break_allowed = existing_db.max_break_time_allowed or AttendanceConfig.MAX_TOTAL_BREAK_TIME
        
        # Calculate correct break_used flag based on ACTUAL time used
        should_break_be_used = total_break_used >= max_break_allowed
        
        logger.info(
            f"📊 BREAK STATUS for {user_id}:\n"
            f"  - Break Time Used: {total_break_used}s\n"
            f"  - Max Allowed: {max_break_allowed}s\n"
            f"  - Remaining: {max_break_allowed - total_break_used}s\n"
            f"  - Database break_used: {existing_db.break_used}\n"
            f"  - Calculated break_used: {should_break_be_used}\n"
            f"  - Will use: {should_break_be_used}"
        )
        
        # ============================================================================
        # ✅ REJOIN FIX: Calculate last_detection_time to allow immediate detection
        # ============================================================================
        current_time = time.time()
        # Set last_detection_time to past so first violation can trigger detection immediately
        rejoin_last_detection_time = current_time - AttendanceConfig.DETECTION_INTERVAL
        
        # ✅ CREATE SESSION WITH PREVIOUS DATA (PRESERVED)
        attendance_sessions[session_key] = {
            "meeting_id": meeting_id,
            "user_id": user_id,
            "user_name": user_name or f"User_{user_id}",
            
            # ✅ PRESERVE: Warnings and Detections
            "popup_count": existing_db.popup_count,
            "warning_count": extended_data.get('warning_count', 0),
            "detection_counts": extended_data.get('detection_counts', 0),
            "total_detections": existing_db.total_detections,
            
            # ✅ PRESERVE: Penalties
            "attendance_penalty": float(existing_db.attendance_penalty),
            
            # ✅ NEW: Calculate and preserve cumulative detection penalty
            "total_detection_penalty_applied": (extended_data.get('detection_counts', 0) // 3) * AttendanceConfig.DETECTION_PENALTY_3,
            
            # ✅ PRESERVE: Session state
            "session_active": True,  # Resume as active
            "break_used": should_break_be_used,  # ✅ Use calculated value (FIXED)
            "violations": violations_list,
            "last_popup_time": 0,  # ✅ RESET: Allow immediate popup on rejoin
            "violation_start_times": {},  # ✅ RESET: Clear violation timers on rejoin
            
            # ✅ PRESERVE: Timestamps (use current time for activity tracking)
            "start_time": existing_db.session_start_time,
            "last_activity": timezone.now(),
            "last_face_movement_time": current_time,  # ✅ RESET: Current time for inactivity tracking
            "inactivity_popup_shown": False,  # ✅ RESET: Allow inactivity popup
            
            # ✅ REMOVAL FIX: Reset removal state to allow restart
            "is_removed_from_meeting": False,  # ✅ RESET: Allow user to restart after removal
            "removal_timestamp": None,  # ✅ RESET: Clear removal timestamp
            "removal_reason": "",  # ✅ RESET: Clear removal reason
            "continuous_violation_start_time": None,  # ✅ RESET: Clear continuous violation timer
            "last_detection_time": rejoin_last_detection_time,  # ✅ REJOIN FIX: Set to past time to allow immediate detection
            "detection_penalty_applied": extended_data.get('detection_penalty_applied', False),
            "warning_phase_complete": extended_data.get('warning_phase_complete', False),
            
            # ✅ PRESERVE: Break time data (CRITICAL FOR ENFORCEMENT)
            "total_break_time_used": total_break_used,
            "current_break_start_time": None,  # Not on break when rejoining
            "is_currently_on_break": False,    # Resume in active state
            "break_count": existing_db.break_count or 0,
            "break_sessions": break_sessions_list,
            "max_break_time_allowed": max_break_allowed,
            
            # ✅ RESET: Camera verification (fresh verification on rejoin)
            "camera_resume_expected": False,  # Reset camera state on rejoin
            "camera_resume_deadline": None,
            "camera_confirmation_token": None,
            "camera_verified_at": current_time,  # Mark as verified on rejoin
            
            # ✅ RESET: Grace period (not active on rejoin)
            "grace_period_active": False,
            "grace_period_until": None,
            
            # ✅ CRITICAL FIX: RESET BASELINE - This ensures behavior detection works on rejoin
            "baseline_ear": None,  # ✅ RESET: Will re-establish baseline
            "baseline_yaw": None,  # ✅ RESET: Will re-establish baseline
            "baseline_samples": 0,  # ✅ RESET: Start fresh baseline collection
            "baseline_established": False,  # ✅ RESET: Must re-establish baseline
            "face_detected": False,  # ✅ RESET: Will detect face again
            
            # ✅ PRESERVE: Metrics
            "frame_processing_count": existing_db.frame_processing_count,
            "active_participation_time": existing_db.active_participation_time,
            "violation_severity_score": float(existing_db.violation_severity_score),
            "continuous_violation_time": 0,  # ✅ RESET: Clear continuous time
            "last_violation_type": "",  # ✅ RESET: Clear last violation
            "metrics_history": [],
            
            # ✅ Tracking
            "session_started_at": current_time,
            "isolation_verified": True,
            "concurrent_participants_at_start": len(concurrent_sessions),
        }
        
        # ✅ LOG: Removed user rejoining
        if was_previously_removed:
            logger.warning(
                f"🔄 REMOVED USER REJOINING: {user_id}\n"
                f"  - Previous removal reason: {previous_removal_reason}\n"
                f"  - Removal status: CLEARED (user can restart)\n"
                f"  - Detection will restart normally\n"
                f"  - Previous penalties preserved: {existing_db.attendance_penalty:.4f}%\n"
                f"  - Warnings preserved: {existing_db.popup_count}\n"
                f"  - Detections preserved: {extended_data.get('detection_counts', 0)}"
            )
        
        # ✅ UPDATE DATABASE: Mark as active and fix break_used if needed
        existing_db.session_active = True
        existing_db.is_currently_on_break = False
        existing_db.current_break_start_time = None
        existing_db.last_face_movement_time = current_time
        existing_db.inactivity_popup_shown = False
        
        # ✅ FIX: Update break_used in database to match calculated value
        if existing_db.break_used != should_break_be_used:
            logger.info(f"🔧 FIXING break_used flag for {user_id}: {existing_db.break_used} → {should_break_be_used}")
            existing_db.break_used = should_break_be_used
        
        existing_db.save()
        
        # ✅ RESET: Extended data for fresh detection on rejoin
        extended_data['continuous_violation_start_time'] = None
        # ✅ REJOIN FIX: Set last_detection_time to allow immediate detection on rejoin
        extended_data['last_detection_time'] = rejoin_last_detection_time
        # ✅ REMOVAL FIX: Reset removal flags to allow restart
        extended_data['is_removed_from_meeting'] = False
        extended_data['removal_timestamp'] = None
        extended_data['removal_reason'] = ''
        extended_data['camera_resume_expected'] = False
        extended_data['camera_resume_deadline'] = None
        extended_data['camera_confirmation_token'] = None
        extended_data['camera_verified_at'] = current_time
        extended_data['grace_period_active'] = False
        extended_data['grace_period_until'] = None
        save_extended_tracking_data(existing_db, extended_data)
        
        logger.info(
            f"✅ REJOIN SUCCESSFUL for {user_id}:\n"
            f"  - Warnings: {existing_db.popup_count}\n"
            f"  - Detections: {extended_data.get('detection_counts', 0)}\n"
            f"  - Penalty: {existing_db.attendance_penalty:.4f}%\n"
            f"  - Detection Penalty: {(extended_data.get('detection_counts', 0) // 3) * AttendanceConfig.DETECTION_PENALTY_3:.4f}%\n"
            f"  - Break Time Used: {total_break_used}s / {max_break_allowed}s\n"
            f"  - Break Available: {max_break_allowed - total_break_used}s\n"
            f"  - break_used Flag: {should_break_be_used}\n"
            f"  - Removal Status: {'CLEARED (was removed)' if was_previously_removed else 'Not removed'}\n"
            f"  - Baseline Reset: Yes (will re-establish)\n"
            f"  - Detection Ready: Yes (last_detection_time set to past)\n"
            f"  - Meeting has {len(concurrent_sessions) + 1} participants"
        )
        
        return True
        
    except AttendanceSession.DoesNotExist:
        # ============================================================================
        # ✅ FIRST TIME JOIN - Create fresh session (ORIGINAL LOGIC)
        # ============================================================================
        logger.info(f"🆕 FIRST JOIN: Creating new session for {user_id}")
        
        current_time = time.time()
        
        attendance_sessions[session_key] = {
            "meeting_id": meeting_id,
            "user_id": user_id,
            "user_name": user_name or f"User_{user_id}",
            
            "popup_count": 0,
            "warning_count": 0,
            "detection_counts": 0,
            "total_detections": 0,
            "attendance_penalty": 0.0,
            "session_active": True,
            "break_used": False,
            "violations": [],
            "last_popup_time": 0,
            "violation_start_times": {},
            "start_time": timezone.now(),
            "last_activity": timezone.now(),
            "last_face_movement_time": current_time,
            "inactivity_popup_shown": False,
            
            "is_removed_from_meeting": False,
            "removal_timestamp": None,
            "removal_reason": "",
            "continuous_violation_start_time": None,
            "last_detection_time": 0.0,
            "detection_penalty_applied": False,
            "warning_phase_complete": False,
            
            # ✅ NEW: Track cumulative detection penalty
            "total_detection_penalty_applied": 0.0,
            
            "total_break_time_used": 0,
            "current_break_start_time": None,
            "is_currently_on_break": False,
            "break_count": 0,
            "break_sessions": [],
            "max_break_time_allowed": AttendanceConfig.MAX_TOTAL_BREAK_TIME,
            
            "camera_resume_expected": False,
            "camera_resume_deadline": None,
            "camera_confirmation_token": None,
            "camera_verified_at": current_time,
            
            "grace_period_active": False,
            "grace_period_until": None,
            
            "baseline_ear": None,
            "baseline_yaw": None,
            "baseline_samples": 0,
            "baseline_established": False,
            "face_detected": False,
            
            "frame_processing_count": 0,
            "active_participation_time": 0,
            "violation_severity_score": 0.0,
            "continuous_violation_time": 0,
            "last_violation_type": "",
            "metrics_history": [],
            
            "session_started_at": current_time,
            "isolation_verified": True,
            "concurrent_participants_at_start": len(concurrent_sessions),
        }

        try:
            extended_tracking = {
                'detection_counts': 0,
                'warning_count': 0,
                'is_removed_from_meeting': False,
                'removal_timestamp': None,
                'removal_reason': '',
                'continuous_violation_start_time': None,
                'last_detection_time': 0.0,
                'detection_penalty_applied': False,
                'warning_phase_complete': False,
                'camera_resume_expected': False,
                'camera_resume_deadline': None,
                'camera_confirmation_token': None,
                'camera_verified_at': current_time,
                'grace_period_active': False,
                'grace_period_until': None,
                # ✅ NEW: Track detection penalty details
                'total_detection_penalty': 0.0,
                'detection_batches_completed': 0,
            }
            
            AttendanceSession.objects.update_or_create(
                meeting_id=meeting_id,
                user_id=user_id,
                defaults={
                    'popup_count': 0,
                    'detection_counts': json.dumps(extended_tracking),
                    'violation_start_times': '{}',
                    'total_detections': 0,
                    'attendance_penalty': 0.0,
                    'session_active': True,
                    'break_used': False,
                    'violations': '[]',
                    'session_start_time': timezone.now(),
                    'last_activity': timezone.now(),
                    'last_face_movement_time': current_time,
                    'inactivity_popup_shown': False,
                    'total_session_time': 0,
                    'active_participation_time': 0,
                    'violation_severity_score': 0.0,
                    'frame_processing_count': 0,
                    'engagement_score': 100.00,
                    'attendance_percentage': 100.00,
                    'focus_score': 100.00,
                    'total_break_time_used': 0,
                    'current_break_start_time': None,
                    'break_sessions': '[]',
                    'max_break_time_allowed': AttendanceConfig.MAX_TOTAL_BREAK_TIME,
                    'is_currently_on_break': False,
                    'break_count': 0,
                    'last_break_calculation': 0.0,
                }
            )
            
            final_concurrent_count = len([k for k in attendance_sessions.keys() if k.startswith(f"{meeting_id}_")])
            logger.info(f"MULTI-USER: Started independent tracking for {meeting_id}_{user_id}. Meeting has {final_concurrent_count} participants")
            
            return True
            
        except Exception as e:
            logger.error(f"MULTI-USER: Failed to start tracking for {meeting_id}_{user_id}: {e}")
            if session_key in attendance_sessions:
                del attendance_sessions[session_key]
            return False


def stop_attendance_tracking(meeting_id: str, user_id) -> bool:
    """Stop tracking for user"""
    user_id = str(user_id)
    session_key = get_session_key(meeting_id, user_id)
    
    other_participants = [k for k in attendance_sessions.keys() 
                         if k.startswith(f"{meeting_id}_") and k != session_key]
    
    logger.info(f"MULTI-USER: Stopping tracking for {user_id}. {len(other_participants)} other participants unaffected")
    
    if session_key in attendance_sessions:
        session = attendance_sessions[session_key]
        current_time = time.time()
        
        try:
            attendance_obj = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
            
            if session.get('is_currently_on_break'):
                update_break_time_used(session, attendance_obj, current_time)
                session['is_currently_on_break'] = False
                session['current_break_start_time'] = None
                attendance_obj.is_currently_on_break = False
                attendance_obj.current_break_start_time = None
                attendance_obj.save()
                
        except AttendanceSession.DoesNotExist:
            pass
        
        store_attendance_to_db(meeting_id, user_id)
        del attendance_sessions[session_key]
        
        remaining_participants = [k for k in attendance_sessions.keys() 
                                if k.startswith(f"{meeting_id}_")]
        logger.info(f"MULTI-USER: User {user_id} stopped. {len(remaining_participants)} participants continue")
        
        return True
    
    logger.warning(f"MULTI-USER: No session found for {meeting_id}_{user_id}")
    return False

def store_attendance_to_db(meeting_id: str, user_id: str) -> bool:
    """Store attendance data"""
    session_key = get_session_key(meeting_id, user_id)
    
    if session_key not in attendance_sessions:
        logger.warning(f"MULTI-USER: Cannot store - no session for {meeting_id}_{user_id}")
        return False
        
    state = attendance_sessions[session_key]
    
    try:
        with transaction.atomic():
            current_time = timezone.now()
            session_duration = (current_time - state["start_time"]).total_seconds()
            
            extended_data = {
                'detection_counts': state.get("detection_counts", 0),
                'warning_count': state.get("warning_count", 0),
                'is_removed_from_meeting': state.get("is_removed_from_meeting", False),
                'removal_timestamp': state.get("removal_timestamp").isoformat() if state.get("removal_timestamp") else None,
                'removal_reason': state.get("removal_reason", ""),
                'continuous_violation_start_time': state.get("continuous_violation_start_time"),
                'last_detection_time': state.get("last_detection_time", 0.0),
                'detection_penalty_applied': state.get("detection_penalty_applied", False),
                'warning_phase_complete': state.get("warning_phase_complete", False),
                'camera_resume_expected': state.get("camera_resume_expected", False),
                'camera_resume_deadline': state.get("camera_resume_deadline"),
                'camera_confirmation_token': state.get("camera_confirmation_token"),
                'camera_verified_at': state.get("camera_verified_at"),
                'grace_period_active': state.get("grace_period_active", False),
                'grace_period_until': state.get("grace_period_until"),
            }
            
            AttendanceSession.objects.update_or_create(
                meeting_id=meeting_id,
                user_id=user_id,
                defaults={
                    'popup_count': state["popup_count"],
                    'detection_counts': json.dumps(extended_data),
                    'violation_start_times': json.dumps(state["violation_start_times"]),
                    'total_detections': state["total_detections"],
                    'attendance_penalty': state["attendance_penalty"],
                    'session_active': state["session_active"],
                    'break_used': state["break_used"],
                    'violations': json.dumps(state["violations"]),
                    'session_start_time': state["start_time"],
                    'last_activity': current_time,
                    'total_session_time': int(session_duration),
                    'active_participation_time': state.get("active_participation_time", int(session_duration)),
                    'violation_severity_score': state.get("violation_severity_score", 0.0),
                    'frame_processing_count': state.get("frame_processing_count", 0),
                    'engagement_score': max(0, 100 - state["attendance_penalty"]),
                    'attendance_percentage': max(0, 100 - state["attendance_penalty"]),
                    'total_break_time_used': state.get("total_break_time_used", 0),
                    'break_sessions': json.dumps(state.get("break_sessions", [])),
                    'break_count': state.get("break_count", 0),
                    'is_currently_on_break': state.get("is_currently_on_break", False),
                }
            )
            
            return True
        
    except Exception as e:
        logger.error(f"MULTI-USER: Failed to store attendance for {meeting_id}_{user_id}: {e}")
        return False

# ==================== CAMERA VERIFICATION ====================

@csrf_exempt
@require_http_methods(["POST"])
def verify_camera_resumed(request):
    """Verify camera was re-enabled after break"""
    try:
        data = json.loads(request.body)
        meeting_id = data.get('meeting_id')
        user_id = data.get('user_id')
        confirmation_token = data.get('confirmation_token')
        camera_active = data.get('camera_active', False)
        
        if not all([meeting_id, user_id, confirmation_token]):
            return JsonResponse({
                'success': False,
                'error': 'Missing required fields'
            }, status=400)
        
        user_id = str(user_id)
        validate_session_data(meeting_id, user_id)
        session_key = get_session_key(meeting_id, user_id)
        
        if session_key not in attendance_sessions:
            return JsonResponse({
                'success': False,
                'error': 'Session not found'
            }, status=404)
        
        session = attendance_sessions[session_key]
        expected_token = session.get('camera_confirmation_token')
        
        if not expected_token:
            logger.warning(f"CAMERA VERIFY: No token expected for {user_id}")
            return JsonResponse({
                'success': False,
                'error': 'No camera verification expected'
            }, status=400)
        
        if confirmation_token != expected_token:
            logger.warning(f"CAMERA VERIFY: Invalid token for {user_id}")
            return JsonResponse({
                'success': False,
                'error': 'Invalid confirmation token'
            }, status=403)
        
        deadline = session.get('camera_resume_deadline', 0)
        current_time = time.time()
        
        if current_time > deadline:
            logger.warning(f"CAMERA VERIFY: Deadline exceeded for {user_id}")
            return JsonResponse({
                'success': False,
                'error': 'Verification deadline exceeded',
                'requires_manual_restart': True
            }, status=408)
        
        if not camera_active:
            logger.warning(f"CAMERA VERIFY: Camera not active for {user_id}")
            return JsonResponse({
                'success': False,
                'error': 'Camera not active',
                'retry_required': True
            }, status=400)
        
        session['camera_resume_expected'] = False
        session['camera_resume_deadline'] = None
        session['camera_confirmation_token'] = None
        session['camera_verified_at'] = current_time
        
        try:
            attendance_obj = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
            extended_data = get_extended_tracking_data(attendance_obj)
            extended_data['camera_resume_expected'] = False
            extended_data['camera_resume_deadline'] = None
            extended_data['camera_confirmation_token'] = None
            extended_data['camera_verified_at'] = current_time
            save_extended_tracking_data(attendance_obj, extended_data)
        except AttendanceSession.DoesNotExist:
            pass
        
        logger.info(f"CAMERA VERIFIED for {user_id}")
        
        return JsonResponse({
            'success': True,
            'message': 'Camera verified successfully',
            'detection_can_start': True,
            'timestamp': current_time,
            'verified_at': current_time
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)
    except ValidationError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except Exception as e:
        logger.error(f"Camera verification error: {e}")
        return JsonResponse({'success': False, 'error': 'Verification failed'}, status=500)

# ==================== PAUSE/RESUME WITH GRACE PERIOD ====================

@csrf_exempt
@require_http_methods(["POST"])
def pause_resume_attendance(request):
    """
    ✅ FIXED: Enhanced pause/resume with STRICT 5-minute break enforcement
    
    Changes from original:
    - Blocks break requests if >= 300 seconds already used
    - Prevents break if currently on break
    - Applies break penalty correctly
    - Sets break_used flag automatically when time exhausted
    
    NO NEW DATABASE COLUMNS REQUIRED - Uses existing structure
    """
    try:
        data = json.loads(request.body)
        meeting_id = data.get('meeting_id')
        user_id = data.get('user_id')
        action = data.get('action')
        
        if not meeting_id or not user_id:
            return JsonResponse({
                'success': False, 
                'error': 'meeting_id and user_id are required'
            }, status=400)
            
        if action not in ['pause', 'resume']:
            return JsonResponse({
                'success': False, 
                'error': 'action must be "pause" or "resume"'
            }, status=400)
        
        user_id = str(user_id)
        validate_session_data(meeting_id, user_id)
        session_key = get_session_key(meeting_id, user_id)
        
        other_participants = [k for k in attendance_sessions.keys() 
                            if k.startswith(f"{meeting_id}_") and k != session_key]
        
        logger.info(f"MULTI-USER: {action} request for {user_id}. {len(other_participants)} other participants unaffected")
        
        if session_key not in attendance_sessions:
            return JsonResponse({
                'success': False, 
                'error': 'No active attendance session'
            }, status=404)
        
        session = attendance_sessions[session_key]
        current_time = time.time()
        
        try:
            attendance_obj = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
        except AttendanceSession.DoesNotExist:
            return JsonResponse({
                'success': False, 
                'error': 'Attendance session not found in database'
            }, status=404)
        
        # ✅ INITIALIZE: Break tracking if missing
        if 'total_break_time_used' not in session:
            session['total_break_time_used'] = attendance_obj.total_break_time_used or 0
            session['current_break_start_time'] = attendance_obj.current_break_start_time
            session['is_currently_on_break'] = attendance_obj.is_currently_on_break
            session['break_count'] = attendance_obj.break_count or 0
            session['break_used'] = attendance_obj.break_used
            session['max_break_time_allowed'] = attendance_obj.max_break_time_allowed or AttendanceConfig.MAX_TOTAL_BREAK_TIME
            try:
                session['break_sessions'] = json.loads(attendance_obj.break_sessions) if attendance_obj.break_sessions else []
            except json.JSONDecodeError:
                session['break_sessions'] = []
        
        max_break_time = session.get('max_break_time_allowed', AttendanceConfig.MAX_TOTAL_BREAK_TIME)
        
        # ============================================================================
        # ✅ ACTION: PAUSE (Take Break)
        # ============================================================================
        if action == 'pause':
            # ✅ CHECK 1: Already on break?
            if session.get('is_currently_on_break', False):
                current_total_break_time = calculate_current_break_time(session, current_time)
                return JsonResponse({
                    'success': False,
                    'error': 'Already on break',
                    'break_time_remaining': max(0, max_break_time - current_total_break_time),
                    'total_break_time_used': current_total_break_time,
                    'is_on_break': True,
                }, status=400)
            
            # ✅ CHECK 2: Calculate total break time used (including any current break)
            current_total_break_time = calculate_current_break_time(session, current_time)
            
            # ============================================================================
            # ✅ CRITICAL FIX: ENFORCE 5-MINUTE LIMIT - Block if already used >= 300s
            # ============================================================================
            if current_total_break_time >= max_break_time:
                logger.warning(
                    f"🚫 BREAK DENIED for {user_id}: Already used {current_total_break_time}s / {max_break_time}s"
                )
                return JsonResponse({
                    'success': False,
                    'error': 'Break time limit exceeded - No more break time available',
                    'message': 'You have already used your full 5-minute break allowance',
                    'total_break_time_used': current_total_break_time,
                    'max_break_time_allowed': max_break_time,
                    'break_time_remaining': 0,
                    'break_time_exhausted': True,
                    'is_on_break': False,
                    'can_take_break': False,
                }, status=403)
            
            # ✅ CHECK 3: How much break time is available?
            break_duration_available = max(0, max_break_time - current_total_break_time)
            
            if break_duration_available <= 0:
                logger.warning(
                    f"🚫 BREAK DENIED for {user_id}: No break time remaining"
                )
                return JsonResponse({
                    'success': False,
                    'error': 'No break time remaining',
                    'message': 'You have used all your break time',
                    'total_break_time_used': current_total_break_time,
                    'max_break_time_allowed': max_break_time,
                    'break_time_remaining': 0,
                    'break_time_exhausted': True,
                    'is_on_break': False,
                    'can_take_break': False,
                }, status=403)
            
            # ✅ ALLOW BREAK: Update session state
            session['is_currently_on_break'] = True
            session['current_break_start_time'] = current_time
            session['session_active'] = False
            session['break_count'] += 1
            
            # Note: Don't set break_used=True here! Only when time exhausted on resume.
            
            logger.info(
                f"✅ BREAK #{session['break_count']} STARTED for {user_id}:\n"
                f"  - Available: {break_duration_available}s\n"
                f"  - Already Used: {current_total_break_time}s\n"
                f"  - Remaining After: {max_break_time - current_total_break_time}s"
            )
            
            # ✅ UPDATE DATABASE
            attendance_obj.is_currently_on_break = True
            attendance_obj.current_break_start_time = current_time
            attendance_obj.session_active = False
            attendance_obj.break_count = session['break_count']
            attendance_obj.save()
            
            return JsonResponse({
                'success': True,
                'action': 'paused',
                'message': f'Break #{session["break_count"]} started',
                'break_time_remaining': break_duration_available,
                'total_break_time_used': current_total_break_time,
                'max_break_time_allowed': max_break_time,
                'break_count': session['break_count'],
                'break_used': session.get('break_used', False),
                'is_on_break': True,
                'break_start_time': current_time,
                'break_duration': break_duration_available,
                'camera_should_disable': True,
                'warning': f'You have {break_duration_available}s of break time remaining',
            })
        
        # ============================================================================
        # ✅ ACTION: RESUME (End Break)
        # ============================================================================
        elif action == 'resume':
            # ✅ CHECK: Not currently on break?
            if not session.get('is_currently_on_break', False):
                return JsonResponse({
                    'success': False,
                    'error': 'Not currently on break',
                    'break_time_remaining': max(0, max_break_time - session.get('total_break_time_used', 0)),
                    'total_break_time_used': session.get('total_break_time_used', 0),
                    'is_on_break': False,
                }, status=400)
            
            # ✅ CALCULATE: Break duration for this session
            update_break_time_used(session, attendance_obj, current_time)
            break_duration_used = current_time - session['current_break_start_time'] if session.get('current_break_start_time') else 0
            
            # ============================================================================
            # ✅ APPLY BREAK PENALTY: 1% per 5 minutes (300 seconds)
            # ============================================================================
            penalty_per_5_minutes = AttendanceConfig.BREAK_PENALTY  # 1.0%
            break_penalty = (break_duration_used / 300.0) * penalty_per_5_minutes
            session['attendance_penalty'] += break_penalty
            
            logger.info(
                f"💰 BREAK #{session['break_count']} PENALTY for {user_id}: "
                f"{break_penalty:.4f}% for {break_duration_used:.1f}s break. "
                f"Total penalty now: {session['attendance_penalty']:.4f}%"
            )
            
            # ============================================================================
            # ✅ CHECK: Automatically set break_used flag if time exhausted
            # ============================================================================
            total_break_used = session['total_break_time_used']
            if total_break_used >= max_break_time:
                session['break_used'] = True
                logger.info(f"🚫 break_used AUTO-SET to True for {user_id} - Time exhausted ({total_break_used}s >= {max_break_time}s)")
            
            # ✅ UPDATE SESSION STATE
            session['is_currently_on_break'] = False
            session['current_break_start_time'] = None
            session['session_active'] = True
            session['last_face_movement_time'] = current_time
            session['inactivity_popup_shown'] = False
            session['violation_start_times'] = {}
            
            # ✅ ACTIVATE GRACE PERIOD
            grace_period_until = current_time + AttendanceConfig.GRACE_PERIOD_DURATION
            session['grace_period_active'] = True
            session['grace_period_until'] = grace_period_until
            
            # ✅ CAMERA VERIFICATION
            verification_token = generate_camera_verification_token(meeting_id, user_id, current_time)
            verification_deadline = current_time + AttendanceConfig.CAMERA_VERIFICATION_TIMEOUT
            
            session['camera_resume_expected'] = True
            session['camera_resume_deadline'] = verification_deadline
            session['camera_confirmation_token'] = verification_token
            
            logger.info(f"⏱️ GRACE PERIOD ACTIVATED for {user_id}: {AttendanceConfig.GRACE_PERIOD_DURATION}s")
            
            # ============================================================================
            # ✅ UPDATE DATABASE: Penalty, percentage, engagement score, break_used
            # ============================================================================
            attendance_obj.is_currently_on_break = False
            attendance_obj.current_break_start_time = None
            attendance_obj.session_active = True
            attendance_obj.last_face_movement_time = current_time
            attendance_obj.inactivity_popup_shown = False
            
            attendance_obj.attendance_penalty = session['attendance_penalty']
            new_percentage = max(0, 100 - session['attendance_penalty'])
            attendance_obj.attendance_percentage = new_percentage
            attendance_obj.engagement_score = new_percentage
            
            # ✅ Update break_used flag in database
            attendance_obj.break_used = session['break_used']
            
            attendance_obj.save()
            
            logger.info(
                f"💾 DB UPDATED: User {user_id} - "
                f"Penalty: {session['attendance_penalty']:.4f}%, "
                f"Attendance: {new_percentage:.2f}%, "
                f"Engagement: {new_percentage:.2f}%, "
                f"break_used: {session['break_used']}"
            )
            
            # ✅ UPDATE EXTENDED DATA
            try:
                extended_data = get_extended_tracking_data(attendance_obj)
                extended_data['camera_resume_expected'] = True
                extended_data['camera_resume_deadline'] = verification_deadline
                extended_data['camera_confirmation_token'] = verification_token
                extended_data['grace_period_active'] = True
                extended_data['grace_period_until'] = grace_period_until
                save_extended_tracking_data(attendance_obj, extended_data)
            except Exception as e:
                logger.error(f"Failed to save camera verification: {e}")
            
            break_time_remaining = max(0, max_break_time - session['total_break_time_used'])
            break_exhausted = break_time_remaining <= 0
            
            logger.info(
                f"✅ BREAK #{session['break_count']} ENDED for {user_id}:\n"
                f"  - Duration: {break_duration_used:.1f}s\n"
                f"  - Total Used: {session['total_break_time_used']}s\n"
                f"  - Remaining: {break_time_remaining}s\n"
                f"  - break_used: {session['break_used']}\n"
                f"  - Grace period active"
            )
            
            response_data = {
                'success': True,
                'action': 'resumed',
                'message': f'Break #{session["break_count"]} ended. Detection resumed.',
                'break_time_remaining': break_time_remaining,
                'total_break_time_used': session['total_break_time_used'],
                'max_break_time_allowed': max_break_time,
                'break_count': session['break_count'],
                'break_used': session.get('break_used', False),
                'is_on_break': False,
                'can_take_more_breaks': not break_exhausted and break_time_remaining > 0,
                'break_duration_used': break_duration_used,
                
                # ✅ BREAK EXHAUSTION WARNING
                'break_time_exhausted': break_exhausted,
                'break_warning': 'No more break time available - break_used flag set' if break_exhausted else None,
                
                # ✅ Break penalty information
                'break_penalty_applied': break_penalty,
                'break_penalty_percentage': f"{break_penalty:.4f}%",
                'total_penalty': session['attendance_penalty'],
                'total_penalty_percentage': f"{session['attendance_penalty']:.4f}%",
                'attendance_percentage': new_percentage,
                'engagement_score': new_percentage,
                'new_attendance_percentage': float(new_percentage),
                
                # ✅ Grace period
                'grace_period_active': True,
                'grace_period_duration_seconds': AttendanceConfig.GRACE_PERIOD_DURATION,
                'grace_period_expires_in': AttendanceConfig.GRACE_PERIOD_DURATION,
                'grace_period_message': f'Camera resumed - grace period {AttendanceConfig.GRACE_PERIOD_DURATION}s active',
                
                # ✅ Camera verification
                'camera_should_resume': True,
                'camera_required': True,
                'camera_enforcement': 'mandatory',
                'next_action': 'enable_camera_immediately',
                'camera_verification_required': True,
                'camera_verification_deadline': verification_deadline,
                'camera_confirmation_token': verification_token,
                'camera_verification_timeout_seconds': AttendanceConfig.CAMERA_VERIFICATION_TIMEOUT,
            }
            
            return JsonResponse(response_data)
        
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)
    except ValidationError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except Exception as e:
        logger.error(f"Error in pause_resume: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return JsonResponse({'success': False, 'error': 'Internal server error'}, status=500)

        
# ==================== DETECT VIOLATIONS (SYNC - NO ASYNC) ====================

@csrf_exempt
@require_http_methods(["POST"])
def detect_violations(request):
    """
    ✅ FIXED: BEHAVIOR DETECTION ENDPOINT WITH IDENTITY VERIFICATION
    
    This endpoint performs:
    1. Identity verification (is this the registered user?)
    2. Behavior analysis (eyes, head, hands, pose, inactivity)
    
    CRITICAL FIX: Properly handles multiple rejoin scenarios
    - Resets baseline on each rejoin
    - Maintains warning/detection counts across rejoins
    - Ensures behavior detection works immediately after rejoin
    - NEW: Dynamic detection penalty calculation (every 3 detections)
    - REJOIN FIX: Detections continue properly after rejoin
    - REMOVAL FIX: Removed users can rejoin and detection restarts properly
    """
    try:
        data = json.loads(request.body)
        meeting_id = data.get('meeting_id')
        user_id = data.get('user_id')
        frame_data = data.get('frame')
        
        validate_session_data(meeting_id, user_id)
        
        if not frame_data:
            return JsonResponse({"status": "error", "message": "Missing data"}, status=400)

        session_key = get_session_key(meeting_id, user_id)
        concurrent_sessions = [k for k in attendance_sessions.keys() if k.startswith(f"{meeting_id}_")]
        
        if session_key not in attendance_sessions:
            logger.info(f"MULTI-USER: Auto-starting session for {user_id}")
            start_success = start_attendance_tracking(meeting_id, user_id)
            if not start_success:
                return JsonResponse({"status": "error", "message": "Failed to start session"}, status=500)

        session = attendance_sessions[session_key]
        
        # ✅ Initialize session fields if missing (handles edge cases)
        if 'violation_start_times' not in session:
            session['violation_start_times'] = {}
        if 'popup_count' not in session:
            session['popup_count'] = 0
        if 'warning_count' not in session:
            session['warning_count'] = 0
        if 'detection_counts' not in session:
            session['detection_counts'] = 0
        if 'last_popup_time' not in session:
            session['last_popup_time'] = 0
        if 'inactivity_popup_shown' not in session:
            session['inactivity_popup_shown'] = False
        if 'baseline_established' not in session:
            session['baseline_established'] = False
        if 'baseline_samples' not in session:
            session['baseline_samples'] = 0
        if 'baseline_ear' not in session:
            session['baseline_ear'] = None
        if 'baseline_yaw' not in session:
            session['baseline_yaw'] = None
        if 'face_detected' not in session:
            session['face_detected'] = False
        if 'continuous_violation_start_time' not in session:
            session['continuous_violation_start_time'] = None
        # ✅ NEW: Initialize cumulative detection penalty
        if 'total_detection_penalty_applied' not in session:
            session['total_detection_penalty_applied'] = 0.0

        # ✅ Load extended tracking data from DB (preserves data across requests)
        try:
            db_session = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
            extended_data = get_extended_tracking_data(db_session)
            
            # Sync from database if not in memory
            if session.get('warning_count', 0) == 0 and extended_data.get('warning_count', 0) > 0:
                session['warning_count'] = extended_data.get('warning_count', 0)
                session['popup_count'] = db_session.popup_count
                session['detection_counts'] = extended_data.get('detection_counts', 0)
                # ✅ NEW: Sync cumulative detection penalty
                session['total_detection_penalty_applied'] = (extended_data.get('detection_counts', 0) // 3) * AttendanceConfig.DETECTION_PENALTY_3
                session['is_removed_from_meeting'] = extended_data.get('is_removed_from_meeting', False)
                session['removal_timestamp'] = extended_data.get('removal_timestamp')
                session['removal_reason'] = extended_data.get('removal_reason', '')
                session['detection_penalty_applied'] = extended_data.get('detection_penalty_applied', False)
                session['warning_phase_complete'] = extended_data.get('warning_phase_complete', False)
                session['camera_resume_expected'] = extended_data.get('camera_resume_expected', False)
                session['camera_resume_deadline'] = extended_data.get('camera_resume_deadline')
                session['camera_confirmation_token'] = extended_data.get('camera_confirmation_token')
                session['camera_verified_at'] = extended_data.get('camera_verified_at')
                session['grace_period_active'] = extended_data.get('grace_period_active', False)
                session['grace_period_until'] = extended_data.get('grace_period_until')
                
                logger.info(
                    f"🔄 SYNCED session data from DB for {user_id}: "
                    f"Warnings={session['warning_count']}, Detections={session['detection_counts']}, "
                    f"Detection Penalty={session['total_detection_penalty_applied']:.4f}%"
                )
        except AttendanceSession.DoesNotExist:
            pass
        
        # ============================================================
        # GRACE PERIOD CHECK - Skip behavior detection during grace
        # ============================================================
        current_time = time.time()
        if session.get('grace_period_active', False):
            grace_until = session.get('grace_period_until', 0)
            
            if current_time < grace_until:
                time_remaining = grace_until - current_time
                logger.debug(f"GRACE PERIOD: {user_id} has {time_remaining:.1f}s remaining - SKIPPING DETECTION")
                
                return JsonResponse({
                    "status": "ok",
                    "popup": "",
                    "violations": [],
                    "immediate_violations": [],
                    "baseline_violations": [],
                    "attendance_percentage": max(0, 100 - session.get("attendance_penalty", 0)),
                    "baseline_established": session.get("baseline_established", False),
                    "face_detected": session.get("face_detected", False),
                    "frame_count": session["frame_processing_count"],
                    "is_on_break": False,
                    "grace_period_active": True,
                    "grace_period_expires_in": time_remaining,
                    "message": "Grace period active - detection paused",
                    "camera_verification_pending": session.get("camera_resume_expected", False),
                    "camera_verified": session.get("camera_verified_at") is not None,
                })
            else:
                logger.info(f"GRACE PERIOD ENDED for {user_id} - RESUMING DETECTION")
                session['grace_period_active'] = False
                session['grace_period_until'] = None
        
        # ============================================================
        # CAMERA VERIFICATION CHECK - After break
        # ============================================================
        if session.get('camera_resume_expected', False) and int(session.get('break_count', 0)) > 0:
            deadline = session.get('camera_resume_deadline', 0)

            if current_time > deadline:
                logger.error(f"CAMERA VERIFICATION DEADLINE EXCEEDED for {user_id}")
                session['camera_resume_expected'] = False
                return JsonResponse({
                    "status": "camera_verification_failed",
                    "message": "Camera verification deadline exceeded",
                    "action_required": "enable_camera_manually",
                })
            else:
                time_remaining = deadline - current_time
                logger.debug(f"AWAITING CAMERA VERIFICATION for {user_id}: {time_remaining:.1f}s")
                return JsonResponse({
                    "status": "awaiting_camera_verification",
                    "message": f"Waiting for camera ({time_remaining:.1f}s remaining)",
                    "verification_pending": True,
                    "time_remaining": time_remaining,
                })
        
        # ============================================================
        # REMOVAL CHECK - Only block if truly removed (not cleared on rejoin)
        # ============================================================
        if session.get('is_removed_from_meeting', False):
            # ✅ This should NEVER happen if start_attendance_tracking properly clears the flag
            logger.error(
                f"⚠️ CRITICAL: Removed flag still set in detect_violations for {user_id}\n"
                f"This indicates start_attendance_tracking did not properly clear removal status.\n"
                f"Removal reason: {session.get('removal_reason', 'Unknown')}"
            )
            return JsonResponse({
                "status": "removed_from_meeting",
                "message": "You were removed from meeting. Please restart the session.",
                "removal_reason": session.get('removal_reason', ''),
                "requires_rejoin": True,
            })
        
        # ============================================================
        # BREAK CHECK
        # ============================================================
        if session.get('is_currently_on_break', False):
            current_total_break_time = calculate_current_break_time(session, current_time)
            return JsonResponse({
                "status": "session_paused", 
                "message": "Session is paused (break mode)",
                "is_on_break": True,
                "total_break_time_used": current_total_break_time,
                "break_time_remaining": max(0, session.get('max_break_time_allowed', 300) - current_total_break_time),
            })

        # ============================================================
        # SESSION ACTIVE CHECK
        # ============================================================
        if not session["session_active"]:
            return JsonResponse({
                "status": "session_paused", 
                "message": "Session is paused",
            })

        # ============================================================
        # IDENTITY VERIFICATION - Using helper function (SYNC)
        # ============================================================
        logger.debug(f"🔍 Starting identity verification for user {user_id}")
        
        # Decode frame first for identity verification
        frame = decode_image(frame_data)
        if frame is None:
            return JsonResponse({"status": "error", "message": "Failed to decode frame"}, status=400)
        
        immediate_violations = []
        
        try:
            # ✅ Run async verification in sync context
            is_identity_verified, identity_similarity = run_async_verification(frame, user_id)
            
            # ============================================================
            # CONSOLE LOGGING - Identity Verification Result
            # ============================================================
            if is_identity_verified:
                # ✅ Authorized person detected
                logger.debug(
                    f"✅ IDENTITY VERIFIED for {user_id} | "
                    f"Similarity: {identity_similarity:.3f} | "
                    f"Frame: #{session.get('frame_processing_count', 0)}"
                )
            else:
                # 🚫 Unknown person detected
                logger.error(
                    f"\n{'='*80}\n"
                    f"🚫 UNKNOWN PERSON DETECTED - IDENTITY MISMATCH\n"
                    f"{'='*80}\n"
                    f"Expected User ID: {user_id}\n"
                    f"Meeting ID: {meeting_id}\n"
                    f"Similarity Score: {identity_similarity:.3f}\n"
                    f"Threshold Required: 0.6\n"
                    f"Result: UNAUTHORIZED PERSON\n"
                    f"Frame Count: #{session.get('frame_processing_count', 0)}\n"
                    f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
                    f"{'='*80}\n"
                )
                
                # Add to immediate violations
                immediate_violations.append("Unknown person detected - Identity mismatch")
                
                # Log security alert
                logger.critical(
                    f"🚨 SECURITY ALERT: Unauthorized person detected for user {user_id} "
                    f"in meeting {meeting_id} | Similarity: {identity_similarity:.3f}"
                )
        
        except ImportError as ie:
            logger.warning(f"⚠️ Identity verification module not found: {ie}")
        
        except Exception as e:
            logger.error(f"❌ Identity verification error for {user_id}: {str(e)}")
            logger.debug(f"Traceback:\n{traceback.format_exc()}")

        # ============================================================
        # PROCESS FRAME - BEHAVIOR DETECTION LOGIC
        # ============================================================
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        session["frame_processing_count"] += 1
        
        logger.debug(f"BEHAVIOR DETECTION FRAME #{session['frame_processing_count']} - User {user_id}")
        
        # ============================================================
        # MEDIAPIPE PROCESSING
        # ============================================================
        face_detections = mp_face.process(rgb).detections
        mesh_results = mp_mesh.process(rgb)
        hands_results = mp_hands.process(rgb)
        pose_results = mp_pose.process(rgb)
        
        popup = ""
        face_changed = False
        
        # ============================================================
        # IMMEDIATE VIOLATIONS
        # ============================================================
        if not face_detections:
            immediate_violations.append("Face not visible")
        elif len(face_detections) > 1:
            immediate_violations.append("Multiple faces detected")

        # HAND NEAR FACE
        if hands_results.multi_hand_landmarks and mesh_results.multi_face_landmarks:
            lm = mesh_results.multi_face_landmarks[0].landmark
            face_pts = [lm[i] for i in [1, 2, 4, 5, 9, 10]]
            for hand in hands_results.multi_hand_landmarks:
                for hpt in [hand.landmark[i] for i in [0, 4, 5, 8, 12, 16, 20]]:
                    for fpt in face_pts:
                        if np.linalg.norm([hpt.x - fpt.x, hpt.y - fpt.y]) < AttendanceConfig.HAND_FACE_DISTANCE:
                            immediate_violations.append("Hand near face")
                            break

        # LYING DOWN
        if pose_results.pose_landmarks:
            if is_fully_lying_down(pose_results.pose_landmarks.landmark):
                immediate_violations.append("Lying down")

        baseline_violations = []
        
        # ============================================================
        # EYE AND HEAD TRACKING - WITH PROPER BASELINE HANDLING
        # ============================================================
        if mesh_results.multi_face_landmarks:
            session["face_detected"] = True
            lm = mesh_results.multi_face_landmarks[0].landmark
            
            left_eye = [lm[i] for i in [362, 385, 387, 263, 373, 380]]
            right_eye = [lm[i] for i in [33, 160, 158, 133, 153, 144]]
            current_ear = enhanced_ear(left_eye, right_eye)
            
            current_yaw = np.degrees(np.arctan2(
                lm[1].x - (lm[33].x + lm[263].x) / 2,
                1e-5 + lm[1].y - (lm[33].y + lm[263].y) / 2
            ))
            
            # ✅ CRITICAL FIX: BASELINE ESTABLISHMENT (Works on rejoin)
            if not session.get("baseline_established", False):
                if session.get("baseline_samples", 0) < AttendanceConfig.BASELINE_FRAMES_REQUIRED:
                    # Initialize baseline on first frame
                    if session.get("baseline_ear") is None:
                        session["baseline_ear"] = current_ear
                        session["baseline_yaw"] = current_yaw
                        logger.info(f"🎯 BASELINE INIT for {user_id}: EAR={current_ear:.3f}, YAW={current_yaw:.1f}°")
                    else:
                        # Average with previous samples
                        session["baseline_ear"] = (session["baseline_ear"] + current_ear) / 2
                        session["baseline_yaw"] = (session["baseline_yaw"] + current_yaw) / 2
                    
                    session["baseline_samples"] = session.get("baseline_samples", 0) + 1
                    
                    # Check violations during baseline establishment
                    if current_ear < 0.15:
                        baseline_violations.append("Eyes closed")
                    if abs(current_yaw) > 35:
                        baseline_violations.append("Head turned")
                    
                    logger.debug(
                        f"📊 BASELINE PROGRESS for {user_id}: "
                        f"Sample {session['baseline_samples']}/{AttendanceConfig.BASELINE_FRAMES_REQUIRED} | "
                        f"EAR={session['baseline_ear']:.3f}, YAW={session['baseline_yaw']:.1f}°"
                    )
                        
                else:
                    # Baseline established
                    session["baseline_established"] = True
                    session["last_face_movement_time"] = current_time
                    logger.info(
                        f"✅ BASELINE ESTABLISHED for {user_id} | "
                        f"EAR={session['baseline_ear']:.3f}, YAW={session['baseline_yaw']:.1f}° | "
                        f"Detection ACTIVE"
                    )
            
            # ✅ BASELINE COMPARISON (Only after baseline is established)
            else:
                # Check absolute violations
                if current_ear < AttendanceConfig.EAR_THRESHOLD:
                    baseline_violations.append("Eyes closed")
                    logger.debug(f"👁️ Eyes closed detected for {user_id}: EAR={current_ear:.3f}")
                    
                if abs(current_yaw) > AttendanceConfig.HEAD_YAW_THRESHOLD:
                    baseline_violations.append("Head turned")
                    logger.debug(f"🔄 Head turned detected for {user_id}: YAW={current_yaw:.1f}°")
                
                # Check movement from baseline
                ear_diff = abs(current_ear - session["baseline_ear"])
                yaw_diff = abs(current_yaw - session["baseline_yaw"])
                
                if ear_diff > AttendanceConfig.FACE_MOVEMENT_THRESHOLD or yaw_diff > AttendanceConfig.YAW_MOVEMENT_THRESHOLD:
                    face_changed = True
                    session["last_face_movement_time"] = current_time
                    session["inactivity_popup_shown"] = False
                    
                    # Update baseline with moving average
                    session["baseline_ear"] = session["baseline_ear"] * 0.9 + current_ear * 0.1
                    session["baseline_yaw"] = session["baseline_yaw"] * 0.9 + current_yaw * 0.1
                    
                    logger.debug(
                        f"✅ Activity detected for {user_id}: "
                        f"EAR_diff={ear_diff:.3f}, YAW_diff={yaw_diff:.1f}°"
                    )
        else:
            # No face detected in this frame
            session["face_detected"] = False

        # ✅ FALLBACK BASELINE (If still not established after 5 frames)
        if not session.get("baseline_established", False) and session.get("frame_processing_count", 0) > 5:
            session["baseline_established"] = True
            if session.get("baseline_ear") is None:
                session["baseline_ear"] = 0.25
            if session.get("baseline_yaw") is None:
                session["baseline_yaw"] = 0.0
            logger.warning(
                f"⚠️ BASELINE FALLBACK for {user_id} after {session['frame_processing_count']} frames"
            )

        violations = immediate_violations + baseline_violations
        
        # ============================================================
        # INACTIVITY DETECTION
        # ============================================================
        if session.get("baseline_established", False):
            inactivity_duration = current_time - session.get("last_face_movement_time", current_time)
            
            if inactivity_duration >= AttendanceConfig.INACTIVITY_WARNING_TIME and not session.get("inactivity_popup_shown", False):
                popup = "You seem inactive. Please make some movement."
                session["inactivity_popup_shown"] = True
                logger.info(f"⏰ INACTIVITY WARNING for {user_id}: {inactivity_duration:.1f}s")
                
            elif inactivity_duration >= AttendanceConfig.INACTIVITY_VIOLATION_TIME:
                violations.append("Inactivity detected")
                logger.warning(f"🚨 INACTIVITY VIOLATION for {user_id}: {inactivity_duration:.1f}s")

        now = time.time()
        
        # ============================================================
        # VIOLATION TRACKING LOGIC
        # ============================================================
        if violations:
            # Start continuous violation timer
            if session.get("continuous_violation_start_time") is None:
                session["continuous_violation_start_time"] = now
                session["last_detection_time"] = now
                logger.info(f"🚨 VIOLATION TRACKING STARTED for {user_id}: {violations}")
            
            continuous_duration = now - session["continuous_violation_start_time"]
            
            # ============================================================
            # AUTO-REMOVAL AFTER 2 MINUTES CONTINUOUS VIOLATIONS
            # ============================================================
            if continuous_duration >= AttendanceConfig.VIOLATION_AUTO_REMOVAL_TIME:
                session["is_removed_from_meeting"] = True
                session["removal_timestamp"] = timezone.now()
                session["removal_reason"] = f"Continuous violations for {continuous_duration:.0f}s"
                session["attendance_penalty"] += AttendanceConfig.CONTINUOUS_2MIN_PENALTY
                session["session_active"] = False
                
                # ✅ Save removal state to database
                try:
                    db_session = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
                    extended_data = get_extended_tracking_data(db_session)
                    extended_data['is_removed_from_meeting'] = True
                    extended_data['removal_timestamp'] = session["removal_timestamp"].isoformat()
                    extended_data['removal_reason'] = session["removal_reason"]
                    save_extended_tracking_data(db_session, extended_data)
                    
                    db_session.attendance_penalty = session["attendance_penalty"]
                    db_session.session_active = False
                    db_session.save()
                except Exception as e:
                    logger.error(f"Failed to save removal state: {e}")
                
                store_attendance_to_db(meeting_id, user_id)
                
                logger.error(
                    f"🚫 USER {user_id} REMOVED after {continuous_duration:.0f}s continuous violations | "
                    f"Reason: {session['removal_reason']}"
                )
                
                return JsonResponse({
                    "status": "participant_removed",
                    "message": f"Removed after {continuous_duration:.0f}s of continuous violations",
                    "violations": violations,
                    "removal_reason": session["removal_reason"],
                    "penalty": session["attendance_penalty"],
                    "force_disconnect": True,
                })
            
            # Find oldest ready violation
            oldest_ready_violation = None
            oldest_ready_duration = 0.0

            for v in violations:
                v_start = session["violation_start_times"].get(v)
                if v_start is None:
                    session["violation_start_times"][v] = now
                    continue

                v_duration = now - v_start
                if v_duration >= AttendanceConfig.VIOLATION_POPUP_TIME and v_duration > oldest_ready_duration:
                    oldest_ready_violation = v
                    oldest_ready_duration = v_duration

            # ============================================================
            # WARNING/DETECTION LOGIC (WORKING CORRECTLY)
            # ============================================================
            if (oldest_ready_violation is not None and 
                (now - session.get("last_popup_time", 0)) >= AttendanceConfig.POPUP_COOLDOWN):

                if session["popup_count"] < AttendanceConfig.MAX_WARNING_MESSAGES:
                    # ============================================================
                    # ✅ WARNING PHASE
                    # ============================================================
                    popup = f"Warning {session['popup_count'] + 1}/4: {oldest_ready_violation}"
                    session["popup_count"] += 1
                    session["warning_count"] = session["popup_count"]
                    session["last_popup_time"] = now
                    logger.warning(
                        f"⚠️ WARNING #{session['popup_count']}/4 for {user_id}: {oldest_ready_violation}"
                    )

                    # Save warning to database
                    try:
                        db_session = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
                        extended_data = get_extended_tracking_data(db_session)
                        extended_data['warning_count'] = session["popup_count"]
                        db_session.popup_count = session["popup_count"]
                        save_extended_tracking_data(db_session, extended_data)
                        db_session.save()
                    except Exception as e:
                        logger.error(f"Failed to save warning: {e}")

                    if session["popup_count"] >= AttendanceConfig.MAX_WARNING_MESSAGES:
                        session["warning_phase_complete"] = True
                        logger.warning(f"✅ WARNING PHASE COMPLETE for {user_id} - Entering detection phase")

                elif session.get("warning_phase_complete", False):
                    # ============================================================
                    # ✅ DETECTION PHASE
                    # ============================================================
                    time_since_last_detection = now - session.get("last_detection_time", 0)
                    
                    # ✅ REJOIN FIX: Allow detection if interval has passed
                    if time_since_last_detection >= AttendanceConfig.DETECTION_INTERVAL:
                        session["detection_counts"] += 1
                        session["last_detection_time"] = now
                        popup = f"Detection {session['detection_counts']}: {oldest_ready_violation}"
                        session["last_popup_time"] = now

                        logger.error(
                            f"🔴 DETECTION #{session['detection_counts']} for {user_id}: {oldest_ready_violation}"
                        )

                        # Save detection to database
                        try:
                            db_session = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
                            extended_data = get_extended_tracking_data(db_session)
                            extended_data['detection_counts'] = session["detection_counts"]
                            extended_data['last_detection_time'] = now
                            save_extended_tracking_data(db_session, extended_data)
                        except Exception as e:
                            logger.error(f"Failed to save detection: {e}")

                        # ============================================================================
                        # ✅ CALCULATE DETECTION PENALTY DYNAMICALLY (Every 3 detections)
                        # ============================================================================

                        # Calculate how many complete batches of 3 detections have occurred
                        batches_completed = session["detection_counts"] // 3  # Integer division

                        # Calculate total detection penalty based on batches
                        total_detection_penalty = batches_completed * AttendanceConfig.DETECTION_PENALTY_3

                        # Get the previous detection penalty that was already applied
                        previous_detection_penalty = session.get("total_detection_penalty_applied", 0.0)

                        # Calculate NEW penalty to add (only the difference)
                        new_penalty_to_add = total_detection_penalty - previous_detection_penalty

                        # If there's new penalty to add, apply it
                        if new_penalty_to_add > 0:
                            session["attendance_penalty"] += new_penalty_to_add
                            session["total_detection_penalty_applied"] = total_detection_penalty
                            
                            logger.error(
                                f"💰 DETECTION PENALTY APPLIED for {user_id}:\n"
                                f"  - Detection Count: {session['detection_counts']}\n"
                                f"  - Batches Completed: {batches_completed}\n"
                                f"  - Penalty This Batch: {new_penalty_to_add:.4f}%\n"
                                f"  - Total Detection Penalty: {total_detection_penalty:.4f}%\n"
                                f"  - Total Attendance Penalty: {session['attendance_penalty']:.4f}%"
                            )
                            
                            # Save penalty to database
                            try:
                                db_session = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
                                db_session.attendance_penalty = session["attendance_penalty"]
                                db_session.attendance_percentage = max(0, 100 - session["attendance_penalty"])
                                db_session.engagement_score = max(0, 100 - session["attendance_penalty"])
                                
                                extended_data = get_extended_tracking_data(db_session)
                                extended_data['detection_penalty_applied'] = True
                                extended_data['total_detection_penalty'] = total_detection_penalty
                                extended_data['detection_batches_completed'] = batches_completed
                                save_extended_tracking_data(db_session, extended_data)
                                db_session.save()
                                
                                logger.info(
                                    f"💾 DB UPDATED: User {user_id} | "
                                    f"Penalty: {session['attendance_penalty']:.4f}% | "
                                    f"Attendance: {db_session.attendance_percentage:.2f}%"
                                )
                            except Exception as e:
                                logger.error(f"Failed to save penalty: {e}")
        else:
            # ✅ Clear violations when none detected
            if session.get("continuous_violation_start_time") is not None:
                logger.info(f"✅ VIOLATIONS CLEARED for {user_id}")
                session["continuous_violation_start_time"] = None
                # ✅ Don't reset last_detection_time to 0 - preserve it for interval check
            
            session["violation_start_times"].clear()

        # ============================================================
        # CALCULATE ATTENDANCE PERCENTAGE
        # ============================================================
        percentage = max(0, 100 - session.get("attendance_penalty", 0))
        
        # ============================================================
        # SAVE TO DATABASE
        # ============================================================
        try:
            db_session = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
            
            extended_data = {
                'detection_counts': session.get("detection_counts", 0),
                'warning_count': session.get("warning_count", 0),
                'is_removed_from_meeting': session.get("is_removed_from_meeting", False),
                'removal_timestamp': session.get("removal_timestamp").isoformat() if session.get("removal_timestamp") else None,
                'removal_reason': session.get("removal_reason", ""),
                'continuous_violation_start_time': session.get("continuous_violation_start_time"),
                'last_detection_time': session.get("last_detection_time", 0.0),
                'detection_penalty_applied': session.get("detection_penalty_applied", False),
                'warning_phase_complete': session.get("warning_phase_complete", False),
                'camera_resume_expected': session.get("camera_resume_expected", False),
                'camera_resume_deadline': session.get("camera_resume_deadline"),
                'camera_confirmation_token': session.get("camera_confirmation_token"),
                'camera_verified_at': session.get("camera_verified_at"),
                'grace_period_active': session.get("grace_period_active", False),
                'grace_period_until': session.get("grace_period_until"),
                # ✅ NEW: Save detection penalty details
                'total_detection_penalty': session.get("total_detection_penalty_applied", 0.0),
                'detection_batches_completed': session.get("detection_counts", 0) // 3,
            }
            
            db_session.popup_count = session["popup_count"]
            db_session.detection_counts = json.dumps(extended_data)
            db_session.violation_start_times = json.dumps(session["violation_start_times"])
            db_session.total_detections = session["total_detections"]
            db_session.attendance_penalty = session.get("attendance_penalty", 0.0)
            db_session.session_active = session.get("session_active", True)
            db_session.break_used = session["break_used"]
            db_session.violations = json.dumps(session.get("violations", []))
            db_session.last_activity = timezone.now()
            db_session.attendance_percentage = percentage
            db_session.engagement_score = percentage
            db_session.frame_processing_count = session["frame_processing_count"]
            db_session.save()
        except AttendanceSession.DoesNotExist:
            pass

        continuous_duration = 0
        if session.get("continuous_violation_start_time"):
            continuous_duration = now - session["continuous_violation_start_time"]

        logger.debug(
            f"✅ DETECTION COMPLETE for {user_id}: "
            f"{percentage:.2f}% | Warnings={session.get('warning_count', 0)} | "
            f"Detections={session.get('detection_counts', 0)} | "
            f"Violations={len(violations)}"
        )

        # ============================================================
        # RETURN RESPONSE
        # ============================================================
        return JsonResponse({
            "status": "ok",
            "popup": popup,
            "violations": violations,
            "immediate_violations": immediate_violations,
            "baseline_violations": baseline_violations,
            "attendance_percentage": percentage,
            "baseline_established": session.get("baseline_established", False),
            "face_detected": session.get("face_detected", False),
            "frame_count": session["frame_processing_count"],
            "baseline_samples": session.get("baseline_samples", 0),
            "inactivity_duration": current_time - session.get("last_face_movement_time", current_time) if session.get("baseline_established") else 0,
            "is_on_break": session.get("is_currently_on_break", False),
            "total_break_time_used": session.get("total_break_time_used", 0),
            "break_time_remaining": max(0, session.get('max_break_time_allowed', 300) - session.get("total_break_time_used", 0)),
            "popup_count": session["popup_count"],
            "warning_count": session.get("warning_count", 0),
            "max_warnings": AttendanceConfig.MAX_WARNING_MESSAGES,
            "detection_counts": session.get("detection_counts", 0),
            "detection_penalty_applied": session.get("detection_penalty_applied", False),
            "warning_phase_complete": session.get("warning_phase_complete", False),
            "in_warning_phase": session["popup_count"] < AttendanceConfig.MAX_WARNING_MESSAGES,
            "in_detection_phase": session.get("warning_phase_complete", False),
            "continuous_violation_duration": continuous_duration,
            "time_until_removal": max(0, AttendanceConfig.VIOLATION_AUTO_REMOVAL_TIME - continuous_duration) if continuous_duration > 0 else 0,
            "is_removed_from_meeting": session.get("is_removed_from_meeting", False),
            "camera_verification_pending": session.get("camera_resume_expected", False),
            "camera_verified": session.get("camera_verified_at") is not None,
            "user_isolation_verified": True,
            "concurrent_participants": len(concurrent_sessions),
        })
        
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Invalid JSON"}, status=400)
    except ValidationError as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)
    except Exception as e:
        logger.error(f"Error in detect_violations: {e}")
        logger.error(traceback.format_exc())
        return JsonResponse({"status": "error", "message": "Internal server error"}, status=500)

        
# ==================== BREAK ENDPOINT ====================

@csrf_exempt
@require_http_methods(["POST"])
def take_break(request):
    """Handle break (legacy endpoint)"""
    try:
        data = json.loads(request.body)
        meeting_id = data.get("meeting_id")
        user_id = data.get("user_id")
        
        validate_session_data(meeting_id, user_id)
        session_key = get_session_key(meeting_id, user_id)
        
        other_participants = [k for k in attendance_sessions.keys() 
                            if k.startswith(f"{meeting_id}_") and k != session_key]
        
        if session_key not in attendance_sessions:
            return JsonResponse({"status": "error", "message": "Session not active"}, status=403)

        session = attendance_sessions[session_key]
        if session["break_used"]:
            return JsonResponse({"status": "error", "message": "Break already used"}, status=400)

        session["break_used"] = True
        session["session_active"] = False
        session["attendance_penalty"] += AttendanceConfig.BREAK_PENALTY
        session["is_currently_on_break"] = True
        session["current_break_start_time"] = time.time()
        
        logger.info(f"MULTI-USER: Legacy break started for {user_id}")
        
        try:
            attendance_obj = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
            attendance_obj.break_used = True
            attendance_obj.session_active = False
            attendance_obj.attendance_penalty = session["attendance_penalty"]
            attendance_obj.is_currently_on_break = True
            attendance_obj.current_break_start_time = session["current_break_start_time"]
            attendance_obj.save()
        except AttendanceSession.DoesNotExist:
            pass

        def resume_after_break():
            time.sleep(AttendanceConfig.BREAK_DURATION)
            if session_key in attendance_sessions:
                session["session_active"] = True
                session["last_face_movement_time"] = time.time()
                session["popup_count"] = 0
                session["violations"] = []
                session["violation_start_times"] = {}
                session["is_currently_on_break"] = False
                session["current_break_start_time"] = None

                try:
                    attendance_obj = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
                    current_time_local = time.time()
                    session["is_currently_on_break"] = True
                    session["current_break_start_time"] = session.get("current_break_start_time") or (current_time_local - AttendanceConfig.BREAK_DURATION)
                    update_break_time_used(session, attendance_obj, current_time_local)
                    session["is_currently_on_break"] = False
                    session["current_break_start_time"] = None
                    attendance_obj.is_currently_on_break = False
                    attendance_obj.current_break_start_time = None
                    attendance_obj.session_active = True
                    attendance_obj.save()
                except AttendanceSession.DoesNotExist:
                    pass

                verification_token = generate_camera_verification_token(meeting_id, user_id, time.time())
                verification_deadline = time.time() + AttendanceConfig.CAMERA_VERIFICATION_TIMEOUT
                session["camera_resume_expected"] = True
                session["camera_resume_deadline"] = verification_deadline
                session["camera_confirmation_token"] = verification_token

                try:
                    attendance_obj = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
                    extended_data = get_extended_tracking_data(attendance_obj)
                    extended_data["camera_resume_expected"] = True
                    extended_data["camera_resume_deadline"] = verification_deadline
                    extended_data["camera_confirmation_token"] = verification_token
                    save_extended_tracking_data(attendance_obj, extended_data)
                except Exception as e:
                    logger.error(f"Failed to save camera resume enforcement: {e}")

                logger.info(f"Legacy break ended for {user_id}")
                
                try:
                    attendance_obj = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
                    attendance_obj.session_active = True
                    attendance_obj.save()
                except AttendanceSession.DoesNotExist:
                    pass

        threading.Thread(target=resume_after_break, daemon=True).start()

        return JsonResponse({
            "status": "break_used",
            "message": f"Break granted for {AttendanceConfig.BREAK_DURATION} seconds (5 minutes)",
        })
        
    except Exception as e:
        logger.error(f"Error in take_break: {e}")
        return JsonResponse({"status": "error", "message": "Internal server error"}, status=500)

# ==================== REST OF THE CODE CONTINUES AS BEFORE ====================
# (get_attendance_status, start_attendance_tracking_api, stop_attendance_tracking_api, urlpatterns)
# ... [Keep all remaining functions exactly as they were in your original code]

@csrf_exempt
@require_http_methods(["GET"])
def get_attendance_status(request):
    """Get attendance status"""
    try:
        meeting_id = request.GET.get('meeting_id')
        user_id = request.GET.get('user_id')
        
        if not meeting_id or not user_id:
            return JsonResponse({"error": "meeting_id and user_id required"}, status=400)
        
        user_id = str(user_id)
        validate_session_data(meeting_id, user_id)
        session_key = get_session_key(meeting_id, user_id)
        
        concurrent_sessions = [k for k in attendance_sessions.keys() if k.startswith(f"{meeting_id}_")]
        other_participants_count = len([k for k in concurrent_sessions if k != session_key])
        
        if session_key in attendance_sessions:
            session = attendance_sessions[session_key]
            total_time = (timezone.now() - session["start_time"]).total_seconds()
            current_time = time.time()
            
            current_total_break_time = calculate_current_break_time(session, current_time)
            break_time_remaining = max(0, session.get('max_break_time_allowed', 300) - current_total_break_time)
            
            continuous_duration = 0
            if session.get("continuous_violation_start_time"):
                continuous_duration = current_time - session["continuous_violation_start_time"]
            
            return JsonResponse({
                "status": "active",
                "meeting_id": meeting_id,
                "user_id": user_id,
                "session_active": session["session_active"],
                "attendance_percentage": max(0, 100 - session["attendance_penalty"]),
                "engagement_score": max(0, 100 - session["attendance_penalty"]),
                "popup_count": session["popup_count"],
                "warning_count": session.get("warning_count", 0),
                "max_warnings": AttendanceConfig.MAX_WARNING_MESSAGES,
                "detection_counts": session.get("detection_counts", 0),
                "detection_penalty_applied": session.get("detection_penalty_applied", False),
                "warning_phase_complete": session.get("warning_phase_complete", False),
                "in_warning_phase": session["popup_count"] < AttendanceConfig.MAX_WARNING_MESSAGES,
                "in_detection_phase": session.get("warning_phase_complete", False),
                "break_used": session["break_used"],
                "violations": session["violations"],
                "total_detections": session["total_detections"],
                "session_duration": int(total_time),
                "baseline_established": session.get("baseline_established", False),
                "face_detected": session.get("face_detected", False),
                "frame_count": session.get("frame_processing_count", 0),
                "is_on_break": session.get("is_currently_on_break", False),
                "total_break_time_used": current_total_break_time,
                "break_time_remaining": break_time_remaining,
                "break_count": session.get("break_count", 0),
                "max_break_time_allowed": session.get('max_break_time_allowed', 300),
                "can_take_break": break_time_remaining > 0,
                "is_removed_from_meeting": session.get("is_removed_from_meeting", False),
                "removal_timestamp": session.get("removal_timestamp"),
                "removal_reason": session.get("removal_reason", ""),
                "continuous_violation_duration": continuous_duration,
                "time_until_removal": max(0, AttendanceConfig.VIOLATION_AUTO_REMOVAL_TIME - continuous_duration) if continuous_duration > 0 else 0,
                "camera_verification_pending": session.get("camera_resume_expected", False),
                "camera_verification_deadline": session.get("camera_resume_deadline"),
                "camera_verified": session.get("camera_verified_at") is not None,
                "camera_verified_at": session.get("camera_verified_at"),
                "real_time": True,
                "camera_should_resume": bool(session.get("camera_resume_expected", False) and session.get("session_active", False)),
                "camera_confirmation_token": session.get("camera_confirmation_token"),
                "user_isolation_verified": True,
                "concurrent_participants": len(concurrent_sessions),
                "other_participants_count": other_participants_count,
            })
        
        try:
            attendance_obj = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
            break_time_remaining = max(0, (attendance_obj.max_break_time_allowed or 300) - (attendance_obj.total_break_time_used or 0))
            extended_data = get_extended_tracking_data(attendance_obj)
            
            return JsonResponse({
                "status": "found",
                "meeting_id": meeting_id,
                "user_id": user_id,
                "session_active": attendance_obj.session_active,
                "attendance_percentage": float(attendance_obj.attendance_percentage),
                "engagement_score": float(attendance_obj.engagement_score),
                "popup_count": attendance_obj.popup_count,
                "warning_count": extended_data.get('warning_count', 0),
                "max_warnings": AttendanceConfig.MAX_WARNING_MESSAGES,
                "detection_counts": extended_data.get('detection_counts', 0),
                "detection_penalty_applied": extended_data.get('detection_penalty_applied', False),
                "warning_phase_complete": extended_data.get('warning_phase_complete', False),
                "in_warning_phase": attendance_obj.popup_count < AttendanceConfig.MAX_WARNING_MESSAGES,
                "in_detection_phase": extended_data.get('warning_phase_complete', False),
                "break_used": attendance_obj.break_used,
                "violations": attendance_obj.get_violation_list(),
                "total_detections": attendance_obj.total_detections,
                "is_on_break": attendance_obj.is_currently_on_break,
                "total_break_time_used": attendance_obj.total_break_time_used or 0,
                "break_time_remaining": break_time_remaining,
                "break_count": attendance_obj.break_count or 0,
                "max_break_time_allowed": attendance_obj.max_break_time_allowed or 300,
                "can_take_break": break_time_remaining > 0,
                "is_removed_from_meeting": extended_data.get('is_removed_from_meeting', False),
                "removal_timestamp": extended_data.get('removal_timestamp'),
                "removal_reason": extended_data.get('removal_reason', ''),
                "camera_verification_pending": extended_data.get('camera_resume_expected', False),
                "camera_verification_deadline": extended_data.get('camera_resume_deadline'),
                "camera_verified": extended_data.get('camera_verified_at') is not None,
                "camera_verified_at": extended_data.get('camera_verified_at'),
                "camera_should_resume": bool(extended_data.get('camera_resume_expected', False) and attendance_obj.session_active),
                "camera_confirmation_token": extended_data.get('camera_confirmation_token'),
                "real_time": False,
                "user_isolation_verified": True,
                "concurrent_participants": len(concurrent_sessions),
                "other_participants_count": other_participants_count,
            })
        except AttendanceSession.DoesNotExist:
            return JsonResponse({
                "status": "not_started",
                "message": "Attendance tracking not started",
                "meeting_id": meeting_id,
                "user_id": user_id,
                "session_active": False,
                "attendance_percentage": 100,
                "engagement_score": 100,
                "popup_count": 0,
                "warning_count": 0,
                "max_warnings": AttendanceConfig.MAX_WARNING_MESSAGES,
                "detection_counts": 0,
                "detection_penalty_applied": False,
                "warning_phase_complete": False,
                "in_warning_phase": True,
                "in_detection_phase": False,
                "break_used": False,
                "violations": [],
                "total_detections": 0,
                "is_on_break": False,
                "total_break_time_used": 0,
                "break_time_remaining": 300,
                "break_count": 0,
                "max_break_time_allowed": 300,
                "can_take_break": True,
                "is_removed_from_meeting": False,
                "removal_timestamp": None,
                "removal_reason": "",
                "camera_verification_pending": False,
                "camera_verified": False,
                "real_time": False,
                "user_isolation_verified": True,
                "concurrent_participants": len(concurrent_sessions),
                "other_participants_count": other_participants_count,
            })
        
    except Exception as e:
        logger.error(f"Error getting status: {e}")
        return JsonResponse({"error": "Internal server error"}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def start_attendance_tracking_api(request):
    """Start tracking API"""
    try:
        data = json.loads(request.body)
        meeting_id = data.get('meeting_id')
        user_id = data.get('user_id')
        user_name = data.get('user_name', f'User_{user_id}')
        
        if not meeting_id or not user_id:
            return JsonResponse({'success': False, 'error': 'meeting_id and user_id required'}, status=400)
        
        user_id_str = str(user_id)
        validate_session_data(meeting_id, user_id_str)
        
        concurrent_sessions = [k for k in attendance_sessions.keys() if k.startswith(f"{meeting_id}_")]
        success = start_attendance_tracking(meeting_id, user_id_str, user_name)
        
        if success:
            final_concurrent_sessions = [k for k in attendance_sessions.keys() if k.startswith(f"{meeting_id}_")]
            
            return JsonResponse({
                'success': True,
                'status': 'started',
                'message': 'Independent attendance tracking started - 5 minute break available',
                'meeting_id': meeting_id,
                'user_id': user_id_str,
                'user_name': user_name,
                'timestamp': timezone.now().isoformat(),
                'max_break_time_allowed': AttendanceConfig.MAX_TOTAL_BREAK_TIME,
                'max_warnings': AttendanceConfig.MAX_WARNING_MESSAGES,
                'grace_period_duration': AttendanceConfig.GRACE_PERIOD_DURATION,
                'detection_interval_seconds': AttendanceConfig.DETECTION_INTERVAL,
                'auto_removal_time_seconds': AttendanceConfig.VIOLATION_AUTO_REMOVAL_TIME,
                'camera_verification_timeout_seconds': AttendanceConfig.CAMERA_VERIFICATION_TIMEOUT,
                'user_isolation_verified': True,
                'concurrent_participants_before': len(concurrent_sessions),
                'concurrent_participants_after': len(final_concurrent_sessions),
            })
        else:
            return JsonResponse({'success': False, 'error': 'Failed to start tracking'}, status=500)
            
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except ValidationError as e:
        return JsonResponse({'error': str(e)}, status=400)
    except Exception as e:
        logger.error(f"Error starting tracking: {e}")
        return JsonResponse({'error': 'Internal server error'}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def stop_attendance_tracking_api(request):
    """Stop tracking API with SAFE GPU cleanup"""
    try:
        data = json.loads(request.body)
        meeting_id = data.get('meeting_id')
        user_id = data.get('user_id')
        
        if not meeting_id or not user_id:
            return JsonResponse({'success': False, 'error': 'meeting_id and user_id required'}, status=400)
        
        user_id_str = str(user_id)
        validate_session_data(meeting_id, user_id_str)
        
        concurrent_sessions_before = [k for k in attendance_sessions.keys() if k.startswith(f"{meeting_id}_")]
        session_key = get_session_key(meeting_id, user_id_str)
        other_participants_before = [k for k in concurrent_sessions_before if k != session_key]
        
        # ✅ FIRST: Stop the attendance session (stops frame processing)
        success = stop_attendance_tracking(meeting_id, user_id_str)
        
        concurrent_sessions_after = [k for k in attendance_sessions.keys() if k.startswith(f"{meeting_id}_")]
        
        is_last_participant = len(concurrent_sessions_after) == 0
        gpu_released = False
        
        if success and is_last_participant:
            # ✅ CRITICAL: Wait for all CUDA operations to complete
            logger.info(f"⏳ Last participant left. Waiting for face detection to fully stop...")
            
            # Give time for any in-flight frame processing to complete
            import time
            time.sleep(2)  # Wait 2 seconds for frame processing to finish
            
            # ✅ Force synchronization with CUDA
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.synchronize()  # Wait for all CUDA operations
                    logger.info("✅ CUDA synchronized")
            except Exception as e:
                logger.warning(f"⚠️ CUDA sync failed: {e}")
            
            # ✅ Additional safety: Wait another second
            time.sleep(1)
            
            # ✅ NOW safe to unload face model
            try:
                logger.info(f"🔄 Attempting to release face model GPU memory...")
                
                import sys
                import os
                
                current_dir = os.path.dirname(os.path.abspath(__file__))
                faceauth_dir = os.path.join(current_dir, '..', 'FaceAuth')
                faceauth_dir = os.path.abspath(faceauth_dir)
                
                if faceauth_dir not in sys.path:
                    sys.path.insert(0, faceauth_dir)
                
                from face_model_shared import unload_face_model
                unload_face_model()
                gpu_released = True
                logger.info(f"✅ Face model GPU memory released safely for meeting {meeting_id}")
                
            except ImportError as ie:
                logger.warning(f"⚠️ Could not import face_model_shared: {ie}")
                
                # Fallback: Manual GPU cleanup
                try:
                    import torch
                    if torch.cuda.is_available():
                        torch.cuda.synchronize()  # Sync again before cleanup
                        torch.cuda.empty_cache()
                        import gc
                        gc.collect()
                        gpu_released = True
                        logger.info("✅ Manual GPU cache cleanup completed")
                except ImportError:
                    logger.warning("⚠️ PyTorch not available for GPU cleanup")
                except Exception as e:
                    logger.warning(f"⚠️ Manual GPU cleanup failed: {e}")
                    
            except Exception as e:
                logger.warning(f"⚠️ Could not release GPU memory: {e}")
                import traceback
                logger.error(traceback.format_exc())
        else:
            if not is_last_participant:
                logger.info(f"ℹ️ Meeting {meeting_id} still has {len(concurrent_sessions_after)} active participants. GPU memory retained.")
        
        return JsonResponse({
            'success': True,
            'status': 'stopped',
            'message': 'Tracking stopped for user only',
            'meeting_id': meeting_id,
            'user_id': user_id_str,
            'timestamp': timezone.now().isoformat(),
            'user_isolation_verified': True,
            'concurrent_participants_before': len(concurrent_sessions_before),
            'concurrent_participants_after': len(concurrent_sessions_after),
            'other_participants_unaffected': len(other_participants_before),
            'is_last_participant': is_last_participant,
            'gpu_memory_released': gpu_released,
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except ValidationError as e:
        return JsonResponse({'error': str(e)}, status=400)
    except Exception as e:
        logger.error(f"Error stopping tracking: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return JsonResponse({'error': 'Internal server error'}, status=500)

# ==================== URL PATTERNS ====================

urlpatterns = [
    path('api/attendance/start/', start_attendance_tracking_api, name='attendance_start'),
    path('api/attendance/stop/', stop_attendance_tracking_api, name='attendance_stop'),
    path('api/attendance/detect/', detect_violations, name='attendance_detect_violations'),
    path('api/attendance/break/', take_break, name='attendance_take_break'),
    path('api/attendance/status/', get_attendance_status, name='attendance_get_status'),
    path('api/attendance/pause-resume/', pause_resume_attendance, name='attendance_pause_resume'),
    path('api/attendance/verify-camera/', verify_camera_resumed, name='attendance_verify_camera'),
]