from django.db import connection, transaction
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.urls import path
import json
import logging
from datetime import datetime, timedelta
import pytz
from django.utils import timezone

# Configure logging
logging.basicConfig(filename='analytics_debug.log', level=logging.DEBUG, format='%(asctime)s %(levelname)s %(message)s')

# Global status codes
SUCCESS_STATUS = 200
BAD_REQUEST_STATUS = 400
UNAUTHORIZED_STATUS = 401
FORBIDDEN_STATUS = 403
NOT_FOUND_STATUS = 404
SERVER_ERROR_STATUS = 500

@require_http_methods(["GET"])
@csrf_exempt
def get_host_dashboard_overview(request):
    """Fetch overview data for host analytics dashboard"""
    try:
        # Accept multiple parameter names for user_id
        user_id = request.GET.get('user_id') or request.GET.get('userId') or request.GET.get('host_id')
        timeframe = request.GET.get('timeframe', '7days')
        meeting_type = request.GET.get('meetingType') or request.GET.get('meeting_type', 'all')

        logging.debug(f"Host overview request - user_id: {user_id}, timeframe: {timeframe}, meeting_type: {meeting_type}")

        if not user_id:
            logging.error("Missing user_id in host overview request")
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
            # Total meetings hosted
            query = """
                SELECT COUNT(*) 
                FROM tbl_Meetings m
                WHERE m.Host_ID = %s AND m.Created_At BETWEEN %s AND %s
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND m.Meeting_Type = %s"
                params.append(meeting_type)
            cursor.execute(query, params)
            total_meetings = cursor.fetchone()[0] or 0

            # Total participants
            query = """
                SELECT COUNT(DISTINCT p.User_ID)
                FROM tbl_Participants p
                JOIN tbl_Meetings m ON p.Meeting_ID = m.ID
                WHERE m.Host_ID = %s AND m.Created_At BETWEEN %s AND %s
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND m.Meeting_Type = %s"
                params.append(meeting_type)
            cursor.execute(query, params)
            total_participants = cursor.fetchone()[0] or 0

            # Average meeting duration
            query = """
                SELECT AVG(p.Duration) / 60
                FROM tbl_Participants p
                JOIN tbl_Meetings m ON p.Meeting_ID = m.ID
                WHERE m.Host_ID = %s AND m.Created_At BETWEEN %s AND %s
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND m.Meeting_Type = %s"
                params.append(meeting_type)
            cursor.execute(query, params)
            avg_duration = cursor.fetchone()[0] or 0

            # Average engagement score
            query = """
                SELECT AVG(p.Engagement_Score)
                FROM tbl_Participants p
                JOIN tbl_Meetings m ON p.Meeting_ID = m.ID
                WHERE m.Host_ID = %s AND m.Created_At BETWEEN %s AND %s
                AND p.Engagement_Score IS NOT NULL
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND m.Meeting_Type = %s"
                params.append(meeting_type)
            cursor.execute(query, params)
            avg_engagement = cursor.fetchone()[0] or 0

        data = {
            "total_meetings": int(total_meetings),
            "total_participants": int(total_participants),
            "average_duration": round(float(avg_duration), 2),
            "average_engagement": round(float(avg_engagement), 2)
        }
        logging.debug(f"Host overview fetched for user_id {user_id}: {data}")
        return JsonResponse({"data": data}, status=SUCCESS_STATUS)
    except Exception as e:
        logging.error(f"Error fetching host overview: {e}")
        return JsonResponse({"error": f"Database error: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def get_host_meeting_reports(request):
    """Fetch detailed meeting reports for host"""
    try:
        # Accept multiple parameter names
        user_id = request.GET.get('user_id') or request.GET.get('userId') or request.GET.get('host_id')
        page = int(request.GET.get('page', 1))
        limit = int(request.GET.get('limit', 50))
        
        # Handle different date parameter formats
        date_range_start = (request.GET.get('dateRange[start]') or 
                           request.GET.get('start_date') or
                           request.GET.get('startDate'))
        date_range_end = (request.GET.get('dateRange[end]') or 
                         request.GET.get('end_date') or
                         request.GET.get('endDate'))
        
        meeting_type = request.GET.get('meetingType') or request.GET.get('meeting_type', 'all')
        timeframe = request.GET.get('timeframe', '30days')

        logging.debug(f"Host meeting reports request - user_id: {user_id}, page: {page}, limit: {limit}")
        logging.debug(f"Date range - start: {date_range_start}, end: {date_range_end}")

        if not user_id:
            logging.error("Missing user_id in meeting reports request")
            return JsonResponse({"error": "user_id is required"}, status=BAD_REQUEST_STATUS)

        # Calculate date range if not provided
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
            else:
                start_date = end_date - timedelta(days=30)
        else:
            start_date = datetime.strptime(date_range_start, '%Y-%m-%d').replace(tzinfo=ist_timezone)

        offset = (page - 1) * limit

        with connection.cursor() as cursor:
            # Count total meetings for pagination
            count_query = """
                SELECT COUNT(*)
                FROM tbl_Meetings m
                WHERE m.Host_ID = %s AND m.Created_At BETWEEN %s AND %s
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                count_query += " AND m.Meeting_Type = %s"
                params.append(meeting_type)
            cursor.execute(count_query, params)
            total_meetings = cursor.fetchone()[0] or 0

            # Fetch meeting reports
            query = """
                SELECT m.ID, m.Meeting_Name, m.Meeting_Type, m.Created_At, 
                       COUNT(DISTINCT p.ID) as participant_count, 
                       AVG(p.Duration) / 60 as avg_duration,
                       AVG(p.Engagement_Score) as avg_engagement
                FROM tbl_Meetings m
                LEFT JOIN tbl_Participants p ON m.ID = p.Meeting_ID
                WHERE m.Host_ID = %s AND m.Created_At BETWEEN %s AND %s
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND m.Meeting_Type = %s"
                params.append(meeting_type)
            query += " GROUP BY m.ID, m.Meeting_Name, m.Meeting_Type, m.Created_At ORDER BY m.Created_At DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            cursor.execute(query, params)
            rows = cursor.fetchall()

            meetings = []
            for row in rows:
                meetings.append({
                    "meeting_id": row[0],
                    "meeting_name": row[1] or f"Meeting {row[0]}",
                    "meeting_type": row[2] or "InstantMeeting",
                    "date": row[3].strftime('%Y-%m-%d') if row[3] else "",
                    "participants": int(row[4] or 0),
                    "duration": round(float(row[5] or 0), 2),
                    "engagement": round(float(row[6] or 0), 2)
                })

        data = {
            "meetings": meetings,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total_meetings,
                "pages": max(1, (total_meetings + limit - 1) // limit)
            }
        }
        logging.debug(f"Host meeting reports fetched for user_id {user_id}: {len(meetings)} meetings")
        return JsonResponse(data, status=SUCCESS_STATUS)
    except Exception as e:
        logging.error(f"Error fetching host meeting reports: {e}")
        return JsonResponse({"error": f"Database error: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def get_host_engagement_distribution(request):
    """Fetch engagement distribution for host's meetings"""
    try:
        # Accept multiple parameter names
        user_id = (request.GET.get('user_id') or 
                  request.GET.get('userId') or 
                  request.GET.get('host_id'))
        timeframe = request.GET.get('timeframe', '7days')
        meeting_type = request.GET.get('meetingType') or request.GET.get('meeting_type', 'all')

        logging.debug(f"Host engagement distribution request - user_id: {user_id}, timeframe: {timeframe}")

        if not user_id:
            logging.error("Missing user_id or host_id in engagement distribution request")
            return JsonResponse({"error": "user_id or host_id is required"}, status=BAD_REQUEST_STATUS)

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
            query = """
                SELECT 
                    CASE 
                        WHEN p.Engagement_Score >= 80 THEN 'High'
                        WHEN p.Engagement_Score >= 50 THEN 'Medium'
                        ELSE 'Low'
                    END as engagement_level,
                    COUNT(*) as count,
                    CASE 
                        WHEN p.Engagement_Score >= 80 THEN '#4CAF50'
                        WHEN p.Engagement_Score >= 50 THEN '#FFC107'
                        ELSE '#F44336'
                    END as color
                FROM tbl_Participants p
                JOIN tbl_Meetings m ON p.Meeting_ID = m.ID
                WHERE m.Host_ID = %s AND m.Created_At BETWEEN %s AND %s 
                AND p.Engagement_Score IS NOT NULL
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND m.Meeting_Type = %s"
                params.append(meeting_type)
            query += " GROUP BY engagement_level ORDER BY engagement_level"
            cursor.execute(query, params)
            rows = cursor.fetchall()

            distribution = []
            for row in rows:
                distribution.append({
                    "name": row[0],
                    "value": int(row[1]),
                    "color": row[2]
                })

            # Ensure we have all three categories even if some are empty
            existing_levels = {item['name'] for item in distribution}
            default_levels = [
                {"name": "High", "value": 0, "color": "#4CAF50"},
                {"name": "Medium", "value": 0, "color": "#FFC107"},
                {"name": "Low", "value": 0, "color": "#F44336"}
            ]
            
            for default_level in default_levels:
                if default_level['name'] not in existing_levels:
                    distribution.append(default_level)

            # Sort by engagement level
            distribution.sort(key=lambda x: {'High': 3, 'Medium': 2, 'Low': 1}[x['name']], reverse=True)

        data = {"distribution": distribution}
        logging.debug(f"Host engagement distribution fetched for user_id {user_id}: {distribution}")
        return JsonResponse({"data": data}, status=SUCCESS_STATUS)
    except Exception as e:
        logging.error(f"Error fetching host engagement distribution: {e}")
        return JsonResponse({"error": f"Database error: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def get_host_meeting_trends(request):
    """Fetch meeting trends for host"""
    try:
        user_id = request.GET.get('user_id') or request.GET.get('userId') or request.GET.get('host_id')
        timeframe = request.GET.get('timeframe', '7days')
        metric = request.GET.get('metric', 'meetings')

        logging.debug(f"Host trends request - user_id: {user_id}, timeframe: {timeframe}, metric: {metric}")

        if not user_id:
            logging.error("Missing user_id in trends request")
            return JsonResponse({"error": "user_id is required"}, status=BAD_REQUEST_STATUS)

        ist_timezone = pytz.timezone('Asia/Kolkata')
        end_date = timezone.now().astimezone(ist_timezone)
        if timeframe == '7days':
            start_date = end_date - timedelta(days=7)
            interval = 'DAY'
            date_format = '%Y-%m-%d'
        elif timeframe == '30days':
            start_date = end_date - timedelta(days=30)
            interval = 'DAY'
            date_format = '%Y-%m-%d'
        elif timeframe == '90days':
            start_date = end_date - timedelta(days=90)
            interval = 'WEEK'
            date_format = '%Y-%u'
        elif timeframe == '1year':
            start_date = end_date - timedelta(days=365)
            interval = 'MONTH'
            date_format = '%Y-%m'
        else:
            return JsonResponse({"error": "Invalid timeframe"}, status=BAD_REQUEST_STATUS)

        with connection.cursor() as cursor:
            if metric == 'meetings':
                query = """
                    SELECT DATE_FORMAT(m.Created_At, %s) as date, 
                           COUNT(*) as count,
                           AVG(COALESCE(p.Engagement_Score, 0)) as avg_engagement
                    FROM tbl_Meetings m
                    LEFT JOIN tbl_Participants p ON m.ID = p.Meeting_ID
                    WHERE m.Host_ID = %s AND m.Created_At BETWEEN %s AND %s
                    GROUP BY DATE_FORMAT(m.Created_At, %s)
                    ORDER BY date
                """
                params = [date_format, user_id, start_date, end_date, date_format]
            elif metric == 'participants':
                query = """
                    SELECT DATE_FORMAT(m.Created_At, %s) as date, 
                           COUNT(DISTINCT p.User_ID) as count,
                           AVG(COALESCE(p.Engagement_Score, 0)) as avg_engagement
                    FROM tbl_Meetings m
                    LEFT JOIN tbl_Participants p ON m.ID = p.Meeting_ID
                    WHERE m.Host_ID = %s AND m.Created_At BETWEEN %s AND %s
                    GROUP BY DATE_FORMAT(m.Created_At, %s)
                    ORDER BY date
                """
                params = [date_format, user_id, start_date, end_date, date_format]
            else:
                return JsonResponse({"error": "Invalid metric"}, status=BAD_REQUEST_STATUS)

            cursor.execute(query, params)
            rows = cursor.fetchall()

            trends = []
            for row in rows:
                trends.append({
                    "date": row[0] or "",
                    metric: int(row[1] or 0),
                    "avg_engagement": round(float(row[2] or 0), 2)
                })

            # Ensure we have at least some data points
            if not trends:
                trends = [{
                    "date": start_date.strftime(date_format),
                    metric: 0,
                    "avg_engagement": 0
                }]

        data = {"trends": trends}
        logging.debug(f"Host trends fetched for user_id {user_id}: {len(trends)} data points")
        return JsonResponse({"data": data}, status=SUCCESS_STATUS)
    except Exception as e:
        logging.error(f"Error fetching host trends: {e}")
        return JsonResponse({"error": f"Database error: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def get_participant_personal_report(request):
    """UPDATED: Fetch personal analytics report for a participant with meeting type support"""
    try:
        user_id = request.GET.get('userId') or request.GET.get('user_id')
        timeframe = request.GET.get('timeframe', '30days')
        meeting_type = request.GET.get('meetingType') or request.GET.get('meeting_type', 'all')

        logging.debug(f"Participant personal report request - user_id: {user_id}, timeframe: {timeframe}, meeting_type: {meeting_type}")

        if not user_id:
            logging.error("Missing userId in personal report request")
            return JsonResponse({"error": "userId is required"}, status=BAD_REQUEST_STATUS)

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
            # Total meetings attended with meeting type filter
            query = """
                SELECT COUNT(*)
                FROM tbl_Participants p
                WHERE p.User_ID = %s AND p.Join_Time BETWEEN %s AND %s AND p.Role = 'participant'
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND p.Meeting_Type = %s"
                params.append(meeting_type)
            cursor.execute(query, params)
            total_meetings = cursor.fetchone()[0] or 0

            # Total meeting time with meeting type filter
            query = """
                SELECT COALESCE(SUM(p.Duration), 0) / 60
                FROM tbl_Participants p
                WHERE p.User_ID = %s AND p.Join_Time BETWEEN %s AND %s AND p.Role = 'participant'
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND p.Meeting_Type = %s"
                params.append(meeting_type)
            cursor.execute(query, params)
            total_minutes = cursor.fetchone()[0] or 0

            # Average attendance percentage with meeting type filter
            query = """
                SELECT AVG(COALESCE(p.Attendance_Percentage, 0))
                FROM tbl_Participants p
                WHERE p.User_ID = %s AND p.Join_Time BETWEEN %s AND %s AND p.Role = 'participant'
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND p.Meeting_Type = %s"
                params.append(meeting_type)
            cursor.execute(query, params)
            avg_attendance = cursor.fetchone()[0] or 0

            # Average engagement score with meeting type filter
            query = """
                SELECT AVG(COALESCE(p.Engagement_Score, 0))
                FROM tbl_Participants p
                WHERE p.User_ID = %s AND p.Join_Time BETWEEN %s AND %s AND p.Role = 'participant'
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND p.Meeting_Type = %s"
                params.append(meeting_type)
            cursor.execute(query, params)
            avg_engagement = cursor.fetchone()[0] or 0

            # Meeting type breakdown
            cursor.execute("""
                SELECT p.Meeting_Type, COUNT(*) as count, 
                       AVG(COALESCE(p.Attendance_Percentage, 0)) as avg_attendance,
                       COALESCE(SUM(p.Duration), 0) / 60 as total_minutes
                FROM tbl_Participants p
                WHERE p.User_ID = %s AND p.Join_Time BETWEEN %s AND %s AND p.Role = 'participant'
                AND p.Meeting_Type IS NOT NULL
                GROUP BY p.Meeting_Type
            """, [user_id, start_date, end_date])
            
            meeting_type_breakdown = {}
            for row in cursor.fetchall():
                mt, count, avg_att, total_min = row
                meeting_type_breakdown[mt] = {
                    'count': int(count),
                    'avg_attendance': round(float(avg_att or 0), 2),
                    'total_minutes': round(float(total_min or 0), 2)
                }

            # Upcoming meetings (estimate based on recent patterns)
            query = """
                SELECT COUNT(*)
                FROM tbl_Meetings m
                WHERE m.Created_At > %s AND m.Host_ID != %s AND m.Status = 'scheduled'
            """
            cursor.execute(query, [end_date, user_id])
            upcoming_count = cursor.fetchone()[0] or 0

        data = {
            "totalMeetings": int(total_meetings),
            "totalMinutes": round(float(total_minutes), 2),
            "averageAttendance": round(float(avg_attendance), 2),
            "averageEngagement": round(float(avg_engagement), 2),
            "upcomingCount": int(upcoming_count),
            "meetingTypeBreakdown": meeting_type_breakdown,
            "appliedFilter": {
                "timeframe": timeframe,
                "meeting_type": meeting_type
            }
        }
        logging.debug(f"Participant personal report fetched for user_id {user_id}: {data}")
        return JsonResponse({"data": data}, status=SUCCESS_STATUS)
    except Exception as e:
        logging.error(f"Error fetching participant personal report: {e}")
        return JsonResponse({"error": f"Database error: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def get_participant_attendance(request):
    """UPDATED: Fetch attendance records for a participant with meeting type support"""
    try:
        user_id = request.GET.get('userId') or request.GET.get('user_id')
        meeting_type = request.GET.get('meetingType') or request.GET.get('meeting_type', 'all')
        
        # Handle different date parameter formats
        try:
            date_range = json.loads(request.GET.get('dateRange', '{}'))
            start_date = date_range.get('start')
            end_date = date_range.get('end')
        except:
            start_date = request.GET.get('start_date') or request.GET.get('startDate')
            end_date = request.GET.get('end_date') or request.GET.get('endDate')
        
        # Default dates if not provided
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')

        logging.debug(f"Participant attendance request - user_id: {user_id}, dates: {start_date} to {end_date}, meeting_type: {meeting_type}")

        if not user_id:
            logging.error("Missing userId in attendance request")
            return JsonResponse({"error": "userId is required"}, status=BAD_REQUEST_STATUS)

        with connection.cursor() as cursor:
            # Get attendance records with meeting type filter
            query = """
                SELECT p.Meeting_ID, m.Meeting_Name, p.Join_Time, 
                       COALESCE(p.Attendance_Percentage, 0) as attendance_percentage,
                       p.Meeting_Type, COALESCE(p.Engagement_Score, 0) as engagement_score
                FROM tbl_Participants p
                JOIN tbl_Meetings m ON p.Meeting_ID = m.ID
                WHERE p.User_ID = %s AND DATE(p.Join_Time) BETWEEN %s AND %s 
                AND p.Role = 'participant'
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND p.Meeting_Type = %s"
                params.append(meeting_type)
            query += " ORDER BY p.Join_Time DESC"
            cursor.execute(query, params)
            rows = cursor.fetchall()

            attendance_records = []
            for row in rows:
                attendance_records.append({
                    "meeting_id": row[0],
                    "meeting_name": row[1] or f"Meeting {row[0]}",
                    "date": row[2].strftime('%Y-%m-%d') if row[2] else "",
                    "attendance_percentage": round(float(row[3] or 0), 2),
                    "meeting_type": row[4] or "Unknown",
                    "engagement_score": round(float(row[5] or 0), 2)
                })

            # Summary statistics with meeting type filter
            query = """
                SELECT COUNT(*), 
                       AVG(COALESCE(p.Attendance_Percentage, 0)), 
                       COALESCE(SUM(p.Duration), 0) / 60,
                       AVG(COALESCE(p.Engagement_Score, 0))
                FROM tbl_Participants p
                WHERE p.User_ID = %s AND DATE(p.Join_Time) BETWEEN %s AND %s 
                AND p.Role = 'participant'
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND p.Meeting_Type = %s"
                params.append(meeting_type)
            cursor.execute(query, params)
            summary = cursor.fetchone()
            
            # Meeting type breakdown for the period
            cursor.execute("""
                SELECT p.Meeting_Type, COUNT(*) as count,
                       AVG(COALESCE(p.Attendance_Percentage, 0)) as avg_attendance,
                       AVG(COALESCE(p.Engagement_Score, 0)) as avg_engagement
                FROM tbl_Participants p
                WHERE p.User_ID = %s AND DATE(p.Join_Time) BETWEEN %s AND %s 
                AND p.Role = 'participant' AND p.Meeting_Type IS NOT NULL
                GROUP BY p.Meeting_Type
            """, [user_id, start_date, end_date])
            
            meeting_type_summary = {}
            for row in cursor.fetchall():
                mt, count, avg_att, avg_eng = row
                meeting_type_summary[mt] = {
                    'count': int(count),
                    'avg_attendance': round(float(avg_att or 0), 2),
                    'avg_engagement': round(float(avg_eng or 0), 2)
                }
            
            summary_data = {
                "total_meetings": int(summary[0] or 0),
                "avg_attendance": round(float(summary[1] or 0), 2),
                "total_minutes": round(float(summary[2] or 0), 2),
                "avg_engagement": round(float(summary[3] or 0), 2),
                "meeting_type_breakdown": meeting_type_summary
            }

        data = {
            "attendanceRecords": attendance_records,
            "summary": summary_data,
            "appliedFilter": {
                "start_date": start_date,
                "end_date": end_date,
                "meeting_type": meeting_type
            }
        }
        logging.debug(f"Participant attendance fetched for user_id {user_id}: {len(attendance_records)} records")
        return JsonResponse(data, status=SUCCESS_STATUS)
    except Exception as e:
        logging.error(f"Error fetching participant attendance: {e}")
        return JsonResponse({"error": f"Database error: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def get_participant_engagement(request):
    """UPDATED: Fetch engagement metrics for a participant with meeting type support"""
    try:
        user_id = request.GET.get('userId') or request.GET.get('user_id')
        timeframe = request.GET.get('timeframe', '30days')
        meeting_type = request.GET.get('meetingType') or request.GET.get('meeting_type', 'all')

        logging.debug(f"Participant engagement request - user_id: {user_id}, timeframe: {timeframe}, meeting_type: {meeting_type}")

        if not user_id:
            logging.error("Missing userId in engagement request")
            return JsonResponse({"error": "userId is required"}, status=BAD_REQUEST_STATUS)

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
            # Get engagement records with meeting type filter
            query = """
                SELECT p.Meeting_ID, m.Meeting_Name, p.Join_Time, 
                       COALESCE(p.Engagement_Score, 0) as engagement_score,
                       p.Meeting_Type, COALESCE(p.Attendance_Percentage, 0) as attendance_percentage
                FROM tbl_Participants p
                JOIN tbl_Meetings m ON p.Meeting_ID = m.ID
                WHERE p.User_ID = %s AND p.Join_Time BETWEEN %s AND %s 
                AND p.Role = 'participant'
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND p.Meeting_Type = %s"
                params.append(meeting_type)
            query += " ORDER BY p.Join_Time DESC"
            cursor.execute(query, params)
            rows = cursor.fetchall()

            engagement_records = []
            for row in rows:
                engagement_records.append({
                    "meeting_id": row[0],
                    "meeting_name": row[1] or f"Meeting {row[0]}",
                    "date": row[2].strftime('%Y-%m-%d') if row[2] else "",
                    "engagement_score": round(float(row[3] or 0), 2),
                    "meeting_type": row[4] or "Unknown",
                    "attendance_percentage": round(float(row[5] or 0), 2)
                })

            # Summary statistics with meeting type filter
            query = """
                SELECT AVG(COALESCE(p.Engagement_Score, 0)),
                       AVG(COALESCE(p.Attendance_Percentage, 0)),
                       COUNT(*)
                FROM tbl_Participants p
                WHERE p.User_ID = %s AND p.Join_Time BETWEEN %s AND %s 
                AND p.Role = 'participant'
            """
            params = [user_id, start_date, end_date]
            if meeting_type != 'all':
                query += " AND p.Meeting_Type = %s"
                params.append(meeting_type)
            cursor.execute(query, params)
            summary = cursor.fetchone()
            
            # Engagement distribution by meeting type
            cursor.execute("""
                SELECT p.Meeting_Type,
                       AVG(COALESCE(p.Engagement_Score, 0)) as avg_engagement,
                       COUNT(*) as meeting_count,
                       COUNT(CASE WHEN p.Engagement_Score >= 80 THEN 1 END) as high_engagement,
                       COUNT(CASE WHEN p.Engagement_Score >= 50 AND p.Engagement_Score < 80 THEN 1 END) as medium_engagement,
                       COUNT(CASE WHEN p.Engagement_Score < 50 THEN 1 END) as low_engagement
                FROM tbl_Participants p
                WHERE p.User_ID = %s AND p.Join_Time BETWEEN %s AND %s 
                AND p.Role = 'participant' AND p.Meeting_Type IS NOT NULL
                GROUP BY p.Meeting_Type
            """, [user_id, start_date, end_date])
            
            engagement_by_meeting_type = {}
            for row in cursor.fetchall():
                mt, avg_eng, count, high, medium, low = row
                engagement_by_meeting_type[mt] = {
                    'avg_engagement': round(float(avg_eng or 0), 2),
                    'meeting_count': int(count),
                    'high_engagement_sessions': int(high or 0),
                    'medium_engagement_sessions': int(medium or 0),
                    'low_engagement_sessions': int(low or 0)
                }
            
            summary_data = {
                "avg_engagement": round(float(summary[0] or 0), 2),
                "avg_attendance": round(float(summary[1] or 0), 2),
                "total_sessions": int(summary[2] or 0),
                "engagement_by_meeting_type": engagement_by_meeting_type
            }

        data = {
            "engagementRecords": engagement_records,
            "summary": summary_data,
            "appliedFilter": {
                "timeframe": timeframe,
                "meeting_type": meeting_type
            }
        }
        logging.debug(f"Participant engagement fetched for user_id {user_id}: {len(engagement_records)} records")
        return JsonResponse({"data": data}, status=SUCCESS_STATUS)
    except Exception as e:
        logging.error(f"Error fetching participant engagement: {e}")
        return JsonResponse({"error": f"Database error: {str(e)}"}, status=SERVER_ERROR_STATUS)

@require_http_methods(["GET"])
@csrf_exempt
def get_user_stats(request):
    """UPDATED: Fetch user statistics with meeting type breakdown"""
    try:
        user_id = request.GET.get('user_id') or request.GET.get('userId')

        logging.debug(f"User stats request - user_id: {user_id}")

        if not user_id:
            logging.error("Missing user_id in stats request")
            return JsonResponse({"error": "user_id is required"}, status=BAD_REQUEST_STATUS)

        with connection.cursor() as cursor:
            # Check if user has hosted meetings with meeting type breakdown
            cursor.execute("""
                SELECT m.Meeting_Type, COUNT(*) as count
                FROM tbl_Meetings m
                WHERE m.Host_ID = %s
                GROUP BY m.Meeting_Type
            """, [user_id])
            
            hosted_meetings_by_type = {}
            total_hosted = 0
            for row in cursor.fetchall():
                mt, count = row
                hosted_meetings_by_type[mt or 'Unknown'] = int(count)
                total_hosted += int(count)

            # Check participant meetings with meeting type breakdown
            cursor.execute("""
                SELECT p.Meeting_Type, 
                       COUNT(*) as meeting_count,
                       COALESCE(SUM(p.Duration), 0) / 60 as total_minutes, 
                       AVG(COALESCE(p.Attendance_Percentage, 0)) as avg_attendance,
                       AVG(COALESCE(p.Engagement_Score, 0)) as avg_engagement
                FROM tbl_Participants p
                WHERE p.User_ID = %s AND p.Role = 'participant'
                GROUP BY p.Meeting_Type
            """, [user_id])
            
            participant_meetings_by_type = {}
            total_participant_meetings = 0
            total_minutes = 0
            weighted_attendance_sum = 0
            weighted_engagement_sum = 0
            
            for row in cursor.fetchall():
                mt, count, minutes, avg_att, avg_eng = row
                meeting_type = mt or 'Unknown'
                participant_meetings_by_type[meeting_type] = {
                    'count': int(count),
                    'total_minutes': round(float(minutes or 0), 2),
                    'avg_attendance': round(float(avg_att or 0), 2),
                    'avg_engagement': round(float(avg_eng or 0), 2)
                }
                total_participant_meetings += int(count)
                total_minutes += float(minutes or 0)
                weighted_attendance_sum += float(avg_att or 0) * int(count)
                weighted_engagement_sum += float(avg_eng or 0) * int(count)

            # Calculate weighted averages
            avg_attendance = weighted_attendance_sum / total_participant_meetings if total_participant_meetings > 0 else 0
            avg_engagement = weighted_engagement_sum / total_participant_meetings if total_participant_meetings > 0 else 0

            # Upcoming meetings
            cursor.execute("""
                SELECT COUNT(*)
                FROM tbl_Meetings m
                WHERE m.Created_At > NOW() AND m.Host_ID != %s AND m.Status = 'scheduled'
            """, [user_id])
            upcoming_count = cursor.fetchone()[0] or 0

        data = {
            "totalMeetings": int(total_participant_meetings),
            "totalHostedMeetings": int(total_hosted),
            "totalMinutes": round(float(total_minutes), 2),
            "averageAttendance": round(float(avg_attendance), 2),
            "averageEngagement": round(float(avg_engagement), 2),
            "upcomingCount": int(upcoming_count),
            "role": "host" if total_hosted > 0 else "participant",
            "meetingTypeBreakdown": {
                "hosted": hosted_meetings_by_type,
                "participated": participant_meetings_by_type
            }
        }
        logging.debug(f"User stats fetched for user_id {user_id}: {data}")
        return JsonResponse({"data": data}, status=SUCCESS_STATUS)
    except Exception as e:
        logging.error(f"Error fetching user stats: {e}")
        return JsonResponse({"error": f"Database error: {str(e)}"}, status=SERVER_ERROR_STATUS)
    
# URL patterns
urlpatterns = [
    path('api/analytics/host/overview', get_host_dashboard_overview, name='get_host_dashboard_overview'),
    path('api/analytics/host/meetings', get_host_meeting_reports, name='get_host_meeting_reports'),
    path('api/analytics/host/engagement-distribution', get_host_engagement_distribution, name='get_host_engagement_distribution'),
    path('api/analytics/host/trends', get_host_meeting_trends, name='get_host_meeting_trends'),
    path('api/analytics/participant/personal-report', get_participant_personal_report, name='get_participant_personal_report'),
    path('api/analytics/participant/attendance', get_participant_attendance, name='get_participant_attendance'),
    path('api/analytics/participant/engagement', get_participant_engagement, name='get_participant_engagement'),
    path('api/analytics/user/stats', get_user_stats, name='get_user_stats'),
]