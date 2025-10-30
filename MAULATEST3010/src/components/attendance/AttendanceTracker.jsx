import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  Box,
  Typography,
  IconButton,
  Chip,
  Card,
  CardContent,
  LinearProgress,
  Tooltip,
  Button,
  Alert,
  CircularProgress,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Coffee,
  Warning,
  CheckCircle,
  Error as ErrorIcon,
  Videocam,
  VideocamOff,
  Stop,
  SupervisorAccount,
  AdminPanelSettings,
  Refresh,
  PersonOff,
} from "@mui/icons-material";
import { styled } from "@mui/material/styles";

import AttendancePopup from "./AttendancePopup";

// ==================== STYLED COMPONENTS ====================
const AttendanceContainer = styled(Box)(({ theme }) => ({
  position: "fixed",
  top: theme.spacing(0.5),
  right: theme.spacing(5),
  zIndex: 1000,
}));

const AttendanceIndicator = styled(Card)(({ theme }) => ({
  backgroundColor: "rgba(0,0,0,0.9)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "white",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
}));

const StatusChip = styled(Chip)(({ status }) => ({
  height: 22,
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "white",
  backgroundColor:
    status === "active"
      ? "rgba(76,175,80,0.8)"
      : status === "warning"
      ? "rgba(255,152,0,0.8)"
      : status === "violation"
      ? "rgba(244,67,54,0.8)"
      : status === "break"
      ? "rgba(33,150,243,0.8)"
      : status === "excluded"
      ? "rgba(158,158,158,0.8)"
      : status === "host_tracking"
      ? "rgba(76,175,80,0.6)"
      : status === "terminated"
      ? "rgba(244,67,54,0.9)"
      : status === "initializing"
      ? "rgba(255,193,7,0.8)"
      : status === "unauthorized"
      ? "rgba(156,39,176,0.8)"
      : "rgba(158,158,158,0.8)",
}));

