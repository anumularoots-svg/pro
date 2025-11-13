// ENHANCED FIX: CalendarPage.jsx - Complete Duplicate Prevention Solution

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  Button,
  IconButton,
  Stack,
  useTheme,
  alpha,
  ToggleButton,
  ToggleButtonGroup,
  Dialog,
  Alert,
} from "@mui/material";
import {
  CalendarToday as CalendarIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  Today as TodayIcon,
  Add as AddIcon,
  ViewWeek as WeekIcon,
  ViewDay as DayIcon,
  ViewModule as MonthIcon,
} from "@mui/icons-material";
import {
  format,
  addMonths,
  subMonths,
  addDays,
  addWeeks,
  subWeeks,
} from "date-fns";
import DashboardLayout from "../layouts/DashboardLayout";
import CalendarMeeting from "../components/meeting/CalendarMeeting";
import MonthWeekDayView from "../components/calendar/MonthWeekDayView";
import { useCalendar } from "../hooks/useCalendar";
import { useAuth } from "../hooks/useAuth";
import BackButton from "../components/common/BackButton";
import { useNotifications } from "../hooks/useNotifications";
import { set } from "lodash";
const CalendarPage = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("month");
  const [selectedDate, setSelectedDate] = useState(null);
  const [createMeetingOpen, setCreateMeetingOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [clickedCalendarDate, setClickedCalendarDate] = useState(null);

  // CRITICAL FIX: Use ref to prevent multiple operations
  const isOperatingRef = useRef(false);
  const lastUpdateTimeRef = useRef(Date.now());
  const isUpdatingRef = useRef(false);
  // Use the useCalendar hook
  const {
    events: meetings,
    loading,
    error,
    createEvent,
    updateEvent,
    loadCalendarData,
    clearError,
  } = useCalendar();
  // const { notifications, fetchNotifications } = useNotifications();
  const { notifications, fetchCalendarNotifications } = useNotifications();
  // CRITICAL FIX: Debounced data loading to prevent multiple calls
  const debouncedLoadData = useCallback(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

    // Prevent calls that are too frequent (less than 1 second apart)
    if (timeSinceLastUpdate < 1000) {
      console.log("⚠️ Skipping load - too frequent");
      return;
    }

    lastUpdateTimeRef.current = now;

    if (!isOperatingRef.current && user?.id) {
      loadCalendarData();
    }
  }, [loadCalendarData, user?.id]);

  // CRITICAL FIX: Controlled effect with proper dependency management
  useEffect(() => {
    let mounted = true;
    let timeoutId;

    const loadData = () => {
      if (mounted && user?.id && !isOperatingRef.current) {
        // Debounce the load call
        timeoutId = setTimeout(() => {
          if (mounted) {
            debouncedLoadData();
          }
        }, 100);
      }
    };

    loadData();

    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [currentDate, view, user?.id, debouncedLoadData]);

  // Clear any errors when component mounts
  useEffect(() => {
    if (error) {
      clearError();
    }
  }, [error, clearError]);
  useEffect(() => {
    console.log("📆 Calendar Page: Fetching CALENDAR notifications only");
    fetchCalendarNotifications(); // Only calendar notifications
  }, [fetchCalendarNotifications]);
  // CRITICAL FIX: Enhanced meeting deduplication with multiple strategies
  // CRITICAL FIX: Enhanced meeting deduplication with correct field names
  const transformMeetingsForView = useMemo(() => {
    if (!meetings || !Array.isArray(meetings)) {
      console.log("No meetings array available");
      return [];
    }

    console.log("Raw meetings from useCalendar:", meetings.length);

    // Strategy 1: ID-based deduplication (FIXED: Use correct field names)
    const uniqueById = [];
    const seenIds = new Set();
    meetings.forEach((meeting) => {
      // ✅ Normalize ID safely for all backend formats
      const meetingId = String(
        meeting.ID ||
          meeting.id ||
          meeting.Meeting_ID ||
          meeting.meeting_id ||
          ""
      ).trim();

      if (!meetingId) return;

      // ✅ Avoid flicker by preferring the latest object when duplicate ID found
      if (seenIds.has(meetingId)) {
        console.log(
          "♻️ Replacing duplicate meeting ID with latest:",
          meetingId
        );
        const index = uniqueById.findIndex(
          (m) =>
            String(m.ID || m.id || m.Meeting_ID || m.meeting_id) === meetingId
        );
        if (index !== -1) uniqueById[index] = meeting; // replace instead of skip
      } else {
        seenIds.add(meetingId);
        uniqueById.push(meeting);
      }
    });
    // Strategy 2: Title+Date+Host combination deduplication (FIXED: Better key generation)
    // const uniqueByTitleDate = [];
    // const seenTitleDates = new Set();

    // uniqueById.forEach((meeting) => {
    //   // Use all possible field names for title, startTime, and host
    //   const title =
    //     meeting.title || meeting.Meeting_Name || meeting.Title || "Untitled";
    //   const startTime =
    //     meeting.start_time || meeting.startTime || meeting.Started_At;
    //   const hostId =
    //     meeting.host || meeting.Host_ID || meeting.host_id || "unknown";

    //   // Create a unique key combining all identifiers
    //   const key = `${String(title).toLowerCase()}_${String(
    //     startTime
    //   ).toLowerCase()}_${String(hostId).toLowerCase()}`;

    //   if (seenTitleDates.has(key)) {
    //     console.warn(
    //       "🔴 DUPLICATE title+date+host combo found, skipping:",
    //       key
    //     );
    //     return;
    //   }

    //   seenTitleDates.add(key);
    //   uniqueByTitleDate.push(meeting);
    // });

    // ✅ Simplified Strategy: Use unique Meeting ID only (prevents false duplicates)
    const uniqueByTitleDate = [];
    const seenTitleDates = new Set();

    uniqueById.forEach((meeting) => {
      const meetingId = String(
        meeting.ID ||
          meeting.id ||
          meeting.Meeting_ID ||
          meeting.meeting_id ||
          ""
      ).trim();

      if (!meetingId) return;

      if (seenTitleDates.has(meetingId)) {
        // Replace old entry if duplicate ID found
        const index = uniqueByTitleDate.findIndex(
          (m) =>
            String(m.ID || m.id || m.Meeting_ID || m.meeting_id).trim() ===
            meetingId
        );
        if (index !== -1) uniqueByTitleDate[index] = meeting;
      } else {
        seenTitleDates.add(meetingId);
        uniqueByTitleDate.push(meeting);
      }
    });

    console.log(
      `✅ Deduplication: ${meetings.length} → ${uniqueById.length} → ${uniqueByTitleDate.length}`
    );

    // Transform unique meetings for view
    const transformedMeetings = uniqueByTitleDate.map((meeting) => {
      // CRITICAL FIX: Handle all possible email field names
      let participantEmails =
        meeting.participantEmails ||
        meeting.guest_emails ||
        meeting.guestEmails ||
        meeting.attendee_emails ||
        meeting.attendees ||
        [];

      // Parse if it's a string
      if (typeof participantEmails === "string") {
        try {
          participantEmails = JSON.parse(participantEmails);
        } catch (e) {
          participantEmails = participantEmails.split(",").map((e) => e.trim());
        }
      }

      if (!Array.isArray(participantEmails)) {
        participantEmails = [];
      }

      return {
        id: meeting.ID || meeting.id || meeting.Meeting_ID,
        title: meeting.title || meeting.Meeting_Name || "Untitled Meeting",
        startTime: meeting.start_time || meeting.startTime,
        endTime: meeting.end_time || meeting.endTime,
        organizer:
          meeting.host || meeting.Host_ID || meeting.email || "Unknown",
        meetingUrl:
          meeting.meeting_url || meeting.meetingUrl || meeting.Meeting_Link,
        location: meeting.location || "",
        participantEmails,
        participants: Array.isArray(participantEmails)
          ? participantEmails.length
          : 0,
        color: theme.palette.primary.main,
        type: meeting.type || "calendar",
        status: meeting.status || meeting.Status || "scheduled",
        description: meeting.description || "",

        // Keep all original fields for CalendarMeeting.jsx
        ...meeting,
      };
    });

    console.log("✅ Final transformed meetings:", transformedMeetings.length);
    return transformedMeetings;
  }, [meetings, theme.palette.primary.main]);
  // Navigation handlers
  const handlePrevious = useCallback(() => {
    if (view === "month") {
      setCurrentDate(subMonths(currentDate, 1));
    } else if (view === "week") {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(addDays(currentDate, -1));
    }
  }, [currentDate, view]);

  const handleNext = useCallback(() => {
    if (view === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (view === "week") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addDays(currentDate, 1));
    }
  }, [currentDate, view]);

  const handleToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  // Handle date click with automatic date population
  const handleDateClick = useCallback((date) => {
    console.log("Calendar date clicked:", date);

    setClickedCalendarDate(date);
    setSelectedDate(date);
    setEditingMeeting(null);
    setCreateMeetingOpen(true);
  }, []);

  // Handle edit meeting
  const handleEditMeeting = useCallback((meeting) => {
    console.log("Editing meeting:", meeting);
    setEditingMeeting(meeting);
    setSelectedDate(
      meeting.start_time ? new Date(meeting.start_time) : new Date()
    );
    setSelectedMeeting(null);
    setClickedCalendarDate(null);
    setCreateMeetingOpen(true);
  }, []);

  // Handle meeting click
  const handleMeetingClick = useCallback((meeting) => {
    setSelectedMeeting(meeting);
  }, []);

  // Navigate to MeetingPage
  const handleJoinMeeting = useCallback(
    (meeting) => {
      console.log("Navigating to meeting:", meeting);

      const meetingId = meeting.meeting_id || meeting.id || meeting.Meeting_ID;

      if (!meetingId) {
        alert("Invalid meeting - no meeting ID found");
        return;
      }

      navigate(`/meeting/${meetingId}`);
    },
    [navigate]
  );

  // CRITICAL FIX: Enhanced meeting creation/update handler with operation locking
 const handleMeetingCreated = useCallback(async (meetingData) => {
  if (isOperatingRef.current) {
    console.log("⚠️ Operation already in progress, skipping...");
    return;
  }

  try {
    isOperatingRef.current = true;
    isUpdatingRef.current = true;
    console.log("Creating/updating calendar meeting with data:", meetingData);

    let result;
    if (editingMeeting) {
      const meetingId = editingMeeting.ID || editingMeeting.id || editingMeeting.meeting_id;
      
      const preservedData = {
        ...meetingData,
        start_time: meetingData.start_time || editingMeeting.start_time || editingMeeting.Started_At,
        end_time: meetingData.end_time || editingMeeting.end_time || editingMeeting.Ended_At,
      };
      
      result = await updateEvent(meetingId, preservedData);
      console.log("Meeting updated:", result);
    } else {
      result = await createEvent(meetingData);
      console.log("Meeting created:", result);
    }

    // ✅ FIX: Check if result exists and has success flag
    if (result && result.success === true) {
      console.log("✅ Operation successful, scheduling calendar refresh...");
      
      const refreshDelay = 2000;
      
      setTimeout(() => {
        loadCalendarData();
        
        if (editingMeeting) {
          const meetingId = editingMeeting.ID || editingMeeting.id || editingMeeting.meeting_id;
          const updatedMeeting = meetings && meetings.find(e => 
            String(e.ID || e.id || e.Meeting_ID || e.meeting_id).trim() === String(meetingId).trim()
          );
          
          if (updatedMeeting && (updatedMeeting.start_time || updatedMeeting.startTime)) {
            const meetingDate = new Date(updatedMeeting.start_time || updatedMeeting.startTime);
            console.log("🗓️ Auto-navigating to updated meeting date:", meetingDate);
            setCurrentDate(meetingDate);
          }
        }
        
        isUpdatingRef.current = false;
        isOperatingRef.current = false;
        
        console.log("✅ Closing modal and cleaning up state");
        setCreateMeetingOpen(false);
        setSelectedDate(null);
        setEditingMeeting(null);
        setClickedCalendarDate(null);
        
      }, refreshDelay);
      
    } else {
      // ✅ FIX: Error already shown by ErrorDialog in CalendarMeeting.jsx
      // Just log and clean up - DO NOT show browser alert
      console.error("❌ Meeting operation failed:", result?.message || result?.error);
      isUpdatingRef.current = false;
      isOperatingRef.current = false;
      
      // Note: CalendarMeeting.jsx ErrorDialog already displayed the error to user
      // We don't close the modal here so user can fix the issue and retry
    }
  } catch (error) {
    console.error("❌ Unexpected error in handleMeetingCreated:", error);
    isUpdatingRef.current = false;
    isOperatingRef.current = false;
    
    // Note: CalendarMeeting.jsx should have caught this, but if not:
    console.error("This error should have been caught by CalendarMeeting.jsx");
  }
}, [editingMeeting, createEvent, updateEvent, loadCalendarData, meetings]);
  // Handle "New Meeting" button click
  const handleNewMeetingClick = useCallback(() => {
    console.log("New Meeting button clicked");
    setSelectedDate(null);
    setEditingMeeting(null);
    setClickedCalendarDate(null);
    setCreateMeetingOpen(true);
  }, []);

  // Handle modal close with proper cleanup
  const handleModalClose = useCallback(() => {
    console.log("🛑 Modal close requested");
    
    setCreateMeetingOpen(false);
    setSelectedDate(null);
    setEditingMeeting(null);
    setClickedCalendarDate(null);
  }, []);
  
  // Get proper view title for all modes
  const getViewTitle = useCallback(() => {
    switch (view) {
      case "month":
        return format(currentDate, "MMMM yyyy");
      case "week":
        const weekStart = new Date(currentDate);
        weekStart.setDate(currentDate.getDate() - currentDate.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return `${format(weekStart, "MMM dd")} - ${format(
          weekEnd,
          "MMM dd, yyyy"
        )}`;
      case "day":
        return format(currentDate, "EEEE, MMMM dd, yyyy");
      default:
        return "";
    }
  }, [view, currentDate]);

  return (
    <DashboardLayout>
      <Box
        sx={{
          flexGrow: 1,
          background: `linear-gradient(135deg, ${alpha(
            theme.palette.background.default,
            0.9
          )} 0%, ${alpha(theme.palette.primary.main, 0.02)} 100%)`,
          minHeight: "100vh",
          pt: 2,
        }}
      >
        <Container maxWidth="xl" sx={{ py: 3 }}>
          {/* Header */}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            mb={4}
          >
            <Stack direction="row" alignItems="center" spacing={2}>
              <CalendarIcon
                sx={{ fontSize: 32, color: theme.palette.primary.main }}
              />
              <Typography variant="h4" fontWeight={700} color="text.primary">
                Calendar
              </Typography>
              <BackButton />

              {loading && (
                <Typography variant="body2" color="text.secondary">
                  Loading...
                </Typography>
              )}
            </Stack>

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleNewMeetingClick}
              disabled={isOperatingRef.current || loading}
              sx={{
                borderRadius: 2,
                textTransform: "none",
                px: 3,
                py: 1.5,
                fontWeight: 600,
              }}
            >
              New Meeting
            </Button>
          </Stack>

          {/* Show error if any */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Error: {error}
            </Alert>
          )}

          {/* DEBUG: Show meeting count in development */}
          {process.env.NODE_ENV === "development" && (
            <Alert severity="info" sx={{ mb: 2 }}>
              DEBUG: Raw meetings: {meetings?.length || 0}, Transformed:{" "}
              {transformMeetingsForView.length}, Duplicates filtered
            </Alert>
          )}

          {/* Calendar Controls */}
          <Stack
            direction={{ xs: "column", md: "row" }}
            alignItems={{ xs: "stretch", md: "center" }}
            justifyContent="space-between"
            spacing={2}
            mb={3}
          >
            {/* Navigation */}
            <Stack direction="row" alignItems="center" spacing={2}>
              <IconButton
                onClick={handlePrevious}
                disabled={loading || isOperatingRef.current}
              >
                <PrevIcon />
              </IconButton>

              <Typography
                variant="h6"
                fontWeight={600}
                sx={{ minWidth: 200, textAlign: "center" }}
              >
                {getViewTitle()}
              </Typography>

              <IconButton
                onClick={handleNext}
                disabled={loading || isOperatingRef.current}
              >
                <NextIcon />
              </IconButton>

              <Button
                variant="outlined"
                size="small"
                startIcon={<TodayIcon />}
                onClick={handleToday}
                disabled={loading || isOperatingRef.current}
                sx={{ ml: 2, textTransform: "none" }}
              >
                Today
              </Button>
            </Stack>

            {/* View Toggle */}
            <ToggleButtonGroup
              value={view}
              exclusive
              onChange={(event, newView) => {
                if (newView !== null && !loading && !isOperatingRef.current) {
                  setView(newView);
                }
              }}
              size="small"
              disabled={loading || isOperatingRef.current}
            >
              <ToggleButton value="month">
                <MonthIcon sx={{ mr: 1 }} />
                Month
              </ToggleButton>
              <ToggleButton value="week">
                <WeekIcon sx={{ mr: 1 }} />
                Week
              </ToggleButton>
              <ToggleButton value="day">
                <DayIcon sx={{ mr: 1 }} />
                Day
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {/* Calendar View with deduplication */}
          <Box>
            <MonthWeekDayView
              viewMode={view}
              currentDate={currentDate}
              meetings={transformMeetingsForView} // This now includes comprehensive deduplication
              onDateClick={handleDateClick}
              onMeetingClick={handleMeetingClick}
            />
          </Box>

          {/* Meeting Details Dialog - Show selected meeting */}
          {/* // ✅ FIXED: CalendarPage.jsx - Lines 491-539
// Meeting Details Dialog - Show selected meeting */}

          {selectedMeeting && (
            <Dialog
              open={Boolean(selectedMeeting)}
              onClose={() => setSelectedMeeting(null)}
              maxWidth="sm"
              fullWidth
            >
              <Box sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  {selectedMeeting.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {selectedMeeting.startTime
                    ? format(
                        new Date(selectedMeeting.startTime),
                        "EEEE, MMMM dd, yyyy HH:mm"
                      )
                    : "Time TBD"}
                </Typography>
                {selectedMeeting.participants > 0 && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    {selectedMeeting.participants} participant(s)
                  </Typography>
                )}
                <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                  <Button
                    variant="contained"
                    onClick={() => {
                      if (selectedMeeting.id) {
                        handleJoinMeeting(selectedMeeting);
                      }
                      setSelectedMeeting(null);
                    }}
                    disabled={!selectedMeeting.id}
                  >
                    Join Meeting
                  </Button>

                  {/* ✅ FIX #1: Fixed Edit Button */}
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => {
                      console.log(
                        "📝 Opening edit dialog for meeting:",
                        selectedMeeting
                      );
                      handleEditMeeting(selectedMeeting);
                      setSelectedMeeting(null); // ✅ CLOSE DETAILS DIALOG FIRST
                    }}
                    sx={{
                      background: "linear-gradient(45deg, #4689e6ff 30%,)",
                      fontWeight: 600,
                    }}
                  >
                    Edit
                  </Button>

                  <Button onClick={() => setSelectedMeeting(null)}>
                    Close
                  </Button>
                </Stack>
              </Box>
            </Dialog>
          )}
          {/* Create/Edit Meeting Dialog */}
          <Dialog
            open={createMeetingOpen}
            onClose={handleModalClose}
            maxWidth="md"
            fullWidth
          >
            <CalendarMeeting
              selectedDate={selectedDate}
              clickedCalendarDate={clickedCalendarDate}
              existingMeeting={editingMeeting}
              isEditing={Boolean(editingMeeting)}
              onClose={handleModalClose}
              onSave={handleMeetingCreated}
            />
          </Dialog>
        </Container>
      </Box>
    </DashboardLayout>
  );
};
export default CalendarPage;