from django.db import connection, transaction
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.urls import path
import json
import logging
from django.http import HttpResponse, JsonResponse
from datetime import datetime, timedelta
import pytz
from django.utils import timezone
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.platypus.frames import Frame
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from io import BytesIO
import os
from textwrap import fill
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
# Configure logging
logging.basicConfig(filename='analytics_debug.log', level=logging.DEBUG, format='%(asctime)s %(levelname)s %(message)s')

# Global status codes
SUCCESS_STATUS = 200
BAD_REQUEST_STATUS = 400
UNAUTHORIZED_STATUS = 401
FORBIDDEN_STATUS = 403
NOT_FOUND_STATUS = 404
SERVER_ERROR_STATUS = 500

class ReportGenerator:
    """Helper class for generating PDF reports"""
    
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self.custom_styles = self._create_custom_styles()
    
    def _create_custom_styles(self):
        """Create custom styles for the reports"""
        styles = {}
        
        # Title style
        styles['ReportTitle'] = ParagraphStyle(
            'ReportTitle',
            parent=self.styles['Title'],
            fontSize=18,
            spaceAfter=20,
            alignment=TA_CENTER,
            textColor=colors.darkblue
        )
        
        # Header style
        styles['SectionHeader'] = ParagraphStyle(
            'SectionHeader',
            parent=self.styles['Heading1'],
            fontSize=14,
            spaceAfter=12,
            textColor=colors.darkblue,
            borderWidth=1,
            borderColor=colors.darkblue,
            borderPadding=5
        )
        
        # Subheader style
        styles['SubHeader'] = ParagraphStyle(
            'SubHeader',
            parent=self.styles['Heading2'],
            fontSize=12,
            spaceAfter=8,
            textColor=colors.black
        )
        
        # Summary style
        styles['Summary'] = ParagraphStyle(
            'Summary',
            parent=self.styles['Normal'],
            fontSize=10,
            spaceAfter=6,
            backColor=colors.lightgrey,
            borderWidth=1,
            borderColor=colors.grey,
            borderPadding=5
        )
        
        # Meeting detail style
        styles['MeetingDetail'] = ParagraphStyle(
            'MeetingDetail',
            parent=self.styles['Normal'],
            fontSize=9,
            spaceAfter=4
        )
        
        return styles
    
    # def create_header_footer(self, canvas, doc, title):
    #     """Create header and footer for all pages"""
    #     canvas.saveState()
        
    #     # Header
    #     canvas.setFont('Helvetica-Bold', 16)
    #     canvas.drawString(50, letter[1] - 50, title)
    #     canvas.setFont('Helvetica', 10)
    #     canvas.drawString(letter[0] - 200, letter[1] - 50, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        
    #     # Header line
    #     canvas.line(50, letter[1] - 70, letter[0] - 50, letter[1] - 70)
        
    #     # Footer
    #     canvas.setFont('Helvetica', 9)
    #     canvas.drawString(50, 50, "Meeting Analytics System")
    #     canvas.drawString(letter[0] - 100, 50, f"Page {doc.page}")
        
    #     # Footer line
    #     canvas.line(50, 70, letter[0] - 50, 70)
        
    #     canvas.restoreState()

    def create_header_footer(self, canvas, doc, title):
        """Properly aligned header and footer for all pages"""
        canvas.saveState()
        width, height = letter

        # Header (left-aligned title, right-aligned timestamp)
        canvas.setFont('Helvetica-Bold', 14)
        canvas.drawString(55, height - 50, title)

        canvas.setFont('Helvetica', 9)
        canvas.drawRightString(width - 55, height - 50, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

        # Header line
        canvas.setLineWidth(0.5)
        canvas.line(50, height - 60, width - 50, height - 60)

        # Footer (left-aligned app name, right-aligned page number)
        canvas.setFont('Helvetica', 8)
        canvas.drawString(55, 55, "Meeting Analytics System")
        canvas.drawRightString(width - 55, 55, f"Page {doc.page}")

        # Footer line
        canvas.line(50, 65, width - 50, 65)
        canvas.restoreState()

def get_participant_report_data(user_id, start_date=None, end_date=None):
    """Helper function to get participant report data"""
    try:
        # Calculate date range if not provided
        if not end_date:
            end_date = timezone.now()
        if not start_date:
            start_date = end_date - timedelta(days=365)  # Last year
        
        with connection.cursor() as cursor:
            # Get participant basic info
            cursor.execute("""
                SELECT DISTINCT p.User_ID, p.Full_Name
                FROM tbl_Participants p
                WHERE p.User_ID = %s
                LIMIT 1
            """, [user_id])
            
            participant_info = cursor.fetchone()
            if not participant_info:
                return None
            
            # Get detailed meeting data for participant
            query = """
                SELECT 
                    p.Meeting_ID,
                    m.Meeting_Name,
                    m.Meeting_Type,
                    m.Created_At,
                    m.Started_At,
                    m.Ended_At,
                    m.Host_ID,
                    p.Role,
                    p.Join_Times,
                    p.Leave_Times,
                    p.Total_Duration_Minutes,
                    p.Total_Sessions,
                    p.Attendance_Percentagebasedon_host,
                    p.Participant_Attendance,
                    p.Overall_Attendance,
                    p.Is_Currently_Active,
                    
                    -- Attendance Sessions Data
                    ats.popup_count,
                    ats.detection_counts,
                    ats.violation_start_times,
                    ats.total_detections,
                    ats.attendance_penalty,
                    ats.break_used,
                    ats.total_break_time_used,
                    ats.engagement_score,
                    ats.attendance_percentage as session_attendance_percentage,
                    ats.focus_score,
                    ats.break_count,
                    ats.violation_severity_score
                    
                FROM tbl_Participants p
                JOIN tbl_Meetings m ON p.Meeting_ID = m.ID
                LEFT JOIN tbl_Attendance_Sessions ats ON p.Meeting_ID = ats.Meeting_ID AND p.User_ID = ats.User_ID
                WHERE p.User_ID = %s 
                AND m.Created_At BETWEEN %s AND %s
                ORDER BY m.Created_At DESC
            """
            
            cursor.execute(query, [user_id, start_date, end_date])
            meetings_data = cursor.fetchall()
            
            # Calculate overall statistics
            cursor.execute("""
                SELECT 
                    COUNT(DISTINCT p.Meeting_ID) as total_meetings,
                    AVG(p.Participant_Attendance) as avg_participant_attendance,
                    AVG(p.Overall_Attendance) as avg_overall_attendance,
                    SUM(p.Total_Duration_Minutes) as total_duration_minutes,
                    AVG(ats.engagement_score) as avg_engagement_score,
                    AVG(ats.attendance_penalty) as avg_penalty,
                    SUM(ats.total_break_time_used) as total_break_time,
                    SUM(ats.total_detections) as total_violations
                FROM tbl_Participants p
                LEFT JOIN tbl_Attendance_Sessions ats ON p.Meeting_ID = ats.Meeting_ID AND p.User_ID = ats.User_ID
                JOIN tbl_Meetings m ON p.Meeting_ID = m.ID
                WHERE p.User_ID = %s 
                AND m.Created_At BETWEEN %s AND %s
            """, [user_id, start_date, end_date])
            
            overall_stats = cursor.fetchone()
            
            return {
                'participant_info': {
                    'user_id': participant_info[0],
                    'full_name': participant_info[1]
                },
                'meetings_data': meetings_data,
                'overall_stats': overall_stats,
                'date_range': {
                    'start': start_date,
                    'end': end_date
                }
            }
            
    except Exception as e:
        logging.error(f"Error getting participant report data: {e}")
        return None

def get_host_report_data(host_id, start_date=None, end_date=None):
    """Helper function to get host report data"""
    try:
        # Calculate date range if not provided
        if not end_date:
            end_date = timezone.now()
        if not start_date:
            start_date = end_date - timedelta(days=365)  # Last year
        
        with connection.cursor() as cursor:
            # Get host meetings with participant details
            query = """
                SELECT 
                    m.ID as meeting_id,
                    m.Meeting_Name,
                    m.Meeting_Type,
                    m.Created_At,
                    m.Started_At,
                    m.Ended_At,
                    m.Status,
                    
                    -- Participant details
                    p.User_ID,
                    p.Full_Name,
                    p.Role,
                    p.Total_Duration_Minutes,
                    p.Attendance_Percentagebasedon_host,
                    p.Participant_Attendance,
                    p.Overall_Attendance,
                    
                    -- Attendance Sessions Data
                    ats.popup_count,
                    ats.detection_counts,
                    ats.violation_start_times,
                    ats.total_detections,
                    ats.attendance_penalty,
                    ats.break_used,
                    ats.total_break_time_used,
                    ats.engagement_score,
                    ats.attendance_percentage as session_attendance_percentage
                    
                FROM tbl_Meetings m
                LEFT JOIN tbl_Participants p ON m.ID = p.Meeting_ID
                LEFT JOIN tbl_Attendance_Sessions ats ON p.Meeting_ID = ats.Meeting_ID AND p.User_ID = ats.User_ID
                WHERE m.Host_ID = %s 
                AND m.Created_At BETWEEN %s AND %s
                ORDER BY m.Created_At DESC, p.Full_Name
            """
            
            cursor.execute(query, [host_id, start_date, end_date])
            meetings_data = cursor.fetchall()
            
            # Get host summary statistics
            cursor.execute("""
                SELECT 
                    COUNT(DISTINCT m.ID) as total_meetings_created,
                    COUNT(DISTINCT CASE WHEN m.Status = 'active' THEN m.ID END) as active_meetings,
                    COUNT(DISTINCT CASE WHEN m.Status = 'ended' THEN m.ID END) as completed_meetings,
                    COUNT(DISTINCT CASE WHEN m.Status = 'scheduled' THEN m.ID END) as scheduled_meetings,
                    COUNT(DISTINCT p.User_ID) as total_unique_participants,
                    AVG(p.Participant_Attendance) as avg_participant_attendance,
                    AVG(ats.engagement_score) as avg_engagement_score,
                    SUM(ats.total_detections) as total_violations_across_meetings
                FROM tbl_Meetings m
                LEFT JOIN tbl_Participants p ON m.ID = p.Meeting_ID
                LEFT JOIN tbl_Attendance_Sessions ats ON p.Meeting_ID = ats.Meeting_ID AND p.User_ID = ats.User_ID
                WHERE m.Host_ID = %s 
                AND m.Created_At BETWEEN %s AND %s
            """, [host_id, start_date, end_date])
            
            host_stats = cursor.fetchone()
            
            return {
                'host_id': host_id,
                'meetings_data': meetings_data,
                'host_stats': host_stats,
                'date_range': {
                    'start': start_date,
                    'end': end_date
                }
            }
            
    except Exception as e:
        logging.error(f"Error getting host report data: {e}")
        return None

@require_http_methods(["GET"])
@csrf_exempt
def get_comprehensive_meeting_analytics(request):
    """
    Comprehensive analytics showing:
    - How long each participant and host stayed in each meeting (duration analysis)
    - Participant attendance data from tbl_Participants (Participant_Attendance, Overall_Attendance)
    - Attendance monitoring data from tbl_Attendance_Sessions (popup_count, detections, penalties, etc.)
    - How many meetings each participant attended
    - How many meetings each host conducted/created/completed
    - Complete participant analysis using actual table columns
    """
    try:
        # Accept multiple parameter names for flexibility
        user_id = request.GET.get('user_id') or request.GET.get('userId')
        meeting_id = request.GET.get('meeting_id') or request.GET.get('meetingId')
        timeframe = request.GET.get('timeframe', '30days')
        meeting_type = request.GET.get('meetingType') or request.GET.get('meeting_type', 'all')
        analytics_type = request.GET.get('analytics_type', 'all')  # all, participant, host, meeting
        page = int(request.GET.get('page', 1))
        limit = int(request.GET.get('limit', 100))
        
        # Handle date range parameters
        date_range_start = (request.GET.get('dateRange[start]') or 
                           request.GET.get('start_date') or
                           request.GET.get('startDate'))
        date_range_end = (request.GET.get('dateRange[end]') or 
                         request.GET.get('end_date') or
                         request.GET.get('endDate'))

        logging.debug(f"Comprehensive analytics request - user_id: {user_id}, meeting_id: {meeting_id}, analytics_type: {analytics_type}")

        # Calculate date range
        ist_timezone = pytz.timezone('Asia/Kolkata')
        if not date_range_end:
            end_date = timezone.now().astimezone(ist_timezone)
        else:
            end_date = datetime.strptime(date_range_end, '%Y-%m-%d').replace(tzinfo=ist_timezone)
            
        if not date_range_start:
            if timeframe == '7days':
                start_date = end_date - timedelta(days=7)
            elif timeframe == '30days':
                start_date = end_date - timedelta(days=30)
            elif timeframe == '90days':
                start_date = end_date - timedelta(days=90)
            elif timeframe == '1year':
                start_date = end_date - timedelta(days=365)
            else:
                start_date = end_date - timedelta(days=30)
        else:
            start_date = datetime.strptime(date_range_start, '%Y-%m-%d').replace(tzinfo=ist_timezone)

        offset = (page - 1) * limit

        with connection.cursor() as cursor:
            
            # 1. PARTICIPANT DURATION AND ATTENDANCE ANALYTICS
            if analytics_type in ['all', 'participant']:
                participant_analytics_query = """
                    SELECT 
                        -- tbl_Participants columns (all actual columns)
                        p.ID as participant_id,
                        p.Meeting_ID,
                        p.User_ID,
                        p.Full_Name,
                        p.Role,
                        p.Meeting_Type,
                        p.Join_Times,
                        p.Leave_Times,
                        p.Total_Duration_Minutes,
                        p.Total_Sessions,
                        p.End_Meeting_Time,
                        p.Is_Currently_Active,
                        p.Attendance_Percentagebasedon_host,
                        p.Participant_Attendance,
                        p.Overall_Attendance,
                        
                        -- tbl_Attendance_Sessions columns (requested columns)
                        ats.popup_count,
                        ats.detection_counts,
                        ats.violation_start_times as violation_start_time,
                        ats.total_detections,
                        ats.attendance_penalty,
                        ats.break_used,
                        ats.total_break_time_used,
                        ats.engagement_score,
                        ats.attendance_percentage as session_attendance_percentage,
                        
                        -- Additional attendance session details
                        ats.session_active,
                        ats.break_count,
                        ats.focus_score,
                        ats.violation_severity_score,
                        ats.active_participation_time,
                        ats.total_session_time,
                        
                        -- Meeting Info from tbl_Meetings
                        m.Meeting_Name,
                        m.Status as meeting_status,
                        m.Created_At as meeting_created_at,
                        m.Started_At,
                        m.Ended_At,
                        m.Host_ID,
                        m.Meeting_Link,
                        m.Is_Recording_Enabled,
                        m.Waiting_Room_Enabled
                        
                    FROM tbl_Participants p
                    LEFT JOIN tbl_Attendance_Sessions ats ON p.Meeting_ID = ats.Meeting_ID AND p.User_ID = ats.User_ID
                    LEFT JOIN tbl_Meetings m ON p.Meeting_ID = m.ID
                    WHERE 1=1
                """
                
                params = []
                if user_id:
                    participant_analytics_query += " AND p.User_ID = %s"
                    params.append(user_id)
                if meeting_id:
                    participant_analytics_query += " AND p.Meeting_ID = %s"
                    params.append(meeting_id)
                if meeting_type != 'all':
                    participant_analytics_query += " AND p.Meeting_Type = %s"
                    params.append(meeting_type)
                
                participant_analytics_query += " AND m.Created_At BETWEEN %s AND %s"
                params.extend([start_date, end_date])
                
                participant_analytics_query += " ORDER BY m.Created_At DESC LIMIT %s OFFSET %s"
                params.extend([limit, offset])
                
                cursor.execute(participant_analytics_query, params)
                participant_data = []
                for row in cursor.fetchall():
                    participant_data.append({
                        # Participant basic info
                        "participant_id": row[0],
                        "meeting_id": row[1],
                        "user_id": row[2],
                        "full_name": row[3],
                        "role": row[4],
                        "meeting_type": row[5],
                        
                        # Duration Analysis (How long they stayed)
                        "duration_analysis": {
                            "join_times": json.loads(row[6]) if row[6] else [],
                            "leave_times": json.loads(row[7]) if row[7] else [],
                            "total_duration_minutes": float(row[8] or 0),
                            "total_sessions": int(row[9] or 0),
                            "end_meeting_time": row[10].isoformat() if row[10] else None,
                            "is_currently_active": bool(row[11])
                        },
                        
                        # Participant Attendance Data (from tbl_Participants)
                        "participant_attendance_data": {
                            "attendance_percentage_based_on_host": float(row[12] or 0),
                            "participant_attendance": float(row[13] or 0),
                            "overall_attendance": float(row[14] or 0)
                        },
                        
                        # Attendance Session Data (requested columns)
                        "attendance_session": {
                            "popup_count": int(row[15] or 0),
                            "detection_counts": row[16],
                            "violation_start_time": row[17],
                            "total_detections": int(row[18] or 0),
                            "attendance_penalty": float(row[19] or 0),
                            "break_used": bool(row[20]),
                            "total_break_time_used": int(row[21] or 0),
                            "engagement_score": int(row[22] or 0),
                            "attendance_percentage": float(row[23] or 0),
                            
                            # Additional session details
                            "session_active": bool(row[24]),
                            "break_count": int(row[25] or 0),
                            "focus_score": float(row[26] or 0),
                            "violation_severity_score": float(row[27] or 0),
                            "active_participation_time": int(row[28] or 0),
                            "total_session_time": int(row[29] or 0)
                        },
                        
                        # Meeting Info
                        "meeting_info": {
                            "meeting_name": row[30],
                            "status": row[31],
                            "created_at": row[32].isoformat() if row[32] else None,
                            "started_at": row[33].isoformat() if row[33] else None,
                            "ended_at": row[34].isoformat() if row[34] else None,
                            "host_id": row[35],
                            "meeting_link": row[36],
                            "is_recording_enabled": bool(row[37]),
                            "waiting_room_enabled": bool(row[38])
                        }
                    })

            # 2. HOST ANALYTICS
            if analytics_type in ['all', 'host']:
                host_analytics_query = """
                    SELECT 
                        m.Host_ID,
                        m.Meeting_Type,
                        COUNT(DISTINCT m.ID) as total_meetings_hosted,
                        COUNT(DISTINCT CASE WHEN m.Status = 'active' THEN m.ID END) as active_meetings,
                        COUNT(DISTINCT CASE WHEN m.Status = 'ended' THEN m.ID END) as ended_meetings,
                        COUNT(DISTINCT CASE WHEN m.Status = 'scheduled' THEN m.ID END) as scheduled_meetings,
                        COUNT(DISTINCT p.User_ID) as total_unique_participants,
                        AVG(p.Total_Duration_Minutes) as avg_meeting_duration_minutes,
                        AVG(p.Participant_Attendance) as avg_participant_attendance,
                        AVG(p.Overall_Attendance) as avg_overall_attendance,
                        SUM(p.Total_Duration_Minutes) as total_hosting_time_minutes,
                        MIN(m.Created_At) as first_meeting_created,
                        MAX(m.Created_At) as last_meeting_created,
                        
                        -- Attendance monitoring averages
                        AVG(ats.popup_count) as avg_popup_count,
                        AVG(ats.total_detections) as avg_total_detections,
                        AVG(ats.attendance_penalty) as avg_attendance_penalty,
                        AVG(ats.engagement_score) as avg_engagement_score,
                        COUNT(CASE WHEN ats.break_used = 1 THEN 1 END) as total_breaks_used
                        
                    FROM tbl_Meetings m
                    LEFT JOIN tbl_Participants p ON m.ID = p.Meeting_ID
                    LEFT JOIN tbl_Attendance_Sessions ats ON m.ID = ats.Meeting_ID
                    WHERE 1=1
                """
                
                params = []
                if user_id:
                    host_analytics_query += " AND m.Host_ID = %s"
                    params.append(user_id)
                if meeting_type != 'all':
                    host_analytics_query += " AND m.Meeting_Type = %s"
                    params.append(meeting_type)
                
                host_analytics_query += " AND m.Created_At BETWEEN %s AND %s"
                params.extend([start_date, end_date])
                
                host_analytics_query += " GROUP BY m.Host_ID, m.Meeting_Type ORDER BY total_meetings_hosted DESC"
                
                cursor.execute(host_analytics_query, params)
                host_data = []
                for row in cursor.fetchall():
                    host_data.append({
                        "host_id": row[0],
                        "meeting_type": row[1],
                        "meeting_counts": {
                            "total_meetings_hosted": int(row[2] or 0),
                            "active_meetings": int(row[3] or 0),
                            "ended_meetings": int(row[4] or 0),
                            "scheduled_meetings": int(row[5] or 0),
                            "completion_rate": round((int(row[4] or 0) / int(row[2] or 1) * 100), 2)
                        },
                        "participant_analytics": {
                            "total_unique_participants": int(row[6] or 0),
                            "avg_meeting_duration_minutes": round(float(row[7] or 0), 2),
                            "avg_participant_attendance": round(float(row[8] or 0), 2),
                            "avg_overall_attendance": round(float(row[9] or 0), 2),
                            "total_hosting_time_minutes": round(float(row[10] or 0), 2)
                        },
                        "activity_period": {
                            "first_meeting_created": row[11].isoformat() if row[11] else None,
                            "last_meeting_created": row[12].isoformat() if row[12] else None
                        },
                        "attendance_monitoring": {
                            "avg_popup_count": round(float(row[13] or 0), 2),
                            "avg_total_detections": round(float(row[14] or 0), 2),
                            "avg_attendance_penalty": round(float(row[15] or 0), 2),
                            "avg_engagement_score": round(float(row[16] or 0), 2),
                            "total_breaks_used": int(row[17] or 0)
                        }
                    })

            # 3. PARTICIPANT SUMMARY ANALYTICS
            if analytics_type in ['all', 'participant']:
                participant_summary_query = """
                    SELECT 
                        p.User_ID,
                        p.Full_Name,
                        COUNT(DISTINCT p.Meeting_ID) as total_meetings_attended,
                        SUM(p.Total_Duration_Minutes) as total_participation_time_minutes,
                        AVG(p.Total_Duration_Minutes) as avg_meeting_duration_minutes,
                        AVG(p.Participant_Attendance) as avg_participant_attendance,
                        AVG(p.Overall_Attendance) as avg_overall_attendance,
                        COUNT(DISTINCT CASE WHEN p.Is_Currently_Active = 1 THEN p.Meeting_ID END) as active_meetings,
                        AVG(p.Total_Sessions) as avg_sessions_per_meeting,
                        p.Meeting_Type,
                        MIN(m.Created_At) as first_meeting_joined,
                        MAX(m.Created_At) as last_meeting_joined,
                        
                        -- Attendance session analytics
                        AVG(ats.popup_count) as avg_popup_count,
                        AVG(ats.total_detections) as avg_total_detections,
                        AVG(ats.attendance_penalty) as avg_attendance_penalty,
                        AVG(ats.total_break_time_used) as avg_break_time_used,
                        AVG(ats.engagement_score) as avg_engagement_score,
                        AVG(ats.focus_score) as avg_focus_score,
                        COUNT(CASE WHEN ats.break_used = 1 THEN 1 END) as total_breaks_taken
                        
                    FROM tbl_Participants p
                    LEFT JOIN tbl_Attendance_Sessions ats ON p.Meeting_ID = ats.Meeting_ID AND p.User_ID = ats.User_ID
                    LEFT JOIN tbl_Meetings m ON p.Meeting_ID = m.ID
                    WHERE p.Role = 'participant'
                """
                
                params = []
                if user_id:
                    participant_summary_query += " AND p.User_ID = %s"
                    params.append(user_id)
                if meeting_type != 'all':
                    participant_summary_query += " AND p.Meeting_Type = %s"
                    params.append(meeting_type)
                
                participant_summary_query += " AND m.Created_At BETWEEN %s AND %s"
                params.extend([start_date, end_date])
                
                participant_summary_query += " GROUP BY p.User_ID, p.Full_Name, p.Meeting_Type ORDER BY total_meetings_attended DESC"
                
                cursor.execute(participant_summary_query, params)
                participant_summary_data = []
                for row in cursor.fetchall():
                    participant_summary_data.append({
                        "user_id": row[0],
                        "full_name": row[1],
                        "meeting_participation": {
                            "total_meetings_attended": int(row[2] or 0),
                            "total_participation_time_minutes": round(float(row[3] or 0), 2),
                            "avg_meeting_duration_minutes": round(float(row[4] or 0), 2),
                            "avg_participant_attendance": round(float(row[5] or 0), 2),
                            "avg_overall_attendance": round(float(row[6] or 0), 2),
                            "active_meetings": int(row[7] or 0),
                            "avg_sessions_per_meeting": round(float(row[8] or 0), 2)
                        },
                        "meeting_type": row[9],
                        "activity_period": {
                            "first_meeting_joined": row[10].isoformat() if row[10] else None,
                            "last_meeting_joined": row[11].isoformat() if row[11] else None
                        },
                        "attendance_analytics": {
                            "avg_popup_count": round(float(row[12] or 0), 2),
                            "avg_total_detections": round(float(row[13] or 0), 2),
                            "avg_attendance_penalty": round(float(row[14] or 0), 2),
                            "avg_break_time_used": round(float(row[15] or 0), 2),
                            "avg_engagement_score": round(float(row[16] or 0), 2),
                            "avg_focus_score": round(float(row[17] or 0), 2),
                            "total_breaks_taken": int(row[18] or 0)
                        }
                    })

            # 4. MEETING ANALYTICS
            if analytics_type in ['all', 'meeting']:
                meeting_analytics_query = """
                    SELECT 
                        m.ID as meeting_id,
                        m.Meeting_Name,
                        m.Meeting_Type,
                        m.Host_ID,
                        m.Status,
                        m.Created_At,
                        m.Started_At,
                        m.Ended_At,
                        m.Meeting_Link,
                        m.Is_Recording_Enabled,
                        m.Waiting_Room_Enabled,
                        
                        -- Participant statistics
                        COUNT(DISTINCT p.User_ID) as total_participants,
                        COUNT(DISTINCT CASE WHEN p.Is_Currently_Active = 1 THEN p.User_ID END) as currently_active_participants,
                        AVG(p.Total_Duration_Minutes) as avg_participant_duration_minutes,
                        AVG(p.Participant_Attendance) as avg_participant_attendance,
                        SUM(p.Total_Duration_Minutes) as total_meeting_duration_minutes,
                        MAX(p.Total_Duration_Minutes) as longest_participant_duration,
                        MIN(p.Total_Duration_Minutes) as shortest_participant_duration,
                        
                        -- Attendance monitoring for meeting
                        AVG(ats.popup_count) as avg_popup_count,
                        AVG(ats.total_detections) as avg_total_detections,
                        AVG(ats.attendance_penalty) as avg_attendance_penalty,
                        AVG(ats.engagement_score) as avg_engagement_score,
                        COUNT(CASE WHEN ats.break_used = 1 THEN 1 END) as total_breaks_in_meeting
                        
                    FROM tbl_Meetings m
                    LEFT JOIN tbl_Participants p ON m.ID = p.Meeting_ID
                    LEFT JOIN tbl_Attendance_Sessions ats ON m.ID = ats.Meeting_ID
                    WHERE 1=1
                """
                
                params = []
                if meeting_id:
                    meeting_analytics_query += " AND m.ID = %s"
                    params.append(meeting_id)
                if user_id:
                    meeting_analytics_query += " AND m.Host_ID = %s"
                    params.append(user_id)
                if meeting_type != 'all':
                    meeting_analytics_query += " AND m.Meeting_Type = %s"
                    params.append(meeting_type)
                
                meeting_analytics_query += " AND m.Created_At BETWEEN %s AND %s"
                params.extend([start_date, end_date])
                
                meeting_analytics_query += " GROUP BY m.ID ORDER BY m.Created_At DESC"
                
                cursor.execute(meeting_analytics_query, params)
                meeting_data = []
                for row in cursor.fetchall():
                    meeting_data.append({
                        "meeting_id": row[0],
                        "meeting_name": row[1],
                        "meeting_type": row[2],
                        "host_id": row[3],
                        "status": row[4],
                        "created_at": row[5].isoformat() if row[5] else None,
                        "started_at": row[6].isoformat() if row[6] else None,
                        "ended_at": row[7].isoformat() if row[7] else None,
                        "meeting_link": row[8],
                        "is_recording_enabled": bool(row[9]),
                        "waiting_room_enabled": bool(row[10]),
                        
                        "participant_analytics": {
                            "total_participants": int(row[11] or 0),
                            "currently_active_participants": int(row[12] or 0),
                            "avg_participant_duration_minutes": round(float(row[13] or 0), 2),
                            "avg_participant_attendance": round(float(row[14] or 0), 2),
                            "total_meeting_duration_minutes": round(float(row[15] or 0), 2),
                            "longest_participant_duration_minutes": round(float(row[16] or 0), 2),
                            "shortest_participant_duration_minutes": round(float(row[17] or 0), 2)
                        },
                        
                        "attendance_analytics": {
                            "avg_popup_count": round(float(row[18] or 0), 2),
                            "avg_total_detections": round(float(row[19] or 0), 2),
                            "avg_attendance_penalty": round(float(row[20] or 0), 2),
                            "avg_engagement_score": round(float(row[21] or 0), 2),
                            "total_breaks_in_meeting": int(row[22] or 0)
                        }
                    })

            # 5. OVERALL SUMMARY STATISTICS
            cursor.execute("""
                SELECT 
                    COUNT(DISTINCT m.ID) as total_meetings,
                    COUNT(DISTINCT m.Host_ID) as total_hosts,
                    COUNT(DISTINCT p.User_ID) as total_participants,
                    AVG(p.Total_Duration_Minutes) as avg_duration_minutes,
                    AVG(p.Participant_Attendance) as avg_participant_attendance,
                    AVG(p.Overall_Attendance) as avg_overall_attendance,
                    SUM(p.Total_Duration_Minutes) as total_duration_minutes,
                    COUNT(DISTINCT CASE WHEN m.Status = 'ended' THEN m.ID END) as ended_meetings,
                    COUNT(DISTINCT CASE WHEN m.Status = 'active' THEN m.ID END) as active_meetings,
                    COUNT(DISTINCT CASE WHEN m.Status = 'scheduled' THEN m.ID END) as scheduled_meetings,
                    
                    -- Overall attendance monitoring
                    AVG(ats.popup_count) as overall_avg_popup_count,
                    AVG(ats.total_detections) as overall_avg_detections,
                    AVG(ats.attendance_penalty) as overall_avg_penalty,
                    AVG(ats.engagement_score) as overall_avg_engagement
                    
                FROM tbl_Meetings m
                LEFT JOIN tbl_Participants p ON m.ID = p.Meeting_ID
                LEFT JOIN tbl_Attendance_Sessions ats ON m.ID = ats.Meeting_ID
                WHERE m.Created_At BETWEEN %s AND %s
            """, [start_date, end_date])
            
            summary_row = cursor.fetchone()
            overall_summary = {
                "total_meetings": int(summary_row[0] or 0),
                "total_hosts": int(summary_row[1] or 0),
                "total_participants": int(summary_row[2] or 0),
                "avg_duration_minutes": round(float(summary_row[3] or 0), 2),
                "avg_participant_attendance": round(float(summary_row[4] or 0), 2),
                "avg_overall_attendance": round(float(summary_row[5] or 0), 2),
                "total_duration_hours": round(float(summary_row[6] or 0) / 60, 2),
                "ended_meetings": int(summary_row[7] or 0),
                "active_meetings": int(summary_row[8] or 0),
                "scheduled_meetings": int(summary_row[9] or 0),
                "attendance_monitoring_summary": {
                    "overall_avg_popup_count": round(float(summary_row[10] or 0), 2),
                    "overall_avg_detections": round(float(summary_row[11] or 0), 2),
                    "overall_avg_penalty": round(float(summary_row[12] or 0), 2),
                    "overall_avg_engagement": round(float(summary_row[13] or 0), 2)
                },
                "date_range": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat()
                }
            }

        # Prepare response data based on analytics_type
        response_data = {
            "overall_summary": overall_summary,
            "filters_applied": {
                "user_id": user_id,
                "meeting_id": meeting_id,
                "analytics_type": analytics_type,
                "meeting_type": meeting_type,
                "timeframe": timeframe,
                "date_range": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat()
                }
            }
        }

        if analytics_type in ['all', 'participant']:
            response_data["participant_details"] = participant_data if 'participant_data' in locals() else []
            response_data["participant_summary"] = participant_summary_data if 'participant_summary_data' in locals() else []

        if analytics_type in ['all', 'host']:
            response_data["host_analytics"] = host_data if 'host_data' in locals() else []

        if analytics_type in ['all', 'meeting']:
            response_data["meeting_analytics"] = meeting_data if 'meeting_data' in locals() else []

        logging.debug(f"Comprehensive analytics fetched - analytics_type: {analytics_type}")
        return JsonResponse({"data": response_data}, status=SUCCESS_STATUS)

    except Exception as e:
        logging.error(f"Error fetching comprehensive analytics: {e}")
        return JsonResponse({"error": f"Database error: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def get_participant_meeting_duration_analytics(request):
    """
    Detailed analytics for:
    1. How long each participant stayed in each meeting (duration analysis)
    2. Participant attendance data from tbl_Participants (Participant_Attendance, Overall_Attendance)
    3. Attendance monitoring from tbl_Attendance_Sessions (popup_count, detections, penalties, etc.)
    Using actual table columns
    """
    try:
        user_id = request.GET.get('user_id') or request.GET.get('userId')
        meeting_id = request.GET.get('meeting_id') or request.GET.get('meetingId')
        
        if not user_id and not meeting_id:
            return JsonResponse({"error": "Either user_id or meeting_id is required"}, status=BAD_REQUEST_STATUS)

        with connection.cursor() as cursor:
            query = """
                SELECT 
                    p.User_ID,
                    p.Full_Name,
                    p.Meeting_ID,
                    m.Meeting_Name,
                    p.Join_Times,
                    p.Leave_Times,
                    p.Total_Duration_Minutes,
                    p.Total_Sessions,
                    p.Is_Currently_Active,
                    p.Attendance_Percentagebasedon_host,
                    p.Participant_Attendance,
                    p.Overall_Attendance,
                    p.End_Meeting_Time,
                    p.Role,
                    p.Meeting_Type,
                    
                    -- Attendance Sessions Data
                    ats.popup_count,
                    ats.total_detections,
                    ats.break_used,
                    ats.total_break_time_used,
                    ats.attendance_penalty,
                    ats.engagement_score,
                    ats.attendance_percentage as session_attendance_percentage,
                    ats.focus_score,
                    ats.break_count,
                    ats.active_participation_time,
                    ats.total_session_time,
                    
                    -- Meeting details
                    m.Started_At,
                    m.Ended_At,
                    m.Host_ID,
                    m.Status as meeting_status,
                    m.Created_At as meeting_created_at,
                    
                    -- Calculate meeting total duration if available
                    CASE 
                        WHEN m.Started_At IS NOT NULL AND m.Ended_At IS NOT NULL 
                        THEN TIMESTAMPDIFF(MINUTE, m.Started_At, m.Ended_At)
                        ELSE NULL 
                    END as meeting_total_duration_minutes
                    
                FROM tbl_Participants p
                JOIN tbl_Meetings m ON p.Meeting_ID = m.ID
                LEFT JOIN tbl_Attendance_Sessions ats ON p.Meeting_ID = ats.Meeting_ID AND p.User_ID = ats.User_ID
                WHERE 1=1
            """
            
            params = []
            if user_id:
                query += " AND p.User_ID = %s"
                params.append(user_id)
            if meeting_id:
                query += " AND p.Meeting_ID = %s"
                params.append(meeting_id)
                
            query += " ORDER BY m.Created_At DESC"
            
            cursor.execute(query, params)
            duration_analytics = []
            
            for row in cursor.fetchall():
                participant_duration = float(row[6] or 0)
                meeting_total_duration = float(row[31] or 0) if row[31] else None
                participation_percentage = (participant_duration / meeting_total_duration * 100) if meeting_total_duration and meeting_total_duration > 0 else None
                
                duration_analytics.append({
                    "user_id": row[0],
                    "full_name": row[1],
                    "meeting_id": row[2],
                    "meeting_name": row[3],
                    
                    # Duration Analysis (How long they stayed in meeting)
                    "duration_analysis": {
                        "join_times": json.loads(row[4]) if row[4] else [],
                        "leave_times": json.loads(row[5]) if row[5] else [],
                        "total_duration_minutes": participant_duration,
                        "total_sessions": int(row[7] or 0),
                        "is_currently_active": bool(row[8]),
                        "end_meeting_time": row[12].isoformat() if row[12] else None,
                        "meeting_total_duration_minutes": meeting_total_duration,
                        "participation_percentage": round(participation_percentage, 2) if participation_percentage else None
                    },
                    
                    # Participant Attendance Data (from tbl_Participants)
                    "participant_attendance_data": {
                        "attendance_percentage_based_on_host": float(row[9] or 0),
                        "participant_attendance": float(row[10] or 0),
                        "overall_attendance": float(row[11] or 0)
                    },
                    
                    "participant_info": {
                        "role": row[13],
                        "meeting_type": row[14]
                    },
                    
                    "attendance_monitoring": {
                        "popup_count": int(row[15] or 0),
                        "total_detections": int(row[16] or 0),
                        "break_used": bool(row[17]),
                        "total_break_time_used": int(row[18] or 0),
                        "attendance_penalty": float(row[19] or 0),
                        "engagement_score": int(row[20] or 0),
                        "session_attendance_percentage": float(row[21] or 0),
                        "focus_score": float(row[22] or 0),
                        "break_count": int(row[23] or 0),
                        "active_participation_time": int(row[24] or 0),
                        "total_session_time": int(row[25] or 0)
                    },
                    
                    "meeting_details": {
                        "started_at": row[26].isoformat() if row[26] else None,
                        "ended_at": row[27].isoformat() if row[27] else None,
                        "host_id": row[28],
                        "status": row[29],
                        "created_at": row[30].isoformat() if row[30] else None
                    }
                })

        return JsonResponse({"data": duration_analytics}, status=SUCCESS_STATUS)

    except Exception as e:
        logging.error(f"Error fetching participant duration analytics: {e}")
        return JsonResponse({"error": f"Database error: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def get_host_meeting_count_analytics(request):
    """
    Analytics for how many meetings each host conducted/created/completed
    Using actual table columns
    """
    try:
        host_id = request.GET.get('host_id') or request.GET.get('user_id') or request.GET.get('userId')
        timeframe = request.GET.get('timeframe', '30days')
        meeting_type = request.GET.get('meeting_type', 'all')
        
        # Calculate date range
        ist_timezone = pytz.timezone('Asia/Kolkata')
        end_date = timezone.now().astimezone(ist_timezone)
        if timeframe == '7days':
            start_date = end_date - timedelta(days=7)
        elif timeframe == '30days':
            start_date = end_date - timedelta(days=30)
        elif timeframe == '90days':
            start_date = end_date - timedelta(days=90)
        elif timeframe == '1year':
            start_date = end_date - timedelta(days=365)
        else:
            start_date = end_date - timedelta(days=30)

        with connection.cursor() as cursor:
            query = """
                SELECT 
                    m.Host_ID,
                    m.Meeting_Type,
                    COUNT(*) as total_meetings_created,
                    COUNT(CASE WHEN m.Status = 'ended' THEN 1 END) as ended_meetings,
                    COUNT(CASE WHEN m.Status = 'active' THEN 1 END) as active_meetings,
                    COUNT(CASE WHEN m.Status = 'scheduled' THEN 1 END) as scheduled_meetings,
                    
                    -- Meeting duration analytics (if started and ended times available)
                    AVG(CASE 
                        WHEN m.Started_At IS NOT NULL AND m.Ended_At IS NOT NULL 
                        THEN TIMESTAMPDIFF(MINUTE, m.Started_At, m.Ended_At)
                        ELSE NULL 
                    END) as avg_actual_meeting_duration_minutes,
                    
                    SUM(CASE 
                        WHEN m.Started_At IS NOT NULL AND m.Ended_At IS NOT NULL 
                        THEN TIMESTAMPDIFF(MINUTE, m.Started_At, m.Ended_At)
                        ELSE 0 
                    END) as total_actual_hosted_duration_minutes,
                    
                    -- Participant analytics
                    COUNT(DISTINCT p.User_ID) as total_unique_participants,
                    AVG(p.Participant_Attendance) as avg_participant_attendance,
                    AVG(p.Overall_Attendance) as avg_overall_attendance,
                    SUM(p.Total_Duration_Minutes) as total_participant_duration_minutes,
                    
                    -- Attendance monitoring
                    AVG(ats.popup_count) as avg_popup_count,
                    AVG(ats.total_detections) as avg_total_detections,
                    AVG(ats.attendance_penalty) as avg_attendance_penalty,
                    AVG(ats.engagement_score) as avg_engagement_score,
                    COUNT(CASE WHEN ats.break_used = 1 THEN 1 END) as total_breaks_across_meetings,
                    
                    -- Activity dates
                    MIN(m.Created_At) as first_meeting_date,
                    MAX(m.Created_At) as last_meeting_date,
                    
                    -- Recording analytics
                    COUNT(CASE WHEN m.Is_Recording_Enabled = 1 THEN 1 END) as meetings_with_recording_enabled,
                    COUNT(CASE WHEN m.Waiting_Room_Enabled = 1 THEN 1 END) as meetings_with_waiting_room
                    
                FROM tbl_Meetings m
                LEFT JOIN tbl_Participants p ON m.ID = p.Meeting_ID
                LEFT JOIN tbl_Attendance_Sessions ats ON m.ID = ats.Meeting_ID
                WHERE m.Created_At BETWEEN %s AND %s
            """
            
            params = [start_date, end_date]
            if host_id:
                query += " AND m.Host_ID = %s"
                params.append(host_id)
            if meeting_type != 'all':
                query += " AND m.Meeting_Type = %s"
                params.append(meeting_type)
                
            query += " GROUP BY m.Host_ID, m.Meeting_Type ORDER BY total_meetings_created DESC"
            
            cursor.execute(query, params)
            host_analytics = []
            
            for row in cursor.fetchall():
                total_meetings = int(row[2])
                ended_meetings = int(row[3])
                
                host_analytics.append({
                    "host_id": row[0],
                    "meeting_type": row[1],
                    
                    "meeting_counts": {
                        "total_meetings_created": total_meetings,
                        "ended_meetings": ended_meetings,
                        "active_meetings": int(row[4]),
                        "scheduled_meetings": int(row[5]),
                        "completion_rate": round((ended_meetings / total_meetings * 100), 2) if total_meetings > 0 else 0
                    },
                    
                    "duration_analytics": {
                        "avg_actual_meeting_duration_minutes": round(float(row[6] or 0), 2),
                        "total_actual_hosted_duration_minutes": round(float(row[7] or 0), 2),
                        "total_actual_hosted_duration_hours": round(float(row[7] or 0) / 60, 2)
                    },
                    
                    "participant_analytics": {
                        "total_unique_participants": int(row[8] or 0),
                        "avg_participant_attendance": round(float(row[9] or 0), 2),
                        "avg_overall_attendance": round(float(row[10] or 0), 2),
                        "total_participant_duration_minutes": round(float(row[11] or 0), 2),
                        "total_participant_duration_hours": round(float(row[11] or 0) / 60, 2)
                    },
                    
                    "attendance_monitoring": {
                        "avg_popup_count": round(float(row[12] or 0), 2),
                        "avg_total_detections": round(float(row[13] or 0), 2),
                        "avg_attendance_penalty": round(float(row[14] or 0), 2),
                        "avg_engagement_score": round(float(row[15] or 0), 2),
                        "total_breaks_across_meetings": int(row[16] or 0)
                    },
                    
                    "activity_period": {
                        "first_meeting_date": row[17].isoformat() if row[17] else None,
                        "last_meeting_date": row[18].isoformat() if row[18] else None
                    },
                    
                    "meeting_features": {
                        "meetings_with_recording_enabled": int(row[19] or 0),
                        "meetings_with_waiting_room": int(row[20] or 0),
                        "recording_enabled_percentage": round((int(row[19] or 0) / total_meetings * 100), 2) if total_meetings > 0 else 0,
                        "waiting_room_enabled_percentage": round((int(row[20] or 0) / total_meetings * 100), 2) if total_meetings > 0 else 0
                    }
                })

        return JsonResponse({"data": host_analytics}, status=SUCCESS_STATUS)

    except Exception as e:
        logging.error(f"Error fetching host meeting count analytics: {e}")
        return JsonResponse({"error": f"Database error: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def get_participant_attendance_analytics(request):
    """
    Focused analytics on participant attendance data showing:
    1. Participant_Attendance and Overall_Attendance from tbl_Participants
    2. All attendance monitoring data from tbl_Attendance_Sessions
    3. Attendance trends and patterns
    """
    try:
        user_id = request.GET.get('user_id') or request.GET.get('userId')
        meeting_id = request.GET.get('meeting_id') or request.GET.get('meetingId')
        timeframe = request.GET.get('timeframe', '30days')
        meeting_type = request.GET.get('meeting_type', 'all')
        
        # Calculate date range
        ist_timezone = pytz.timezone('Asia/Kolkata')
        end_date = timezone.now().astimezone(ist_timezone)
        if timeframe == '7days':
            start_date = end_date - timedelta(days=7)
        elif timeframe == '30days':
            start_date = end_date - timedelta(days=30)
        elif timeframe == '90days':
            start_date = end_date - timedelta(days=90)
        elif timeframe == '1year':
            start_date = end_date - timedelta(days=365)
        else:
            start_date = end_date - timedelta(days=30)

        with connection.cursor() as cursor:
            query = """
                SELECT 
                    p.User_ID,
                    p.Full_Name,
                    p.Meeting_ID,
                    m.Meeting_Name,
                    p.Meeting_Type,
                    p.Role,
                    
                    -- Core Attendance Data from tbl_Participants
                    p.Attendance_Percentagebasedon_host,
                    p.Participant_Attendance,
                    p.Overall_Attendance,
                    p.Total_Duration_Minutes,
                    p.Total_Sessions,
                    p.Is_Currently_Active,
                    
                    -- All Attendance Sessions Data (requested columns)
                    ats.popup_count,
                    ats.detection_counts,
                    ats.violation_start_times,
                    ats.total_detections,
                    ats.attendance_penalty,
                    ats.break_used,
                    ats.total_break_time_used,
                    ats.engagement_score,
                    ats.attendance_percentage as session_attendance_percentage,
                    
                    -- Additional monitoring data
                    ats.session_active,
                    ats.break_count,
                    ats.focus_score,
                    ats.violation_severity_score,
                    ats.active_participation_time,
                    ats.total_session_time,
                    ats.last_violation_type,
                    ats.continuous_violation_time,
                    
                    -- Meeting context
                    m.Created_At,
                    m.Started_At,
                    m.Ended_At,
                    m.Host_ID,
                    m.Status
                    
                FROM tbl_Participants p
                JOIN tbl_Meetings m ON p.Meeting_ID = m.ID
                LEFT JOIN tbl_Attendance_Sessions ats ON p.Meeting_ID = ats.Meeting_ID AND p.User_ID = ats.User_ID
                WHERE 1=1
            """
            
            params = []
            if user_id:
                query += " AND p.User_ID = %s"
                params.append(user_id)
            if meeting_id:
                query += " AND p.Meeting_ID = %s"
                params.append(meeting_id)
            if meeting_type != 'all':
                query += " AND p.Meeting_Type = %s"
                params.append(meeting_type)
                
            query += " AND m.Created_At BETWEEN %s AND %s"
            params.extend([start_date, end_date])
            query += " ORDER BY m.Created_At DESC"
            
            cursor.execute(query, params)
            attendance_analytics = []
            
            for row in cursor.fetchall():
                attendance_analytics.append({
                    "user_id": row[0],
                    "full_name": row[1],
                    "meeting_id": row[2],
                    "meeting_name": row[3],
                    "meeting_type": row[4],
                    "role": row[5],
                    
                    # Core Attendance Metrics from tbl_Participants
                    "participant_attendance_metrics": {
                        "attendance_percentage_based_on_host": float(row[6] or 0),
                        "participant_attendance": float(row[7] or 0),
                        "overall_attendance": float(row[8] or 0),
                        "total_duration_minutes": float(row[9] or 0),
                        "total_sessions": int(row[10] or 0),
                        "is_currently_active": bool(row[11])
                    },
                    
                    # Detailed Attendance Monitoring from tbl_Attendance_Sessions
                    "attendance_monitoring_details": {
                        "popup_count": int(row[12] or 0),
                        "detection_counts": row[13],
                        "violation_start_times": row[14],
                        "total_detections": int(row[15] or 0),
                        "attendance_penalty": float(row[16] or 0),
                        "break_used": bool(row[17]),
                        "total_break_time_used": int(row[18] or 0),
                        "engagement_score": int(row[19] or 0),
                        "session_attendance_percentage": float(row[20] or 0)
                    },
                    
                    # Advanced Monitoring Metrics
                    "advanced_monitoring": {
                        "session_active": bool(row[21]),
                        "break_count": int(row[22] or 0),
                        "focus_score": float(row[23] or 0),
                        "violation_severity_score": float(row[24] or 0),
                        "active_participation_time": int(row[25] or 0),
                        "total_session_time": int(row[26] or 0),
                        "last_violation_type": row[27],
                        "continuous_violation_time": int(row[28] or 0)
                    },
                    
                    # Meeting Context
                    "meeting_context": {
                        "created_at": row[29].isoformat() if row[29] else None,
                        "started_at": row[30].isoformat() if row[30] else None,
                        "ended_at": row[31].isoformat() if row[31] else None,
                        "host_id": row[32],
                        "status": row[33]
                    }
                })

            # Summary statistics for attendance
            cursor.execute("""
                SELECT 
                    COUNT(DISTINCT p.User_ID) as total_participants,
                    AVG(p.Participant_Attendance) as avg_participant_attendance,
                    AVG(p.Overall_Attendance) as avg_overall_attendance,
                    AVG(p.Attendance_Percentagebasedon_host) as avg_attendance_based_on_host,
                    AVG(ats.attendance_penalty) as avg_penalty,
                    AVG(ats.engagement_score) as avg_engagement,
                    COUNT(CASE WHEN ats.break_used = 1 THEN 1 END) as total_breaks_used,
                    AVG(ats.total_detections) as avg_violations
                FROM tbl_Participants p
                LEFT JOIN tbl_Attendance_Sessions ats ON p.Meeting_ID = ats.Meeting_ID AND p.User_ID = ats.User_ID
                JOIN tbl_Meetings m ON p.Meeting_ID = m.ID
                WHERE m.Created_At BETWEEN %s AND %s
            """, [start_date, end_date])
            
            summary = cursor.fetchone()
            attendance_summary = {
                "total_participants": int(summary[0] or 0),
                "avg_participant_attendance": round(float(summary[1] or 0), 2),
                "avg_overall_attendance": round(float(summary[2] or 0), 2),
                "avg_attendance_based_on_host": round(float(summary[3] or 0), 2),
                "avg_penalty": round(float(summary[4] or 0), 2),
                "avg_engagement": round(float(summary[5] or 0), 2),
                "total_breaks_used": int(summary[6] or 0),
                "avg_violations": round(float(summary[7] or 0), 2)
            }

        return JsonResponse({
            "data": {
                "attendance_details": attendance_analytics,
                "attendance_summary": attendance_summary,
                "filters_applied": {
                    "user_id": user_id,
                    "meeting_id": meeting_id,
                    "meeting_type": meeting_type,
                    "timeframe": timeframe,
                    "date_range": {
                        "start": start_date.isoformat(),
                        "end": end_date.isoformat()
                    }
                }
            }
        }, status=SUCCESS_STATUS)

    except Exception as e:
        logging.error(f"Error fetching participant attendance analytics: {e}")
        return JsonResponse({"error": f"Database error: {str(e)}"}, status=SERVER_ERROR_STATUS)

# Enhanced host dashboard overview with actual columns
@require_http_methods(["GET"])
@csrf_exempt
def get_host_dashboard_overview(request):
    """Enhanced host dashboard overview with attendance sessions data using actual columns"""
    try:
        user_id = request.GET.get('user_id') or request.GET.get('userId') or request.GET.get('host_id')
        timeframe = request.GET.get('timeframe', '7days')
        meeting_type = request.GET.get('meetingType') or request.GET.get('meeting_type', 'all')

        if not user_id:
            return JsonResponse({"error": "user_id is required"}, status=BAD_REQUEST_STATUS)

        # Calculate timeframe
        ist_timezone = pytz.timezone('Asia/Kolkata')
        end_date = timezone.now().astimezone(ist_timezone)
        if timeframe == '7days':
            start_date = end_date - timedelta(days=7)
        elif timeframe == '30days':
            start_date = end_date - timedelta(days=30)
        elif timeframe == '90days':
            start_date = end_date - timedelta(days=90)
        elif timeframe == '1year':
            start_date = end_date - timedelta(days=365)
        else:
            return JsonResponse({"error": "Invalid timeframe"}, status=BAD_REQUEST_STATUS)

        with connection.cursor() as cursor:
            # Enhanced overview with attendance sessions data using actual columns
            query = """
                SELECT 
                    COUNT(DISTINCT m.ID) as total_meetings,
                    COUNT(DISTINCT p.User_ID) as total_participants,
                    AVG(p.Total_Duration_Minutes) as avg_duration_minutes,
                    AVG(p.Participant_Attendance) as avg_participant_attendance,
                    AVG(p.Overall_Attendance) as avg_overall_attendance,
                    
                    -- Attendance monitoring averages
                    AVG(ats.popup_count) as avg_popup_count,
                    AVG(ats.total_detections) as avg_detections,
                    AVG(ats.attendance_penalty) as avg_penalty,
                    AVG(ats.total_break_time_used) as avg_break_time,
                    AVG(ats.engagement_score) as avg_engagement_score,
                    SUM(CASE WHEN ats.break_used = 1 THEN 1 ELSE 0 END) as total_breaks_used,
                    
                    -- Meeting status breakdown
                    COUNT(CASE WHEN m.Status = 'active' THEN 1 END) as active_meetings,
                    COUNT(CASE WHEN m.Status = 'ended' THEN 1 END) as ended_meetings,
                    COUNT(CASE WHEN m.Status = 'scheduled' THEN 1 END) as scheduled_meetings
                    
                FROM tbl_Meetings m
                LEFT JOIN tbl_Participants p ON m.ID = p.Meeting_ID
                LEFT JOIN tbl_Attendance_Sessions ats ON m.ID = ats.Meeting_ID
                WHERE m.Host_ID = %s AND m.Created_At BETWEEN %s AND %s
            """
            
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND m.Meeting_Type = %s"
                params.append(meeting_type)

            cursor.execute(query, params)
            result = cursor.fetchone()

        data = {
            "total_meetings": int(result[0] or 0),
            "total_participants": int(result[1] or 0),
            "average_duration_minutes": round(float(result[2] or 0), 2),
            "avg_participant_attendance": round(float(result[3] or 0), 2),
            "avg_overall_attendance": round(float(result[4] or 0), 2),
            
            "attendance_monitoring": {
                "avg_popup_count": round(float(result[5] or 0), 2),
                "avg_detections": round(float(result[6] or 0), 2),
                "avg_penalty": round(float(result[7] or 0), 2),
                "avg_break_time_minutes": round(float(result[8] or 0), 2),
                "avg_engagement_score": round(float(result[9] or 0), 2),
                "total_breaks_used": int(result[10] or 0)
            },
            
            "meeting_status_breakdown": {
                "active_meetings": int(result[11] or 0),
                "ended_meetings": int(result[12] or 0),
                "scheduled_meetings": int(result[13] or 0)
            }
        }
        
        return JsonResponse({"data": data}, status=SUCCESS_STATUS)
    except Exception as e:
        logging.error(f"Error fetching enhanced host overview: {e}")
        return JsonResponse({"error": f"Database error: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def generate_participant_report_pdf(request):
    """
    Generate PDF report for a specific participant showing:
    - Every meeting they attended
    - Attendance percentage per meeting
    - Overall attendance percentage
    - All attendance monitoring metrics per meeting
    """
    try:
        user_id = request.GET.get('user_id') or request.GET.get('userId')
        
        # Date range parameters
        start_date_str = request.GET.get('start_date')
        end_date_str = request.GET.get('end_date')
        
        if not user_id:
            return JsonResponse({"error": "user_id is required"}, status=BAD_REQUEST_STATUS)
        
        # Parse date range
        start_date = None
        end_date = None
        if start_date_str:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
        if end_date_str:
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
        
        # Get report data
        data = get_participant_report_data(user_id, start_date, end_date)
        if not data:
            return JsonResponse({"error": "Participant not found or no data available"}, status=NOT_FOUND_STATUS)
        
        # Create PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, leftMargin=50, rightMargin=50, topMargin=80, bottomMargin=80)
        
        # Create report generator
        report_gen = ReportGenerator()
        
        # Story elements
        story = []
        
        # Title
        title = Paragraph(f"Participant Attendance Report", report_gen.custom_styles['ReportTitle'])
        story.append(title)
        story.append(Spacer(1, 20))
        
        # Participant Information
        participant_info = data['participant_info']
        story.append(Paragraph("Participant Information", report_gen.custom_styles['SectionHeader']))
        
        participant_table_data = [
            ['Participant ID:', str(participant_info['user_id'])],
            ['Full Name:', participant_info['full_name']],
            ['Report Period:', f"{data['date_range']['start'].strftime('%Y-%m-%d')} to {data['date_range']['end'].strftime('%Y-%m-%d')}"],
        ]
        
        participant_table = Table(participant_table_data, colWidths=[2*inch, 4*inch])
        participant_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(participant_table)
        story.append(Spacer(1, 20))
        
        # Overall Statistics
        overall_stats = data['overall_stats']
        story.append(Paragraph("Overall Statistics", report_gen.custom_styles['SectionHeader']))
        
        stats_table_data = [
            ['Total Meetings Attended:', str(int(overall_stats[0] or 0))],
            ['Average Participant Attendance:', f"{round(float(overall_stats[1] or 0), 2)}%"],
            ['Average Overall Attendance:', f"{round(float(overall_stats[2] or 0), 2)}%"],
            ['Total Duration (Minutes):', f"{round(float(overall_stats[3] or 0), 2)}"],
            ['Total Duration (Hours):', f"{round(float(overall_stats[3] or 0) / 60, 2)}"],
            ['Average Engagement Score:', f"{round(float(overall_stats[4] or 0), 2)}"],
            ['Average Attendance Penalty:', f"{round(float(overall_stats[5] or 0), 2)}"],
            ['Total Break Time Used (Minutes):', f"{round(float(overall_stats[6] or 0), 2)}"],
            ['Total Violations/Detections:', str(int(overall_stats[7] or 0))],
        ]
        
        stats_table = Table(stats_table_data, colWidths=[3*inch, 3*inch])
        stats_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightblue),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(stats_table)
        story.append(Spacer(1, 20))
        
        # Detailed Meeting Records
        story.append(Paragraph("Detailed Meeting Records", report_gen.custom_styles['SectionHeader']))
        
        if data['meetings_data']:
            for meeting in data['meetings_data']:
                # Meeting header
                meeting_title = f"Meeting: {meeting[1] or 'Unnamed Meeting'}"
                story.append(Paragraph(meeting_title, report_gen.custom_styles['SubHeader']))
                
                # Meeting details table
                meeting_details = [
                    ['Meeting ID:', str(meeting[0])],
                    ['Meeting Type:', meeting[2] or 'N/A'],
                    ['Created Date:', meeting[3].strftime('%Y-%m-%d %H:%M') if meeting[3] else 'N/A'],
                    ['Started Date:', meeting[4].strftime('%Y-%m-%d %H:%M') if meeting[4] else 'N/A'],
                    ['Ended Date:', meeting[5].strftime('%Y-%m-%d %H:%M') if meeting[5] else 'N/A'],
                    ['Host ID:', str(meeting[6])],
                    ['Participant Role:', meeting[7] or 'participant'],
                ]
                
                meeting_table = Table(meeting_details, colWidths=[2.5*inch, 3.5*inch])
                meeting_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
                    ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black)
                ]))
                story.append(meeting_table)
                story.append(Spacer(1, 10))
                
                # Attendance and Duration Data
                attendance_data = [
                    ['Duration (Minutes):', f"{round(float(meeting[10] or 0), 2)}"],
                    ['Total Sessions:', str(int(meeting[11] or 0))],
                    ['Attendance % (Host-based):', f"{round(float(meeting[12] or 0), 2)}%"],
                    ['Participant Attendance:', f"{round(float(meeting[13] or 0), 2)}%"],
                    ['Overall Attendance:', f"{round(float(meeting[14] or 0), 2)}%"],
                    ['Currently Active:', 'Yes' if meeting[15] else 'No'],
                ]
                
                attendance_table = Table(attendance_data, colWidths=[2.5*inch, 3.5*inch])
                attendance_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (0, -1), colors.lightyellow),
                    ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black)
                ]))
                story.append(attendance_table)
                story.append(Spacer(1, 10))
                
                # # Attendance Monitoring Data
                # monitoring_data = [
                #     ['Popup Count:', str(int(meeting[16] or 0))],
                #     ['Detection Counts:', meeting[17] or 'N/A'],
                #     ['Violation Start Times:', meeting[18] or 'N/A'],
                #     ['Total Detections:', str(int(meeting[19] or 0))],
                #     ['Attendance Penalty:', f"{round(float(meeting[20] or 0), 2)}"],
                #     ['Break Used:', 'Yes' if meeting[21] else 'No'],
                #     ['Total Break Time (seconds):', str(int(meeting[22] or 0))],
                #     ['Engagement Score:', str(int(meeting[23] or 0))],
                #     ['Session Attendance %:', f"{round(float(meeting[24] or 0), 2)}%"],
                #     ['Focus Score:', f"{round(float(meeting[25] or 0), 2)}"],
                #     ['Break Count:', str(int(meeting[26] or 0))],
                #     ['Violation Severity Score:', f"{round(float(meeting[27] or 0), 2)}"],
                # ]
                
                # monitoring_table = Table(monitoring_data, colWidths=[2.5*inch, 3.5*inch])
                # monitoring_table.setStyle(TableStyle([
                #     ('BACKGROUND', (0, 0), (0, -1), colors.lightcoral),
                #     ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                #     ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                #     ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                #     ('FONTSIZE', (0, 0), (-1, -1), 9),
                #     ('GRID', (0, 0), (-1, -1), 1, colors.black)
                # ]))
                # story.append(monitoring_table)
                # story.append(Spacer(1, 15))
                # Define a paragraph style for wrapped cell text
                wrapped_style = ParagraphStyle(
                    name="WrappedStyle",
                    fontName="Helvetica",
                    fontSize=8.5,
                    leading=10,
                    wordWrap='CJK'
                )

                # --- Monitoring data (no truncation, full text displayed) ---
                monitoring_data = [
                    ['Popup Count:', Paragraph(str(int(meeting[16] or 0)), wrapped_style)],
                    ['Detection Counts:', Paragraph(str(meeting[17] or 'N/A'), wrapped_style)],
                    ['Violation Start Times:', Paragraph(str(meeting[18] or 'N/A'), wrapped_style)],
                    ['Total Detections:', Paragraph(str(int(meeting[19] or 0)), wrapped_style)],
                    ['Attendance Penalty:', Paragraph(f"{round(float(meeting[20] or 0), 2)}", wrapped_style)],
                    ['Break Used:', Paragraph('Yes' if meeting[21] else 'No', wrapped_style)],
                    ['Total Break Time (seconds):', Paragraph(str(int(meeting[22] or 0)), wrapped_style)],
                    ['Engagement Score:', Paragraph(str(int(meeting[23] or 0)), wrapped_style)],
                    ['Session Attendance %:', Paragraph(f"{round(float(meeting[24] or 0), 2)}%", wrapped_style)],
                    ['Focus Score:', Paragraph(f"{round(float(meeting[25] or 0), 2)}", wrapped_style)],
                    ['Break Count:', Paragraph(str(int(meeting[26] or 0)), wrapped_style)],
                    ['Violation Severity Score:', Paragraph(f"{round(float(meeting[27] or 0), 2)}", wrapped_style)],
                ]

                # Create monitoring table with consistent alignment & wrapping
                monitoring_table = Table(monitoring_data, colWidths=[2.7*inch, 3.3*inch])
                monitoring_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (0, -1), colors.lightcoral),
                    ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('WORDWRAP', (0, 0), (-1, -1), 'CJK'),
                    ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                    ('FONTSIZE', (0, 0), (-1, -1), 8.5),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
                ]))
                story.append(monitoring_table)
                story.append(Spacer(1, 15))


        else:
            story.append(Paragraph("No meeting records found for the selected period.", report_gen.styles['Normal']))
        
        # Build PDF with custom header/footer
        def add_page_number(canvas, doc):
            report_gen.create_header_footer(canvas, doc, "Participant Attendance Report")
        
        doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
        
        # Prepare response
        buffer.seek(0)
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="participant_report_{user_id}_{datetime.now().strftime("%Y%m%d")}.pdf"'
        
        return response
        
    except Exception as e:
        logging.error(f"Error generating participant PDF report: {e}")
        return JsonResponse({"error": f"Failed to generate report: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def generate_host_report_pdf(request):
    """
    Generate PDF report for a specific host showing:
    - All meetings the host created/conducted/completed
    - For each meeting, all participants with their attendance details
    - Summary counts: meetings created, conducted, completed, participant metrics
    """
    try:
        host_id = request.GET.get('host_id') or request.GET.get('user_id') or request.GET.get('userId')
        
        # Date range parameters
        start_date_str = request.GET.get('start_date')
        end_date_str = request.GET.get('end_date')
        
        if not host_id:
            return JsonResponse({"error": "host_id is required"}, status=BAD_REQUEST_STATUS)
        
        # Parse date range
        start_date = None
        end_date = None
        if start_date_str:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
        if end_date_str:
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
        
        # Get report data
        data = get_host_report_data(host_id, start_date, end_date)
        if not data:
            return JsonResponse({"error": "Host not found or no data available"}, status=NOT_FOUND_STATUS)
        
        # Create PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, leftMargin=50, rightMargin=50, topMargin=80, bottomMargin=80)
        
        # Create report generator
        report_gen = ReportGenerator()
        
        # Story elements
        story = []
        
        # Title
        title = Paragraph(f"Host Meeting Report", report_gen.custom_styles['ReportTitle'])
        story.append(title)
        story.append(Spacer(1, 20))
        
        # Host Information
        story.append(Paragraph("Host Information", report_gen.custom_styles['SectionHeader']))
        
        host_info_data = [
            ['Host ID:', str(data['host_id'])],
            ['Report Period:', f"{data['date_range']['start'].strftime('%Y-%m-%d')} to {data['date_range']['end'].strftime('%Y-%m-%d')}"],
        ]
        
        host_table = Table(host_info_data, colWidths=[2*inch, 4*inch])
        host_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(host_table)
        story.append(Spacer(1, 20))
        
        # Host Summary Statistics
        host_stats = data['host_stats']
        story.append(Paragraph("Host Summary Statistics", report_gen.custom_styles['SectionHeader']))
        
        summary_data = [
            ['Total Meetings Created:', str(int(host_stats[0] or 0))],
            ['Active Meetings:', str(int(host_stats[1] or 0))],
            ['Completed Meetings:', str(int(host_stats[2] or 0))],
            ['Scheduled Meetings:', str(int(host_stats[3] or 0))],
            ['Total Unique Participants:', str(int(host_stats[4] or 0))],
            ['Average Participant Attendance:', f"{round(float(host_stats[5] or 0), 2)}%"],
            ['Average Engagement Score:', f"{round(float(host_stats[6] or 0), 2)}"],
            ['Total Violations Across Meetings:', str(int(host_stats[7] or 0))],
        ]
        
        summary_table = Table(summary_data, colWidths=[3*inch, 3*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightblue),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 20))
        
        # Detailed Meeting Records with Participants
        story.append(Paragraph("Detailed Meeting Records with Participants", report_gen.custom_styles['SectionHeader']))
        
        if data['meetings_data']:
            # Group meetings data by meeting_id
            meetings_dict = {}
            for record in data['meetings_data']:
                meeting_id = record[0]
                if meeting_id not in meetings_dict:
                    meetings_dict[meeting_id] = {
                        'meeting_info': record[:7],  # meeting details
                        'participants': []
                    }
                
                # Add participant if exists
                if record[7]:  # user_id exists
                    meetings_dict[meeting_id]['participants'].append(record[7:])
            
            for meeting_id, meeting_data in meetings_dict.items():
                meeting_info = meeting_data['meeting_info']
                participants = meeting_data['participants']
                
                # Meeting header
                meeting_title = f"Meeting: {meeting_info[1] or 'Unnamed Meeting'}"
                story.append(Paragraph(meeting_title, report_gen.custom_styles['SubHeader']))
                
                # Meeting details
                meeting_details = [
                    ['Meeting ID:', str(meeting_info[0])],
                    ['Meeting Type:', meeting_info[2] or 'N/A'],
                    ['Created Date:', meeting_info[3].strftime('%Y-%m-%d %H:%M') if meeting_info[3] else 'N/A'],
                    ['Started Date:', meeting_info[4].strftime('%Y-%m-%d %H:%M') if meeting_info[4] else 'N/A'],
                    ['Ended Date:', meeting_info[5].strftime('%Y-%m-%d %H:%M') if meeting_info[5] else 'N/A'],
                    ['Status:', meeting_info[6] or 'N/A'],
                    ['Total Participants:', str(len(participants))],
                ]
                
                meeting_table = Table(meeting_details, colWidths=[2.5*inch, 3.5*inch])
                meeting_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
                    ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black)
                ]))
                story.append(meeting_table)
                story.append(Spacer(1, 10))
                
                # Participants details
                if participants:
                    story.append(Paragraph("Participants:", report_gen.styles['Heading3']))
                    
                    # Create participants table
                    participants_header = [
                        'Name', 'Role', 'Duration (min)', 'Attendance %', 
                        'Engagement', 'Penalties', 'Breaks', 'Violations'
                    ]
                    participants_data = [participants_header]
                    
                    for participant in participants:
                        participant_row = [
                            participant[1] or 'N/A',  # Full_Name
                            participant[2] or 'participant',  # Role
                            f"{round(float(participant[3] or 0), 1)}",  # Total_Duration_Minutes
                            f"{round(float(participant[5] or 0), 1)}%",  # Participant_Attendance
                            str(int(participant[15] or 0)),  # engagement_score
                            f"{round(float(participant[12] or 0), 2)}",  # attendance_penalty
                            str(int(participant[13] or 0)),  # break_used
                            str(int(participant[11] or 0)),  # total_detections
                        ]
                        participants_data.append(participant_row)
                    
                    participants_table = Table(participants_data, colWidths=[1*inch, 0.8*inch, 0.8*inch, 0.8*inch, 0.8*inch, 0.8*inch, 0.6*inch, 0.8*inch])
                    participants_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                        ('FONTSIZE', (0, 0), (-1, 0), 8),
                        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                        ('FONTSIZE', (0, 1), (-1, -1), 7),
                        ('GRID', (0, 0), (-1, -1), 1, colors.black),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
                    ]))
                    story.append(participants_table)
                else:
                    story.append(Paragraph("No participants recorded for this meeting.", report_gen.styles['Normal']))
                
                story.append(Spacer(1, 15))
        else:
            story.append(Paragraph("No meeting records found for the selected period.", report_gen.styles['Normal']))
        
        # Build PDF with custom header/footer
        def add_page_number(canvas, doc):
            report_gen.create_header_footer(canvas, doc, "Host Meeting Report")
        
        doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
        
        # Prepare response
        buffer.seek(0)
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="host_report_{host_id}_{datetime.now().strftime("%Y%m%d")}.pdf"'
        
        return response
        
    except Exception as e:
        logging.error(f"Error generating host PDF report: {e}")
        return JsonResponse({"error": f"Failed to generate report: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def get_participant_report_preview(request):
    """
    Get participant report data in JSON format for preview before generating PDF
    """
    try:
        user_id = request.GET.get('user_id') or request.GET.get('userId')
        start_date_str = request.GET.get('start_date')
        end_date_str = request.GET.get('end_date')
        
        if not user_id:
            return JsonResponse({"error": "user_id is required"}, status=BAD_REQUEST_STATUS)
        
        # Parse date range
        start_date = None
        end_date = None
        if start_date_str:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
        if end_date_str:
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
        
        # Get report data
        data = get_participant_report_data(user_id, start_date, end_date)
        if not data:
            return JsonResponse({"error": "Participant not found or no data available"}, status=NOT_FOUND_STATUS)
        
        # Format response data
        response_data = {
            "participant_info": data['participant_info'],
            "overall_stats": {
                "total_meetings": int(data['overall_stats'][0] or 0),
                "avg_participant_attendance": round(float(data['overall_stats'][1] or 0), 2),
                "avg_overall_attendance": round(float(data['overall_stats'][2] or 0), 2),
                "total_duration_minutes": round(float(data['overall_stats'][3] or 0), 2),
                "avg_engagement_score": round(float(data['overall_stats'][4] or 0), 2),
                "avg_penalty": round(float(data['overall_stats'][5] or 0), 2),
                "total_break_time": round(float(data['overall_stats'][6] or 0), 2),
                "total_violations": int(data['overall_stats'][7] or 0)
            },
            "date_range": {
                "start": data['date_range']['start'].isoformat(),
                "end": data['date_range']['end'].isoformat()
            },
            "total_meetings_count": len(data['meetings_data'])
        }
        
        return JsonResponse({"data": response_data}, status=SUCCESS_STATUS)
        
    except Exception as e:
        logging.error(f"Error getting participant report preview: {e}")
        return JsonResponse({"error": f"Failed to get preview: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def get_host_report_preview(request):
    """
    Get host report data in JSON format for preview before generating PDF
    """
    try:
        host_id = request.GET.get('host_id') or request.GET.get('user_id') or request.GET.get('userId')
        start_date_str = request.GET.get('start_date')
        end_date_str = request.GET.get('end_date')
        
        if not host_id:
            return JsonResponse({"error": "host_id is required"}, status=BAD_REQUEST_STATUS)
        
        # Parse date range
        start_date = None
        end_date = None
        if start_date_str:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
        if end_date_str:
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
        
        # Get report data
        data = get_host_report_data(host_id, start_date, end_date)
        if not data:
            return JsonResponse({"error": "Host not found or no data available"}, status=NOT_FOUND_STATUS)
        
        # Count unique meetings
        unique_meetings = set()
        for record in data['meetings_data']:
            unique_meetings.add(record[0])  # meeting_id
        
        # Format response data
        response_data = {
            "host_id": data['host_id'],
            "host_stats": {
                "total_meetings_created": int(data['host_stats'][0] or 0),
                "active_meetings": int(data['host_stats'][1] or 0),
                "completed_meetings": int(data['host_stats'][2] or 0),
                "scheduled_meetings": int(data['host_stats'][3] or 0),
                "total_unique_participants": int(data['host_stats'][4] or 0),
                "avg_participant_attendance": round(float(data['host_stats'][5] or 0), 2),
                "avg_engagement_score": round(float(data['host_stats'][6] or 0), 2),
                "total_violations": int(data['host_stats'][7] or 0)
            },
            "date_range": {
                "start": data['date_range']['start'].isoformat(),
                "end": data['date_range']['end'].isoformat()
            },
            "total_meetings_count": len(unique_meetings),
            "total_records_count": len(data['meetings_data'])
        }
        
        return JsonResponse({"data": response_data}, status=SUCCESS_STATUS)
        
    except Exception as e:
        logging.error(f"Error getting host report preview: {e}")
        return JsonResponse({"error": f"Failed to get preview: {str(e)}"}, status=SERVER_ERROR_STATUS)

# URL patterns
urlpatterns = [
    # Comprehensive Analytics Endpoints
    path('api/analytics/comprehensive', get_comprehensive_meeting_analytics, name='get_comprehensive_meeting_analytics'),
    path('api/analytics/participant/duration', get_participant_meeting_duration_analytics, name='get_participant_meeting_duration_analytics'),
    path('api/analytics/participant/attendance', get_participant_attendance_analytics, name='get_participant_attendance_analytics'),
    path('api/analytics/host/meeting-counts', get_host_meeting_count_analytics, name='get_host_meeting_count_analytics'),
    
    # Enhanced Existing Endpoints
    path('api/analytics/host/overview', get_host_dashboard_overview, name='get_host_dashboard_overview'),
    path('api/reports/participant/pdf', generate_participant_report_pdf, name='generate_participant_report_pdf'),
    path('api/reports/host/pdf', generate_host_report_pdf, name='generate_host_report_pdf'),
    
    # Report Previews (JSON data)
    path('api/reports/participant/preview', get_participant_report_preview, name='get_participant_report_preview'),
    path('api/reports/host/preview', get_host_report_preview, name='get_host_report_preview'),
]