// ==================== MAIN COMPONENT ====================
const AttendanceTracker = ({
  meetingId,
  userId,
  userName,
  isActive = true,
  cameraEnabled: propCameraEnabled = false,
  onViolation,
  onStatusChange,
  minimized = false,
  onToggleMinimized,
  onCameraToggle,
  onSessionTerminated,
  isHost = false,
  isCoHost = false,
  effectiveRole = "participant",
}) => {
  console.log("🔄 AttendanceTracker rendered:", {
    meetingId,
    userId,
    userName,
    cameraEnabled: propCameraEnabled,
    effectiveRole,
  });

  // ==================== REFS ====================
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);
  const breakTimerRef = useRef(null);
  const violationTimerRef = useRef(null);
  const lastWarningTimeRef = useRef(0);
  const roleHistoryRef = useRef([]);
  const warningIssuedForDurationRef = useRef(new Set());
  const lastWarningCheckTimeRef = useRef(0);
  const breakProcessingRef = useRef(false);
  const autoResumeInProgressRef = useRef(false);
  const cameraVerificationTokenRef = useRef(null);
  const cameraEnableAttemptRef = useRef(0);
  const cameraWasEnabledBeforeBreakRef = useRef(false);
  const lastShownViolationRef = useRef({});
  const gracePeriodRef = useRef({ active: false, until: 0 });

  // ==================== FACE AUTHENTICATION REFS ====================
  const consecutiveUnauthorizedCountRef = useRef(0);
  const lastAuthCheckTimeRef = useRef(0);
  const authCheckIntervalRef = useRef(null);
  const isAuthBlockedRef = useRef(false);

  // ==================== SESSION STATE ====================
  const [isSessionTerminated, setIsSessionTerminated] = useState(false);
  const [isSessionPermanentlyEnded, setIsSessionPermanentlyEnded] =
    useState(false);
  const [terminationReason, setTerminationReason] = useState("");
  const [terminationCountdown, setTerminationCountdown] = useState(null);
  const [isTerminating, setIsTerminating] = useState(false);

  // ==================== ROLE TRACKING STATE ====================
  const [currentTrackingMode, setCurrentTrackingMode] = useState("participant");
  const [roleTransitionInProgress, setRoleTransitionInProgress] =
    useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(Date.now());

  // ==================== TRACKING STATE ====================
  const [isTracking, setIsTracking] = useState(false);
  const [attendanceData, setAttendanceData] = useState({
    attendancePercentage: 100,
    engagementScore: 100,
    popupCount: 0,
    maxPopups: 4,
    breakUsed: false,
    violations: [],
    currentViolations: [],
    frameCount: 0,
    lastDetectionTime: null,
    totalPresenceTime: 0,
    roleHistory: [],
  });

  // ==================== VIOLATION STATE ====================
  const [currentViolations, setCurrentViolations] = useState([]);
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState("");
  const [popupType, setPopupType] = useState("warning");
  const [sessionActive, setSessionActive] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [continuousViolationTime, setContinuousViolationTime] = useState(0);
  const [processingFrame, setProcessingFrame] = useState(false);
  const [gracePeriodActive, setGracePeriodActive] = useState(false);

  // ==================== INSTANT VIOLATION POPUP STATE ====================
  const [showInstantViolation, setShowInstantViolation] = useState(false);
  const [instantViolationType, setInstantViolationType] = useState(null);
  const VIOLATION_COOLDOWN_MS = 3000;
  const FIRST_VIOLATION_COOLDOWN_MS = 500;

  // ==================== WARNING SYSTEM STATE ====================
  const [warningCount, setWarningCount] = useState(0);
  const [violationStartTime, setViolationStartTime] = useState(null);
  const [isInViolation, setIsInViolation] = useState(false);
  const [warningsExhausted, setWarningsExhausted] = useState(false);
  const [postWarningViolationStart, setPostWarningViolationStart] =
    useState(null);
  const [lastWarningDisplayTime, setLastWarningDisplayTime] = useState(0);

  // ==================== BREAK MANAGEMENT STATE ====================
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakTimeLeft, setBreakTimeLeft] = useState(0);
  const [totalBreakTimeUsed, setTotalBreakTimeUsed] = useState(0);
  const [breakTimeRemaining, setBreakTimeRemaining] = useState(30);
  const [lastPopupType, setLastPopupType] = useState("");
  const [showSuccessPopup, setShowSuccessPopup] = useState(true);
  const [breakStartedAt, setBreakStartedAt] = useState(null);
  const [breakCount, setBreakCount] = useState(0);
  const [isProcessingBreak, setIsProcessingBreak] = useState(false);

  // ==================== CAMERA STATE ====================
  const [cameraEnabled, setCameraEnabled] = useState(propCameraEnabled);
  const [cameraInitStatus, setCameraInitStatus] = useState("idle");
  const [cameraInitError, setCameraInitError] = useState("");

  // ==================== FACE AUTHENTICATION STATE ====================
  const [faceAuthStatus, setFaceAuthStatus] = useState("verified"); // 'verified', 'checking', 'unauthorized', 'blocked'
  const [unauthorizedCount, setUnauthorizedCount] = useState(0);
  const [isAuthBlocked, setIsAuthBlocked] = useState(false);
  const [authCheckInProgress, setAuthCheckInProgress] = useState(false);

  // ==================== ROLE-BASED TRACKING MODE ====================
  const determineTrackingMode = useCallback(() => {
    if (isHost || effectiveRole === "host") return "host";
    if (isCoHost || effectiveRole === "co-host" || effectiveRole === "cohost")
      return "cohost";
    return "participant";
  }, [isHost, isCoHost, effectiveRole]);

  // ==================== VIOLATION DETECTION CHECK ====================
  const shouldDetectViolations = useMemo(() => {
    return (
      currentTrackingMode === "participant" &&
      sessionActive &&
      !isSessionTerminated &&
      !isOnBreak
    );
  }, [currentTrackingMode, sessionActive, isSessionTerminated, isOnBreak]);

  // ==================== BREAK AVAILABILITY CHECK ====================
  const canTakeBreak = useMemo(() => {
    return (
      currentTrackingMode === "participant" &&
      breakTimeRemaining >= 5 &&
      sessionActive &&
      !isOnBreak &&
      !isSessionTerminated &&
      !isProcessingBreak &&
      totalBreakTimeUsed < 30 &&
      !isAuthBlocked
    );
  }, [
    currentTrackingMode,
    breakTimeRemaining,
    sessionActive,
    isOnBreak,
    isSessionTerminated,
    isProcessingBreak,
    totalBreakTimeUsed,
    isAuthBlocked,
  ]);

  // ==================== POPUP DISPLAY FUNCTION ====================
  const showViolationPopup = useCallback(
    (message, type = "warning", force = false) => {
      if (
        currentTrackingMode !== "participant" &&
        type !== "info" &&
        type !== "success"
      ) {
        console.log("Popup blocked - not in participant mode");
        return;
      }

      console.log(`Popup (${type}): ${message}`);

      // ✅ FIXED: Proper success popup handling
      if (type === "success" && !force) {
        if (!showSuccessPopup) {
          console.log("Success popup blocked - already shown once");
          return;
        }
        setShowSuccessPopup(false);
      }

      setPopupMessage(message);
      setPopupType(type);
      setShowPopup(true);
      setLastPopupType(type);

      // ✅ FIXED: Longer duration for success messages
      const duration =
        type === "error"
          ? 8000
          : type === "warning"
          ? 6000
          : type === "success"
          ? 5000
          : 3000;

      setTimeout(() => {
        if (mountedRef.current) {
          setShowPopup(false);
        }
      }, duration);

      if (onViolation) {
        onViolation({ message, type, timestamp: Date.now() });
      }
    },
    [currentTrackingMode, onViolation, showSuccessPopup]
  );

  // ==================== TRIGGER INSTANT VIOLATION POPUP ====================
  const triggerInstantViolationPopup = useCallback(
    (violation, isNewViolation = false) => {
      if (currentTrackingMode !== "participant") {
        console.log("Instant popup blocked - not participant mode");
        return;
      }
      if (isOnBreak || isSessionTerminated) {
        console.log("Instant popup blocked - on break or terminated");
        return;
      }

      const currentTime = Date.now();
      const lastShown = lastShownViolationRef.current[violation] || 0;
      const timeSinceLastShown = currentTime - lastShown;

      const cooldown =
        lastShown === 0 || isNewViolation
          ? FIRST_VIOLATION_COOLDOWN_MS
          : VIOLATION_COOLDOWN_MS;

      if (timeSinceLastShown >= cooldown || isNewViolation) {
        console.log(
          `INSTANT VIOLATION POPUP: ${violation}${
            isNewViolation ? " (NEW)" : ""
          }`
        );

        lastShownViolationRef.current[violation] = currentTime;
        setInstantViolationType(violation);
        setShowInstantViolation(true);

        setTimeout(() => {
          setShowInstantViolation(false);
        }, 100);
      }
    },
    [
      currentTrackingMode,
      isOnBreak,
      isSessionTerminated,
      VIOLATION_COOLDOWN_MS,
      FIRST_VIOLATION_COOLDOWN_MS,
    ]
  );

  // ==================== API CALL FUNCTION ====================
  const apiCall = useCallback(
    async (endpoint, method = "GET", data = null) => {
      const url = `/api/attendance${endpoint}`;
      const options = {
        method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      if (data) {
        const enhancedData = {
          ...data,
          current_tracking_mode: currentTrackingMode,
          role_history: roleHistoryRef.current,
          session_start_time: sessionStartTime,
        };
        options.body = JSON.stringify(enhancedData);
      }

      console.log(`API: ${method} ${url}`);
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`API Response: ${method} ${url}`, result);
      return result;
    },
    [currentTrackingMode, sessionStartTime]
  );

  // ==================== SESSION TERMINATION HANDLER ====================
  const handleSessionTermination = useCallback(
    async (
      reason = "violations",
      message = "Session ended due to violations"
    ) => {
      if (currentTrackingMode !== "participant") {
        console.log("Termination blocked - not participant");
        return;
      }

      console.log("SESSION TERMINATION:", { reason, message });

      setIsSessionTerminated(true);
      setIsSessionPermanentlyEnded(true);
      setTerminationReason(reason);
      setSessionActive(false);
      setIsTracking(false);
      setIsTerminating(true);

      try {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        if (breakTimerRef.current) {
          clearInterval(breakTimerRef.current);
          breakTimerRef.current = null;
        }

        if (violationTimerRef.current) {
          clearInterval(violationTimerRef.current);
          violationTimerRef.current = null;
        }

        if (authCheckIntervalRef.current) {
          clearInterval(authCheckIntervalRef.current);
          authCheckIntervalRef.current = null;
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => {
            track.stop();
          });
          streamRef.current = null;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }

        setVideoReady(false);

        if (meetingId && userId) {
          try {
            await apiCall("/stop/", "POST", {
              meeting_id: meetingId,
              user_id: userId,
              reason: "session_terminated",
              termination_reason: reason,
            });
          } catch (backendError) {
            console.warn("Failed to notify backend:", backendError.message);
          }
        }
      } catch (cleanupError) {
        console.error("Termination cleanup error:", cleanupError);
      }

      showViolationPopup(message, "error");

      setTerminationCountdown(3);
      const countdownInterval = setInterval(() => {
        setTerminationCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);

            if (onSessionTerminated) {
              console.log(`AUTO-REMOVING participant ${userId}`);
              onSessionTerminated({
                userId,
                userName,
                reason: reason,
                message: message,
                timestamp: Date.now(),
                participantSpecific: true,
                permanent: true,
              });
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [
      currentTrackingMode,
      meetingId,
      userId,
      userName,
      onSessionTerminated,
      showViolationPopup,
      apiCall,
    ]
  );

  // ==================== FACE AUTHENTICATION CHECK ====================
  const performFaceAuthCheck = useCallback(async () => {
    if (!mountedRef.current || isAuthBlockedRef.current || authCheckInProgress) {
      return;
    }

    if (isSessionTerminated || isSessionPermanentlyEnded || !sessionActive) {
      return;
    }

    if (!cameraEnabled || !videoReady || isOnBreak) {
      return;
    }

    if (!videoRef.current || !canvasRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    if (video.paused || video.ended) {
      return;
    }

    const currentTime = Date.now();
    const timeSinceLastCheck = currentTime - lastAuthCheckTimeRef.current;

    // Check every 5 seconds
    if (timeSinceLastCheck < 5000) {
      return;
    }

    try {
      setAuthCheckInProgress(true);
      lastAuthCheckTimeRef.current = currentTime;

      // Capture frame
      const context = canvas.getContext("2d");
      const maxWidth = 640;
      const maxHeight = 480;
      let { videoWidth: width, videoHeight: height } = video;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);

      // Convert canvas to blob for FormData
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      
      // Create FormData with proper format for face/verify endpoint
      const formData = new FormData();
      formData.append('user_id', userId.toString());
      formData.append('image', blob, 'frame.jpg');

      console.log(`🔐 Checking face authentication for user ${userId}...`);

      // Call existing face/verify endpoint (port 8220)
      const response = await fetch('https://192.168.48.201:8220/api/face/verify', {
        method: 'POST',
        body: formData,
      });

      if (!mountedRef.current || isAuthBlockedRef.current) {
        return;
      }

      const authResult = await response.json();

      console.log('🔐 Face Auth Result:', {
        allowed: authResult.allowed,
        distance: authResult.distance,
        confidence: authResult.confidence,
        status: authResult.status,
      });

      if (authResult.allowed && authResult.status === "VERIFIED") {
        // Authentication successful - reset counter
        if (consecutiveUnauthorizedCountRef.current > 0) {
          console.log('✅ Face re-verified - resetting unauthorized count');
          consecutiveUnauthorizedCountRef.current = 0;
          setUnauthorizedCount(0);
          setFaceAuthStatus('verified');
        }
      } else {
        // Authentication failed - increment counter
        consecutiveUnauthorizedCountRef.current += 1;
        const count = consecutiveUnauthorizedCountRef.current;
        setUnauthorizedCount(count);
        setFaceAuthStatus('unauthorized');

        console.log(`❌ Unauthorized detection #${count}/3 - Distance: ${authResult.distance}, Confidence: ${authResult.confidence}%`);

        // Show warning popup
        showViolationPopup(
          `⚠️ Unauthorized user detected (${count}/3). Please ensure you are the registered user.`,
          'warning',
          true
        );

        // Trigger instant violation popup
        triggerInstantViolationPopup('Unauthorized User', true);

        if (count >= 3) {
          // Block further checks and terminate session
          isAuthBlockedRef.current = true;
          setIsAuthBlocked(true);
          setFaceAuthStatus('blocked');

          console.log('🚫 3 consecutive unauthorized detections - BLOCKING USER');

          // Stop auth check interval
          if (authCheckIntervalRef.current) {
            clearInterval(authCheckIntervalRef.current);
            authCheckIntervalRef.current = null;
          }

          // Terminate session
          await handleSessionTermination(
            'unauthorized_user',
            '🚫 Session terminated: Unauthorized user detected 3 times. You have been blocked from this meeting.'
          );
        }
      }
    } catch (error) {
      console.error('❌ Face auth check error:', error);
      // Don't increment counter on technical errors - network issues, etc.
    } finally {
      if (mountedRef.current) {
        setAuthCheckInProgress(false);
      }
    }
  }, [
    cameraEnabled,
    videoReady,
    isOnBreak,
    isSessionTerminated,
    isSessionPermanentlyEnded,
    sessionActive,
    userId,
    authCheckInProgress,
    showViolationPopup,
    triggerInstantViolationPopup,
    handleSessionTermination,
  ]);

  // ==================== VIOLATION WARNING SYSTEM ====================
  const handleViolationWarning = useCallback(
    (violations) => {
      if (currentTrackingMode !== "participant") {
        return;
      }

      const currentTime = Date.now();

      if (violations && violations.length > 0) {
        if (!isInViolation) {
          console.log("VIOLATION STARTED");
          setIsInViolation(true);
          setViolationStartTime(currentTime);
          lastWarningTimeRef.current = currentTime;
          warningIssuedForDurationRef.current.clear();
        }

        const violationDuration = violationStartTime
          ? Math.floor((currentTime - violationStartTime) / 1000)
          : 0;

        setContinuousViolationTime(violationDuration);

        if (!warningsExhausted && violationDuration > 0) {
          const timeSinceLastWarning = Math.floor(
            (currentTime - lastWarningTimeRef.current) / 1000
          );

          const shouldIssueWarning =
            timeSinceLastWarning >= 20 &&
            warningCount < 4 &&
            timeSinceLastWarning < 22;

          if (shouldIssueWarning) {
            const newWarningCount = warningCount + 1;
            setWarningCount(newWarningCount);
            lastWarningTimeRef.current = currentTime;
            setLastWarningDisplayTime(currentTime);

            console.log(`WARNING ${newWarningCount}/4`);

            const warningMessage = `Warning ${newWarningCount}/4: ${violations.join(
              ", "
            )}`;

            showViolationPopup(warningMessage, "warning", true);

            setAttendanceData((prev) => ({
              ...prev,
              popupCount: newWarningCount,
            }));

            if (newWarningCount >= 4) {
              console.log("ALL 4 WARNINGS EXHAUSTED");
              setWarningsExhausted(true);
              setPostWarningViolationStart(currentTime);

              setTimeout(() => {
                showViolationPopup(
                  "FINAL WARNING: All 4 warnings used. Continued violations will reduce attendance.",
                  "error",
                  true
                );
              }, 1000);
            }
          }
        } else if (warningsExhausted) {
          if (!postWarningViolationStart) {
            setPostWarningViolationStart(currentTime);
            console.log("Post-warning timer started");
          }

          const postWarningDuration = Math.floor(
            (currentTime - postWarningViolationStart) / 1000
          );

          if (postWarningDuration > 0 && postWarningDuration % 20 === 0) {
            setAttendanceData((prev) => ({
              ...prev,
              attendancePercentage: Math.max(
                0,
                prev.attendancePercentage - 0.25
              ),
            }));
            console.log(`Attendance reduced`);
          }

          if (postWarningDuration >= 120) {
            console.log("Terminating - 2min post-warning violations");
            handleSessionTermination(
              "post_warning_violations",
              `Session terminated: 2 minutes of violations after warnings`
            );
          }
        }
      } else {
        if (isInViolation) {
          console.log("Violations cleared");
          setIsInViolation(false);
          setViolationStartTime(null);
          setContinuousViolationTime(0);
          setPostWarningViolationStart(null);
        }
      }
    },
    [
      currentTrackingMode,
      isInViolation,
      violationStartTime,
      warningCount,
      warningsExhausted,
      postWarningViolationStart,
      showViolationPopup,
      handleSessionTermination,
    ]
  );

  // ==================== CAMERA INITIALIZATION ====================
  const initializeCamera = useCallback(async () => {
    if (isSessionTerminated || isSessionPermanentlyEnded) {
      console.log("Session terminated - blocking camera");
      return false;
    }

    try {
      console.log("Initializing camera...");
      setCameraError(null);
      setCameraInitStatus("initializing");
      setCameraInitError("");

      const constraints = [
        { video: { width: 640, height: 480, frameRate: 15 }, audio: false },
        { video: { width: 320, height: 240 }, audio: false },
        { video: true, audio: false },
      ];

      let stream = null;
      for (let i = 0; i < constraints.length; i++) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints[i]);
          break;
        } catch (err) {
          if (i === constraints.length - 1) throw err;
        }
      }

      if (!stream) {
        throw new Error("Failed to get camera stream");
      }

      streamRef.current = stream;

      if (videoRef.current && mountedRef.current && !isSessionTerminated) {
        videoRef.current.srcObject = stream;

        await new Promise((resolve, reject) => {
          const video = videoRef.current;
          if (!video) {
            reject(new Error("Video ref lost"));
            return;
          }

          const timeout = setTimeout(() => {
            reject(new Error("Video setup timeout"));
          }, 10000);

          const handleLoad = () => {
            clearTimeout(timeout);
            video.removeEventListener("loadedmetadata", handleLoad);
            video.removeEventListener("error", handleError);
            resolve();
          };

          const handleError = (err) => {
            clearTimeout(timeout);
            video.removeEventListener("loadedmetadata", handleLoad);
            video.removeEventListener("error", handleError);
            reject(err);
          };

          video.addEventListener("loadedmetadata", handleLoad);
          video.addEventListener("error", handleError);

          video.play().catch(reject);
        });
      }

      if (mountedRef.current && !isSessionTerminated) {
        setVideoReady(true);
        setCameraInitStatus("ready");
        setCameraEnabled(true);
        console.log("Camera initialized successfully");
      }
      return true;
    } catch (error) {
      console.error("Camera init failed:", error);
      setCameraError(error.message);
      setCameraInitError(error.message);
      setVideoReady(false);
      setCameraInitStatus("failed");
      return false;
    }
  }, [isSessionTerminated, isSessionPermanentlyEnded]);

  // ==================== VERIFY CAMERA HARDWARE IS READY ====================
  const verifyCameraReady = useCallback(
    async (maxRetries = 5, retryDelay = 500) => {
      console.log("Verifying camera hardware is ready...");

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`Verification attempt ${attempt}/${maxRetries}`);

        if (!mountedRef.current) {
          console.error("Component unmounted during verification");
          return false;
        }

        if (!videoRef.current || !streamRef.current) {
          console.warn(`Attempt ${attempt}: Video/stream ref not available`);
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            continue;
          }
          return false;
        }

        const videoTracks = streamRef.current.getVideoTracks();
        if (videoTracks.length === 0) {
          console.warn(`Attempt ${attempt}: No video tracks found`);
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            continue;
          }
          return false;
        }

        const track = videoTracks[0];

        if (!track.enabled) {
          console.warn(
            `Attempt ${attempt}: Video track disabled - enabling now...`
          );
          track.enabled = true;
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        if (track.readyState !== "live") {
          console.warn(
            `Attempt ${attempt}: Track not live (state: ${track.readyState})`
          );
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            continue;
          }
          return false;
        }

        if (videoRef.current.paused || videoRef.current.ended) {
          console.warn(
            `Attempt ${attempt}: Video paused or ended - attempting to play...`
          );
          try {
            await videoRef.current.play();
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (playError) {
            console.warn(`Play error:`, playError);
            if (attempt < maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
              continue;
            }
          }
        }

        if (
          videoRef.current.videoWidth === 0 ||
          videoRef.current.videoHeight === 0
        ) {
          console.warn(`Attempt ${attempt}: Video dimensions not ready`);
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            continue;
          }
          return false;
        }

        console.log(`Camera verified ready on attempt ${attempt}`);
        return true;
      }

      console.error("Camera verification failed after all retries");
      return false;
    },
    []
  );

  // ==================== VERIFY WITH BACKEND ====================
  const verifyWithBackend = useCallback(
    async (confirmationToken) => {
      if (!confirmationToken) {
        console.warn(
          "No confirmation token available for backend verification"
        );
        return false;
      }

      try {
        console.log("Verifying camera with backend...");
        setCameraInitStatus("verifying");

        const response = await apiCall("/verify-camera/", "POST", {
          meeting_id: meetingId,
          user_id: userId,
          confirmation_token: confirmationToken,
          camera_active: true,
        });

        if (response.success) {
          console.log("Backend confirmed camera is active");
          return true;
        } else {
          console.warn("Backend verification failed:", response.error);
          return false;
        }
      } catch (error) {
        console.warn(
          "Backend verification error (non-critical):",
          error.message
        );
        return true;
      }
    },
    [meetingId, userId, apiCall]
  );

  // ==================== FRAME CAPTURE AND ANALYSIS ====================
  const captureAndAnalyze = useCallback(async () => {
    if (!mountedRef.current) return;

    if (isSessionTerminated || isSessionPermanentlyEnded) {
      console.log("Session terminated - blocking capture");
      return;
    }

    if (!cameraEnabled) {
      console.log("Camera disabled - blocking capture");
      return;
    }

    if (isOnBreak) {
      console.log("On break - blocking capture");
      return;
    }

    if (!sessionActive || !videoReady || !isTracking) {
      return;
    }

    if (!videoRef.current || !canvasRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    if (video.paused || video.ended) {
      return;
    }

    if (!streamRef.current || streamRef.current.getTracks().length === 0) {
      return;
    }

    const videoTracks = streamRef.current.getVideoTracks();
    if (videoTracks.length === 0 || !videoTracks[0].enabled) {
      return;
    }

    if (processingFrame) {
      return;
    }

    try {
      setProcessingFrame(true);

      const context = canvas.getContext("2d");

      const maxWidth = 640;
      const maxHeight = 480;
      let { videoWidth: width, videoHeight: height } = video;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);

      const frameData = canvas.toDataURL("image/jpeg", 0.8);

      const analysisState = {
        meeting_id: meetingId,
        user_id: userId,
        frame: frameData,
        user_role: effectiveRole,
        current_tracking_mode: currentTrackingMode,
        is_host: isHost,
        is_cohost: isCoHost,
        is_on_break: isOnBreak,
        should_detect_violations: shouldDetectViolations,
        role_history: roleHistoryRef.current,
        session_start_time: sessionStartTime,
      };

      const response = await apiCall("/detect/", "POST", analysisState);

      if (mountedRef.current && !isSessionTerminated) {
        handleAnalysisResponse(response);
      }
    } catch (error) {
      console.error("Frame analysis error:", error);

      if (
        error.message.includes("session_closed") ||
        error.message.includes("session_terminated")
      ) {
        if (currentTrackingMode === "participant") {
          handleSessionTermination("session_violations_error", "Session ended");
        }
        return;
      }
    } finally {
      if (mountedRef.current) {
        setProcessingFrame(false);
      }
    }
  }, [
    sessionActive,
    videoReady,
    meetingId,
    userId,
    processingFrame,
    isOnBreak,
    cameraEnabled,
    isTracking,
    effectiveRole,
    currentTrackingMode,
    isHost,
    isCoHost,
    shouldDetectViolations,
    sessionStartTime,
    apiCall,
    isSessionTerminated,
    isSessionPermanentlyEnded,
    handleSessionTermination,
  ]);

  // ==================== HANDLE ANALYSIS RESPONSE WITH GRACE PERIOD ====================
  const handleAnalysisResponse = useCallback(
    (response) => {
      if (!response || !mountedRef.current) return;

      if (isSessionTerminated || isSessionPermanentlyEnded) {
        console.log("Session terminated - ignoring response");
        return;
      }

      console.log("Analysis response:", response.status);

      // FIXED: Check if grace period is active from backend
      if (response.grace_period_active) {
        const gracePeriodTimeRemaining =
          (response.grace_period_expires_in || 0) * 1000;
        console.log(
          `GRACE PERIOD ACTIVE from backend: ${gracePeriodTimeRemaining}ms remaining`
        );
        setGracePeriodActive(true);
        gracePeriodRef.current.active = true;
        gracePeriodRef.current.until = Date.now() + gracePeriodTimeRemaining;

        if (response.message) {
          showViolationPopup(response.message, "info");
        }
        return;
      } else if (
        gracePeriodRef.current.active &&
        Date.now() >= gracePeriodRef.current.until
      ) {
        console.log(`GRACE PERIOD ENDED - resuming normal detection`);
        setGracePeriodActive(false);
        gracePeriodRef.current.active = false;
        gracePeriodRef.current.until = 0;
      }

      console.log("POPUP DEBUG:", {
        violations: response.violations,
        currentViolations: currentViolations,
        warningCount: warningCount,
        baselineEstablished: response.baseline_established,
        isTracking: isTracking,
        cameraEnabled: cameraEnabled,
        trackingMode: currentTrackingMode,
        frameCount: response.frame_count,
        gracePeriodActive: gracePeriodActive,
      });

      if (
        currentTrackingMode === "participant" &&
        (response.status === "participant_removed" ||
          response.status === "session_terminated" ||
          response.status === "session_closed")
      ) {
        console.log("Backend requests removal");

        handleSessionTermination(
          "attendance_violations",
          response.message || "Session ended"
        );
        return;
      }

      setAttendanceData((prev) => ({
        ...prev,
        attendancePercentage:
          response.attendance_percentage ?? prev.attendancePercentage,
        engagementScore: response.engagement_score ?? prev.engagementScore,
        popupCount: warningCount,
        maxPopups: response.max_popups ?? prev.maxPopups,
        breakUsed: response.break_used ?? prev.breakUsed,
        currentViolations: response.violations || [],
        totalPresenceTime:
          response.total_presence_time ?? prev.totalPresenceTime,
        frameCount: prev.frameCount + 1,
        lastDetectionTime: new Date().toLocaleTimeString(),
      }));

      if (currentTrackingMode === "participant") {
        if (response.violations && response.violations.length > 0) {
          console.log("Violations detected:", response.violations);

          const previousViolations = currentViolations || [];
          response.violations.forEach((violation) => {
            const isNewViolation = !previousViolations.includes(violation);
            console.log(
              `Triggering instant popup for: ${violation} (new: ${isNewViolation})`
            );
            triggerInstantViolationPopup(violation, isNewViolation);
          });

          setCurrentViolations(response.violations);
          handleViolationWarning(response.violations);

          if (response.continuous_violation_time > 0) {
            setContinuousViolationTime(response.continuous_violation_time);
          }
        } else {
          setCurrentViolations([]);
          handleViolationWarning([]);
        }
      } else {
        setCurrentViolations([]);
      }

      if (
        response.status === "session_closed" &&
        currentTrackingMode === "participant"
      ) {
        console.log("Session closed by backend");
        handleSessionTermination(
          "session_violations",
          response.popup || "Session ended"
        );
        return;
      }

      if (response.is_on_break !== undefined) {
        setIsOnBreak(response.is_on_break);
      }
      if (response.total_break_time_used !== undefined) {
        setTotalBreakTimeUsed(response.total_break_time_used);
      }
      if (response.break_time_remaining !== undefined) {
        setBreakTimeRemaining(response.break_time_remaining);
      }

      if (onStatusChange) {
        onStatusChange({
          attendancePercentage: response.attendance_percentage,
          violations: response.violations || [],
          active:
            sessionActive &&
            response.session_active !== false &&
            !isSessionTerminated,
          continuousViolationTime: continuousViolationTime,
          isOnBreak: response.is_on_break || false,
          isTerminated: isSessionTerminated,
          warningCount: warningCount,
          warningsExhausted: warningsExhausted,
          trackingMode: currentTrackingMode,
          roleHistory: roleHistoryRef.current,
          totalPresenceTime: response.total_presence_time || 0,
          faceAuthStatus: faceAuthStatus,
          unauthorizedCount: unauthorizedCount,
        });
      }
    },
    [
      sessionActive,
      onStatusChange,
      isSessionTerminated,
      isSessionPermanentlyEnded,
      handleSessionTermination,
      handleViolationWarning,
      warningCount,
      warningsExhausted,
      continuousViolationTime,
      currentTrackingMode,
      triggerInstantViolationPopup,
      currentViolations,
      isTracking,
      cameraEnabled,
      showViolationPopup,
      gracePeriodActive,
      faceAuthStatus,
      unauthorizedCount,
    ]
  );

  // ==================== END BREAK HANDLER ====================
  const handleEndBreak = useCallback(async () => {
    if (currentTrackingMode !== "participant") {
      console.log("Not participant - ignoring end break");
      return;
    }

    console.log("handleEndBreak STARTED");

    const cameraWasEnabled = cameraWasEnabledBeforeBreakRef.current;

    if (breakProcessingRef.current || autoResumeInProgressRef.current) {
      console.log("Break end already in progress - aborting duplicate call");
      return;
    }

    const isAutoExpire = breakTimeLeft === 0;

    breakProcessingRef.current = true;
    autoResumeInProgressRef.current = true;
    setIsProcessingBreak(true);

    let backendResponse = null;

    try {
      const statusResponse = await apiCall(
        `/status/?meeting_id=${meetingId}&user_id=${userId}`,
        "GET"
      );

      if (!statusResponse.is_on_break) {
        setIsOnBreak(false);
        setBreakTimeLeft(0);
        setBreakStartedAt(null);
        if (breakTimerRef.current) {
          clearInterval(breakTimerRef.current);
          breakTimerRef.current = null;
        }
      } else {
        backendResponse = await apiCall("/pause-resume/", "POST", {
          meeting_id: meetingId,
          user_id: userId,
          action: "resume",
        });

        if (backendResponse.success !== false) {
          setIsOnBreak(false);
          setBreakStartedAt(null);
          setCurrentViolations([]);
          setTotalBreakTimeUsed(backendResponse.total_break_time_used || 0);
          setBreakTimeRemaining(backendResponse.break_time_remaining || 0);
          setBreakCount(backendResponse.break_count || 0);

          if (breakTimerRef.current) {
            clearInterval(breakTimerRef.current);
            breakTimerRef.current = null;
          }
          setBreakTimeLeft(0);

          setIsInViolation(false);
          setViolationStartTime(null);
          setContinuousViolationTime(0);
          lastWarningTimeRef.current = 0;

          // FIXED: Preserve violation cooldowns - DON'T reset them
          // lastShownViolationRef.current = {}; // REMOVED THIS LINE

          if (backendResponse.camera_confirmation_token) {
            cameraVerificationTokenRef.current =
              backendResponse.camera_confirmation_token;
          }
        } else {
          throw new Error(backendResponse.error || "Failed to end break");
        }
      }
    } catch (error) {
      console.error("Break end error:", error);
      showViolationPopup(`Failed to end break: ${error.message}`, "error");
      breakProcessingRef.current = false;
      autoResumeInProgressRef.current = false;
      setIsProcessingBreak(false);
      return;
    }

    if (isSessionTerminated || isSessionPermanentlyEnded) {
      breakProcessingRef.current = false;
      autoResumeInProgressRef.current = false;
      setIsProcessingBreak(false);
      return;
    }

    if (cameraWasEnabled) {
      if (!onCameraToggle) {
        console.error("onCameraToggle callback missing!");
        showViolationPopup("Error: Cannot control camera", "error");
        breakProcessingRef.current = false;
        autoResumeInProgressRef.current = false;
        setIsProcessingBreak(false);
        return;
      }

      if (isAutoExpire) {
        setCameraEnabled(true);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      showViolationPopup("Enabling camera after break...", "info");

      setCameraInitStatus("initializing");
      setCameraEnabled(true);

      await new Promise((resolve) => setTimeout(resolve, 150));

      try {
        onCameraToggle(true);
      } catch (toggleError) {
        console.error("Error calling onCameraToggle:", toggleError);
        setCameraInitStatus("failed");
        showViolationPopup("Failed to enable camera", "error");
        breakProcessingRef.current = false;
        autoResumeInProgressRef.current = false;
        setIsProcessingBreak(false);
        return;
      }

      const initialWaitTime = isAutoExpire ? 4000 : 2000;
      await new Promise((resolve) => setTimeout(resolve, initialWaitTime));

      const maxRetries = isAutoExpire ? 20 : 5;
      const retryDelay = isAutoExpire ? 1500 : 500;

      let cameraReady = false;

      for (let attempt = 1; attempt <= 3 && !cameraReady; attempt++) {
        if (attempt > 1) {
          try {
            onCameraToggle(true);
            await new Promise((resolve) => setTimeout(resolve, 2000));
          } catch (retryError) {
            console.error(`Retry ${attempt} failed:`, retryError);
          }
        }

        cameraReady = await verifyCameraReady(maxRetries, retryDelay);

        if (cameraReady) {
          break;
        } else if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }

      if (!cameraReady) {
        console.error("Camera failed to initialize");
        setCameraInitStatus("failed");
        showViolationPopup(
          "Camera failed to start - please enable manually",
          "error"
        );
        breakProcessingRef.current = false;
        autoResumeInProgressRef.current = false;
        setIsProcessingBreak(false);
        return;
      }

      setCameraInitStatus("ready");

      if (
        backendResponse?.camera_verification_required &&
        cameraVerificationTokenRef.current &&
        !isAutoExpire
      ) {
        await verifyWithBackend(cameraVerificationTokenRef.current);
      }

      if (!mountedRef.current || !sessionActive) {
        breakProcessingRef.current = false;
        autoResumeInProgressRef.current = false;
        setIsProcessingBreak(false);
        return;
      }

      setIsTracking(true);

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      intervalRef.current = setInterval(() => {
        if (mountedRef.current && !isSessionTerminated && !isOnBreak) {
          captureAndAnalyze();
        }
      }, 3000);

      setTimeout(() => {
        if (
          mountedRef.current &&
          !isSessionTerminated &&
          !isOnBreak &&
          cameraEnabled
        ) {
          captureAndAnalyze();
        }
      }, 1000);

      const endType = isAutoExpire ? "auto-completed (30s)" : "manually ended";
      showViolationPopup(
        `Break ${endType} - Camera enabled, detection active`,
        "success"
      );
    } else {
      if (mountedRef.current && sessionActive && !isSessionTerminated) {
        setIsTracking(true);
      }
      showViolationPopup("Break ended - Camera remains off", "info");
    }

    breakProcessingRef.current = false;
    autoResumeInProgressRef.current = false;
    setIsProcessingBreak(false);
  }, [
    currentTrackingMode,
    isOnBreak,
    breakTimeLeft,
    isSessionTerminated,
    isSessionPermanentlyEnded,
    meetingId,
    userId,
    onCameraToggle,
    sessionActive,
    showViolationPopup,
    apiCall,
    verifyCameraReady,
    verifyWithBackend,
    captureAndAnalyze,
    cameraEnabled,
  ]);

  // ==================== RETRY CAMERA ====================
  const handleRetryCamera = useCallback(async () => {
    if (!onCameraToggle) {
      showViolationPopup("Camera control not available", "error");
      return;
    }

    setCameraInitStatus("initializing");
    showViolationPopup("Retrying camera initialization...", "info");

    try {
      onCameraToggle(true);
      setCameraEnabled(true);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const cameraReady = await verifyCameraReady(5, 500);

      if (!cameraReady) {
        throw new Error("Camera verification failed after retry");
      }

      setCameraInitStatus("ready");
      showViolationPopup("Camera enabled successfully", "success");

      if (!isTracking && sessionActive && !isSessionTerminated && !isOnBreak) {
        setIsTracking(true);

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }

        intervalRef.current = setInterval(() => {
          if (mountedRef.current && !isSessionTerminated && !isOnBreak) {
            captureAndAnalyze();
          }
        }, 3000);

        setTimeout(() => {
          if (mountedRef.current && !isSessionTerminated && !isOnBreak) {
            captureAndAnalyze();
          }
        }, 1000);
      }
    } catch (error) {
      console.error("Camera retry failed:", error);
      setCameraInitStatus("failed");
      setCameraInitError(error.message);
      showViolationPopup(`Camera retry failed: ${error.message}`, "error");
    }
  }, [
    onCameraToggle,
    showViolationPopup,
    verifyCameraReady,
    isTracking,
    sessionActive,
    isSessionTerminated,
    isOnBreak,
    captureAndAnalyze,
  ]);

  // ==================== BREAK TIMER ====================
  const startBreakTimer = useCallback(
    (duration) => {
      setBreakStartedAt(Date.now());

      if (breakTimerRef.current) {
        clearInterval(breakTimerRef.current);
        breakTimerRef.current = null;
      }

      setBreakTimeLeft(duration);

      breakTimerRef.current = setInterval(() => {
        setBreakTimeLeft((prev) => {
          const newTime = prev - 1;

          if (newTime <= 0) {
            clearInterval(breakTimerRef.current);
            breakTimerRef.current = null;

            if (
              mountedRef.current &&
              !isSessionTerminated &&
              !breakProcessingRef.current &&
              !autoResumeInProgressRef.current
            ) {
              handleEndBreak();
            }

            return 0;
          }

          if (newTime === 10) {
            showViolationPopup("10 seconds remaining on break", "info");
          }

          return newTime;
        });
      }, 1000);
    },
    [isSessionTerminated, showViolationPopup, handleEndBreak]
  );

  // ==================== BACKEND SYNC ====================
  const syncWithBackend = useCallback(async () => {
    if (!meetingId || !userId || isSessionTerminated) return;

    try {
      const response = await apiCall(
        `/status/?meeting_id=${meetingId}&user_id=${userId}`,
        "GET"
      );

      const backendOnBreak = response.is_on_break || false;
      const backendBreakTimeRemaining = response.break_time_remaining || 0;
      const backendTotalUsed = response.total_break_time_used || 0;
      const backendBreakCount = response.break_count || 0;

      if (backendBreakCount !== breakCount) {
        setBreakCount(backendBreakCount);
      }

      if (Math.abs(breakTimeRemaining - backendBreakTimeRemaining) > 5) {
        setBreakTimeRemaining(backendBreakTimeRemaining);
      }

      if (Math.abs(totalBreakTimeUsed - backendTotalUsed) > 2) {
        setTotalBreakTimeUsed(backendTotalUsed);
      }

      if (isOnBreak !== backendOnBreak) {
        setIsOnBreak(backendOnBreak);

        if (!backendOnBreak && breakTimerRef.current) {
          clearInterval(breakTimerRef.current);
          breakTimerRef.current = null;
          setBreakTimeLeft(0);
          setBreakStartedAt(null);
          breakProcessingRef.current = false;
          autoResumeInProgressRef.current = false;
          setIsProcessingBreak(false);

          if (cameraWasEnabledBeforeBreakRef.current && onCameraToggle) {
            onCameraToggle(true);
            setCameraEnabled(true);
          }
        } else if (
          backendOnBreak &&
          !breakTimerRef.current &&
          !breakProcessingRef.current
        ) {
          const remainingTime = Math.max(0, backendBreakTimeRemaining);
          if (remainingTime > 0) {
            setBreakTimeLeft(remainingTime);
            startBreakTimer(remainingTime);
          }
        }
      }
    } catch (error) {
      console.warn("Backend sync failed:", error.message);
    }
  }, [
    meetingId,
    userId,
    isSessionTerminated,
    isOnBreak,
    breakTimeRemaining,
    totalBreakTimeUsed,
    breakCount,
    onCameraToggle,
    startBreakTimer,
    apiCall,
  ]);

  // ==================== TAKE BREAK ====================
  const handleTakeBreak = useCallback(async () => {
    if (currentTrackingMode !== "participant") {
      showViolationPopup("Break only available for participants", "warning");
      return;
    }

    if (
      breakProcessingRef.current ||
      isSessionTerminated ||
      isSessionPermanentlyEnded ||
      isOnBreak ||
      !canTakeBreak
    ) {
      return;
    }

    breakProcessingRef.current = true;
    setIsProcessingBreak(true);

    try {
      cameraWasEnabledBeforeBreakRef.current = cameraEnabled;

      const response = await apiCall("/pause-resume/", "POST", {
        meeting_id: meetingId,
        user_id: userId,
        action: "pause",
      });

      if (response.success) {
        setIsOnBreak(true);
        setCurrentViolations([]);
        setTotalBreakTimeUsed(response.total_break_time_used || 0);
        setBreakTimeRemaining(response.break_time_remaining || 0);
        setBreakCount(response.break_count || 0);

        setIsInViolation(false);
        setViolationStartTime(null);
        setContinuousViolationTime(0);

        // FIXED: Don't clear violation cooldowns when taking break
        // lastShownViolationRef.current = {}; // REMOVED THIS LINE

        if (cameraEnabled && onCameraToggle) {
          onCameraToggle(false);
          setCameraEnabled(false);
        }

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        // Stop face auth checks during break
        if (authCheckIntervalRef.current) {
          clearInterval(authCheckIntervalRef.current);
          authCheckIntervalRef.current = null;
        }

        const breakDuration =
          response.break_duration || response.break_time_remaining || 30;

        setBreakTimeLeft(breakDuration);
        startBreakTimer(breakDuration);

        const displayMinutes = Math.floor(breakDuration / 60);
        const displaySeconds = breakDuration % 60;

        showViolationPopup(
          `Break #${
            response.break_count
          } started - camera disabled. ${displayMinutes}:${displaySeconds
            .toString()
            .padStart(2, "0")} available.`,
          "success"
        );
      } else {
        throw new Error(response.error || "Failed to start break");
      }
    } catch (error) {
      console.error("Break request failed:", error);
      showViolationPopup(`Break failed: ${error.message}`, "error");
    } finally {
      breakProcessingRef.current = false;
      setIsProcessingBreak(false);
    }
  }, [
    currentTrackingMode,
    isOnBreak,
    isSessionTerminated,
    isSessionPermanentlyEnded,
    canTakeBreak,
    cameraEnabled,
    onCameraToggle,
    meetingId,
    userId,
    showViolationPopup,
    apiCall,
    startBreakTimer,
  ]);

  // ==================== ROLE TRANSITION ====================
  const handleRoleTransition = useCallback(
    (newMode) => {
      if (newMode === currentTrackingMode) return;

      setRoleTransitionInProgress(true);

      const roleChange = {
        fromRole: currentTrackingMode,
        toRole: newMode,
        timestamp: Date.now(),
        attendanceAtTransition: attendanceData.attendancePercentage,
      };

      roleHistoryRef.current.push(roleChange);

      setAttendanceData((prev) => ({
        ...prev,
        roleHistory: [...roleHistoryRef.current],
      }));

      if (newMode !== "participant") {
        setCurrentViolations([]);
        setIsInViolation(false);
        setViolationStartTime(null);
        setContinuousViolationTime(0);
        setWarningsExhausted(false);
        setPostWarningViolationStart(null);

        if (violationTimerRef.current) {
          clearInterval(violationTimerRef.current);
          violationTimerRef.current = null;
        }

        // Stop face auth checks for non-participants
        if (authCheckIntervalRef.current) {
          clearInterval(authCheckIntervalRef.current);
          authCheckIntervalRef.current = null;
        }
      }

      setCurrentTrackingMode(newMode);
      setRoleTransitionInProgress(false);
    },
    [currentTrackingMode, attendanceData.attendancePercentage]
  );

  // ==================== START TRACKING ====================
  const startTracking = useCallback(async () => {
    if (!meetingId || !userId || !mountedRef.current) {
      return false;
    }

    if (isSessionTerminated || isSessionPermanentlyEnded) {
      return false;
    }

    try {
      if (!videoReady && !isOnBreak) {
        const cameraReady = await initializeCamera();
        if (!cameraReady || !mountedRef.current || isSessionTerminated) {
          showViolationPopup("Camera initialization failed", "error");
          return false;
        }
      }

      const response = await apiCall("/start/", "POST", {
        meeting_id: meetingId,
        user_id: userId,
        user_name: userName,
        user_role: effectiveRole,
        current_tracking_mode: currentTrackingMode,
        is_host: isHost,
        is_cohost: isCoHost,
        should_detect_violations: shouldDetectViolations,
      });

      if (!mountedRef.current || isSessionTerminated) {
        return false;
      }

      setSessionActive(true);
      setIsTracking(true);
      if (currentTrackingMode === "participant") {
        setWarningCount(0);
        setViolationStartTime(null);
        setIsInViolation(false);
        setWarningsExhausted(false);
        setPostWarningViolationStart(null);
        lastWarningTimeRef.current = 0;
        warningIssuedForDurationRef.current.clear();
        lastShownViolationRef.current = {};

        // Reset face auth state
        consecutiveUnauthorizedCountRef.current = 0;
        setUnauthorizedCount(0);
        setFaceAuthStatus("verified");
        setIsAuthBlocked(false);
        isAuthBlockedRef.current = false;
      }

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      intervalRef.current = setInterval(() => {
        if (mountedRef.current && !isSessionTerminated) {
          captureAndAnalyze();
        } else {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }, 3000);

      if (!isOnBreak) {
        setTimeout(() => {
          if (mountedRef.current && !isOnBreak && !isSessionTerminated) {
            captureAndAnalyze();
          }
        }, 500);
      }

      if (showSuccessPopup) {
        const message =
          currentTrackingMode === "participant"
            ? "AI attendance monitoring started"
            : `Presence tracking started for ${currentTrackingMode}`;
        showViolationPopup(message, "success");
      }

      return true;
    } catch (error) {
      console.error("Failed to start:", error);
      showViolationPopup(`Failed to start: ${error.message}`, "error");
      return false;
    }
  }, [
    meetingId,
    userId,
    userName,
    currentTrackingMode,
    videoReady,
    initializeCamera,
    captureAndAnalyze,
    showViolationPopup,
    showSuccessPopup,
    effectiveRole,
    isHost,
    isCoHost,
    shouldDetectViolations,
    isOnBreak,
    apiCall,
    isSessionTerminated,
    isSessionPermanentlyEnded,
  ]);

  // ==================== STOP TRACKING ====================
  const stopTracking = useCallback(async () => {
    try {
      setIsTracking(false);

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (breakTimerRef.current) {
        clearInterval(breakTimerRef.current);
        breakTimerRef.current = null;
      }

      if (violationTimerRef.current) {
        clearInterval(violationTimerRef.current);
        violationTimerRef.current = null;
      }

      if (authCheckIntervalRef.current) {
        clearInterval(authCheckIntervalRef.current);
        authCheckIntervalRef.current = null;
      }

      if (meetingId && userId && !isSessionTerminated) {
        await apiCall("/stop/", "POST", {
          meeting_id: meetingId,
          user_id: userId,
          reason: "manual_stop",
        });
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        setVideoReady(false);
      }
    } catch (error) {
      console.error("Failed to stop:", error);
    }
  }, [meetingId, userId, isSessionTerminated, apiCall]);

  // ==================== EFFECTS ====================
  useEffect(() => {
    const newMode = determineTrackingMode();
    if (newMode !== currentTrackingMode) {
      handleRoleTransition(newMode);
    }
  }, [determineTrackingMode, currentTrackingMode, handleRoleTransition]);

  useEffect(() => {
    const prevEnabled = cameraEnabled;

    setCameraEnabled(propCameraEnabled);

    if (prevEnabled !== propCameraEnabled) {
      if (!propCameraEnabled) {
        setCurrentViolations([]);
        setContinuousViolationTime(0);

        if (currentTrackingMode === "participant") {
          setIsInViolation(false);
          setViolationStartTime(null);
        }

        if (isTracking && !isOnBreak && currentTrackingMode === "participant") {
          setIsTracking(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          if (authCheckIntervalRef.current) {
            clearInterval(authCheckIntervalRef.current);
            authCheckIntervalRef.current = null;
          }
          showViolationPopup("Tracking paused - camera disabled", "warning");
        }
      } else {
        if (
          !isTracking &&
          !isOnBreak &&
          sessionActive &&
          !isSessionTerminated
        ) {
          const message =
            currentTrackingMode === "participant"
              ? "Camera enabled - resuming detection"
              : "Camera enabled - presence tracking active";
          showViolationPopup(message, "info");

          setIsTracking(true);

          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          intervalRef.current = setInterval(() => {
            if (mountedRef.current && !isSessionTerminated) {
              captureAndAnalyze();
            }
          }, 3000);

          setTimeout(() => {
            if (mountedRef.current && !isSessionTerminated && !isOnBreak) {
              captureAndAnalyze();
            }
          }, 1000);

          // Start face auth checks for participants
          if (
            currentTrackingMode === "participant" &&
            !isAuthBlockedRef.current
          ) {
            if (authCheckIntervalRef.current) {
              clearInterval(authCheckIntervalRef.current);
            }
            authCheckIntervalRef.current = setInterval(() => {
              performFaceAuthCheck();
            }, 5000); // Check every 5 seconds
          }
        }
      }
    }
  }, [
    propCameraEnabled,
    isTracking,
    isOnBreak,
    sessionActive,
    showViolationPopup,
    isSessionTerminated,
    currentTrackingMode,
    cameraEnabled,
    captureAndAnalyze,
    performFaceAuthCheck,
  ]);

  useEffect(() => {
    if (!meetingId || !userId || isSessionTerminated) return;

    const syncInterval = setInterval(syncWithBackend, isOnBreak ? 5000 : 10000);

    return () => clearInterval(syncInterval);
  }, [meetingId, userId, isSessionTerminated, isOnBreak, syncWithBackend]);

  useEffect(() => {
    mountedRef.current = true;

    if (isSessionTerminated || isSessionPermanentlyEnded) {
      return;
    }

    if (meetingId && userId) {
      const initialize = async () => {
        try {
          await syncWithBackend();

          const success = await startTracking();
          if (success) {
            console.log(
              `AttendanceTracker initialized for ${currentTrackingMode}`
            );

            // Start face auth checks for participants
            if (
              currentTrackingMode === "participant" &&
              cameraEnabled &&
              !isAuthBlockedRef.current
            ) {
              if (authCheckIntervalRef.current) {
                clearInterval(authCheckIntervalRef.current);
              }
              authCheckIntervalRef.current = setInterval(() => {
                performFaceAuthCheck();
              }, 3000);
            }
          }
        } catch (error) {
          console.error("Init error:", error);
        }
      };

      const timeoutId = setTimeout(initialize, 500);

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [
    meetingId,
    userId,
    currentTrackingMode,
    isSessionTerminated,
    isSessionPermanentlyEnded,
    cameraEnabled,
    syncWithBackend,
    startTracking,
    performFaceAuthCheck,
  ]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (breakTimerRef.current) {
        clearInterval(breakTimerRef.current);
        breakTimerRef.current = null;
      }
      if (violationTimerRef.current) {
        clearInterval(violationTimerRef.current);
        violationTimerRef.current = null;
      }
      if (authCheckIntervalRef.current) {
        clearInterval(authCheckIntervalRef.current);
        authCheckIntervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      setIsTracking(false);
      setSessionActive(false);
      setVideoReady(false);
    };
  }, []);

  // ==================== STATUS HELPERS ====================
  const getStatus = () => {
    if (isAuthBlocked || faceAuthStatus === "blocked") return "unauthorized";
    if (isSessionTerminated || isSessionPermanentlyEnded) return "terminated";
    if (!sessionActive) return "ended";
    if (isOnBreak) return "break";
    if (cameraInitStatus === "initializing" || cameraInitStatus === "verifying")
      return "initializing";
    if (currentTrackingMode !== "participant") return "host_tracking";
    if (faceAuthStatus === "unauthorized" && unauthorizedCount > 0)
      return "warning";
    if (currentViolations.length > 0) return "violation";
    if (attendanceData.attendancePercentage < 80) return "warning";
    return "active";
  };

  const getStatusIcon = () => {
    const status = getStatus();
    const iconProps = { sx: { fontSize: 16 } };
    switch (status) {
      case "active":
        return (
          <CheckCircle
            {...iconProps}
            sx={{ ...iconProps.sx, color: "#4caf50" }}
          />
        );
      case "warning":
        return (
          <Warning {...iconProps} sx={{ ...iconProps.sx, color: "#ff9800" }} />
        );
      case "violation":
        return (
          <ErrorIcon
            {...iconProps}
            sx={{ ...iconProps.sx, color: "#f44336" }}
          />
        );
      case "break":
        return (
          <Coffee {...iconProps} sx={{ ...iconProps.sx, color: "#2196f3" }} />
        );
      case "initializing":
        return <CircularProgress size={16} sx={{ color: "#ffc107" }} />;
      case "host_tracking":
        return (
          <CheckCircle
            {...iconProps}
            sx={{ ...iconProps.sx, color: "#4caf50" }}
          />
        );
      case "ended":
        return (
          <ErrorIcon {...iconProps} sx={{ ...iconProps.sx, color: "#666" }} />
        );
      case "terminated":
        return (
          <ErrorIcon
            {...iconProps}
            sx={{ ...iconProps.sx, color: "#f44336" }}
          />
        );
      case "unauthorized":
        return (
          <PersonOff
            {...iconProps}
            sx={{ ...iconProps.sx, color: "#9c27b0" }}
          />
        );
      default:
        return (
          <CheckCircle
            {...iconProps}
            sx={{ ...iconProps.sx, color: "#4caf50" }}
          />
        );
    }
  };

  if (!meetingId || !userId) {
    return null;
  }

  // ==================== RENDER ====================
  return (
    <>
      <AttendanceContainer>
        <AttendanceIndicator>
          <CardContent sx={{ p: 2 }}>
            {!minimized ? (
              <>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mb: 1.5,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {currentTrackingMode === "host" ? (
                      <AdminPanelSettings
                        sx={{ fontSize: 16, color: "#ff9800" }}
                      />
                    ) : currentTrackingMode === "cohost" ? (
                      <SupervisorAccount
                        sx={{ fontSize: 16, color: "#ff5722" }}
                      />
                    ) : (
                      getStatusIcon()
                    )}
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, fontSize: "0.85rem" }}
                    >
                      {currentTrackingMode === "host"
                        ? "Meeting Host"
                        : currentTrackingMode === "cohost"
                        ? "Meeting Co-Host"
                        : "AI Attendance Monitor"}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    {!isSessionTerminated &&
                      (cameraEnabled ? (
                        <Tooltip title="Camera Active">
                          <Videocam sx={{ fontSize: 16, color: "#4caf50" }} />
                        </Tooltip>
                      ) : (
                        <Tooltip title="Camera Disabled">
                          <VideocamOff
                            sx={{ fontSize: 16, color: "#f44336" }}
                          />
                        </Tooltip>
                      ))}
                    {onToggleMinimized && (
                      <IconButton
                        size="small"
                        onClick={onToggleMinimized}
                        sx={{ color: "white" }}
                      >
                        <VisibilityOff sx={{ fontSize: 16 }} />
                      </IconButton>
                    )}
                  </Box>
                </Box>

                {currentTrackingMode === "host" ||
                currentTrackingMode === "cohost" ? (
                  <>
                    <StatusChip
                      label={
                        currentTrackingMode === "host"
                          ? "HOST PRIVILEGES"
                          : "CO-HOST PRIVILEGES"
                      }
                      status="excluded"
                      size="small"
                      sx={{ mb: 1.5 }}
                    />

                    <Alert
                      severity="info"
                      sx={{ mb: 1.5, fontSize: "0.75rem" }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 600,
                          display: "block",
                          color: "#2196f3",
                        }}
                      >
                        {currentTrackingMode === "host"
                          ? "HOST PRIVILEGES:"
                          : "CO-HOST PRIVILEGES:"}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: "0.7rem",
                          color: "#90caf9",
                          display: "block",
                        }}
                      >
                        Presence tracking active
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: "0.7rem",
                          color: "#4caf50",
                          display: "block",
                        }}
                      >
                        Violation detection disabled
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: "0.7rem",
                          color: "#4caf50",
                          display: "block",
                        }}
                      >
                        No warnings or termination
                      </Typography>
                    </Alert>

                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "center",
                        p: 1,
                        backgroundColor: "rgba(170, 101, 101, 0.05)",
                        borderRadius: 1,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: "0.7rem",
                          color: "#4caf50",
                          fontWeight: 600,
                          textAlign: "center",
                        }}
                      >
                        Continuous Presence Tracking
                        <br />
                        Attendance:{" "}
                        {Math.round(attendanceData.attendancePercentage)}%
                      </Typography>
                    </Box>
                  </>
                ) : (
                  <>
                    {isSessionTerminated || isSessionPermanentlyEnded ? (
                      <Alert
                        severity="error"
                        sx={{ mb: 1.5, fontSize: "0.75rem" }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 600,
                            display: "block",
                            color: "#f44336",
                          }}
                        >
                          SESSION TERMINATED:
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ fontSize: "0.7rem", color: "#ffcdd2" }}
                        >
                          Reason: {terminationReason || "Attendance violations"}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: "0.7rem",
                            color: "#ffcdd2",
                            display: "block",
                          }}
                        >
                          Monitoring disabled
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: "0.7rem",
                            color: "#ffcdd2",
                            display: "block",
                          }}
                        >
                          You will be removed from meeting
                        </Typography>
                        {isTerminating && terminationCountdown > 0 && (
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: "0.8rem",
                              color: "#fff",
                              display: "block",
                              mt: 1,
                              fontWeight: 600,
                              backgroundColor: "rgba(244,67,54,0.3)",
                              padding: "4px 8px",
                              borderRadius: "4px",
                            }}
                          >
                            Leaving in {terminationCountdown}s...
                          </Typography>
                        )}
                      </Alert>
                    ) : (
                      <>
                        <StatusChip
                          label={
                            isOnBreak
                              ? `BREAK (${Math.floor(breakTimeLeft / 60)}:${(
                                  breakTimeLeft % 60
                                )
                                  .toString()
                                  .padStart(2, "0")})`
                              : cameraInitStatus === "initializing"
                              ? "INITIALIZING CAMERA..."
                              : cameraInitStatus === "verifying"
                              ? "VERIFYING CAMERA..."
                              : isAuthBlocked || faceAuthStatus === "blocked"
                              ? "UNAUTHORIZED - BLOCKED"
                              : faceAuthStatus === "unauthorized" &&
                                unauthorizedCount > 0
                              ? `UNAUTHORIZED (${unauthorizedCount}/3)`
                              : `${Math.round(
                                  attendanceData.attendancePercentage
                                )}% • ${
                                  isTracking ? "MONITORING" : "STARTING..."
                                }`
                          }
                          status={getStatus()}
                          size="small"
                          sx={{ mb: 1.5 }}
                        />

                        {(faceAuthStatus === "unauthorized" || isAuthBlocked) &&
                          !isOnBreak && (
                            <Alert
                              severity="error"
                              sx={{ mb: 1.5, fontSize: "0.75rem" }}
                            >
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 600,
                                  display: "block",
                                  color: "#f44336",
                                  mb: 0.5,
                                }}
                              >
                                ⚠️ FACE AUTHENTICATION WARNING
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  fontSize: "0.7rem",
                                  color: "#ffcdd2",
                                  display: "block",
                                }}
                              >
                                Unauthorized user detected: {unauthorizedCount}
                                /3
                              </Typography>
                              {isAuthBlocked ? (
                                <>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontSize: "0.7rem",
                                      color: "#fff",
                                      display: "block",
                                      fontWeight: 600,
                                      mt: 0.5,
                                    }}
                                  >
                                    🚫 BLOCKED FROM MEETING
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontSize: "0.7rem",
                                      color: "#ffcdd2",
                                      display: "block",
                                    }}
                                  >
                                    You have been removed
                                  </Typography>
                                </>
                              ) : (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontSize: "0.7rem",
                                    color: "#ff5722",
                                    display: "block",
                                    mt: 0.5,
                                  }}
                                >
                                  Ensure you are the registered user
                                </Typography>
                              )}
                            </Alert>
                          )}

                        {cameraInitStatus === "initializing" && (
                          <Alert
                            severity="info"
                            sx={{ mb: 1.5, fontSize: "0.75rem" }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              <CircularProgress
                                size={16}
                                sx={{ color: "#2196f3" }}
                              />
                              <Typography
                                variant="caption"
                                sx={{ fontSize: "0.75rem", color: "#2196f3" }}
                              >
                                Initializing camera... Please wait
                              </Typography>
                            </Box>
                          </Alert>
                        )}

                        {cameraInitStatus === "verifying" && (
                          <Alert
                            severity="info"
                            sx={{ mb: 1.5, fontSize: "0.75rem" }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              <CircularProgress
                                size={16}
                                sx={{ color: "#2196f3" }}
                              />
                              <Typography
                                variant="caption"
                                sx={{ fontSize: "0.75rem", color: "#2196f3" }}
                              >
                                Verifying camera... Almost ready
                              </Typography>
                            </Box>
                          </Alert>
                        )}

                        {cameraInitStatus === "failed" && (
                          <Alert
                            severity="error"
                            sx={{ mb: 1.5, fontSize: "0.75rem" }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                display: "block",
                                color: "#f44336",
                                mb: 0.5,
                              }}
                            >
                              Camera initialization failed
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: "0.7rem",
                                color: "#ffcdd2",
                                display: "block",
                                mb: 1,
                              }}
                            >
                              {cameraInitError || "Unknown error"}
                            </Typography>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={handleRetryCamera}
                              startIcon={<Refresh />}
                              sx={{
                                fontSize: "0.65rem",
                                color: "#f44336",
                                borderColor: "#f44336",
                                "&:hover": {
                                  backgroundColor: "rgba(244,67,54,0.1)",
                                },
                              }}
                            >
                              Retry Camera
                            </Button>
                          </Alert>
                        )}

                        {!isOnBreak && warningCount > 0 && (
                          <Box sx={{ mb: 1.5 }}>
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: "0.7rem",
                                color: warningsExhausted
                                  ? "#f44336"
                                  : "#ff9800",
                                fontWeight: 600,
                                display: "block",
                                mb: 0.5,
                              }}
                            >
                              Warnings: {warningCount}/4{" "}
                              {warningsExhausted ? "(EXHAUSTED)" : ""}
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={(warningCount / 4) * 100}
                              sx={{
                                height: 4,
                                backgroundColor: "rgba(255,255,255,0.1)",
                                "& .MuiLinearProgress-bar": {
                                  backgroundColor: warningsExhausted
                                    ? "#f44336"
                                    : "#ff9800",
                                },
                              }}
                            />
                          </Box>
                        )}

                        {warningsExhausted &&
                          currentViolations.length > 0 &&
                          !isOnBreak && (
                            <Alert
                              severity="error"
                              sx={{ mb: 1.5, fontSize: "0.75rem" }}
                            >
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 600,
                                  display: "block",
                                  color: "#f44336",
                                }}
                              >
                                POST-WARNING PHASE:
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  fontSize: "0.7rem",
                                  color: "#ffcdd2",
                                  display: "block",
                                }}
                              >
                                No more warnings
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  fontSize: "0.7rem",
                                  color: "#ffcdd2",
                                  display: "block",
                                }}
                              >
                                Attendance reduction active
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  fontSize: "0.7rem",
                                  color: "#ff5722",
                                  display: "block",
                                }}
                              >
                                2 min continuous = TERMINATION
                              </Typography>
                            </Alert>
                          )}

                        {isOnBreak ? (
                          <Alert
                            severity="info"
                            sx={{ mb: 1.5, fontSize: "0.75rem" }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 600,
                                display: "block",
                                color: "#2196f3",
                              }}
                            >
                              ON BREAK #{breakCount}:
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: "0.7rem",
                                color: "#90caf9",
                                display: "block",
                              }}
                            >
                              Time left: {Math.floor(breakTimeLeft / 60)}:
                              {(breakTimeLeft % 60).toString().padStart(2, "0")}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: "0.7rem",
                                color: "#90caf9",
                                display: "block",
                              }}
                            >
                              Camera: DISABLED
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: "0.7rem",
                                color: "#4caf50",
                                display: "block",
                              }}
                            >
                              Total used: {Math.round(totalBreakTimeUsed)}s /
                              30s
                            </Typography>

                            <Box sx={{ mt: 1, display: "flex", gap: 0.5 }}>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={handleEndBreak}
                                disabled={
                                  isProcessingBreak ||
                                  autoResumeInProgressRef.current
                                }
                                startIcon={<Stop />}
                                sx={{
                                  fontSize: "0.65rem",
                                  color: "#f44336",
                                  borderColor: "#f44336",
                                  "&:hover": {
                                    backgroundColor: "rgba(244,67,54,0.1)",
                                  },
                                  "&:disabled": {
                                    color: "#666",
                                    borderColor: "#666",
                                  },
                                }}
                              >
                                {isProcessingBreak ||
                                autoResumeInProgressRef.current
                                  ? "Ending..."
                                  : "End Break"}
                              </Button>
                            </Box>
                          </Alert>
                        ) : (
                          !cameraEnabled &&
                          sessionActive &&
                          !isOnBreak &&
                          cameraInitStatus !== "initializing" &&
                          cameraInitStatus !== "verifying" && (
                            <Alert
                              severity="error"
                              sx={{ mb: 1.5, fontSize: "0.75rem" }}
                            >
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 600,
                                  display: "block",
                                  color: "#f44336",
                                }}
                              >
                                Please turn on the camera
                              </Typography>
                            </Alert>
                          )
                        )}

                        {currentViolations.length > 0 && !isOnBreak && (
                          <Alert
                            severity="warning"
                            sx={{ mb: 1.5, fontSize: "0.75rem" }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 600,
                                display: "block",
                                mb: 0.5,
                                color: "#ff9800",
                              }}
                            >
                              ACTIVE VIOLATIONS:
                            </Typography>
                            {currentViolations.map((violation, index) => (
                              <Typography
                                key={index}
                                variant="caption"
                                sx={{
                                  display: "block",
                                  fontSize: "0.7rem",
                                  color: "#ffcc02",
                                  fontWeight: 500,
                                }}
                              >
                                {violation}
                              </Typography>
                            ))}
                            {continuousViolationTime > 0 && (
                              <Typography
                                variant="caption"
                                sx={{
                                  display: "block",
                                  mt: 0.5,
                                  color: "#f44336",
                                  fontWeight: 600,
                                  fontSize: "0.7rem",
                                }}
                              >
                                Duration: {continuousViolationTime}s
                              </Typography>
                            )}
                          </Alert>
                        )}

                        {currentViolations.length === 0 &&
                          isTracking &&
                          sessionActive &&
                          !isOnBreak &&
                          cameraEnabled &&
                          cameraInitStatus === "ready" &&
                          faceAuthStatus === "verified" && (
                            <Alert
                              severity="success"
                              sx={{ mb: 1.5, fontSize: "0.75rem" }}
                            >
                              <Typography
                                variant="caption"
                                sx={{ color: "#4caf50", fontWeight: 500 }}
                              >
                                All good! Proper attendance detected.
                              </Typography>
                            </Alert>
                          )}

                        <Box
                          sx={{
                            display: "flex",
                            gap: 0.5,
                            justifyContent: "center",
                          }}
                        >
                          {!isOnBreak && canTakeBreak && (
                            <Tooltip
                              title={`Take break (${Math.floor(
                                breakTimeRemaining
                              )}s available)`}
                            >
                              <IconButton
                                size="small"
                                onClick={handleTakeBreak}
                                disabled={isProcessingBreak}
                                sx={{
                                  color: "#2196f3",
                                  backgroundColor: "rgba(33,150,243,0.1)",
                                  "&:hover": {
                                    backgroundColor: "rgba(33,150,243,0.2)",
                                  },
                                  "&:disabled": {
                                    color: "#666",
                                    backgroundColor: "rgba(0,0,0,0.1)",
                                  },
                                }}
                              >
                                <Coffee sx={{ fontSize: 27 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </>
                    )}
                  </>
                )}
              </>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {getStatusIcon()}
                <StatusChip
                  label={
                    isSessionTerminated
                      ? "TERMINATED"
                      : isAuthBlocked
                      ? "BLOCKED"
                      : faceAuthStatus === "unauthorized"
                      ? `UNAUTH ${unauthorizedCount}/3`
                      : isOnBreak
                      ? `BREAK ${breakTimeLeft}s`
                      : cameraInitStatus === "initializing"
                      ? "INIT..."
                      : `${Math.round(attendanceData.attendancePercentage)}%`
                  }
                  status={getStatus()}
                  size="small"
                />
                {onToggleMinimized && (
                  <IconButton
                    size="small"
                    onClick={onToggleMinimized}
                    sx={{ color: "white" }}
                  >
                    <Visibility sx={{ fontSize: 16 }} />
                  </IconButton>
                )}
              </Box>
            )}
          </CardContent>
        </AttendanceIndicator>
      </AttendanceContainer>

      {!isSessionTerminated && (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ display: "none" }}
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </>
      )}

      <AttendancePopup
        open={showPopup}
        message={popupMessage}
        type={popupType}
        onClose={() => setShowPopup(false)}
        attendanceData={attendanceData}
        onTakeBreak={handleTakeBreak}
        currentViolations={currentViolations}
        continuousTime={continuousViolationTime}
        autoHide={true}
        hideCloseButton={false}
        instantViolation={instantViolationType}
        showInstantViolation={showInstantViolation}
        onInstantViolationClose={() => setShowInstantViolation(false)}
        faceAuthStatus={faceAuthStatus}
        unauthorizedCount={unauthorizedCount}
      />
    </>
  );
};

export default AttendanceTracker;