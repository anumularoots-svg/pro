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

logger = logging.getLogger(__name__)

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

# ==================== INTEGRATION HOOKS ====================

def start_attendance_tracking(meeting_id: str, user_id, user_name: str = None) -> bool:
    """Start tracking for user"""
    user_id = str(user_id)
    session_key = get_session_key(meeting_id, user_id)
    
    concurrent_sessions = [k for k in attendance_sessions.keys() if k.startswith(f"{meeting_id}_")]
    logger.info(f"MULTI-USER: Starting tracking for {user_id}. Current participants: {len(concurrent_sessions)}")
    
    if session_key in attendance_sessions:
        logger.warning(f"MULTI-USER: Session already exists for {meeting_id}_{user_id}")
        return True
    
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
        "last_face_movement_time": time.time(),
        "inactivity_popup_shown": False,
        
        "is_removed_from_meeting": False,
        "removal_timestamp": None,
        "removal_reason": "",
        "continuous_violation_start_time": None,
        "last_detection_time": 0.0,
        "detection_penalty_applied": False,
        "warning_phase_complete": False,
        
        "total_break_time_used": 0,
        "current_break_start_time": None,
        "is_currently_on_break": False,
        "break_count": 0,
        "break_sessions": [],
        "max_break_time_allowed": AttendanceConfig.MAX_TOTAL_BREAK_TIME,  # ✅ 300 seconds
        
        "camera_resume_expected": False,
        "camera_resume_deadline": None,
        "camera_confirmation_token": None,
        "camera_verified_at": None,
        
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
        
        "session_started_at": time.time(),
        "isolation_verified": True,
        "concurrent_participants_at_start": len(concurrent_sessions),
    }

    attendance_sessions[session_key]["camera_resume_expected"] = False
    attendance_sessions[session_key]["camera_verified_at"] = time.time()

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
            'camera_verified_at': None,
            'grace_period_active': False,
            'grace_period_until': None,
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
                'last_face_movement_time': time.time(),
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
                'max_break_time_allowed': AttendanceConfig.MAX_TOTAL_BREAK_TIME,  # ✅ 300 seconds
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
    """Enhanced pause/resume with grace period activation"""
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
        
        logger.info(f"MULTI-USER: {action} for {user_id}. {len(other_participants)} other participants unaffected")
        
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
        
        if 'total_break_time_used' not in session:
            session['total_break_time_used'] = attendance_obj.total_break_time_used or 0
            session['current_break_start_time'] = attendance_obj.current_break_start_time
            session['is_currently_on_break'] = attendance_obj.is_currently_on_break
            session['break_count'] = attendance_obj.break_count or 0
            session['max_break_time_allowed'] = attendance_obj.max_break_time_allowed or AttendanceConfig.MAX_TOTAL_BREAK_TIME
            try:
                session['break_sessions'] = json.loads(attendance_obj.break_sessions) if attendance_obj.break_sessions else []
            except json.JSONDecodeError:
                session['break_sessions'] = []
        
        max_break_time = session.get('max_break_time_allowed', AttendanceConfig.MAX_TOTAL_BREAK_TIME)
        
        if action == 'pause':
            if session.get('is_currently_on_break', False):
                current_total_break_time = calculate_current_break_time(session, current_time)
                return JsonResponse({
                    'success': False,
                    'error': 'Already on break',
                    'break_time_remaining': max(0, max_break_time - current_total_break_time),
                    'total_break_time_used': current_total_break_time,
                    'is_on_break': True,
                }, status=400)
            
            current_total_break_time = calculate_current_break_time(session, current_time)
            
            if current_total_break_time >= max_break_time:
                return JsonResponse({
                    'success': False,
                    'error': 'Break time limit exceeded (5 minutes total)',  # ✅ UPDATED MESSAGE
                    'total_break_time_used': current_total_break_time,
                    'max_break_time_allowed': max_break_time,
                    'break_time_remaining': 0,
                    'is_on_break': False,
                }, status=403)
            
            session['is_currently_on_break'] = True
            session['current_break_start_time'] = current_time
            session['session_active'] = False
            session['break_count'] += 1
            
            break_duration_available = max(0, max_break_time - current_total_break_time)
            
            logger.info(f"BREAK #{session['break_count']} STARTING for {user_id}: Available {break_duration_available}s")
            
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
                'is_on_break': True,
                'break_start_time': current_time,
                'break_duration': break_duration_available,
                'camera_should_disable': True,
            })
            
        elif action == 'resume':
            if not session.get('is_currently_on_break', False):
                return JsonResponse({
                    'success': False,
                    'error': 'Not currently on break',
                    'break_time_remaining': max(0, max_break_time - session.get('total_break_time_used', 0)),
                    'total_break_time_used': session.get('total_break_time_used', 0),
                    'is_on_break': False,
                }, status=400)
            
            update_break_time_used(session, attendance_obj, current_time)
            break_duration_used = current_time - session['current_break_start_time'] if session.get('current_break_start_time') else 0
            
            session['is_currently_on_break'] = False
            session['current_break_start_time'] = None
            session['session_active'] = True
            session['last_face_movement_time'] = current_time
            session['inactivity_popup_shown'] = False
            
            session['violation_start_times'] = {}
            
            # ✅ Activate grace period
            grace_period_until = current_time + AttendanceConfig.GRACE_PERIOD_DURATION
            session['grace_period_active'] = True
            session['grace_period_until'] = grace_period_until
            
            verification_token = generate_camera_verification_token(meeting_id, user_id, current_time)
            verification_deadline = current_time + AttendanceConfig.CAMERA_VERIFICATION_TIMEOUT
            
            session['camera_resume_expected'] = True
            session['camera_resume_deadline'] = verification_deadline
            session['camera_confirmation_token'] = verification_token
            
            logger.info(f"GRACE PERIOD ACTIVATED for {user_id}: {AttendanceConfig.GRACE_PERIOD_DURATION}s")
            
            attendance_obj.is_currently_on_break = False
            attendance_obj.current_break_start_time = None
            attendance_obj.session_active = True
            attendance_obj.last_face_movement_time = current_time
            attendance_obj.inactivity_popup_shown = False
            attendance_obj.save()
            
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
            
            logger.info(f"BREAK #{session['break_count']} ENDED for {user_id}. Grace period active")
            
            response_data = {
                'success': True,
                'action': 'resumed',
                'message': f'Break #{session["break_count"]} ended. Detection resumed.',
                'break_time_remaining': break_time_remaining,
                'total_break_time_used': session['total_break_time_used'],
                'max_break_time_allowed': max_break_time,
                'break_count': session['break_count'],
                'is_on_break': False,
                'can_take_more_breaks': break_time_remaining > 0,
                'break_duration_used': break_duration_used,
                
                'grace_period_active': True,
                'grace_period_duration_seconds': AttendanceConfig.GRACE_PERIOD_DURATION,
                'grace_period_expires_in': AttendanceConfig.GRACE_PERIOD_DURATION,
                'grace_period_message': f'Camera resumed - grace period {AttendanceConfig.GRACE_PERIOD_DURATION}s active',
                
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
        return JsonResponse({'success': False, 'error': 'Internal server error'}, status=500)

# ==================== DETECT VIOLATIONS WITH GRACE PERIOD ====================

@csrf_exempt
@require_http_methods(["POST"])
def detect_violations(request):
    """Enhanced detection with grace period check"""
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

        try:
            db_session = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
            extended_data = get_extended_tracking_data(db_session)
            
            if 'warning_count' not in session:
                session['warning_count'] = extended_data.get('warning_count', 0)
                session['detection_counts'] = extended_data.get('detection_counts', 0)
                session['is_removed_from_meeting'] = extended_data.get('is_removed_from_meeting', False)
                session['removal_timestamp'] = extended_data.get('removal_timestamp')
                session['removal_reason'] = extended_data.get('removal_reason', '')
                session['continuous_violation_start_time'] = extended_data.get('continuous_violation_start_time')
                session['last_detection_time'] = extended_data.get('last_detection_time', 0.0)
                session['detection_penalty_applied'] = extended_data.get('detection_penalty_applied', False)
                session['warning_phase_complete'] = extended_data.get('warning_phase_complete', False)
                session['camera_resume_expected'] = extended_data.get('camera_resume_expected', False)
                session['camera_resume_deadline'] = extended_data.get('camera_resume_deadline')
                session['camera_confirmation_token'] = extended_data.get('camera_confirmation_token')
                session['camera_verified_at'] = extended_data.get('camera_verified_at')
                session['grace_period_active'] = extended_data.get('grace_period_active', False)
                session['grace_period_until'] = extended_data.get('grace_period_until')
        except AttendanceSession.DoesNotExist:
            pass
        
        # ✅ Check if grace period is active
        current_time = time.time()
        if session.get('grace_period_active', False):
            grace_until = session.get('grace_period_until', 0)
            
            if current_time < grace_until:
                time_remaining = grace_until - current_time
                logger.info(f"GRACE PERIOD: {user_id} has {time_remaining:.1f}s remaining")
                
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
                    "message": "Grace period active - resuming detection",
                    "camera_verification_pending": session.get("camera_resume_expected", False),
                    "camera_verified": session.get("camera_verified_at") is not None,
                })
            else:
                logger.info(f"GRACE PERIOD ENDED for {user_id} - resuming normal detection")
                session['grace_period_active'] = False
                session['grace_period_until'] = None
        
        # Camera verification check
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
        
        if session.get('is_removed_from_meeting', False):
            return JsonResponse({
                "status": "removed_from_meeting",
                "message": "You were removed from meeting",
                "removal_reason": session.get('removal_reason', ''),
                "requires_rejoin": True,
            })
        
        if session.get('is_currently_on_break', False):
            current_total_break_time = calculate_current_break_time(session, current_time)
            return JsonResponse({
                "status": "session_paused", 
                "message": "Session is paused (break mode)",
                "is_on_break": True,
                "total_break_time_used": current_total_break_time,
                "break_time_remaining": max(0, session.get('max_break_time_allowed', 300) - current_total_break_time),
            })

        if not session["session_active"]:
            return JsonResponse({
                "status": "session_paused", 
                "message": "Session is paused",
            })

        # Process frame
        frame = decode_image(frame_data)
        if frame is None:
            return JsonResponse({"status": "error", "message": "Failed to decode frame"}, status=400)
            
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        session["frame_processing_count"] += 1
        
        logger.info(f"FRAME #{session['frame_processing_count']} - User {user_id}")
        
        # MediaPipe processing
        face_detections = mp_face.process(rgb).detections
        mesh_results = mp_mesh.process(rgb)
        hands_results = mp_hands.process(rgb)
        pose_results = mp_pose.process(rgb)
        
        popup = ""
        face_changed = False
        immediate_violations = []
        
        # Immediate violations
        if not face_detections:
            immediate_violations.append("Face not visible")
        elif len(face_detections) > 1:
            immediate_violations.append("Multiple faces detected")

        if hands_results.multi_hand_landmarks and mesh_results.multi_face_landmarks:
            lm = mesh_results.multi_face_landmarks[0].landmark
            face_pts = [lm[i] for i in [1, 2, 4, 5, 9, 10]]
            for hand in hands_results.multi_hand_landmarks:
                for hpt in [hand.landmark[i] for i in [0, 4, 5, 8, 12, 16, 20]]:
                    for fpt in face_pts:
                        if np.linalg.norm([hpt.x - fpt.x, hpt.y - fpt.y]) < AttendanceConfig.HAND_FACE_DISTANCE:
                            immediate_violations.append("Hand near face")
                            break

        if pose_results.pose_landmarks:
            if is_fully_lying_down(pose_results.pose_landmarks.landmark):
                immediate_violations.append("Lying down")

        baseline_violations = []
        
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
            
            if not session.get("baseline_established", False):
                if session.get("baseline_samples", 0) < AttendanceConfig.BASELINE_FRAMES_REQUIRED:
                    if session.get("baseline_ear") is None:
                        session["baseline_ear"] = current_ear
                        session["baseline_yaw"] = current_yaw
                    else:
                        session["baseline_ear"] = (session["baseline_ear"] + current_ear) / 2
                        session["baseline_yaw"] = (session["baseline_yaw"] + current_yaw) / 2
                    
                    session["baseline_samples"] = session.get("baseline_samples", 0) + 1
                    
                    if current_ear < 0.15:
                        baseline_violations.append("Eyes closed")
                    if abs(current_yaw) > 35:
                        baseline_violations.append("Head turned")
                        
                else:
                    session["baseline_established"] = True
                    session["last_face_movement_time"] = current_time
                    logger.info(f"BASELINE ESTABLISHED for {user_id}")
            
            else:
                if current_ear < AttendanceConfig.EAR_THRESHOLD:
                    baseline_violations.append("Eyes closed")
                if abs(current_yaw) > AttendanceConfig.HEAD_YAW_THRESHOLD:
                    baseline_violations.append("Head turned")
                
                ear_diff = abs(current_ear - session["baseline_ear"])
                yaw_diff = abs(current_yaw - session["baseline_yaw"])
                
                if ear_diff > AttendanceConfig.FACE_MOVEMENT_THRESHOLD or yaw_diff > AttendanceConfig.YAW_MOVEMENT_THRESHOLD:
                    face_changed = True
                    session["last_face_movement_time"] = current_time
                    session["inactivity_popup_shown"] = False
                    
                    session["baseline_ear"] = session["baseline_ear"] * 0.9 + current_ear * 0.1
                    session["baseline_yaw"] = session["baseline_yaw"] * 0.9 + current_yaw * 0.1

        if not session.get("baseline_established", False) and session.get("frame_processing_count", 0) > 5:
            session["baseline_established"] = True
            if session.get("baseline_ear") is None:
                session["baseline_ear"] = 0.25
            if session.get("baseline_yaw") is None:
                session["baseline_yaw"] = 0.0

        violations = immediate_violations + baseline_violations
        
        if session.get("baseline_established", False):
            inactivity_duration = current_time - session["last_face_movement_time"]
            
            if inactivity_duration >= AttendanceConfig.INACTIVITY_WARNING_TIME and not session.get("inactivity_popup_shown", False):
                popup = "You seem inactive. Please make some movement."
                session["inactivity_popup_shown"] = True
                
            elif inactivity_duration >= AttendanceConfig.INACTIVITY_VIOLATION_TIME:
                violations.append("Inactivity detected")

        now = time.time()
        
        if violations:
            if session.get("continuous_violation_start_time") is None:
                session["continuous_violation_start_time"] = now
                session["last_detection_time"] = now
                logger.info(f"VIOLATION TRACKING STARTED for {user_id}")
            
            continuous_duration = now - session["continuous_violation_start_time"]
            
            if continuous_duration >= AttendanceConfig.VIOLATION_AUTO_REMOVAL_TIME:
                session["is_removed_from_meeting"] = True
                session["removal_timestamp"] = timezone.now()
                session["removal_reason"] = f"Continuous violations for {continuous_duration:.0f}s"
                session["attendance_penalty"] += AttendanceConfig.CONTINUOUS_2MIN_PENALTY
                session["session_active"] = False
                
                store_attendance_to_db(meeting_id, user_id)
                
                logger.error(f"USER {user_id} REMOVED after {continuous_duration:.0f}s violations")
                
                return JsonResponse({
                    "status": "participant_removed",
                    "message": f"Removed after {continuous_duration:.0f}s of continuous violations",
                    "violations": violations,
                    "removal_reason": session["removal_reason"],
                    "penalty": session["attendance_penalty"],
                    "force_disconnect": True,
                })
            
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

            if (oldest_ready_violation is not None and 
                (now - session.get("last_popup_time", 0)) >= AttendanceConfig.POPUP_COOLDOWN):

                if session["popup_count"] < AttendanceConfig.MAX_WARNING_MESSAGES:
                    popup = f"Warning {session['popup_count'] + 1}/4: {oldest_ready_violation}"
                    session["popup_count"] += 1
                    session["warning_count"] = session["popup_count"]
                    session["last_popup_time"] = now
                    logger.warning(f"WARNING #{session['popup_count']}/4 for {user_id}: {oldest_ready_violation}")

                    try:
                        db_session = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
                        extended_data = get_extended_tracking_data(db_session)
                        extended_data['warning_count'] = session["popup_count"]
                        save_extended_tracking_data(db_session, extended_data)
                    except Exception as e:
                        logger.error(f"Failed to save warning: {e}")

                    if session["popup_count"] >= AttendanceConfig.MAX_WARNING_MESSAGES:
                        session["warning_phase_complete"] = True
                        logger.warning(f"WARNING PHASE COMPLETE for {user_id}")

                elif session.get("warning_phase_complete", False):
                    time_since_last_detection = now - session.get("last_detection_time", 0)
                    if time_since_last_detection >= AttendanceConfig.DETECTION_INTERVAL:
                        session["detection_counts"] += 1
                        session["last_detection_time"] = now
                        popup = f"Detection {session['detection_counts']}: {oldest_ready_violation}"
                        session["last_popup_time"] = now

                        logger.error(f"DETECTION #{session['detection_counts']} for {user_id}")

                        try:
                            db_session = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
                            extended_data = get_extended_tracking_data(db_session)
                            extended_data['detection_counts'] = session["detection_counts"]
                            extended_data['last_detection_time'] = now
                            save_extended_tracking_data(db_session, extended_data)
                        except Exception as e:
                            logger.error(f"Failed to save detection: {e}")

                        if session["detection_counts"] >= 3 and not session.get("detection_penalty_applied", False):
                            session["attendance_penalty"] += AttendanceConfig.DETECTION_PENALTY_3
                            session["detection_penalty_applied"] = True
                            logger.error(f"PENALTY APPLIED for {user_id}")

                            try:
                                db_session = AttendanceSession.objects.get(meeting_id=meeting_id, user_id=user_id)
                                db_session.attendance_penalty = session["attendance_penalty"]
                                db_session.attendance_percentage = max(0, 100 - session["attendance_penalty"])
                                db_session.save()
                            except Exception as e:
                                logger.error(f"Failed to save penalty: {e}")
        else:
            if session.get("continuous_violation_start_time") is not None:
                logger.info(f"VIOLATIONS CLEARED for {user_id}")
                session["continuous_violation_start_time"] = None
                session["last_detection_time"] = 0.0
            
            session["violation_start_times"].clear()

        percentage = max(0, 100 - session["attendance_penalty"])
        
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
            }
            
            db_session.popup_count = session["popup_count"]
            db_session.detection_counts = json.dumps(extended_data)
            db_session.violation_start_times = json.dumps(session["violation_start_times"])
            db_session.total_detections = session["total_detections"]
            db_session.attendance_penalty = session["attendance_penalty"]
            db_session.session_active = True
            db_session.break_used = session["break_used"]
            db_session.violations = json.dumps(session["violations"])
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

        logger.info(f"DETECTION COMPLETE - {user_id}: {percentage}% attendance")

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
            "inactivity_duration": current_time - session["last_face_movement_time"] if session.get("baseline_established") else 0,
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

