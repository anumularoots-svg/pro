// CRITICAL FIX: CalendarMeeting.jsx - Corrected Data Source Issue

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Grid,
  Paper,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Avatar,
  CircularProgress,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  Chip,
  Divider,
  Stack,
  useTheme,
  alpha,
  FormHelperText,
} from "@mui/material";
import {
  CalendarToday,
  Edit,
  Delete,
  VideoCall,
  ExpandMore,
  ArrowBack,
  ArrowForward,
  GroupAdd,
  CheckCircle,
  Warning,
  Info,
  Group,
  Schedule,
  Person,
  AccessTime,
  Event,
  EventAvailable,
} from "@mui/icons-material";
import { styled } from "@mui/material/styles";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { format, parseISO, isValid } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useCalendar } from "../../hooks/useCalendar";
import BulkInvite from "../invitations/BulkInvite";

const StyledContainer = styled(Box)(({ theme }) => ({
  minHeight: "100vh",
  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  padding: theme.spacing(2),
}));

const CalendarCard = styled(Card)(({ theme }) => ({
  maxWidth: 1200,
  margin: "0 auto",
  borderRadius: theme.spacing(3),
  boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
  background: "rgba(255,255,255,0.95)",
  backdropFilter: "blur(10px)",
}));

function CalendarMeeting({
  selectedDate,
  clickedCalendarDate,
  existingMeeting = null,
  isEditing = false,
  onClose,
  onSave,
}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { createEvent, updateEvent, loading, error, clearError, events } =
    useCalendar();

  const [currentTab, setCurrentTab] = useState(isEditing ? 1 : 0);
  const [bulkInviteOpen, setBulkInviteOpen] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Enhanced loading and progress states
  const [isCreating, setIsCreating] = useState(false);
  const [creationProgress, setCreationProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [participantStats, setParticipantStats] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  // FIXED: Initial form state with better defaults
  const getInitialFormState = () => ({
    selectedDate: new Date(),
    meetingTitle: "",
    meetingDuration: 60,
    startTime: "09:00",
    endTime: "10:00",
    participants: [],
    participantEmail: "",
    location: "",
    timeZone: "Asia/Kolkata",
    meetingSettings: {
      createCalendarEvent: true,
      sendInvitations: true,
      setReminders: true,
      addMeetingLink: true,
    },
    calendarSettings: {
      addToHostCalendar: true,
      addToParticipantCalendars: true,
      reminderTimes: [15, 30],
    },
  });

  const [formData, setFormData] = useState(getInitialFormState);

  const tabLabels = useMemo(() => {
    return isEditing
      ? ["Meeting Details", "Select Time", "Review & Update"]
      : ["Select Time", "Meeting Details", "Review & Create"];
  }, [isEditing]);

  const durationOptions = useMemo(
    () => [
      { value: 15, label: "15 minutes" },
      { value: 30, label: "30 minutes" },
      { value: 45, label: "45 minutes" },
      { value: 60, label: "1 hour" },
      { value: 90, label: "1.5 hours" },
      { value: 120, label: "2 hours" },
    ],
    []
  );

  // ENHANCED: Utility function to safely parse dates with multiple formats
  const safeParseDateString = (dateString) => {
    if (!dateString) return null;

    try {
      // Handle different date formats
      let parsed;

      // ISO string format
      if (typeof dateString === "string" && dateString.includes("T")) {
        parsed = parseISO(dateString);
        if (isValid(parsed)) return parsed;
      }

      // Regular Date constructor
      parsed = new Date(dateString);
      if (isValid(parsed)) return parsed;

      return null;
    } catch (error) {
      console.error("Error parsing date:", dateString, error);
      return null;
    }
  };

  // CRITICAL FIX: Get the correct meeting data from the events array
  const getCorrectMeetingData = useCallback(() => {
    if (!isEditing || !existingMeeting) return null;

    const meetingId =
      existingMeeting.id ||
      existingMeeting.ID ||
      existingMeeting.meeting_id ||
      existingMeeting.Meeting_ID;

    if (!meetingId) {
      console.log("⚠️ No meeting ID found");
      return existingMeeting;
    }

    console.log("🔍 Looking for meeting:", meetingId);

    if (events && Array.isArray(events) && events.length > 0) {
      const correctMeeting = events.find((event) => {
        const eventId = String(
          event.id || event.ID || event.meeting_id || event.Meeting_ID
        ).trim();
        const targetId = String(meetingId).trim();
        return eventId === targetId;
      });

      if (correctMeeting) {
        console.log("✅ Found in events array:", correctMeeting);
        return correctMeeting;
      }
    }

    if (
      existingMeeting &&
      (existingMeeting.title ||
        existingMeeting.Meeting_Name ||
        existingMeeting.start_time ||
        existingMeeting.Started_At)
    ) {
      console.log(
        "✅ Using existingMeeting prop (fresh from parent):",
        existingMeeting
      );
      return existingMeeting;
    }

    console.log("⚠️ Using fallback existingMeeting:", existingMeeting);
    return existingMeeting;
  }, [isEditing, existingMeeting, events]);

  // CRITICAL FIX: Enhanced email parsing function that handles all backend formats
  const parseEmailList = (emailData) => {
    if (!emailData) return [];

    try {
      console.log("🔍 DEBUG: Parsing email data:", {
        emailData,
        type: typeof emailData,
        isArray: Array.isArray(emailData),
        length: emailData?.length,
      });

      // If it's already an array
      if (Array.isArray(emailData)) {
        const validEmails = emailData
          .filter((email) => {
            if (
              typeof email === "string" &&
              email.trim() &&
              email.includes("@")
            ) {
              return true;
            }
            if (
              typeof email === "object" &&
              email?.email &&
              email.email.includes("@")
            ) {
              return true;
            }
            return false;
          })
          .map((email) => {
            if (typeof email === "string") return email.trim();
            if (typeof email === "object" && email.email)
              return email.email.trim();
            return null;
          })
          .filter(Boolean);

        console.log("📧 Parsed emails from array:", validEmails);
        return validEmails;
      }

      // If it's a string (most common from backend)
      if (typeof emailData === "string" && emailData.trim()) {
        // First try to parse as JSON (in case it's a JSON string)
        try {
          const parsed = JSON.parse(emailData);
          if (Array.isArray(parsed)) {
            const validEmails = parsed.filter(
              (email) =>
                email &&
                typeof email === "string" &&
                email.trim() &&
                email.includes("@")
            );
            console.log("📧 Parsed emails from JSON string:", validEmails);
            return validEmails;
          }
        } catch (jsonError) {
          // Not JSON, treat as comma/semicolon separated string
          const emails = emailData
            .split(/[,;]/) // Split by comma or semicolon
            .map((email) => email.trim())
            .filter((email) => email && email.includes("@"));

          console.log("📧 Parsed emails from delimited string:", emails);
          return emails;
        }
      }

      // CRITICAL: Handle number type (which we see in your logs)
      if (typeof emailData === "number") {
        console.log(
          "⚠️ DEBUG: Email data is a number, cannot extract emails:",
          emailData
        );
        return [];
      }

      console.log("📧 No valid emails found");
      return [];
    } catch (error) {
      console.error("❌ Error parsing email list:", emailData, error);
      return [];
    }
  };

  // ENHANCED: Calculate duration from start and end times
  const calculateDuration = (startTime, endTime) => {
    if (!startTime || !endTime) return 60;

    try {
      const start = safeParseDateString(startTime);
      const end = safeParseDateString(endTime);

      if (start && end) {
        return Math.max(15, Math.round((end - start) / (1000 * 60))); // Minimum 15 minutes
      }

      return 60; // Default
    } catch (error) {
      console.error("Error calculating duration:", error);
      return 60;
    }
  };

  // CRITICAL FIX: Enhanced data population effect for editing with comprehensive email handling
  useEffect(() => {
    if (isEditing && existingMeeting && !dataLoaded) {
      console.log(
        "🔧 DEBUG: Populating form with existing meeting data:",
        existingMeeting
      );

      try {
        // CRITICAL FIX: Get the correct meeting data
        const correctMeeting = getCorrectMeetingData();
        const meetingToUse = correctMeeting || existingMeeting;

        console.log(
          "🔧 DEBUG: Using meeting data for population:",
          meetingToUse
        );

        // Parse dates
        const startTime = safeParseDateString(
          meetingToUse.startTime ||
            meetingToUse.Started_At ||
            meetingToUse.start_time
        );
        const endTime = safeParseDateString(
          meetingToUse.endTime || meetingToUse.Ended_At || meetingToUse.end_time
        );

        console.log(
          "📅 DEBUG: Parsed dates - Start:",
          startTime,
          "End:",
          endTime
        );

        // Calculate duration
        const duration =
          meetingToUse.duration ||
          meetingToUse.meetingDuration ||
          meetingToUse.Duration_Minutes ||
          calculateDuration(startTime, endTime) ||
          60;

        // CRITICAL FIX: Comprehensive email extraction with all possible sources
        let emailList = [];

        // CRITICAL FIX: Use the correct meeting data for email extraction
        const emailSources = [
          { key: "participantEmails", value: meetingToUse.participantEmails }, // ✅ add this first
          { key: "attendees", value: meetingToUse.attendees },
          { key: "guest_emails", value: meetingToUse.guest_emails },
          { key: "participants", value: meetingToUse.participants },
          { key: "guestEmails", value: meetingToUse.guestEmails },
          { key: "attendee_emails", value: meetingToUse.attendee_emails },
          { key: "Participants", value: meetingToUse.Participants },
          { key: "guestEmailsRaw", value: meetingToUse.guestEmailsRaw },
          { key: "attendeesRaw", value: meetingToUse.attendeesRaw },
        ];

        console.log(
          "🔍 DEBUG: All available email sources from correct meeting:"
        );
        emailSources.forEach((source) => {
          console.log(
            `  ${source.key}:`,
            source.value,
            `(type: ${typeof source.value})`
          );
        });

        // Try each source until we find valid emails
        for (const source of emailSources) {
          if (source.value !== undefined && source.value !== null) {
            console.log(
              `🔍 DEBUG: Trying source "${source.key}":`,
              source.value
            );

            const parsedEmails = parseEmailList(source.value);
            if (parsedEmails && parsedEmails.length > 0) {
              emailList = parsedEmails;
              console.log(
                `✅ SUCCESS: Found ${parsedEmails.length} emails from "${source.key}":`,
                parsedEmails
              );
              break;
            }
          }
        }

        // If no emails found from structured sources, try to find any email-like strings in the object
        if (emailList.length === 0) {
          console.log(
            "⚠️ DEBUG: No emails found in structured fields, scanning entire object..."
          );

          const objectStr = JSON.stringify(meetingToUse);
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const foundEmails = objectStr.match(emailRegex);

          if (foundEmails) {
            emailList = [...new Set(foundEmails)]; // Remove duplicates
            console.log(`✅ SUCCESS: Found emails via regex scan:`, emailList);
          }
        }

        // Convert emails to participant objects
        const participants = emailList.map((email, index) => ({
          id: Date.now() + index + Math.random(), // Ensure unique IDs
          email: email.trim(),
          name: email.split("@")[0],
        }));

        console.log("👥 DEBUG: Final participants created:", participants);
        console.log("📊 DEBUG: Participant count:", participants.length);

        // ENHANCED: Extract settings with proper fallbacks
        const meetingSettings = {
          createCalendarEvent:
            meetingToUse.Settings_CreateCalendarEvent ??
            meetingToUse.Settings?.createCalendarEvent ??
            true,
          sendInvitations:
            meetingToUse.Settings_SendInvitations ??
            meetingToUse.Settings?.sendInvitations ??
            true,
          setReminders:
            meetingToUse.Settings_SetReminders ??
            meetingToUse.Settings?.setReminders ??
            true,
          addMeetingLink:
            meetingToUse.Settings_AddMeetingLink ??
            meetingToUse.Settings?.addMeetingLink ??
            true,
        };

        // Parse reminder minutes with multiple fallbacks
        let reminderTimes = [15, 30]; // Default
        const reminderSources = [
          meetingToUse.reminderMinutes,
          meetingToUse.ReminderMinutes,
          meetingToUse.CalendarSettings?.reminderTimes,
          meetingToUse.calendarSettings?.reminderTimes,
        ];

        for (const source of reminderSources) {
          if (source) {
            try {
              if (Array.isArray(source)) {
                reminderTimes = source;
                break;
              } else if (typeof source === "string") {
                const parsed = JSON.parse(source);
                if (Array.isArray(parsed)) {
                  reminderTimes = parsed;
                  break;
                }
              } else if (typeof source === "number") {
                reminderTimes = [source];
                break;
              }
            } catch (error) {
              console.warn("Error parsing reminder source:", source, error);
            }
          }
        }

        const calendarSettings = {
          addToHostCalendar:
            meetingToUse.Settings_AddToHostCalendar ??
            meetingToUse.CalendarSettings?.addToHostCalendar ??
            true,
          addToParticipantCalendars:
            meetingToUse.Settings_AddToParticipantCalendars ??
            meetingToUse.CalendarSettings?.addToParticipantCalendars ??
            true,
          reminderTimes: reminderTimes,
        };

        // ENHANCED: Comprehensive form data population
        const populatedData = {
          selectedDate: startTime || new Date(),
          meetingTitle:
            meetingToUse.title ||
            meetingToUse.Meeting_Name ||
            meetingToUse.meetingTitle ||
            "",
          meetingDuration: duration,
          startTime: startTime ? format(startTime, "HH:mm") : "09:00",
          endTime: endTime ? format(endTime, "HH:mm") : "10:00",
          participants: participants, // This is the critical fix!
          participantEmail: "",
          location: meetingToUse.location || meetingToUse.Location || "",
          timeZone:
            meetingToUse.timezone || meetingToUse.timeZone || "Asia/Kolkata",
          meetingSettings: meetingSettings,
          calendarSettings: calendarSettings,
        };

        console.log("📝 DEBUG: Final populated form data:", populatedData);
        console.log(
          "📊 DEBUG: Final participant count in form:",
          populatedData.participants.length
        );

        setFormData(populatedData);
        setDataLoaded(true);

        // Additional debug info
        if (process.env.NODE_ENV === "development") {
          console.log("🐛 DEVELOPMENT DEBUG INFO:");
          console.log("Original meeting object:", existingMeeting);
          console.log("Correct meeting object:", correctMeeting);
          console.log("Meeting used for population:", meetingToUse);
          console.log("Extracted email list:", emailList);
          console.log("Created participants:", participants);
          console.log("Form data set:", populatedData);
        }
      } catch (error) {
        console.error("❌ Error populating form data:", error);
        console.error("❌ Error details:", {
          error: error.message,
          stack: error.stack,
          meetingData: existingMeeting,
        });

        // Fallback with minimal data but still try to get participants
        let fallbackParticipants = [];
        try {
          // Last resort: try to find any emails anywhere in the meeting object
          const meetingStr = JSON.stringify(existingMeeting);
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const foundEmails = meetingStr.match(emailRegex);
          if (foundEmails) {
            fallbackParticipants = [...new Set(foundEmails)].map(
              (email, index) => ({
                id: Date.now() + index,
                email: email,
                name: email.split("@")[0],
              })
            );
            console.log(
              "🔧 Fallback: Found participants via regex:",
              fallbackParticipants
            );
          }
        } catch (fallbackError) {
          console.error(
            "❌ Even fallback email extraction failed:",
            fallbackError
          );
        }

        const fallbackData = {
          ...getInitialFormState(),
          meetingTitle:
            existingMeeting.title ||
            existingMeeting.Meeting_Name ||
            "Untitled Meeting",
          location: existingMeeting.location || "",
          meetingDuration: existingMeeting.duration || 60,
          participants: fallbackParticipants, // Include any emails we found
        };

        setFormData(fallbackData);
        setDataLoaded(true);
      }
    }
  }, [isEditing, existingMeeting, dataLoaded, getCorrectMeetingData]);

  // Handle clicked calendar date population (for new meetings)
  useEffect(() => {
    if (!isEditing && clickedCalendarDate && !dataLoaded) {
      console.log("📅 Setting clicked calendar date:", clickedCalendarDate);

      const dateToSet = new Date(clickedCalendarDate);
      setFormData((prev) => ({
        ...prev,
        selectedDate: dateToSet,
      }));
      setDataLoaded(true);
    } else if (!isEditing && !clickedCalendarDate && !dataLoaded) {
      // For manual "New Meeting" clicks, just mark as loaded
      setDataLoaded(true);
    }
  }, [clickedCalendarDate, isEditing, dataLoaded]);

  // Calculate end time when start time or duration changes
  useEffect(() => {
    if (formData.startTime && formData.meetingDuration) {
      try {
        const [hours, minutes] = formData.startTime.split(":");
        const startDate = new Date();
        startDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        const endDate = new Date(
          startDate.getTime() + formData.meetingDuration * 60000
        );
        const endTime = format(endDate, "HH:mm");

        setFormData((prev) => ({
          ...prev,
          endTime: endTime,
        }));
      } catch (error) {
        console.error("Error calculating end time:", error);
      }
    }
  }, [formData.startTime, formData.meetingDuration]);

  // Form validation
  const validateForm = useCallback(() => {
    const errors = {};

    if (!formData.selectedDate) {
      errors.selectedDate = "Please select a date";
    }

    if (!formData.startTime) {
      errors.startTime = "Please select a start time";
    }

    if (!formData.meetingTitle || formData.meetingTitle.trim() === "") {
      errors.meetingTitle = "Meeting title is required";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData.selectedDate, formData.startTime, formData.meetingTitle]);

  // Add participant - Enhanced to handle multiple comma-separated emails
  const addParticipant = useCallback(() => {
    if (!formData.participantEmail) {
      return;
    }

    // Parse comma-separated emails
    const emailList = formData.participantEmail
      .split(",")
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    if (emailList.length === 0) {
      return;
    }

    // Validate each email
    const invalidEmails = emailList.filter((email) => !isValidEmail(email));
    if (invalidEmails.length > 0) {
      console.warn("Invalid email addresses:", invalidEmails.join(", "));
      return;
    }

    // Check for existing emails
    const existingEmails = emailList.filter((email) =>
      formData.participants.some(
        (p) => p.email.toLowerCase() === email.toLowerCase()
      )
    );

    if (existingEmails.length > 0) {
      console.warn(
        "These emails are already in the participant list:",
        existingEmails.join(", ")
      );
      return;
    }

    // Create new participants for all valid emails
    const newParticipants = emailList.map((email, index) => ({
      id: Date.now() + index + Math.random(), // Ensure unique IDs
      email: email,
      name: email.split("@")[0],
    }));

    // Add all participants at once
    setFormData((prev) => ({
      ...prev,
      participants: [...prev.participants, ...newParticipants],
      participantEmail: "",
    }));
  }, [formData.participantEmail, formData.participants]);

  // Remove participant
  const removeParticipant = useCallback((id) => {
    setFormData((prev) => ({
      ...prev,
      participants: prev.participants.filter((p) => p.id !== id),
    }));
  }, []);

  // Email validation
  const isValidEmail = useCallback((email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }, []);

  // Bulk invite handler
  const handleBulkInvitesSent = useCallback((bulkEmails) => {
    const newParticipants = bulkEmails.map((email, index) => ({
      id: Date.now() + index + Math.random(),
      email: email,
      name: email.split("@")[0],
    }));

    setFormData((prev) => {
      const existingEmails = new Set(
        prev.participants.map((p) => p.email.toLowerCase())
      );
      const uniqueNewParticipants = newParticipants.filter(
        (p) => !existingEmails.has(p.email.toLowerCase())
      );

      return {
        ...prev,
        participants: [...prev.participants, ...uniqueNewParticipants],
      };
    });

    setBulkInviteOpen(false);
  }, []);

  // Handle form submission with progress tracking
  const handleCreateMeeting = useCallback(async () => {
    if (isCreating) {
      console.log("Meeting creation/update already in progress...");
      return;
    }
    if (!validateForm()) {
      setCurrentTab(0);
      return;
    }

    setIsCreating(true);
    setCreationProgress(0);
    setProgressMessage("Preparing meeting data...");
    setParticipantStats(null);

    try {
      const participantEmails = formData.participants.map((p) => p.email);

      const selectedDate = new Date(formData.selectedDate);
      const [startHours, startMinutes] = formData.startTime.split(":");
      const [endHours, endMinutes] = formData.endTime.split(":");

      const userSelectedStart = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        parseInt(startHours),
        parseInt(startMinutes),
        0,
        0
      );

      const userSelectedEnd = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        parseInt(endHours),
        parseInt(endMinutes),
        0,
        0
      );

      // ✅ KEY FIX: Only convert times for NEW meetings
      let istStartString, istEndString;

      if (isEditing && existingMeeting) {
        // 📝 EDIT MODE: Use original times (no conversion)
        console.log("📝 EDIT MODE: Using original meeting times");
        istStartString =
          existingMeeting.start_time ||
          existingMeeting.startTime ||
          existingMeeting.Started_At;
        istEndString =
          existingMeeting.end_time ||
          existingMeeting.endTime ||
          existingMeeting.Ended_At;
        console.log("  Using original:", { istStartString, istEndString });
      } else {
        // ✨ CREATE MODE: Convert local times to ISO
        console.log("✨ CREATE MODE: Converting local times to ISO");
        istStartString = userSelectedStart.toISOString();
        istEndString = userSelectedEnd.toISOString();
        console.log("  Converted to ISO:", { istStartString, istEndString });
      }

      const meetingData = {
        title: formData.meetingTitle,
        Meeting_Name: formData.meetingTitle,
        Meeting_Type: "CalendarMeeting",

        // ✅ TIME FIELDS - Using corrected start/end times
        start_time: istStartString, // ✅ Uses original OR converted correctly
        end_time: istEndString, // ✅ Uses original OR converted correctly
        startTime: istStartString, // Alternative field
        endTime: istEndString, // Alternative field
        Started_At: istStartString, // Alternative field
        Ended_At: istEndString, // Alternative field

        duration_minutes: formData.meetingDuration,
        location: formData.location,

        // Participant fields (all variations)
        guestEmails: participantEmails,
        attendees: participantEmails,
        participantEmails: participantEmails,
        guest_emails: participantEmails,

        Participants: formData.participants.map((p) => ({
          email: p.email,
          name: p.name || p.email.split("@")[0],
        })),

        provider: "internal",

        Settings: {
          createCalendarEvent: formData.meetingSettings.createCalendarEvent,
          sendInvitations: formData.meetingSettings.sendInvitations,
          setReminders: formData.meetingSettings.setReminders,
          addMeetingLink: formData.meetingSettings.addMeetingLink,
          recording: true,
        },

        CalendarSettings: {
          addToHostCalendar: formData.calendarSettings.addToHostCalendar,
          addToParticipantCalendars:
            formData.calendarSettings.addToParticipantCalendars,
          reminderTimes: formData.calendarSettings.reminderTimes,
        },

        Status: "scheduled",
        Is_Recording_Enabled: true,
        Waiting_Room_Enabled: false,
        ReminderMinutes: formData.calendarSettings.reminderTimes,
        reminderMinutes: formData.calendarSettings.reminderTimes,
      };

      console.log("📤 Meeting data prepared:", meetingData);
      console.log("   start_time:", meetingData.start_time);
      console.log("   end_time:", meetingData.end_time);

      let result;

      if (isEditing && existingMeeting) {
        const meetingId =
          existingMeeting.ID ||
          existingMeeting.id ||
          existingMeeting.meeting_id;

        if (!meetingId) {
          throw new Error("No meeting ID found for update");
        }

        // ✅ FIX: Preserve original times if not changed
        const updateData = {
          ...meetingData,
          start_time:
            meetingData.start_time ||
            existingMeeting.start_time ||
            existingMeeting.startTime,
          end_time:
            meetingData.end_time ||
            existingMeeting.end_time ||
            existingMeeting.endTime,
          id: meetingId,
          meeting_id: meetingId,
          Meeting_ID: meetingId,
        };

        console.log(
          "🔄 Updating meeting with participants:",
          participantEmails
        );
        console.log("   Original times:", {
          original_start: existingMeeting.start_time,
          original_end: existingMeeting.end_time,
          sending_start: updateData.start_time,
          sending_end: updateData.end_time,
        });
        result = await updateEvent(meetingId, updateData);
      } else {
        console.log(
          "🆕 Creating new meeting with participants:",
          participantEmails
        );
        result = { success: true, event: meetingData };
      }

      if (result.success) {
        if (result.participantSummary) {
          setParticipantStats(result.participantSummary);
        }

        setCreationProgress(100);
        setProgressMessage("Meeting processed successfully!");

        console.log("✅ Meeting processing complete");

        setTimeout(() => {
          if (onSave) {
            console.log("📞 Calling onSave callback");
            onSave(result.event || meetingData);
          }

          if (onClose) {
            console.log("🛑 Calling onClose");
            onClose();
          } else {
            console.log("🗺️ Navigating to dashboard");
            navigate("/dashboard", {
              state: {
                message: isEditing
                  ? "Meeting updated successfully!"
                  : "Calendar meeting created successfully!",
                meetingLink: result.meetingLink,
                participantSummary: result.participantSummary,
                calendarIntegration: result.calendarIntegration,
              },
            });
          }
        }, 2000);
      } else {
        throw new Error(result.message || "Failed to process meeting");
      }
    } catch (error) {
      console.error("❌ Failed to process calendar meeting:", error);
      console.error("   Error details:", {
        message: error.message,
        stack: error.stack,
      });
      setCreationProgress(0);
      setProgressMessage("");
    } finally {
      if (creationProgress !== 100) {
        setIsCreating(false);
      }
    }
  }, [
    formData,
    validateForm,
    isEditing,
    existingMeeting,
    createEvent,
    updateEvent,
    onSave,
    onClose,
    navigate,
    creationProgress,
  ]);

  // Update form data handlers
  const updateFormData = useCallback((updates) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateMeetingSettings = useCallback((settingUpdates) => {
    setFormData((prev) => ({
      ...prev,
      meetingSettings: {
        ...prev.meetingSettings,
        ...settingUpdates,
      },
    }));
  }, []);

  const updateCalendarSettings = useCallback((settingUpdates) => {
    setFormData((prev) => ({
      ...prev,
      calendarSettings: {
        ...prev.calendarSettings,
        ...settingUpdates,
      },
    }));
  }, []);

  const clearValidationError = useCallback((fieldName) => {
    setValidationErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[fieldName];
      return newErrors;
    });
  }, []);

  // Enhanced select time rendering
  const renderSelectTime = () => (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
        <Box
          sx={{
            bgcolor: "primary.main",
            color: "white",
            borderRadius: "50%",
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1rem",
            fontWeight: "bold",
          }}
        >
          {isEditing ? "2" : "1"}
        </Box>
        <Typography variant="h5" fontWeight={600}>
          Date & Time
        </Typography>
      </Box>

      {/* Enhanced debug info in development */}
      {process.env.NODE_ENV === "development" && isEditing && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="caption">
            DEBUG INFO:
            <br />- Data loaded: {dataLoaded ? "Yes" : "No"}
            <br />- Start time: {formData.startTime}
            <br />- Duration: {formData.meetingDuration}
            <br />- Selected date: {formData.selectedDate?.toLocaleDateString()}
            <br />- Participants: {formData.participants.length}
            <br />- Participant emails:{" "}
            {formData.participants.map((p) => p.email).join(", ")}
            <br />- Original meeting ID:{" "}
            {existingMeeting?.ID || existingMeeting?.id}
          </Typography>
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Left Panel - Date & Duration Selection */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              p: 3,
              height: "fit-content",
              bgcolor: "#f8f9fa",
              border: "1px solid #e9ecef",
              borderRadius: 2,
            }}
          >
            <Typography
              variant="h6"
              gutterBottom
              sx={{ fontWeight: 600, mb: 3, color: "#2c3e50" }}
            >
              When is your meeting?
            </Typography>

            {/* Meeting Date */}
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                gutterBottom
                sx={{ fontWeight: 500 }}
              >
                Meeting Date *
              </Typography>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  value={formData.selectedDate}
                  onChange={(newDate) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    if (newDate && newDate >= today) {
                      updateFormData({ selectedDate: newDate });
                      clearValidationError("selectedDate");
                    }
                  }}
                  minDate={new Date()}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      fullWidth
                      placeholder="Select date"
                      error={!!validationErrors.selectedDate}
                      helperText={validationErrors.selectedDate}
                      sx={{
                        "& .MuiInputBase-root": {
                          bgcolor: "white",
                          borderRadius: 1,
                          fontSize: "1rem",
                        },
                      }}
                    />
                  )}
                />
              </LocalizationProvider>
            </Box>

            {/* Start Time */}
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                gutterBottom
                sx={{ fontWeight: 500 }}
              >
                Start Time *
              </Typography>
              <TextField
                fullWidth
                type="time"
                value={formData.startTime}
                onChange={(e) => {
                  updateFormData({ startTime: e.target.value });
                  clearValidationError("startTime");
                }}
                error={!!validationErrors.startTime}
                helperText={validationErrors.startTime}
                sx={{
                  "& .MuiInputBase-root": {
                    bgcolor: "white",
                    borderRadius: 1,
                    fontSize: "1rem",
                  },
                }}
              />
            </Box>

            {/* Duration */}
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                gutterBottom
                sx={{ fontWeight: 500 }}
              >
                Duration
              </Typography>
              <FormControl fullWidth>
                <Select
                  value={formData.meetingDuration}
                  onChange={(e) =>
                    updateFormData({ meetingDuration: e.target.value })
                  }
                  displayEmpty
                  sx={{
                    bgcolor: "white",
                    borderRadius: 1,
                    fontSize: "1rem",
                  }}
                >
                  {durationOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* Timezone */}
            <Box>
              <Typography
                variant="body2"
                color="text.secondary"
                gutterBottom
                sx={{ fontWeight: 500 }}
              >
                Timezone
              </Typography>
              <FormControl fullWidth>
                <Select
                  value={formData.timeZone}
                  onChange={(e) => updateFormData({ timeZone: e.target.value })}
                  displayEmpty
                  sx={{
                    bgcolor: "white",
                    borderRadius: 1,
                    fontSize: "1rem",
                  }}
                >
                  <MenuItem value="Asia/Kolkata">Asia/Kolkata</MenuItem>
                  <MenuItem value="America/New_York">America/New_York</MenuItem>
                  <MenuItem value="Europe/London">Europe/London</MenuItem>
                  <MenuItem value="Asia/Tokyo">Asia/Tokyo</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Card>
        </Grid>

        {/* Right Panel - Meeting Summary */}
        <Grid item xs={12} md={6}>
          <Card sx={{ p: 3, height: "fit-content" }}>
            <Typography
              variant="h6"
              gutterBottom
              sx={{ fontWeight: 600, mb: 3 }}
            >
              Meeting Summary
            </Typography>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <CalendarToday color="primary" />
              <Box>
                <Typography variant="body1" fontWeight={500}>
                  {formData.selectedDate
                    ? format(formData.selectedDate, "EEEE, MMMM dd, yyyy")
                    : "No date selected"}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <AccessTime color="primary" />
              <Box>
                <Typography variant="body1" fontWeight={500}>
                  {formData.startTime && formData.endTime
                    ? `${format(
                        new Date(`2000-01-01T${formData.startTime}`),
                        "h:mm a"
                      )} - ${format(
                        new Date(`2000-01-01T${formData.endTime}`),
                        "h:mm a"
                      )}`
                    : "No time selected"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formData.meetingDuration} minutes duration
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <Group color="primary" />
              <Box>
                <Typography variant="body1" fontWeight={500}>
                  {formData.participants.length} Participants
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formData.participants.length > 0
                    ? formData.participants
                        .map((p) => p.email)
                        .join(", ")
                        .substring(0, 50) +
                      (formData.participants.map((p) => p.email).join(", ")
                        .length > 50
                        ? "..."
                        : "")
                    : "No participants added"}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <Schedule color="primary" />
              <Box>
                <Typography variant="body1" fontWeight={500}>
                  {formData.timeZone}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Timezone
                </Typography>
              </Box>
            </Box>

            {formData.selectedDate && formData.startTime && (
              <Alert severity="success" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>
                    {isEditing
                      ? "Updated meeting time:"
                      : "Meeting scheduled for:"}
                  </strong>
                  <br />
                  {format(formData.selectedDate, "EEEE, MMMM dd, yyyy")} at{" "}
                  {format(
                    new Date(`2000-01-01T${formData.startTime}`),
                    "h:mm a"
                  )}{" "}
                  ({formData.meetingDuration} minutes)
                </Typography>
              </Alert>
            )}
          </Card>
        </Grid>
      </Grid>
    </Box>
  );

  // Enhanced meeting details rendering with better debug info
  const renderMeetingDetails = () => (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
        <Box
          sx={{
            bgcolor: "primary.main",
            color: "white",
            borderRadius: "50%",
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1rem",
            fontWeight: "bold",
          }}
        >
          {isEditing ? "1" : "2"}
        </Box>
        <Typography variant="h5" fontWeight={600}>
          Meeting Details
        </Typography>
      </Box>

      {/* Enhanced debug info in development */}
      {process.env.NODE_ENV === "development" && isEditing && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="caption">
            DEBUG INFO:
            <br />- Title: "{formData.meetingTitle}"<br />- Location: "
            {formData.location}"<br />- Participants:{" "}
            {formData.participants.length}
            <br />- Participant emails:{" "}
            {formData.participants.map((p) => p.email).join(", ")}
            <br />- Correct meeting found:{" "}
            {getCorrectMeetingData() ? "Yes" : "No"}
            <br />- Using events array:{" "}
            {events && events.length > 0 ? "Yes" : "No"}
            <br />- Events count: {events ? events.length : "None"}
            <br />
          </Typography>
        </Alert>
      )}

      <TextField
        fullWidth
        label="Meeting Title"
        value={formData.meetingTitle}
        onChange={(e) => {
          updateFormData({ meetingTitle: e.target.value });
          clearValidationError("meetingTitle");
        }}
        sx={{ mb: 3 }}
        placeholder="Enter meeting title..."
        required
        error={!!validationErrors.meetingTitle}
        helperText={
          validationErrors.meetingTitle ||
          "Enter a descriptive title for your meeting"
        }
      />

      <TextField
        fullWidth
        label="Location (Optional)"
        value={formData.location}
        onChange={(e) => updateFormData({ location: e.target.value })}
        sx={{ mb: 3 }}
        placeholder="Enter meeting location or 'Online'..."
        helperText="Physical location or 'Online' for virtual meetings"
      />

      {/* Participants section with enhanced display */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="subtitle1">
          Who's joining? ({formData.participants.length} participants)
        </Typography>
        <Button
          variant="outlined"
          startIcon={<GroupAdd />}
          onClick={() => setBulkInviteOpen(true)}
          size="small"
          sx={{
            borderColor: "secondary.main",
            color: "secondary.main",
            "&:hover": {
              borderColor: "secondary.dark",
              backgroundColor: "rgba(156, 39, 176, 0.04)",
            },
          }}
        >
          Bulk Invite
        </Button>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <TextField
              fullWidth
              label="Email Address"
              value={formData.participantEmail}
              onChange={(e) => {
                updateFormData({ participantEmail: e.target.value });
              }}
              placeholder="user1@example.com, user2@example.com"
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addParticipant();
                }
              }}
              helperText="Enter multiple emails separated by commas"
              InputProps={{
                startAdornment: (
                  <Box
                    sx={{
                      mr: 1,
                      color: "text.secondary",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    📧
                  </Box>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Button
              fullWidth
              variant="contained"
              onClick={addParticipant}
              disabled={!formData.participantEmail}
              sx={{ height: 56 }}
            >
              {formData.participantEmail?.includes(",") ? "Add All" : "Add"}
            </Button>
          </Grid>
        </Grid>
      </Box>

      {/* Enhanced participants display */}
      {formData.participants.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography
            variant="subtitle2"
            gutterBottom
            color="primary"
            fontWeight={600}
          >
            Participants ({formData.participants.length})
          </Typography>
          <Paper sx={{ maxHeight: 200, overflow: "auto", bgcolor: "grey.50" }}>
            <List>
              {formData.participants.map((participant, index) => (
                <ListItem key={participant.id} divider>
                  <ListItemIcon>
                    <Avatar
                      sx={{ bgcolor: "primary.main", width: 32, height: 32 }}
                    >
                      {participant.name.charAt(0).toUpperCase()}
                    </Avatar>
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="body2" fontWeight={500}>
                        {participant.name}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {participant.email}
                      </Typography>
                    }
                  />
                  <IconButton
                    onClick={() => removeParticipant(participant.id)}
                    color="error"
                    size="small"
                    sx={{ ml: 1 }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </ListItem>
              ))}
            </List>
          </Paper>
        </Box>
      )}

      {formData.participants.length === 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            No participants added yet. Add participant emails above or use the
            Bulk Invite feature.
          </Typography>
        </Alert>
      )}

      <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2">
          <strong>Important:</strong> Only invited participants and the host can
          see this meeting in their schedule.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Participants will receive email invitations with the meeting details
          and join link.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          <strong>Tip:</strong> You can add multiple participants at once by
          entering email addresses separated by commas, or use the Bulk Invite
          button to upload from Excel/CSV files.
        </Typography>
      </Alert>

      {/* Meeting Settings */}
      <Accordion sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="subtitle1">Meeting Settings</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.meetingSettings.createCalendarEvent}
                  onChange={(e) =>
                    updateMeetingSettings({
                      createCalendarEvent: e.target.checked,
                    })
                  }
                />
              }
              label="Create calendar event"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.meetingSettings.sendInvitations}
                  onChange={(e) =>
                    updateMeetingSettings({ sendInvitations: e.target.checked })
                  }
                />
              }
              label="Send email invitations"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.meetingSettings.setReminders}
                  onChange={(e) =>
                    updateMeetingSettings({ setReminders: e.target.checked })
                  }
                />
              }
              label="Set calendar reminders"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.meetingSettings.addMeetingLink}
                  onChange={(e) =>
                    updateMeetingSettings({ addMeetingLink: e.target.checked })
                  }
                />
              }
              label="Add video meeting link"
            />
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Calendar Integration Settings */}
      <Accordion>
        <AccordionSummary
          expandIcon={<ExpandMore />}
          sx={{
            bgcolor: alpha(theme.palette.primary.main, 0.05),
            borderRadius: 1,
            mb: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Event color="primary" />
            <Typography variant="subtitle1" color="primary" fontWeight={600}>
              Calendar Integration
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              Control whether this meeting should be automatically added to
              calendars.
            </Typography>
          </Alert>

          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.calendarSettings.addToHostCalendar}
                  onChange={(e) =>
                    updateCalendarSettings({
                      addToHostCalendar: e.target.checked,
                    })
                  }
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    Add to my calendar (Host)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Meeting will be added to your main calendar
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              control={
                <Switch
                  checked={formData.calendarSettings.addToParticipantCalendars}
                  onChange={(e) =>
                    updateCalendarSettings({
                      addToParticipantCalendars: e.target.checked,
                    })
                  }
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    Add to participants' calendars
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Meeting will be automatically added to participants'
                    calendars
                  </Typography>
                </Box>
              }
            />

            {(formData.calendarSettings.addToHostCalendar ||
              formData.calendarSettings.addToParticipantCalendars) && (
              <Box sx={{ mt: 2, p: 2, bgcolor: "grey.50", borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Reminder Times (minutes before meeting)
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                  {[5, 10, 15, 30, 60].map((minutes) => (
                    <Chip
                      key={minutes}
                      label={`${minutes} min`}
                      variant={
                        formData.calendarSettings.reminderTimes.includes(
                          minutes
                        )
                          ? "filled"
                          : "outlined"
                      }
                      color={
                        formData.calendarSettings.reminderTimes.includes(
                          minutes
                        )
                          ? "primary"
                          : "default"
                      }
                      size="small"
                      onClick={() => {
                        const currentTimes =
                          formData.calendarSettings.reminderTimes;
                        if (currentTimes.includes(minutes)) {
                          updateCalendarSettings({
                            reminderTimes: currentTimes.filter(
                              (t) => t !== minutes
                            ),
                          });
                        } else {
                          updateCalendarSettings({
                            reminderTimes: [...currentTimes, minutes].sort(
                              (a, b) => a - b
                            ),
                          });
                        }
                      }}
                      sx={{ cursor: "pointer" }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Box>
  );

  const renderReview = () => (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
        <Box
          sx={{
            bgcolor: "primary.main",
            color: "white",
            borderRadius: "50%",
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1rem",
            fontWeight: "bold",
          }}
        >
          3
        </Box>
        <Typography variant="h5" fontWeight={600}>
          {isEditing ? "Review Changes" : "Review & Create Meeting"}
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, bgcolor: "grey.50" }}>
            <Typography variant="subtitle2" color="primary" gutterBottom>
              MEETING DETAILS
            </Typography>
            <Typography variant="h6" gutterBottom>
              {formData.meetingTitle || "Untitled Meeting"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formData.selectedDate?.toLocaleDateString()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formData.startTime && formData.endTime
                ? `${format(
                    new Date(`2000-01-01T${formData.startTime}`),
                    "h:mm a"
                  )} - ${format(
                    new Date(`2000-01-01T${formData.endTime}`),
                    "h:mm a"
                  )}`
                : "No time selected"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formData.meetingDuration} minutes
            </Typography>
            {formData.location && (
              <Typography variant="body2" color="text.secondary">
                {formData.location}
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, bgcolor: "grey.50" }}>
            <Typography variant="subtitle2" color="primary" gutterBottom>
              PARTICIPANTS ({formData.participants.length})
            </Typography>
            {formData.participants.length > 0 ? (
              <Box>
                {formData.participants.length <= 5 ? (
                  formData.participants.map((participant) => (
                    <Typography
                      key={participant.id}
                      variant="body2"
                      gutterBottom
                    >
                      {participant.name} ({participant.email})
                    </Typography>
                  ))
                ) : (
                  <Box>
                    {formData.participants.slice(0, 3).map((participant) => (
                      <Typography
                        key={participant.id}
                        variant="body2"
                        gutterBottom
                      >
                        {participant.name} ({participant.email})
                      </Typography>
                    ))}
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontStyle: "italic" }}
                    >
                      ... and {formData.participants.length - 3} more
                      participants
                    </Typography>
                  </Box>
                )}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No participants added
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper
            sx={{
              p: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.05),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
            }}
          >
            <Typography variant="subtitle2" color="primary" gutterBottom>
              CALENDAR INTEGRATION
            </Typography>
            <Stack direction="row" spacing={3}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <EventAvailable
                  color={
                    formData.calendarSettings.addToHostCalendar
                      ? "primary"
                      : "disabled"
                  }
                  fontSize="small"
                />
                <Typography
                  variant="body2"
                  color={
                    formData.calendarSettings.addToHostCalendar
                      ? "text.primary"
                      : "text.secondary"
                  }
                >
                  Host calendar:{" "}
                  {formData.calendarSettings.addToHostCalendar
                    ? "Enabled"
                    : "Disabled"}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Group
                  color={
                    formData.calendarSettings.addToParticipantCalendars
                      ? "primary"
                      : "disabled"
                  }
                  fontSize="small"
                />
                <Typography
                  variant="body2"
                  color={
                    formData.calendarSettings.addToParticipantCalendars
                      ? "text.primary"
                      : "text.secondary"
                  }
                >
                  Participant calendars:{" "}
                  {formData.calendarSettings.addToParticipantCalendars
                    ? "Enabled"
                    : "Disabled"}
                </Typography>
              </Box>
            </Stack>

            {(formData.calendarSettings.addToHostCalendar ||
              formData.calendarSettings.addToParticipantCalendars) && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Reminders:{" "}
                  {formData.calendarSettings.reminderTimes.join(", ")} minutes
                  before
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Creation progress */}
      {isCreating && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" gutterBottom>
            {progressMessage ||
              (isEditing ? "Updating meeting..." : "Creating meeting...")}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={creationProgress}
            sx={{ mb: 1 }}
          />
          <Typography variant="caption" color="text.secondary">
            {creationProgress}% complete
          </Typography>

          {participantStats && (
            <Alert severity="success" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Participant Summary:</strong>
                <br />
                {participantStats.added} of {participantStats.total}{" "}
                participants added successfully
                {participantStats.failed > 0 && (
                  <span>
                    <br />
                    {participantStats.failed} participants failed to add (you
                    can try adding them manually)
                  </span>
                )}
              </Typography>
            </Alert>
          )}
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Error:</strong> {error}
          </Typography>
        </Alert>
      )}

      {Object.keys(validationErrors).length > 0 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Please fix the following issues:</strong>
          </Typography>
          <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
            {Object.values(validationErrors).map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}
    </Box>
  );

  // Validation for proceeding to next tab
  const canProceed = useMemo(() => {
    const tabIndex = isEditing ? currentTab + 1 : currentTab;

    switch (tabIndex) {
      case 0: // Select Time
        return formData.selectedDate && formData.startTime;
      case 1: // Meeting Details
        return formData.meetingTitle.trim() !== "";
      case 2: // Review
        return validateForm();
      default:
        return false;
    }
  }, [
    currentTab,
    isEditing,
    formData.selectedDate,
    formData.startTime,
    formData.meetingTitle,
    validateForm,
  ]);

  const getNextButtonText = () => {
    if (!canProceed) {
      if (currentTab === 0 && (!formData.selectedDate || !formData.startTime)) {
        return "Select Date & Time First";
      }
      if (currentTab === 1 && !formData.meetingTitle.trim()) {
        return "Enter Meeting Title";
      }
      return "Complete Required Fields";
    }
    return "Next";
  };

  // Don't render until data is properly loaded for editing
  if (isEditing && !dataLoaded) {
    return (
      <StyledContainer>
        <CalendarCard>
          <CardContent sx={{ p: 4, textAlign: "center" }}>
            <CircularProgress size={40} sx={{ mb: 2 }} />
            <Typography variant="body1">Loading meeting data...</Typography>
            {process.env.NODE_ENV === "development" && (
              <Typography variant="caption" sx={{ display: "block", mt: 2 }}>
                DEBUG: Waiting for data population...
                <br />
                Existing meeting: {existingMeeting ? "Present" : "Missing"}
                <br />
                Data loaded: {dataLoaded ? "Yes" : "No"}
                <br />
                Events available: {events ? events.length : 0}
              </Typography>
            )}
          </CardContent>
        </CalendarCard>
      </StyledContainer>
    );
  }

  return (
    <StyledContainer>
      <CalendarCard>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ textAlign: "center", p: 4, pb: 2 }}>
            {isEditing ? (
              <Edit sx={{ fontSize: 80, color: "primary.main", mb: 2 }} />
            ) : (
              <CalendarToday
                sx={{ fontSize: 80, color: "primary.main", mb: 2 }}
              />
            )}
            <Typography variant="h4" fontWeight="bold" gutterBottom>
              {isEditing ? "Edit Meeting" : "Calendar Meeting"}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {isEditing
                ? "Update your meeting details and calendar settings"
                : "Create a new calendar meeting with integration options"}
            </Typography>

            {/* Show participant count in editing mode */}
            {isEditing && formData.participants.length > 0 && (
              <Chip
                label={`${formData.participants.length} participants loaded`}
                color="success"
                size="small"
                sx={{ mt: 1 }}
              />
            )}
          </Box>

          <Tabs
            value={currentTab}
            onChange={(e, newValue) => setCurrentTab(newValue)}
            variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            {tabLabels.map((label, index) => (
              <Tab
                key={index}
                label={label}
                icon={
                  index === 0 ? (
                    <CalendarToday />
                  ) : index === 1 ? (
                    <Edit />
                  ) : (
                    <CheckCircle />
                  )
                }
              />
            ))}
          </Tabs>

          {/* Tab Content */}
          {(currentTab === 0 && !isEditing) || (currentTab === 1 && isEditing)
            ? renderSelectTime()
            : null}
          {(currentTab === 1 && !isEditing) || (currentTab === 0 && isEditing)
            ? renderMeetingDetails()
            : null}
          {(currentTab === 2 && !isEditing) || (currentTab === 2 && isEditing)
            ? renderReview()
            : null}

          {/* Navigation Buttons */}
          {/* Navigation Buttons */}
          <Box
            sx={{
              p: 3,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: 1,
              borderColor: "divider",
              position: "sticky",
              bottom: 0,
              bgcolor: "white",
              zIndex: 5,
            }}
          >
            {/* Back Button */}
            <Button
              onClick={() => setCurrentTab(Math.max(0, currentTab - 1))}
              disabled={currentTab === 0}
              variant="outlined"
              startIcon={<ArrowBack />}
            >
              Back
            </Button>

            <Box sx={{ display: "flex", gap: 2 }}>
              {/* Cancel */}
              <Button
                onClick={onClose || (() => navigate("/dashboard"))}
                color="inherit"
              >
                Cancel
              </Button>

              {/* ✅ Always show Update button when editing */}
              {isEditing && (
                <Button
                  onClick={handleCreateMeeting}
                  disabled={isCreating || loading}
                  variant="contained"
                  startIcon={
                    isCreating || loading ? (
                      <CircularProgress size={20} />
                    ) : (
                      <VideoCall />
                    )
                  }
                  sx={{
                    background: "linear-gradient(45deg, #3a34ceff 30%,)",
                    fontWeight: 600,
                    minWidth: "160px",
                    textTransform: "none",
                  }}
                >
                  {isCreating || loading ? "Updating..." : "Update Meeting"}
                </Button>
              )}

              {/* ✅ Show “Next” until last tab */}
              {currentTab < tabLabels.length - 1 && (
                <Button
                  onClick={() => setCurrentTab(currentTab + 1)}
                  disabled={!canProceed}
                  variant="contained"
                  endIcon={<ArrowForward />}
                  sx={{
                    opacity: !canProceed ? 0.5 : 1,
                    cursor: !canProceed ? "not-allowed" : "pointer",
                    textTransform: "none",
                    fontSize: "1rem",
                    fontWeight: 600,
                    padding: "10px 24px",
                    background:
                      "linear-gradient(45deg, #1a5fcfff 30%, #5bd1f5ff 90%)",
                  }}
                >
                  {getNextButtonText()}
                </Button>
              )}

              {/* ✅ Show “Create Meeting” on last tab if not editing */}
              {!isEditing && currentTab === tabLabels.length - 1 && (
                <Button
                  onClick={handleCreateMeeting}
                  disabled={isCreating || loading || !canProceed}
                  variant="contained"
                  startIcon={
                    isCreating || loading ? (
                      <CircularProgress size={20} />
                    ) : (
                      <VideoCall />
                    )
                  }
                  sx={{
                    background:
                      "linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)",
                    minWidth: "160px",
                    textTransform: "none",
                    fontWeight: 600,
                  }}
                >
                  {isCreating || loading ? "Creating..." : "Create Meeting"}
                </Button>
              )}
            </Box>
          </Box>
        </CardContent>
      </CalendarCard>

      {/* Bulk Invite Dialog */}
      <BulkInvite
        open={bulkInviteOpen}
        onClose={() => setBulkInviteOpen(false)}
        meetingId={
          formData?.id || existingMeeting?.ID || "new-calendar-meeting"
        }
        meetingTitle={formData?.meetingTitle || "New Calendar Meeting"}
        onInvitesSent={handleBulkInvitesSent}
      />
    </StyledContainer>
  );
}

export default CalendarMeeting;