# ==================== STATUS ENDPOINT ====================

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

# ==================== START TRACKING ENDPOINT ====================

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

# ==================== STOP TRACKING ENDPOINT ====================
@csrf_exempt
@require_http_methods(["POST"])
def stop_attendance_tracking_api(request):
    """
    CRASH-PROOF Stop tracking API
    NEVER unloads GPU if video processing might be active
    Prevents NVDEC crashes that kill the entire backend
    """
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
        gpu_unload_skipped = False
        gpu_unload_reason = ""
        
        if success and is_last_participant:
            logger.info(f"⏳ Last participant left meeting {meeting_id}")
            
            # ✅✅✅ CRITICAL CHECK: Is video processing active for this meeting?
            video_processing_active = False
            video_processing_status = "unknown"
            
            try:
                # Check if this meeting is in the processing queue
                from .video_processing_queue import processing_queue
                queue_status = processing_queue.get_queue_status()
                
                # Check if meeting is actively being processed
                if queue_status.get('active_meeting') == meeting_id:
                    video_processing_active = True
                    video_processing_status = "currently_processing"
                    logger.warning(f"⚠️ Meeting {meeting_id} is ACTIVELY being processed!")
                
                # Check if meeting is queued
                elif meeting_id in queue_status.get('queued_meetings', []):
                    video_processing_active = True
                    video_processing_status = "queued_for_processing"
                    logger.warning(f"⚠️ Meeting {meeting_id} is QUEUED for processing!")
                
                else:
                    video_processing_status = "no_processing_detected"
                    logger.info(f"✅ No video processing detected for {meeting_id}")
                    
            except Exception as check_error:
                logger.warning(f"⚠️ Could not check video processing status: {check_error}")
                # If we can't check, assume processing might be active (safe default)
                video_processing_active = True
                video_processing_status = "check_failed_assume_active"
            
            # ✅✅✅ NEVER UNLOAD GPU IF VIDEO PROCESSING MIGHT BE ACTIVE
            if video_processing_active:
                gpu_unload_skipped = True
                gpu_unload_reason = f"Video processing {video_processing_status} - GPU kept loaded to prevent crashes"
                logger.warning(f"🛡️ SAFETY: Skipping GPU unload for {meeting_id}")
                logger.warning(f"🛡️ Reason: {gpu_unload_reason}")
                logger.warning(f"🛡️ This prevents NVDEC crashes in FFmpeg!")
                
            else:
                # Safe to unload - no video processing
                logger.info(f"✅ Safe to unload GPU - no video processing for {meeting_id}")
                
                # Wait for in-flight frame processing to complete
                import time
                time.sleep(2)
                
                # Force CUDA synchronization
                try:
                    import torch
                    if torch.cuda.is_available():
                        torch.cuda.synchronize()
                        logger.info("✅ CUDA synchronized")
                except Exception as e:
                    logger.debug(f"CUDA sync: {e}")
                
                # Additional safety buffer
                time.sleep(1)
                
                # Now safe to unload
                try:
                    logger.info(f"🔄 Unloading face model GPU memory...")
                    
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
                    logger.info(f"✅ Face model GPU memory released safely")
                    
                except ImportError as ie:
                    logger.warning(f"⚠️ Could not import face_model_shared: {ie}")
                    
                    # Fallback cleanup
                    try:
                        import torch
                        if torch.cuda.is_available():
                            torch.cuda.synchronize()
                            torch.cuda.empty_cache()
                            import gc
                            gc.collect()
                            gpu_released = True
                            logger.info("✅ Manual GPU cleanup completed")
                    except:
                        pass
                        
                except Exception as e:
                    logger.warning(f"⚠️ GPU unload error: {e}")
        else:
            if not is_last_participant:
                logger.info(f"ℹ️ Meeting {meeting_id} has {len(concurrent_sessions_after)} participants - GPU retained")
        
        return JsonResponse({
            'success': True,
            'status': 'stopped',
            'message': 'Tracking stopped safely',
            'meeting_id': meeting_id,
            'user_id': user_id_str,
            'timestamp': timezone.now().isoformat(),
            'user_isolation_verified': True,
            'concurrent_participants_before': len(concurrent_sessions_before),
            'concurrent_participants_after': len(concurrent_sessions_after),
            'other_participants_unaffected': len(other_participants_before),
            'is_last_participant': is_last_participant,
            'gpu_memory_released': gpu_released,
            'gpu_unload_skipped': gpu_unload_skipped,
            'gpu_unload_reason': gpu_unload_reason if gpu_unload_skipped else None,
            'crash_protection_active': True,
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