// src/components/meeting/MeetingRoom.jsx - FIXED CO-HOST PRIVILEGES AND SCREEN SHARE
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
} from "react";
import { useLiveKit } from "../../hooks/useLiveKit";
import { useHandRaise } from "../../hooks/useHandRaise";
import { throttle, debounce } from "lodash";
import { useRecording } from "../../hooks/useRecording";
import ReactionsManager from "../reactions/ReactionsManager";
import AttendanceTracker from "../attendance/AttendanceTracker";
import Whiteboard from "../whiteboard/Whiteboard";
import { Gesture as WhiteboardIcon } from "@mui/icons-material";
import {
  Box,
  Paper,
  IconButton,
  Typography,
  Drawer,
  Badge,
  Tooltip,
  AppBar,
  Toolbar,
  Chip,
  Button,
  Avatar,
  Grid,
  Fade,
  Zoom,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  Card,
  CardContent,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  CircularProgress,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  Menu,
  MenuItem,
  Divider,
} from "@mui/material";
import Add from '@mui/icons-material/Add';
import {
  Mic,
  MicOff,
  Videocam,
  VideocamOff,
  ScreenShare,
  StopScreenShare,
  Chat,
  People,
  MoreVert,
  CallEnd,
  EmojiEmotions,
  PanTool,
  RadioButtonChecked,
  Settings,
  Fullscreen,
  FullscreenExit,
  VolumeUp,
  VolumeOff,
  CameraAlt,
  Grid3x3,
  ViewModule,
  Monitor,
  Window,
  Tab,
  Close,
  VideoCall,
  Security,
  Warning,
  CheckCircle,
  Error as ErrorIcon,
  Queue,
  Speed,
  NetworkCheck,
  ExitToApp,
  MeetingRoom as MeetingRoomIcon,
  Check,
  Clear,
  HourglassEmpty,
  Person,
  Gavel,
  Share,
  Star,
  PersonOff,
  SupervisorAccount,
  AdminPanelSettings,
  Visibility,
  VisibilityOff,
  Minimize,
  ContentCopy,
} from "@mui/icons-material";
import { styled } from "@mui/material/styles";
import VideoGrid from "../video/VideoGrid";
import MeetingSettings from "./MeetingSettings";
import ChatPanel from "../chat/ChatPanel";
import ParticipantsList from "../participants/ParticipantsList";
import RaiseHand from "../interactions/RaiseHand";
import HandRaisedList from "../interactions/HandRaisedList";
import { Track, DataPacket_Kind } from "livekit-client";
import { API_BASE_URL } from "../../utils/constants";
import { participantsAPI, meetingsAPI } from "../../services/api";
// import ProfessionalReactionsPanel from "../reactions/ProfessionalReactionsPanel";
import {
  createRecordingStream,
  createMediaRecorder,
  processRecordingChunks,
  validateRecordingBlob,
  cleanupRecordingResources,
  createRecordingMetadata,
} from "../../utils/clientRecording";
// import { useTheme } from '@mui/material/styles';
// const theme = useTheme();
// Enhanced performance configuration for 50+ participants
const PERFORMANCE_CONFIG = {
  MAX_VIDEO_PARTICIPANTS: 50,
  THROTTLE_DELAY: 200,
  DEBOUNCE_DELAY: 100,
  PARTICIPANT_SYNC_INTERVAL: 10000,
  CONNECTION_RETRY_DELAY: 2000,
  MAX_RETRIES: 3,
  STREAM_CACHE_SIZE: 50,
  MAX_MESSAGES: 100,
  MAX_REACTIONS: 10,
  VIDEO_QUALITY: "medium",
  FRAME_RATE: 15,
  QUEUE_POLL_INTERVAL: 2000,
  MAX_QUEUE_WAIT_TIME: 300000,
  INITIAL_MEDIA_DELAY: 100,
  COHOST_SYNC_INTERVAL: 15000,
  ATTENDANCE_SYNC_INTERVAL: 30000,
};

// Updated Styled Components - Replace the existing ones in your MeetingRoom.jsx

const MeetingContainer = styled(Box)(({ theme }) => ({
  height: '100vh',
  width: '100vw',
  padding:0,
  margin:0,
  display: 'flex',
  flexDirection: 'column',
  background: 'linear-gradient(135deg, #0f1419 0%, #1a202c 50%, #2d3748 100%)',
  color: 'white',
  overflow: 'hidden',
  position: 'relative',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
}));

// Browser-style Tab Container
const TabsContainer = styled(Box)(({ theme }) => ({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  height: 42,
  display: 'flex',
  alignItems: 'flex-end',
  padding: '0 8px',
  zIndex: 1000,
}));

// Individual Browser Tab
const BrowserTab = styled(Box, {
  shouldForwardProp: (prop) => !['active'].includes(prop)
})(({ theme, active }) => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  height: 36,
  minWidth: 160,
  maxWidth: 220,
  padding: '12px 12px',
  marginRight: '1px',
  background: active ? '#2a2d35' : 'rgba(255, 255, 255, 0.04)',
  color: active ? '#fff' : 'rgba(255, 255, 255, 0.55)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  fontSize: '13px',
  fontWeight: 400,
  userSelect: 'none',
  borderTopLeftRadius: '8px',
  borderTopRightRadius: '8px',
  borderBottomLeftRadius: '8px',
  borderBottomRightRadius: "8px",
  border: active ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
  borderBottom: active ? '1px solid #2a2d35' : 'none',

  '&:hover': {
    background: active ? '#2a2d35' : 'rgba(255, 255, 255, 0.07)',
    color: active ? '#fff' : 'rgba(255, 255, 255, 0.8)',
  },

  '& .tab-icon': {
    fontSize: 16,
    flexShrink: 0,
    opacity: active ? 1 : 0.7,
  },

  '& .tab-title': {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}));


// Close button for tabs
const TabCloseButton = styled(IconButton)(({ theme }) => ({
  width: 18,
  height: 18,
  padding: 0,
  marginLeft: theme.spacing(0.5),
  color: 'rgba(255, 255, 255, 0.4)',
  transition: 'all 0.15s',
  borderRadius: '4px',

  '&:hover': {
    color: 'rgba(255, 255, 255, 0.9)',
    background: 'rgba(255, 255, 255, 0.12)',
  },

  '& .MuiSvgIcon-root': {
    fontSize: 14,
  }
}));




const MeetingRoom = memo(function MeetingRoom({
  meetingData,
  participants = [],
  currentUser,
  localStream,
  remoteStreams = new Map(),
  screenShareStream,
  screenSharer,
  onLeaveMeeting,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onSendReaction,
  onToggleRecording,
  isConnected: propIsConnected = false,
  isVideoEnabled: propVideoEnabled = false,
  isAudioEnabled: propAudioEnabled = false,
  isScreenSharing: propScreenSharing = false,
  isRecording: propRecording = false,
  connectionQuality = "good",
  webrtcErrors = [],
  isHost = false,
  realMeetingId = null,
  participantId = null,
}) {
  // LiveKit hooks with enhanced role-based features
  // UPDATED: Add updateCoHostStatus to the useLiveKit destructuring (around line 400 in MeetingRoom.jsx)
  const {
    connectToRoom,
    disconnectFromRoom,
    sendReaction,
    sendChatMessage,
    isConnected: livekitConnected,
    connected,
    participantCount,
    remoteParticipants,
    localParticipant,
    room,
    localTracks,
    isAudioEnabled: livekitAudioEnabled,
    isVideoEnabled: livekitVideoEnabled,
    isScreenSharing: livekitScreenSharing,
    toggleAudio: livekitToggleAudio,
    toggleVideo: livekitToggleVideo,
    startScreenShare: livekitStartScreenShare,
    stopScreenShare: livekitStopScreenShare,
    error: livekitError,
    connectionState,
    isConnecting,
    screenSharingParticipant: livekitScreenSharingParticipant,
    localIsScreenSharing: livekitLocalIsScreenSharing,
    getScreenShareStream,
    queueStatus,
    checkConnectionQueue,
    joinMeetingWithQueue,
    waitForQueueTurn,
    maxParticipants,
    performanceMode,
    startRecording: livekitStartRecording,
    stopRecording: livekitStopRecording,
    enableAudio,
    enableVideo,
    endMeetingForEveryone,
    meetingEnded,
    screenSharePermissions,
    screenShareRequests,
    currentScreenShareRequest,
    requestScreenSharePermission,
    approveScreenShareRequest,
    denyScreenShareRequest,
    updateCoHostStatus, // ADD THIS LINE
  } = useLiveKit();

  // const {
  //   sendReactionToMeeting,
  //   activeReactions,
  //   reactionCounts,
  //   participantReactions,
  //   getParticipantReaction,
  //   initializeMeetingReactions,
  //   endMeetingReactions,
  //   clearAllReactions,
  //   soundEnabled,
  //   toggleSound,
  // } = useReactions(realMeetingId, room);

  const getTabIcon = (tab) => {
    switch (tab) {
      case 'meeting':
        return <VideoCall className="tab-icon" />;
      case 'whiteboard':
        return <WhiteboardIcon className="tab-icon" />;
      default:
        return null;
    }
  };

  const getTabTitle = (tab) => {
    return tab.charAt(0).toUpperCase() + tab.slice(1);
  };

  // Hand raise hook
  const {
    raisedHands,
    isHandRaised,
    handRaiseStats,
    isLoading: handRaiseLoading,
    error: handRaiseError,
    toggleHandRaise,
    acknowledgeHand,
    clearAllHands,
    loadRaisedHands,
    pendingHandsCount,
    totalHandsCount,
    isInitialized: handRaiseInitialized,
  } = useHandRaise(realMeetingId, currentUser, isHost, room);

  const {
    startRecording: startHybridRecording,
    stopRecording: stopHybridRecording,
    checkRecordingSupport,
    uploadProgress: hookUploadProgress,
    recordingMethod: hookRecordingMethod,
    clientRecording: hookClientRecording,
    loading: recordingLoading,
    error: recordingError,
    // CORRECTED: Use these actual function names
    startMeetingRecording,
    stopMeetingRecording,
    uploadRecording,
    fetchAllRecordings,
  } = useRecording();
  // Connection refs
  const connectionAttemptRef = useRef(false);
  const hasInitialConnectionRef = useRef(false);
  const connectionRetryCountRef = useRef(0);
  const streamCacheRef = useRef(new Map());
  const participantUpdateTimerRef = useRef(null);
  const performanceMonitorRef = useRef(null);
  const queueCheckIntervalRef = useRef(null);
  const audioInitializedRef = useRef(false);
  const videoInitializedRef = useRef(false);
  const coHostSyncTimerRef = useRef(null);
  const [serverRecording, setServerRecording] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [whiteboardError, setWhiteboardError] = useState(null);

  // State management
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(propRecording);
  const [performanceWarning, setPerformanceWarning] = useState(null);
  const [showEndMeetingDialog, setShowEndMeetingDialog] = useState(false);
  const [totalMessages, setTotalMessages] = useState(0);
  // FIXED: Enhanced co-host management state
  const [coHosts, setCoHosts] = useState([]);
  const [isCoHost, setIsCoHost] = useState(false);
  const [coHostLoading, setCoHostLoading] = useState(false);
  const [showCoHostDialog, setShowCoHostDialog] = useState(false);
  const [selectedParticipantForRole, setSelectedParticipantForRole] =
    useState(null);
  const [roleChangeAction, setRoleChangeAction] = useState(null);
  const [coHostPrivilegesActive, setCoHostPrivilegesActive] = useState(false);

  const [recordingMethod, setRecordingMethod] = useState(null); // 'server' or 'client'
  const [clientMediaRecorder, setClientMediaRecorder] = useState(null);
  const [clientRecordedChunks, setClientRecordedChunks] = useState([]);
  const [clientRecordingStream, setClientRecordingStream] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showRecordingMethodDialog, setShowRecordingMethodDialog] = useState(false);
  const [recordingMetadata, setRecordingMetadata] = useState(null);


  // AI Attendance state - FIXED to ensure always enabled
  const [attendanceEnabled, setAttendanceEnabled] = useState(true);
  const [attendanceMinimized, setAttendanceMinimized] = useState(false);
  const [currentAttendanceData, setCurrentAttendanceData] = useState({
    attendancePercentage: 100,
    engagementScore: 100,
    violations: [],
    breakUsed: false,
    sessionActive: true,
  });
  const [chatStats, setChatStats] = useState({
    unread: 0,
    total: 0,
    hasNewMessages: false,
  });
  // Add these new state variables
  const [activeTab, setActiveTab] = useState('meeting');
  const [availableTabs, setAvailableTabs] = useState(['meeting']);
  // UI state
  const roomRef = useRef(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [showNotification, setShowNotification] = useState(false);
  const [notification, setNotification] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showToggleMenu, setShowToggleMenu] = useState(false);
  const [showMeetingLinkPopup, setShowMeetingLinkPopup] = useState(true);
  const [meetingLinkMinimized, setMeetingLinkMinimized] = useState(false);
  const [meetingLink, setMeetingLink] = useState("");
  // Hand raise UI state
  const [handRaiseOpen, setHandRaiseOpen] = useState(false);
  const [showHandNotification, setShowHandNotification] = useState(false);

  // Enhanced state
  const [showQueueOverlay, setShowQueueOverlay] = useState(false);
  const [queuePosition, setQueuePosition] = useState(0);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [estimatedWaitTime, setEstimatedWaitTime] = useState(0);
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [performanceMetrics, setPerformanceMetrics] = useState({
    fps: 30,
    bandwidth: "good",
    participants: 0,
    mode: "standard",
  });
  const [lastParticipantsClickTime, setLastParticipantsClickTime] = useState(0);

  const [audioInitStatus, setAudioInitStatus] = useState("");
  const [showAudioStatus, setShowAudioStatus] = useState(false);
  const [showRecordingDialog, setShowRecordingDialog] = useState(false);
  const [recordingDialogResolve, setRecordingDialogResolve] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordedChunks, setRecordedChunks] = useState([]);

  // Participant management with role-based filtering
  const [liveParticipants, setLiveParticipants] = useState([]);
  const [participantStats, setParticipantStats] = useState({
    total: 0,
    active: 0,
    livekit: 0,
  });

  // Screen Share Permission State
  const [showScreenShareRequest, setShowScreenShareRequest] = useState(false);
  const [showScreenShareWaiting, setShowScreenShareWaiting] = useState(false);
  const [screenShareWaitingTimeout, setScreenShareWaitingTimeout] =
    useState(null);

  // FIXED: Enhanced role determination with proper co-host privileges
  const effectiveRole = useMemo(() => {
    if (isHost) return "host";
    if (isCoHost || coHostPrivilegesActive) return "co-host";
    return "student";
  }, [isHost, isCoHost, coHostPrivilegesActive]);

  // FIXED: Enhanced host privileges - Co-hosts get FULL privileges
  const hasHostPrivileges = useMemo(() => {
    const privileges = isHost || isCoHost || coHostPrivilegesActive;
    // console.log("🔐 Host Privileges Check:", {
    //   isHost,
    //   isCoHost,
    //   coHostPrivilegesActive,
    //   hasHostPrivileges: privileges,
    // });
    return privileges;
  }, [isHost, isCoHost, coHostPrivilegesActive]);

  // FIXED: Only original host can make new co-hosts
  const canMakeCoHost = useMemo(() => {
    const canMake = isHost; // ONLY the original host can make co-hosts
    // console.log("👑 Can Make Co-Host Check:", {
    //   isHost,
    //   isCoHost,
    //   canMakeCoHost: canMake,
    // });
    return canMake;
  }, [isHost]);

  // FIXED: Co-hosts can remove other co-hosts, only host can remove co-hosts
  // FIXED: Only original host can remove co-hosts
  const canRemoveCoHost = useMemo(() => {
    // ONLY the original host can remove co-hosts, not other co-hosts
    const canRemove = isHost; // Only original host, not co-hosts
    // console.log("🗑️ Can Remove Co-Host Check:", {
    //   isHost,
    //   isCoHost,
    //   coHostPrivilegesActive,
    //   canRemoveCoHost: canRemove,
    // });
    return canRemove;
  }, [isHost]); // Remove isCoHost and coHostPrivilegesActive from dependencies

  // FIXED: Co-hosts get direct screen share access without approval
  const canShareScreenDirectly = useMemo(() => {
    const canShare = isHost || isCoHost || coHostPrivilegesActive;
    // console.log("🖥️ Direct Screen Share Check:", {
    //   isHost,
    //   isCoHost,
    //   coHostPrivilegesActive,
    //   canShareScreenDirectly: canShare,
    // });
    return canShare;
  }, [isHost, isCoHost, coHostPrivilegesActive]);

  // Meeting settings with role-based permissions
  const [meetingSettings, setMeetingSettings] = useState({
    waitingRoom: true,
    recording: true,
    autoRecord: false,
    transcription: false,
    muteOnEntry: true,
    videoOnEntry: false,
    chatEnabled: true,
    screenShareEnabled: true,
    screenShareRequiresApproval: true,
    reactionsEnabled: true,
    handRaiseEnabled: true,
    maxParticipants: 50,
    meetingPassword: "",
    recordingQuality: "hd",
    audioQuality: "high",
    autoEndMeeting: 120,
    allowGuestAccess: false,
    hostOnlyScreenShare: false,
    hostOnlyMute: false,
    coHostManagement: true,
    attendanceTracking: attendanceEnabled,
    attendanceMinimized: attendanceMinimized,
    whiteboardEnabled: true, // Add this
    whiteboardHostOnly: false, // Add this if needed
  });

  const meetingContainerRef = useRef(null);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState(null);

  // Connection state
  const actualIsConnected = livekitConnected || connected || false;
  const isConnectionReady = actualIsConnected && room && localParticipant;
  const currentPerformanceMode = performanceMode || "standard";
  const currentMaxParticipants = maxParticipants || 50;
  const [recordingState, setRecordingState] = useState({
    isRecording: false,
    method: null, // 'server' or 'client'
    startTime: null,
    duration: 0,
    error: null,
    uploading: false,
    uploadProgress: 0,
  });

  // FIXED: Enhanced loadLiveParticipants with name cache clearing
  const loadLiveParticipants = useCallback(
    throttle(async (forceRefresh = false) => {
      if (!realMeetingId) return;

      try {
        // console.log(
        //   "🔄 Loading live participants...",
        //   forceRefresh ? "(forced refresh)" : ""
        // );

        const response = await participantsAPI.getLiveParticipantsEnhanced(
          realMeetingId
        );

        if (response.success) {
          const processedParticipants = response.participants.map(
            (participant) => ({
              ...participant,
              id: participant.User_ID || participant.ID,
              user_id: participant.User_ID || participant.user_id,
              name:
                participant.Full_Name ||
                participant.name ||
                `User ${participant.User_ID}`,
              full_name:
                participant.Full_Name ||
                participant.name ||
                `User ${participant.User_ID}`,
              displayName:
                participant.Full_Name ||
                participant.name ||
                `User ${participant.User_ID}`,
              isOnline:
                participant.Status === "live" ||
                participant.Status === "connecting",
              isLive: participant.Status === "live",
              LiveKit_Connected: participant.LiveKit_Connected || false,
              Has_Stream: participant.Has_Stream || false,
              audio_enabled: participant.LiveKit_Data?.has_audio_track || false,
              video_enabled: participant.LiveKit_Data?.has_video_track || false,
              isAudioEnabled:
                participant.LiveKit_Data?.has_audio_track || false,
              isVideoEnabled:
                participant.LiveKit_Data?.has_video_track || false,
              connection_quality: "good",
              speaking: false,
              isHost: participant.Role === "host",
              role: participant.Role || "participant",
              isCoHost: false,
              effectiveRole: participant.Role || "participant",
              stream: null,
            })
          );

          // console.log(
          //   "✅ Processed participants:",
          //   processedParticipants.map((p) => ({
          //     id: p.id,
          //     name: p.full_name,
          //     role: p.role,
          //     status: p.Status,
          //     Leave_Time: p.Leave_Time,
          //   }))
          // );

          // CRITICAL: Filter out participants with Leave_Time (officially left/removed)
          const activeParticipants = processedParticipants.filter((p) => {
            if (p.Leave_Time) {
              // console.log(
              //   "Filtering out participant with Leave_Time:",
              //   p.id,
              //   p.name
              // );
              return false;
            }
            return true;
          });

          // console.log(
          //   "✅ Active participants after filtering:",
          //   activeParticipants.length
          // );

          // Update state with active participants only
          setLiveParticipants(activeParticipants);
          setParticipantStats({
            total: response.summary?.total_participants || 0,
            active: activeParticipants.length,
            livekit: response.summary?.livekit_participants || 0,
          });

          // CRITICAL: Dispatch update events for UI synchronization
          window.dispatchEvent(
            new CustomEvent("participantListChanged", {
              detail: {
                participants: activeParticipants,
                timestamp: Date.now(),
                source: "meeting_room_refresh",
                forceRefresh: forceRefresh,
                filteredOut:
                  processedParticipants.length - activeParticipants.length,
              },
            })
          );

          // Secondary event for name refresh
          window.dispatchEvent(
            new CustomEvent("refreshParticipantNames", {
              detail: {
                participants: activeParticipants,
                timestamp: Date.now(),
                source: "load_participants_success",
              },
            })
          );

          // console.log("✅ Participant loading completed successfully:", {
          //   total: processedParticipants.length,
          //   active: activeParticipants.length,
          //   filtered: processedParticipants.length - activeParticipants.length,
          // });
        } else {
          console.error("❌ Failed to load participants:", response.error);
        }
      } catch (error) {
        console.error("❌ Failed to load participants:", error);
      }
    }, PERFORMANCE_CONFIG.THROTTLE_DELAY),
    [realMeetingId]
  );


  const showNotificationMessage = useCallback((message, severity = "info") => {
    setNotification({ message, severity });
    setShowNotification(true);
  }, []);
  const handleCloseTab = useCallback((tabToClose) => {
    if (tabToClose === 'meeting') {
      // Cannot close meeting tab
      return;
    }

    // Remove tab from available tabs
    setAvailableTabs(prev => prev.filter(tab => tab !== tabToClose));

    // If closing active tab, switch to meeting
    if (activeTab === tabToClose) {
      setActiveTab('meeting');
    }

    // Close specific panels and cleanup
    if (tabToClose === 'whiteboard') {
      setWhiteboardOpen(false);
    }

    showNotificationMessage(`${tabToClose} tab closed`, "info");
  }, [activeTab, showNotificationMessage]);


  const handleToggleWhiteboard = useCallback(() => {
    // RESTRICT: Only hosts and co-hosts can access whiteboard
    if (!hasHostPrivileges) {
      showNotificationMessage(
        "Only hosts and co-hosts can access the whiteboard",
        "warning"
      );
      return;
    }

    if (!meetingSettings.whiteboardEnabled) {
      showNotificationMessage(
        "Whiteboard is disabled in this meeting",
        "warning"
      );
      return;
    }

    // Add whiteboard tab if it doesn't exist
    if (!availableTabs.includes('whiteboard')) {
      setAvailableTabs(prev => [...prev, 'whiteboard']);
    }

    // Switch to whiteboard tab
    setActiveTab('whiteboard');
    setWhiteboardOpen(true);

    showNotificationMessage("Whiteboard opened in new tab", "info");
  }, [
    hasHostPrivileges,
    meetingSettings.whiteboardEnabled,
    availableTabs,
    showNotificationMessage,
  ]);

  const handleWhiteboardError = useCallback(
    (error) => {
      console.error("Whiteboard error:", error);
      setWhiteboardError(error.message || "Whiteboard error occurred");
      showNotificationMessage(`Whiteboard error: ${error.message}`, "error");
    },
    [showNotificationMessage]
  );

  const handleWhiteboardSuccess = useCallback(
    (message) => {
      showNotificationMessage(message, "success");
      setWhiteboardError(null);
    },
    [showNotificationMessage]
  );
  // CRITICAL: Add this callback for ParticipantsList to trigger refreshes
  const handleParticipantsUpdated = useCallback(() => {
    // console.log("🔄 Participants update requested by child component");
    // Use forced refresh to bypass throttling
    loadLiveParticipants(true);
  }, [loadLiveParticipants]);

  const getParticipantDisplayName = useCallback((participant) => {
    if (!participant) return "Unknown User";
    return (
      participant.full_name ||
      participant.Full_Name ||
      participant.name ||
      participant.displayName ||
      participant.username ||
      participant.user_name ||
      "Unknown User"
    );
  }, []);

  const showAudioInitStatus = useCallback((status) => {
    setAudioInitStatus(status);
    setShowAudioStatus(true);
    setTimeout(() => setShowAudioStatus(false), 3000);
  }, []);


  
  const handleAttendanceViolation = useCallback(
    (violation) => {
      showNotificationMessage(
        violation.message,
        violation.type === "error" ? "error" : "warning"
      );

      if (violation.attendanceData) {
        setCurrentAttendanceData((prev) => ({
          ...prev,
          ...violation.attendanceData,
        }));
      }
    },
    [showNotificationMessage]
  );

  const handleAttendanceStatusChange = useCallback(
    (status) => {
      setCurrentAttendanceData((prev) => ({
        ...prev,
        ...status,
      }));

      if (status.sessionActive === false) {
        showNotificationMessage(
          "AI Attendance session ended due to violations",
          "error"
        );
      }
    },
    [showNotificationMessage]
  );




  const handleAttendanceSessionTerminated = useCallback(
    async (terminationData) => {
      // console.log(
      //   "🚨 MEETING ROOM: Attendance session terminated:",
      //   terminationData
      // );

      // Only process if this is for the current user
      if (terminationData.userId?.toString() !== currentUser?.id?.toString()) {
        // console.log("Termination not for current user, ignoring");
        return;
      }

      // console.log(
      //   "🚪 FORCING PARTICIPANT REMOVAL due to attendance violations"
      // );

      // Show immediate notification
      showNotificationMessage(
        terminationData.message ||
        "You have been removed from the meeting due to attendance violations",
        "error"
      );

      // Disable all controls immediately
      setAttendanceEnabled(false);
      setVideoEnabled(false);
      setAudioEnabled(false);

      // Wait 3 seconds then force disconnect and refresh
      setTimeout(async () => {
        try {
          // console.log(
          //   "🔌 Force disconnecting participant due to attendance violations..."
          // );

          // Record the forced leave
          if (realMeetingId && currentUser?.id) {
            try {
              await participantsAPI.recordLeave({
                meetingId: realMeetingId,
                userId: currentUser.id,
                participant_id: participantId || `removed_${currentUser.id}`,
                manual_leave: false,
                reason: "attendance_violation_removal",
                leave_type: "forced_removal",
                violation_reason:
                  terminationData.reason || "continuous_violations",
              });
              // console.log("✅ Forced leave recorded successfully");
            } catch (recordError) {
              // console.error("❌ Failed to record forced leave:", recordError);
            }
          }

          // // Clean up attendance tracking
          // if (endMeetingReactions) {
          //   await endMeetingReactions();
          // }

          // Disconnect from LiveKit
          if (disconnectFromRoom) {
            await disconnectFromRoom();
          }

          // Stop all media tracks
          if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
          }

          // Force refresh the entire application
          // console.log(
          //   "🔄 FORCE REFRESHING APPLICATION after attendance violation removal..."
          // );
          window.location.reload();
        } catch (error) {
          // console.error("❌ Error during forced removal:", error);
          // Force refresh even if cleanup fails
          window.location.reload();
        }
      }, 3000);
    },
    [
      currentUser?.id,
      realMeetingId,
      participantId,
      showNotificationMessage,
      // endMeetingReactions,
      disconnectFromRoom,
      localStream,
    ]
  );

  // FIXED: Enhanced loadCoHosts function with proper privilege activation
  // UPDATED: Enhanced loadCoHosts function with screen share privilege activation
  const loadCoHosts = useCallback(async () => {
    if (!realMeetingId) return;

    try {
      setCoHostLoading(true);
      const response = await meetingsAPI.getCoHosts(realMeetingId);

      // console.log("Co-hosts loaded:", response);
      const cohostList = response.cohosts || [];
      setCoHosts(cohostList);

      // Check if current user is a co-host
      const currentUserIsCoHost = cohostList.some((cohost) => {
        const cohostUserId = (cohost.user_id || cohost.User_ID)?.toString();
        const currentUserId = currentUser?.id?.toString();

        // console.log("Co-host check:", {
        //   cohostUserId,
        //   currentUserId,
        //   match: cohostUserId === currentUserId,
        // });

        return cohostUserId === currentUserId;
      });

      // UPDATED: Update co-host status with IMMEDIATE privilege activation including screen share
      if (currentUserIsCoHost !== isCoHost) {
        setIsCoHost(currentUserIsCoHost);
        setCoHostPrivilegesActive(currentUserIsCoHost); // IMMEDIATE activation

        // UPDATED: Notify LiveKit hook about co-host status change for screen share permissions
        if (updateCoHostStatus && typeof updateCoHostStatus === "function") {
          updateCoHostStatus(currentUserIsCoHost);
        }

        if (currentUserIsCoHost) {
          // console.log(
          //   "PROMOTED TO CO-HOST - ACTIVATING ALL PRIVILEGES INCLUDING SCREEN SHARE"
          // );
          showNotificationMessage("You are now a co-host", "success");
        } else if (isCoHost && !currentUserIsCoHost) {
          // console.log(
          //   "DEMOTED FROM CO-HOST - REMOVING ALL PRIVILEGES INCLUDING SCREEN SHARE"
          // );
          showNotificationMessage(
            "Co-host privileges have been removed ",
            "info"
          );
          setCoHostPrivilegesActive(false);

          // Reset screen share permissions for demoted co-host
          if (updateCoHostStatus && typeof updateCoHostStatus === "function") {
            updateCoHostStatus(false);
          }
        }
      }
    } catch (error) {
      // console.error("Failed to load co-hosts:", error);
      setCoHosts([]);
      setIsCoHost(false);
      setCoHostPrivilegesActive(false);

      // Reset screen share permissions on error
      if (updateCoHostStatus && typeof updateCoHostStatus === "function") {
        updateCoHostStatus(false);
      }
    } finally {
      setCoHostLoading(false);
    }
  }, [
    realMeetingId,
    currentUser?.id,
    isCoHost,
    showNotificationMessage,
    updateCoHostStatus,
  ]);

  // FIXED: Host can promote to co-host
  const handlePromoteToCoHost = useCallback(
    async (participantData) => {
      if (!canMakeCoHost) {
        showNotificationMessage(
          "Only the host can assign co-host roles",
          "error"
        );
        return { success: false, error: "Only host can assign co-hosts" };
      }

      try {
        const userId =
          participantData.userId ||
          participantData.user_id ||
          participantData.participantId;
        const participant = participantData.participant || participantData;
        const userName =
          participant?.displayName ||
          participant?.name ||
          participant?.full_name ||
          `User ${userId}`;

        // console.log("🚀 Host promoting to co-host:", {
        //   meetingId: realMeetingId,
        //   userId,
        //   userName,
        //   assignedBy: currentUser.id,
        // });

        const response = await meetingsAPI.assignCoHost(
          realMeetingId,
          userId,
          currentUser.id,
          userName
        );

        // console.log("✅ Co-host assignment successful:", response);
        showNotificationMessage(
          `${userName} is now a co-host with full privileges!`,
          "success"
        );

        // Reload to update UI
        await Promise.all([loadCoHosts(), loadLiveParticipants()]);

        return { success: true, response };
      } catch (error) {
        // console.error("❌ Failed to promote to co-host:", error);
        const errorMessage =
          error.response?.data?.error ||
          error.message ||
          "Failed to assign co-host";
        showNotificationMessage(
          `Failed to assign co-host: ${errorMessage}`,
          "error"
        );
        return { success: false, error: errorMessage };
      }
    },
    [
      canMakeCoHost,
      realMeetingId,
      currentUser?.id,
      showNotificationMessage,
      loadCoHosts,
      loadLiveParticipants,
    ]
  );

  // Helper function to get menu item colors
  const getMenuItemColor = (label) => {
    if (label.includes('Recording')) return '#ef4444';
    if (label.includes('Whiteboard')) return '#8b5cf6';
    if (label.includes('Attendance')) return '#22c55e';
    if (label.includes('Copy') || label.includes('Share')) return '#3b82f6';
    if (label.includes('End Meeting')) return '#dc2626';
    if (label.includes('Fullscreen')) return '#6b7280';
    return '#6b7280'; // Default gray
  };

  // FIXED: Enhanced participant removal that actually kicks participants from LiveKit
  const handleRemoveParticipant = useCallback(
    async (participantData) => {
      if (!hasHostPrivileges) {
        showNotificationMessage(
          "Only hosts and co-hosts can remove participants",
          "error"
        );
        return { success: false, error: "Insufficient permissions" };
      }

      try {
        const userId =
          participantData.userId ||
          participantData.user_id ||
          participantData.participantId ||
          participantData.id ||
          (participantData.participant &&
            (participantData.participant.user_id ||
              participantData.participant.User_ID ||
              participantData.participant.id));

        const participant = participantData.participant || participantData;
        const userName =
          participant?.displayName ||
          participant?.name ||
          participant?.full_name ||
          participant?.Full_Name ||
          `User ${userId}`;

        // console.log("MeetingRoom: Starting participant removal process:", {
        //   meetingId: realMeetingId,
        //   userId,
        //   userName,
        //   removedBy: currentUser.id,
        //   removerRole: effectiveRole,
        //   participantData: participantData,
        // });

        if (userId?.toString() === currentUser?.id?.toString()) {
          showNotificationMessage(
            "You cannot remove yourself from the meeting",
            "error"
          );
          return { success: false, error: "Cannot remove self" };
        }

        if (participant.role === "host" || participant.isHost) {
          showNotificationMessage(
            "Cannot remove another host from the meeting",
            "error"
          );
          return { success: false, error: "Cannot remove host" };
        }

        // STEP 1: IMMEDIATE UI UPDATE - Remove from local state first
        // console.log("MeetingRoom: Immediately removing participant from UI");
        setLiveParticipants((prev) => {
          const updated = prev.filter((p) => {
            const pUserId = p.User_ID || p.user_id || p.ID;
            return pUserId?.toString() !== userId?.toString();
          });
          // console.log("MeetingRoom: Local participants updated immediately:", {
          //   before: prev.length,
          //   after: updated.length,
          //   removedUserId: userId,
          // });
          return updated;
        });

        // Update participant stats immediately
        setParticipantStats((prev) => ({
          ...prev,
          total: Math.max(0, prev.total - 1),
          active: Math.max(0, prev.active - 1),
        }));

        // STEP 2: GLOBAL EVENT DISPATCH for immediate UI updates across all components
        // console.log("MeetingRoom: Dispatching global removal events");

        // Primary removal event
        window.dispatchEvent(
          new CustomEvent("participantRemoved", {
            detail: {
              removedUserId: userId,
              removedUserName: userName,
              removedBy: currentUser.id,
              removedByName: getParticipantDisplayName(currentUser),
              timestamp: Date.now(),
              meetingId: realMeetingId,
              immediate: true,
            },
          })
        );

        // Secondary events for different components
        window.dispatchEvent(
          new CustomEvent("participantListChanged", {
            detail: {
              action: "remove",
              userId: userId,
              timestamp: Date.now(),
              source: "host_removal",
            },
          })
        );

        window.dispatchEvent(
          new CustomEvent("refreshParticipantNames", {
            detail: {
              reason: "participant_removed",
              removedUserId: userId,
              timestamp: Date.now(),
            },
          })
        );

        // STEP 3: Show immediate feedback
        showNotificationMessage(
          `Removing ${userName} from the meeting...`,
          "info"
        );

        // STEP 4: Send LiveKit disconnection signal
        if (room && room.localParticipant) {
          try {
            const encoder = new TextEncoder();
            const removalData = encoder.encode(
              JSON.stringify({
                type: "participant_removed",
                target_user_id: userId,
                target_user_name: userName,
                removed_by: currentUser.id,
                removed_by_name: getParticipantDisplayName(currentUser),
                reason: "removed_by_host_or_cohost",
                message: `You have been removed from the meeting by ${effectiveRole}`,
                timestamp: Date.now(),
                force_disconnect: true,
                meeting_id: realMeetingId,
              })
            );

            room.localParticipant.publishData(
              removalData,
              DataPacket_Kind.RELIABLE
            );

            // console.log(
            //   "MeetingRoom: Removal signal sent via LiveKit data channel"
            // );
          } catch (signalError) {
            // console.error(
            //   "MeetingRoom: Failed to send removal signal:",
            //   signalError
            // );
          }
        }

        // STEP 5: Call backend API to remove participant
        try {
          const response = await meetingsAPI.removeParticipantFromMeeting(
            realMeetingId,
            userId,
            currentUser.id,
            "removed_by_host_or_cohost"
          );

          // console.log("MeetingRoom: Backend removal API response:", response);

          if (response.success) {
            // console.log("MeetingRoom: Backend removal confirmed successful");

            showNotificationMessage(
              `${userName} has been removed from the meeting and disconnected`,
              "success"
            );

            // STEP 6: Force refresh from backend after short delay to ensure consistency
            setTimeout(async () => {
              try {
                // console.log(
                //   "MeetingRoom: Force reloading participants from backend"
                // );
                await loadLiveParticipants();

                // Additional global refresh event
                window.dispatchEvent(
                  new CustomEvent("participantListChanged", {
                    detail: {
                      action: "backend_refresh",
                      timestamp: Date.now(),
                      source: "post_removal_sync",
                    },
                  })
                );
              } catch (error) {
                console.error(
                  "MeetingRoom: Failed to reload participants:",
                  error
                );
              }
            }, 1000);

            return { success: true, response };
          } else {
            // Backend failed - restore participant to UI
            console.error(
              "MeetingRoom: Backend removal failed, restoring participant"
            );
            await loadLiveParticipants(); // Reload to restore state
            throw new Error(response.message || "Unknown error from backend");
          }
        } catch (apiError) {
          console.error("MeetingRoom: Backend API error:", apiError);

          // Restore participant to UI if backend fails
          // console.log(
          //   "MeetingRoom: Restoring participant due to backend failure"
          // );
          await loadLiveParticipants();

          const errorMessage =
            apiError.response?.data?.error ||
            apiError.message ||
            "Failed to remove participant";
          showNotificationMessage(
            `Failed to remove participant: ${errorMessage}`,
            "error"
          );
          return { success: false, error: errorMessage };
        }
      } catch (error) {
        console.error("MeetingRoom: Failed to remove participant:", error);

        // Restore state on any error
        await loadLiveParticipants();

        const errorMessage =
          error.response?.data?.error ||
          error.message ||
          "Failed to remove participant";
        showNotificationMessage(
          `Failed to remove participant: ${errorMessage}`,
          "error"
        );
        return { success: false, error: errorMessage };
      }
    },
    [
      hasHostPrivileges,
      realMeetingId,
      currentUser?.id,
      showNotificationMessage,
      loadLiveParticipants,
      effectiveRole,
      room,
      getParticipantDisplayName,
      setLiveParticipants,
      setParticipantStats,
    ]
  );

  // FIXED: Enhanced handleRemoveCoHost function around line 520
  const handleRemoveCoHost = useCallback(
    async (userId, userName) => {
      if (!canRemoveCoHost) {
        showNotificationMessage(
          "Only the original host can remove co-host privileges",
          "error"
        );
        return { success: false, error: "Only host can remove co-hosts" };
      }

      try {
        // console.log("🗑️ Host removing co-host:", {
        //   meetingId: realMeetingId,
        //   userId,
        //   userName,
        //   removedBy: currentUser.id,
        //   removerIsHost: isHost,
        // });

        const response = await meetingsAPI.removeCoHost(
          realMeetingId,
          userId,
          currentUser.id
        );

        // console.log("✅ Co-host removal successful:", response);
        showNotificationMessage(
          `Removed co-host privileges from ${userName}`,
          "success"
        );

        // Reload co-hosts and participants
        await Promise.all([loadCoHosts(), loadLiveParticipants()]);

        return { success: true, response };
      } catch (error) {
        // console.error("❌ Failed to remove co-host:", error);
        const errorMessage =
          error.response?.data?.error ||
          error.message ||
          "Failed to remove co-host";
        showNotificationMessage(
          `Failed to remove co-host: ${errorMessage}`,
          "error"
        );
        return { success: false, error: errorMessage };
      }
    },
    [
      canRemoveCoHost,
      realMeetingId,
      currentUser?.id,
      showNotificationMessage,
      loadCoHosts,
      loadLiveParticipants,
      isHost,
    ]
  );

  const handleRoleChangeDialog = useCallback((participant, action) => {
    setSelectedParticipantForRole(participant);
    setRoleChangeAction(action);
    setShowCoHostDialog(true);
  }, []);
  // Screen Share Permission Handlers
  const handleScreenShareRequestReceived = useCallback(() => {
    if (hasHostPrivileges && currentScreenShareRequest) {
      // FIXED: Co-hosts can also approve
      setShowScreenShareRequest(true);
    }
  }, [hasHostPrivileges, currentScreenShareRequest]);

  const handleApproveScreenShare = useCallback(async () => {
    if (!currentScreenShareRequest) return;

    try {
      await approveScreenShareRequest(
        currentScreenShareRequest.request_id,
        currentScreenShareRequest.user_id
      );
      setShowScreenShareRequest(false);
      showNotificationMessage(
        `Approved screen share for ${currentScreenShareRequest.user_name}`,
        "success"
      );
    } catch (error) {
      console.error("Failed to approve screen share:", error);
      showNotificationMessage(
        "Failed to approve screen share request",
        "error"
      );
    }
  }, [
    currentScreenShareRequest,
    approveScreenShareRequest,
    showNotificationMessage,
  ]);

  const handleDenyScreenShare = useCallback(async () => {
    if (!currentScreenShareRequest) return;

    try {
      await denyScreenShareRequest(
        currentScreenShareRequest.request_id,
        currentScreenShareRequest.user_id
      );
      setShowScreenShareRequest(false);
      showNotificationMessage(
        `Denied screen share for ${currentScreenShareRequest.user_name}`,
        "info"
      );
    } catch (error) {
      console.error("Failed to deny screen share:", error);
      showNotificationMessage("Failed to deny screen share request", "error");
    }
  }, [
    currentScreenShareRequest,
    denyScreenShareRequest,
    showNotificationMessage,
  ]);

  // Queue handling
  const handleQueueStatus = useCallback(
    (status) => {
      if (!status) return;

      setQueuePosition(status.position || 0);
      setEstimatedWaitTime(status.estimated_wait || 0);

      if (status.status === "queued" && status.position > 0) {
        setShowQueueOverlay(true);
        showNotificationMessage(
          `You are #${status.position} in the connection queue. Estimated wait: ${status.estimated_wait}s`,
          "info"
        );
      } else if (status.status === "allowed") {
        setShowQueueOverlay(false);
        showNotificationMessage(
          "Connection allowed, joining meeting...",
          "success"
        );
      }
    },
    [showNotificationMessage]
  );

  const updatePerformanceMetrics = useCallback(() => {
    setPerformanceMetrics((prev) => ({
      ...prev,
      participants: participantCount || 0,
      mode: currentPerformanceMode,
      maxParticipants: currentMaxParticipants,
    }));

    if (participantCount > 40) {
      setPerformanceWarning(
        "High participant count - performance may be affected"
      );
    } else if (
      participantCount > 30 &&
      currentPerformanceMode !== "optimized"
    ) {
      setPerformanceWarning(
        "Consider enabling performance mode for better stability"
      );
    } else {
      setPerformanceWarning(null);
    }
  }, [participantCount, currentPerformanceMode, currentMaxParticipants]);

  // Enhanced stream mapping
  const createEnhancedStreamMapping = useMemo(() => {
    const streamMap = new Map();

    if (
      streamCacheRef.current.size > 0 &&
      streamCacheRef.current._timestamp &&
      Date.now() - streamCacheRef.current._timestamp < 100
    ) {
      return streamCacheRef.current;
    }

    try {
      if (localParticipant && room) {
        if (typeof localParticipant.getTrackPublication === "function") {
          const localVideoTrack = localParticipant.getTrackPublication(
            Track.Source.Camera
          );
          const localAudioTrack = localParticipant.getTrackPublication(
            Track.Source.Microphone
          );
          const localScreenTrack = localParticipant.getTrackPublication(
            Track.Source.ScreenShare
          );

          if (
            localVideoTrack?.track?.mediaStreamTrack ||
            localAudioTrack?.track?.mediaStreamTrack
          ) {
            const stream = new MediaStream();

            if (localVideoTrack?.track?.mediaStreamTrack) {
              stream.addTrack(localVideoTrack.track.mediaStreamTrack);
            }

            if (localAudioTrack?.track?.mediaStreamTrack) {
              stream.addTrack(localAudioTrack.track.mediaStreamTrack);
            }

            const userId = currentUser?.id || "local";
            streamMap.set(userId.toString(), stream);
          }

          if (localScreenTrack?.track?.mediaStreamTrack) {
            const screenStream = new MediaStream([
              localScreenTrack.track.mediaStreamTrack,
            ]);
            const screenKey = `${currentUser?.id || "local"}_screen`;
            streamMap.set(screenKey, screenStream);
          }
        }
      }

      if (remoteParticipants?.size > 0) {
        remoteParticipants.forEach((participant, participantSid) => {
          try {
            if (typeof participant.getTrackPublication !== "function") {
              return;
            }

            const videoTrack = participant.getTrackPublication(
              Track.Source.Camera
            );
            const audioTrack = participant.getTrackPublication(
              Track.Source.Microphone
            );
            const screenTrack = participant.getTrackPublication(
              Track.Source.ScreenShare
            );

            let userId = participant.identity;
            if (participant.identity?.includes("user_")) {
              userId = participant.identity.split("_")[1];
            }

            if (userId === currentUser?.id?.toString()) return;

            if (
              videoTrack?.track?.mediaStreamTrack ||
              audioTrack?.track?.mediaStreamTrack
            ) {
              const stream = new MediaStream();

              if (videoTrack?.track?.mediaStreamTrack) {
                stream.addTrack(videoTrack.track.mediaStreamTrack);
              }

              if (audioTrack?.track?.mediaStreamTrack) {
                stream.addTrack(audioTrack.track.mediaStreamTrack);
              }

              streamMap.set(userId.toString(), stream);
              streamMap.set(participantSid, stream);
            }

            if (screenTrack?.track?.mediaStreamTrack) {
              const screenStream = new MediaStream([
                screenTrack.track.mediaStreamTrack,
              ]);
              streamMap.set(`${userId}_screen`, screenStream);
            }
          } catch (error) {
            console.error("Error processing participant stream:", error);
          }
        });
      }

      const livekitScreenStream = getScreenShareStream?.();
      if (livekitScreenStream) {
        streamMap.set("screen_share_active", livekitScreenStream);
      }

      if (streamMap.size > PERFORMANCE_CONFIG.STREAM_CACHE_SIZE) {
        const entries = Array.from(streamMap.entries());
        const newMap = new Map(
          entries.slice(-PERFORMANCE_CONFIG.STREAM_CACHE_SIZE)
        );
        streamMap.clear();
        newMap.forEach((value, key) => streamMap.set(key, value));
      }

      streamCacheRef.current = streamMap;
      streamCacheRef.current._timestamp = Date.now();
    } catch (error) {
      console.error("Stream mapping error:", error);
    }

    return streamMap;
  }, [
    localParticipant,
    remoteParticipants,
    room,
    currentUser,
    localTracks,
    getScreenShareStream,
  ]);

  // Enhanced participant processing with co-host information
  const allParticipants = useMemo(() => {
    const participantMap = new Map();

    // Process database participants with role and co-host information
    liveParticipants.forEach((p) => {
      const key = p.User_ID || p.ID || p.user_id;
      if (!key) return;

      const isParticipantCoHost = coHosts.some(
        (cohost) => cohost.user_id?.toString() === key.toString()
      );

      participantMap.set(key.toString(), {
        ...p,
        id: key,
        user_id: key,
        participant_id: p.ID || `db_${key}`,
        full_name: getParticipantDisplayName(p),
        name: getParticipantDisplayName(p),
        displayName: getParticipantDisplayName(p),
        role: p.Role || "participant",
        isHost: p.Role === "host",
        isCoHost: isParticipantCoHost,
        effectiveRole:
          p.Role === "host"
            ? "host"
            : isParticipantCoHost
              ? "co-host"
              : "participant",
        isVideoEnabled: p.video_enabled || p.isVideoEnabled || false,
        isAudioEnabled: p.audio_enabled || p.isAudioEnabled || false,
        video_enabled: p.video_enabled || p.isVideoEnabled || false,
        audio_enabled: p.audio_enabled || p.isAudioEnabled || false,
        isLocal: p.User_ID == currentUser?.id || p.user_id == currentUser?.id,
        Status: p.Status || "online",
        LiveKit_Connected: p.LiveKit_Connected || false,
        stream: null,
        connection_id: p.User_ID || p.ID,
        isScreenSharing: false,
      });
    });

    // Process current user with role information
    if (currentUser) {
      const localKey = currentUser.id?.toString();
      const displayName = getParticipantDisplayName(currentUser);
      const localStreamFromLiveKit =
        createEnhancedStreamMapping.get(localKey) ||
        createEnhancedStreamMapping.get(currentUser.id) ||
        localStream;

      const isLocalScreenSharing =
        livekitLocalIsScreenSharing ||
        (localParticipant &&
          typeof localParticipant.getTrackPublication === "function" &&
          !!localParticipant.getTrackPublication(Track.Source.ScreenShare)
            ?.track);

      participantMap.set(localKey, {
        id: currentUser.id,
        user_id: currentUser.id,
        participant_id: `local_${currentUser.id}`,
        connection_id: `participant_${currentUser.id}`,
        full_name: displayName,
        name: displayName,
        displayName: displayName,
        email: currentUser.email || "",
        isLocal: true,
        isVideoEnabled: videoEnabled,
        isAudioEnabled: audioEnabled,
        video_enabled: videoEnabled,
        audio_enabled: audioEnabled,
        role: isHost ? "host" : "participant",
        isHost: isHost,
        isCoHost: isCoHost,
        effectiveRole: isHost ? "host" : isCoHost ? "co-host" : "participant",
        stream: localStreamFromLiveKit,
        isScreenSharing: isLocalScreenSharing,
        connectionQuality: "good",
        Status: actualIsConnected ? "live" : "connecting",
        LiveKit_Connected: actualIsConnected,
      });
    }

    // Process remote participants
    if (remoteParticipants?.size > 0) {
      remoteParticipants.forEach((participant, participantSid) => {
        let userId = participant.identity;
        if (participant.identity?.includes("user_")) {
          userId = participant.identity.split("_")[1];
        }

        const userKey = userId?.toString();
        if (userKey === currentUser?.id?.toString()) return;

        const isParticipantScreenSharing =
          typeof participant.getTrackPublication === "function" &&
          !!participant.getTrackPublication(Track.Source.ScreenShare)?.track;

        const existingParticipant = participantMap.get(userKey);
        const participantStream =
          createEnhancedStreamMapping.get(userKey) ||
          createEnhancedStreamMapping.get(userId) ||
          remoteStreams.get(participantSid);

        let displayName = participant.name || existingParticipant?.full_name;
        if (!displayName || displayName === `User ${userId}`) {
          displayName =
            existingParticipant?.Full_Name ||
            existingParticipant?.name ||
            participant.name ||
            `User ${userId}`;
        }

        const participantRole = existingParticipant?.role || "participant";
        const participantIsHost =
          existingParticipant?.isHost || participantRole === "host";
        const participantIsCoHost = coHosts.some(
          (cohost) => cohost.user_id?.toString() === userId?.toString()
        );

        participantMap.set(userKey, {
          ...existingParticipant,
          id: userId,
          user_id: userId,
          participant_id: participantSid,
          connection_id: participantSid,
          full_name: displayName,
          name: displayName,
          displayName: displayName,
          isLocal: false,
          isVideoEnabled: participant.isCameraEnabled || false,
          isAudioEnabled: participant.isMicrophoneEnabled || false,
          video_enabled: participant.isCameraEnabled || false,
          audio_enabled: participant.isMicrophoneEnabled || false,
          role: participantRole,
          isHost: participantIsHost,
          isCoHost: participantIsCoHost,
          effectiveRole:
            participantRole === "host"
              ? "host"
              : participantIsCoHost
                ? "co-host"
                : "participant",
          Status: "live",
          LiveKit_Connected: true,
          connectionQuality: "good",
          stream: participantStream,
          isScreenSharing: isParticipantScreenSharing,
        });
      });
    }

    // Handle screen sharing participant
    if (livekitScreenSharingParticipant) {
      const sharingUserId =
        livekitScreenSharingParticipant.userId ||
        livekitScreenSharingParticipant.sid;

      if (livekitScreenSharingParticipant.isLocal && currentUser) {
        const localKey = currentUser.id?.toString();
        const localParticipant = participantMap.get(localKey);
        if (localParticipant) {
          participantMap.set(localKey, {
            ...localParticipant,
            isScreenSharing: true,
          });
        }
      } else if (sharingUserId) {
        const participantKey = sharingUserId.toString();
        const remoteParticipant = participantMap.get(participantKey);
        if (remoteParticipant) {
          participantMap.set(participantKey, {
            ...remoteParticipant,
            isScreenSharing: true,
          });
        }
      }
    }

    const processedParticipants = Array.from(participantMap.values());

    // Sort participants: local first, then hosts, then co-hosts, then others
    processedParticipants.sort((a, b) => {
      if (a.isLocal && !b.isLocal) return -1;
      if (!a.isLocal && b.isLocal) return 1;
      if (a.role === "host" && b.role !== "host") return -1;
      if (a.role !== "host" && b.role === "host") return 1;
      if (a.isCoHost && !b.isCoHost) return -1;
      if (!a.isCoHost && b.isCoHost) return 1;
      return (a.displayName || "").localeCompare(b.displayName || "");
    });

    return processedParticipants;
  }, [
    liveParticipants,
    currentUser,
    localStream,
    videoEnabled,
    audioEnabled,
    isHost,
    isCoHost,
    coHosts,
    remoteParticipants,
    actualIsConnected,
    createEnhancedStreamMapping,
    remoteStreams,
    localParticipant,
    livekitScreenSharingParticipant,
    livekitLocalIsScreenSharing,
    getParticipantDisplayName,
  ]);

  // Enhanced screen share data
  const enhancedScreenShareData = useMemo(() => {
    if (livekitScreenSharingParticipant || livekitLocalIsScreenSharing) {
      const screenStream =
        getScreenShareStream?.() ||
        createEnhancedStreamMapping.get("screen_share_active");

      if (screenStream) {
        return {
          stream: screenStream,
          sharer: livekitScreenSharingParticipant || {
            name: currentUser?.name || currentUser?.full_name || "You",
            user_id: currentUser?.id,
            connection_id: currentUser?.id,
            participant_id: `local_${currentUser?.id}`,
            isLocal: true,
          },
        };
      }
    }

    if (remoteParticipants?.size > 0) {
      for (const [participantSid, participant] of remoteParticipants) {
        if (typeof participant.getTrackPublication === "function") {
          const screenSharePub = participant.getTrackPublication(
            Track.Source.ScreenShare
          );
          if (screenSharePub?.track?.mediaStreamTrack) {
            const screenStream = new MediaStream([
              screenSharePub.track.mediaStreamTrack,
            ]);
            let userId = participant.identity;
            if (participant.identity?.includes("user_")) {
              userId = participant.identity.split("_")[1];
            }

            return {
              stream: screenStream,
              sharer: {
                name: participant.name || participant.identity || "Remote User",
                user_id: userId,
                connection_id: participantSid,
                participant_id: participantSid,
                isLocal: false,
              },
            };
          }
        }
      }
    }

    if (screenShareStream) {
      return {
        stream: screenShareStream,
        sharer: screenSharer || { name: "Unknown", user_id: "unknown" },
      };
    }

    return { stream: null, sharer: null };
  }, [
    livekitScreenSharingParticipant,
    livekitLocalIsScreenSharing,
    getScreenShareStream,
    createEnhancedStreamMapping,
    screenShareStream,
    screenSharer,
    currentUser,
    localParticipant,
    remoteParticipants,
  ]);

  // Combined streams for VideoGrid
  const combinedStreams = useMemo(() => {
    const combined = new Map();

    createEnhancedStreamMapping.forEach((stream, key) => {
      combined.set(key, stream);
    });

    remoteStreams.forEach((stream, key) => {
      if (!combined.has(key)) {
        combined.set(key, stream);
      }
    });

    if (localStream && currentUser) {
      const localKey = currentUser.id || "local";
      if (!combined.has(localKey)) {
        combined.set(localKey, localStream);
      }
    }

    return combined;
  }, [createEnhancedStreamMapping, remoteStreams, localStream, currentUser]);

  // Connection establishment with disabled audio/video
  // REPLACE this function in MeetingRoom.jsx around line 1500
  const establishLiveKitConnection = useCallback(async () => {
    if (connectionAttemptRef.current || actualIsConnected || isConnecting) {
      return;
    }

    if (!realMeetingId || !currentUser) {
      return;
    }

    if (connectionRetryCountRef.current >= PERFORMANCE_CONFIG.MAX_RETRIES) {
      showNotificationMessage(
        "Failed to connect after multiple attempts. Please refresh the page.",
        "error"
      );
      return;
    }

    try {
      connectionAttemptRef.current = true;
      connectionRetryCountRef.current += 1;
      setConnectionProgress(10);

      if (checkConnectionQueue && typeof checkConnectionQueue === "function") {
        try {
          setConnectionProgress(20);
          const queueStatus = await checkConnectionQueue(
            realMeetingId,
            currentUser.id
          );
          handleQueueStatus(queueStatus.queue_status);

          if (queueStatus.queue_status?.status === "queued") {
            return;
          }
        } catch (queueError) {
          console.warn(
            "Queue check failed, proceeding with direct connection:",
            queueError
          );
        }
      }

      setConnectionProgress(40);

      const connectionResult = await connectToRoom(
        realMeetingId,
        currentUser.id,
        getParticipantDisplayName(currentUser),
        {
          isHost: isHost,
          enableAudio: false, // Start muted
          enableVideo: false, // Start with camera off
          skipQueue: false,
        }
      );

      setConnectionProgress(80);

      if (connectionResult?.success) {
        hasInitialConnectionRef.current = true;
        connectionRetryCountRef.current = 0;
        setConnectionProgress(100);

        // CRITICAL FIX: Auto-publish media tracks for recording bot detection
        // console.log("🎥 Auto-publishing media tracks for recording bot...");

        // Start with tracks OFF but PUBLISHED (for recording bot)
        setAudioEnabled(false);
        setVideoEnabled(false);
        audioInitializedRef.current = false;
        videoInitializedRef.current = false;
        showAudioInitStatus("Microphone muted");

        // Delay to ensure room is fully established
        setTimeout(async () => {
          try {
            // console.log(
            //   "🚀 Publishing media tracks for recording detection..."
            // );

            // Enable and publish video track (but keep it muted visually)
            if (enableVideo && typeof enableVideo === "function") {
              const videoResult = await enableVideo();
              if (videoResult) {
                // console.log("✅ Video track published for recording bot");
                // Immediately mute it visually but keep published
                if (livekitToggleVideo) {
                  await livekitToggleVideo(); // This will mute it
                  setVideoEnabled(false); // Update UI state
                }
              }
            }

            // Enable and publish audio track (but keep it muted)
            if (enableAudio && typeof enableAudio === "function") {
              const audioResult = await enableAudio();
              if (audioResult) {
                // console.log("✅ Audio track published for recording bot");
                // Immediately mute it but keep published
                if (livekitToggleAudio) {
                  await livekitToggleAudio(); // This will mute it
                  setAudioEnabled(false); // Update UI state
                }
              }
            }

            // Verify tracks are published after 3 seconds
            setTimeout(() => {
              if (room && room.localParticipant) {
                const videoTrack =
                  room.localParticipant.getTrackPublication("camera");
                const audioTrack =
                  room.localParticipant.getTrackPublication("microphone");

                // console.log("📊 RECORDING BOT VERIFICATION:", {
                //   participantSid: room.localParticipant.sid,
                //   participantIdentity: room.localParticipant.identity,
                //   totalTracksPublished: room.localParticipant.tracks.size,
                //   videoPublished: !!videoTrack?.track,
                //   audioPublished: !!audioTrack?.track,
                //   videoMuted: videoTrack?.track?.isMuted,
                //   audioMuted: audioTrack?.track?.isMuted,
                //   readyForRecording: !!(videoTrack?.track || audioTrack?.track),
                // });

                if (videoTrack?.track || audioTrack?.track) {
                  showNotificationMessage(
                    "Connected - media ready for recording (mic/camera off)",
                    "success"
                  );
                } else {
                  console.warn(
                    "❌ No tracks published - recording bot won't detect content"
                  );
                  showNotificationMessage(
                    "Connected but recording may not work properly",
                    "warning"
                  );
                }
              }
            }, 3000);
          } catch (mediaError) {
            console.error(
              "❌ Failed to auto-publish media tracks:",
              mediaError
            );
            showNotificationMessage(
              "Connected but media setup failed - recording may not work",
              "warning"
            );
          }
        }, 1000);

        showNotificationMessage(
          "Connected to meeting - setting up media for recording...",
          "info"
        );
        setShowQueueOverlay(false);

        if (participantsAPI.recordJoin) {
          await participantsAPI.recordJoin({
            meetingId: realMeetingId,
            userId: currentUser.id,
            userName: getParticipantDisplayName(currentUser),
            isHost: isHost,
            participant_identity: connectionResult.participantIdentity,
          });
        }

        await loadCoHosts();
      }
    } catch (error) {
      console.error("Connection failed:", error);

      if (connectionRetryCountRef.current < PERFORMANCE_CONFIG.MAX_RETRIES) {
        showNotificationMessage(
          `Connection failed. Retrying... (${connectionRetryCountRef.current}/${PERFORMANCE_CONFIG.MAX_RETRIES})`,
          "warning"
        );

        setTimeout(() => {
          connectionAttemptRef.current = false;
          establishLiveKitConnection();
        }, PERFORMANCE_CONFIG.CONNECTION_RETRY_DELAY * connectionRetryCountRef.current);
      } else {
        showNotificationMessage(`Connection failed: ${error.message}`, "error");
        setConnectionProgress(0);
      }
    } finally {
      connectionAttemptRef.current = false;
    }
  }, [
    realMeetingId,
    currentUser,
    actualIsConnected,
    isConnecting,
    connectToRoom,
    isHost,
    showNotificationMessage,
    getParticipantDisplayName,
    checkConnectionQueue,
    handleQueueStatus,
    showAudioInitStatus,
    loadCoHosts,
    enableVideo,
    enableAudio,
    livekitToggleVideo,
    livekitToggleAudio,
    room,
  ]);

  // Audio toggle with track creation only when unmuting
  const handleToggleAudio = useMemo(
    () =>
      throttle(async () => {
        try {
          if (!isConnectionReady) {
            showNotificationMessage(
              "Please wait for connection to establish",
              "warning"
            );
            return;
          }

          if (
            !audioEnabled &&
            enableAudio &&
            typeof enableAudio === "function"
          ) {
            showAudioInitStatus("Enabling microphone...");
            const result = await enableAudio();
            if (result) {
              setAudioEnabled(true);
              audioInitializedRef.current = true;
              showAudioInitStatus("Microphone enabled");
              showNotificationMessage("Microphone unmuted");
              return;
            }
          }

          if (livekitToggleAudio && typeof livekitToggleAudio === "function") {
            showAudioInitStatus(audioEnabled ? "Muting..." : "Unmuting...");
            const newState = await livekitToggleAudio();
            setAudioEnabled(newState);
            audioInitializedRef.current = true;
            showAudioInitStatus(
              newState ? "Microphone unmuted" : "Microphone muted"
            );
            showNotificationMessage(
              newState ? "Microphone unmuted" : "Microphone muted"
            );
            return;
          }
        } catch (error) {
          console.error("Audio toggle error:", error);
          showAudioInitStatus("Audio error");
          showNotificationMessage(
            `Audio toggle failed: ${error.message}`,
            "error"
          );
        }

        if (onToggleAudio) {
          const newState = onToggleAudio();
          setAudioEnabled(
            typeof newState === "boolean" ? newState : !audioEnabled
          );
        } else {
          setAudioEnabled(!audioEnabled);
        }
      }, PERFORMANCE_CONFIG.THROTTLE_DELAY),
    [
      livekitToggleAudio,
      enableAudio,
      isConnectionReady,
      onToggleAudio,
      audioEnabled,
      showNotificationMessage,
      showAudioInitStatus,
    ]
  );

  // Video toggle with track creation only when turning on
  const handleToggleVideo = useMemo(
    () =>
      throttle(async () => {
        try {
          if (!isConnectionReady) {
            showNotificationMessage(
              "Please wait for connection to establish",
              "warning"
            );
            return;
          }

          if (
            !videoEnabled &&
            enableVideo &&
            typeof enableVideo === "function"
          ) {
            const result = await enableVideo();
            if (result) {
              setVideoEnabled(true);
              videoInitializedRef.current = true;
              showNotificationMessage("Camera turned on");
              return;
            }
          }

          if (livekitToggleVideo) {
            const newState = await livekitToggleVideo();
            setVideoEnabled(newState);
            videoInitializedRef.current = true;
            showNotificationMessage(
              newState ? "Camera turned on" : "Camera turned off"
            );
            return;
          }
        } catch (error) {
          console.error("Video toggle error:", error);
          showNotificationMessage(
            `Video toggle failed: ${error.message}`,
            "error"
          );
        }

        if (onToggleVideo) {
          const newState = onToggleVideo();
          setVideoEnabled(
            typeof newState === "boolean" ? newState : !videoEnabled
          );
        } else {
          setVideoEnabled(!videoEnabled);
        }
      }, PERFORMANCE_CONFIG.THROTTLE_DELAY),
    [
      livekitToggleVideo,
      enableVideo,
      isConnectionReady,
      onToggleVideo,
      videoEnabled,
      showNotificationMessage,
    ]
  );

  // ============================================================================
  // COMPLETE PARTICIPANT CONTROL HANDLERS WITH INSTANT UI UPDATES
  // ============================================================================

  // 1. MUTE PARTICIPANT AUDIO - With Instant Update
  const handleMuteParticipant = useCallback(
    async (participantId) => {
      if (!hasHostPrivileges) {
        showNotificationMessage("Only hosts and co-hosts can mute participants", "error");
        return { success: false };
      }

      try {
        console.log("🔇 Muting participant:", participantId);

        const participant = allParticipants.find(
          p => (p.id || p.user_id || p.User_ID)?.toString() === participantId?.toString()
        );

        if (!participant) {
          throw new Error("Participant not found");
        }

        const userName = getParticipantDisplayName(participant);

        // INSTANT UI UPDATE - Optimistic update
        setLiveParticipants(prev =>
          prev.map(p => {
            const pId = (p.id || p.user_id || p.User_ID)?.toString();
            if (pId === participantId?.toString()) {
              return {
                ...p,
                audio_enabled: false,
                isAudioEnabled: false
              };
            }
            return p;
          })
        );

        // Send mute command via LiveKit
        if (room && room.localParticipant) {
          const encoder = new TextEncoder();
          const muteData = encoder.encode(
            JSON.stringify({
              type: "force_mute_audio",
              target_user_id: participantId,
              target_user_name: userName,
              muted_by: currentUser.id,
              muted_by_name: getParticipantDisplayName(currentUser),
              timestamp: Date.now(),
            })
          );

          await room.localParticipant.publishData(muteData, DataPacket_Kind.RELIABLE);
          showNotificationMessage(`Muted ${userName}'s microphone`, "success");

          return { success: true };
        }

        throw new Error("Room not available");
      } catch (error) {
        console.error("❌ Mute failed:", error);
        showNotificationMessage(`Failed to mute: ${error.message}`, "error");

        // Revert optimistic update on error
        await loadLiveParticipants(true);
        return { success: false };
      }
    },
    [hasHostPrivileges, room, currentUser, allParticipants, getParticipantDisplayName, showNotificationMessage, loadLiveParticipants]
  );

  // 2. UNMUTE PARTICIPANT AUDIO - With Instant Update
  const handleUnmuteParticipant = useCallback(
    async (participantId) => {
      if (!hasHostPrivileges) {
        showNotificationMessage("Only hosts and co-hosts can unmute participants", "error");
        return { success: false };
      }

      try {
        console.log("🔊 Allowing unmute for participant:", participantId);

        const participant = allParticipants.find(
          p => (p.id || p.user_id || p.User_ID)?.toString() === participantId?.toString()
        );

        if (!participant) {
          throw new Error("Participant not found");
        }

        const userName = getParticipantDisplayName(participant);

        // Send unmute permission via LiveKit
        if (room && room.localParticipant) {
          const encoder = new TextEncoder();
          const unmuteData = encoder.encode(
            JSON.stringify({
              type: "allow_unmute_audio",
              target_user_id: participantId,
              target_user_name: userName,
              unmuted_by: currentUser.id,
              unmuted_by_name: getParticipantDisplayName(currentUser),
              timestamp: Date.now(),
            })
          );

          await room.localParticipant.publishData(unmuteData, DataPacket_Kind.RELIABLE);
          showNotificationMessage(`Allowed ${userName} to unmute`, "success");

          return { success: true };
        }

        throw new Error("Room not available");
      } catch (error) {
        console.error("❌ Unmute permission failed:", error);
        showNotificationMessage(`Failed to allow unmute: ${error.message}`, "error");
        return { success: false };
      }
    },
    [hasHostPrivileges, room, currentUser, allParticipants, getParticipantDisplayName, showNotificationMessage]
  );

  // 3. MUTE PARTICIPANT VIDEO - With Instant Update
  const handleMuteVideo = useCallback(
    async (participantId) => {
      if (!hasHostPrivileges) {
        showNotificationMessage("Only hosts and co-hosts can control video", "error");
        return { success: false };
      }

      try {
        console.log("📹 Turning off participant video:", participantId);

        const participant = allParticipants.find(
          p => (p.id || p.user_id || p.User_ID)?.toString() === participantId?.toString()
        );

        if (!participant) {
          throw new Error("Participant not found");
        }

        const userName = getParticipantDisplayName(participant);

        // INSTANT UI UPDATE
        setLiveParticipants(prev =>
          prev.map(p => {
            const pId = (p.id || p.user_id || p.User_ID)?.toString();
            if (pId === participantId?.toString()) {
              return {
                ...p,
                video_enabled: false,
                isVideoEnabled: false
              };
            }
            return p;
          })
        );

        // Send video mute command via LiveKit
        if (room && room.localParticipant) {
          const encoder = new TextEncoder();
          const muteVideoData = encoder.encode(
            JSON.stringify({
              type: "force_mute_video",
              target_user_id: participantId,
              target_user_name: userName,
              muted_by: currentUser.id,
              muted_by_name: getParticipantDisplayName(currentUser),
              timestamp: Date.now(),
            })
          );

          await room.localParticipant.publishData(muteVideoData, DataPacket_Kind.RELIABLE);
          showNotificationMessage(`Turned off ${userName}'s camera`, "success");

          return { success: true };
        }

        throw new Error("Room not available");
      } catch (error) {
        console.error("❌ Video mute failed:", error);
        showNotificationMessage(`Failed to turn off video: ${error.message}`, "error");

        // Revert optimistic update
        await loadLiveParticipants(true);
        return { success: false };
      }
    },
    [hasHostPrivileges, room, currentUser, allParticipants, getParticipantDisplayName, showNotificationMessage, loadLiveParticipants]
  );

  // 4. UNMUTE PARTICIPANT VIDEO - With Instant Update
  const handleUnmuteVideo = useCallback(
    async (participantId) => {
      if (!hasHostPrivileges) {
        showNotificationMessage("Only hosts and co-hosts can control video", "error");
        return { success: false };
      }

      try {
        console.log("📹 Allowing camera for participant:", participantId);

        const participant = allParticipants.find(
          p => (p.id || p.user_id || p.User_ID)?.toString() === participantId?.toString()
        );

        if (!participant) {
          throw new Error("Participant not found");
        }

        const userName = getParticipantDisplayName(participant);

        // Send video permission via LiveKit
        if (room && room.localParticipant) {
          const encoder = new TextEncoder();
          const unmuteVideoData = encoder.encode(
            JSON.stringify({
              type: "allow_unmute_video",
              target_user_id: participantId,
              target_user_name: userName,
              unmuted_by: currentUser.id,
              unmuted_by_name: getParticipantDisplayName(currentUser),
              timestamp: Date.now(),
            })
          );

          await room.localParticipant.publishData(unmuteVideoData, DataPacket_Kind.RELIABLE);
          showNotificationMessage(`Allowed ${userName} to turn on camera`, "success");

          return { success: true };
        }

        throw new Error("Room not available");
      } catch (error) {
        console.error("❌ Video permission failed:", error);
        showNotificationMessage(`Failed to allow camera: ${error.message}`, "error");
        return { success: false };
      }
    },
    [hasHostPrivileges, room, currentUser, allParticipants, getParticipantDisplayName, showNotificationMessage]
  );



  const handleCameraToggle = useCallback(
    async (enabled) => {
      try {
        // console.log("📷 Camera toggle requested for attendance:", enabled);

        if (enabled) {
          // Enable camera
          if (enableVideo && typeof enableVideo === "function") {
            const result = await enableVideo();
            if (result) {
              setVideoEnabled(true);
              videoInitializedRef.current = true;
              showNotificationMessage("Camera enabled for attendance tracking");
              return Promise.resolve();
            }
          }

          if (livekitToggleVideo) {
            const newState = await livekitToggleVideo();
            if (newState) {
              setVideoEnabled(true);
              videoInitializedRef.current = true;
              showNotificationMessage("Camera enabled for attendance tracking");
              return Promise.resolve();
            }
          }

          // Fallback
          if (onToggleVideo) {
            const newState = onToggleVideo();
            const finalState = typeof newState === "boolean" ? newState : true;
            setVideoEnabled(finalState);
            return Promise.resolve();
          }

          setVideoEnabled(true);
          return Promise.resolve();
        } else {
          // Disable camera
          if (livekitToggleVideo) {
            const newState = await livekitToggleVideo();
            setVideoEnabled(newState);
            showNotificationMessage("Camera disabled for attendance break");
            return Promise.resolve();
          }

          // Fallback
          if (onToggleVideo) {
            const newState = onToggleVideo();
            const finalState = typeof newState === "boolean" ? newState : false;
            setVideoEnabled(finalState);
            return Promise.resolve();
          }

          setVideoEnabled(false);
          return Promise.resolve();
        }
      } catch (error) {
        console.error("❌ Camera toggle failed:", error);
        showNotificationMessage(
          `Camera toggle failed: ${error.message}`,
          "error"
        );
        throw error; // Re-throw so AttendanceTracker can handle retry
      }
    },
    [livekitToggleVideo, enableVideo, onToggleVideo, showNotificationMessage]
  );



  // FIXED: Screen share with co-host direct access
  // UPDATED: Screen share with co-host direct access
  const handleToggleScreenShare = useMemo(
    () =>
      throttle(async () => {
        if (!isConnectionReady) {
          showNotificationMessage(
            "Not connected to meeting. Please wait for connection to establish.",
            "error"
          );
          return;
        }

        try {
          if (screenSharing || livekitLocalIsScreenSharing) {
            // Stop screen sharing
            // console.log("Stopping screen share...");
            if (livekitStopScreenShare) {
              const success = await livekitStopScreenShare();
              if (success) {
                setScreenSharing(false);
                showNotificationMessage("Screen sharing stopped", "success");
              }
            }
          } else {
            // Start screen sharing
            // console.log("Starting screen share...", {
            //   isHost,
            //   isCoHost,
            //   coHostPrivilegesActive,
            //   hasHostPrivileges,
            //   canShareScreenDirectly,
            // });

            // UPDATED: HOSTS AND CO-HOSTS CAN SHARE DIRECTLY WITHOUT APPROVAL
            if (canShareScreenDirectly) {
              const userRole = isHost
                ? "Host"
                : isCoHost || coHostPrivilegesActive
                  ? "Co-Host"
                  : "Participant";
              // console.log(
              //   `${userRole} starting screen share directly without approval`
              // );

              showNotificationMessage(
                'For YouTube/Spotify audio: Select "Chrome Tab" and check "Share tab audio"',
                "info"
              );

              if (livekitStartScreenShare) {
                const result = await livekitStartScreenShare();
                if (result?.success) {
                  setScreenSharing(true);

                  const roleMessage = isHost ? "Host" : "Co-Host";

                  if (result.hasSystemAudio) {
                    showNotificationMessage(
                      `${roleMessage} screen sharing with audio started - participants can hear YouTube/music!`,
                      "success"
                    );
                  } else {
                    showNotificationMessage(
                      `${roleMessage} screen sharing started. For audio: select "Chrome Tab" and check "Share tab audio"`,
                      "success"
                    );
                  }

                  // console.log(
                  //   `${roleMessage} screen share started successfully:`,
                  //   {
                  //     sharingMode: result.sharingMode,
                  //     audioStrategy: result.audioStrategy,
                  //     hasSystemAudio: result.hasSystemAudio,
                  //   }
                  // );
                }
              }
              return;
            }

            // UPDATED: Only regular participants (not co-hosts) need approval
            if (
              !hasHostPrivileges &&
              meetingSettings.screenShareRequiresApproval &&
              screenSharePermissions.requiresHostApproval
            ) {
              // console.log(
              //   "Regular participant requesting screen share approval..."
              // );

              if (screenSharePermissions.pendingRequest) {
                showNotificationMessage(
                  "Screen share request already pending host approval",
                  "info"
                );
                setShowScreenShareWaiting(true);
                return;
              }

              if (!screenSharePermissions.hasPermission) {
                showNotificationMessage(
                  "Requesting screen share permission from host...",
                  "info"
                );
                setShowScreenShareWaiting(true);

                try {
                  const result = await livekitStartScreenShare();
                  setShowScreenShareWaiting(false);

                  if (result?.success) {
                    setScreenSharing(true);
                    showNotificationMessage(
                      "Screen sharing started after approval",
                      "success"
                    );
                  }
                } catch (error) {
                  setShowScreenShareWaiting(false);
                  if (error.message.includes("denied")) {
                    showNotificationMessage(
                      "Screen share request was denied by host",
                      "warning"
                    );
                  } else if (error.message.includes("timeout")) {
                    showNotificationMessage(
                      "Screen share request timed out - try again",
                      "warning"
                    );
                  } else {
                    showNotificationMessage(
                      `Screen share error: ${error.message}`,
                      "error"
                    );
                  }
                }
                return;
              }
            }

            // Fallback for edge cases
            // console.log("Fallback screen share start...");
            showNotificationMessage(
              'For YouTube/Spotify audio: Select "Chrome Tab" and check "Share tab audio"',
              "info"
            );

            if (livekitStartScreenShare) {
              const result = await livekitStartScreenShare();
              if (result?.success) {
                setScreenSharing(true);
                showNotificationMessage("Screen sharing started", "success");
              }
            }
          }
        } catch (error) {
          console.error("Screen share error:", error);
          setShowScreenShareWaiting(false);
          showNotificationMessage(
            `Screen share error: ${error.message}`,
            "error"
          );
        }
      }, PERFORMANCE_CONFIG.THROTTLE_DELAY),
    [
      isConnectionReady,
      screenSharing,
      livekitLocalIsScreenSharing,
      livekitStopScreenShare,
      livekitStartScreenShare,
      showNotificationMessage,
      canShareScreenDirectly,
      hasHostPrivileges,
      meetingSettings.screenShareRequiresApproval,
      screenSharePermissions,
      isHost,
      isCoHost,
      coHostPrivilegesActive,
    ]
  );

  // Leave meeting handler
  // In MeetingRoom.jsx - Update handleLeaveMeeting function
  const handleLeaveMeeting = async () => {
    setShowLeaveDialog(false);

    try {
      const [mediaRecorder, setMediaRecorder] = useState(null);
      const [recordedChunks, setRecordedChunks] = useState([]);
      // console.log("User manually leaving meeting");
      // if (realMeetingId) {
      //   await endMeetingReactions();
      // }
      if (realMeetingId && currentUser?.id) {
        const leaveResult = await participantsAPI.recordLeave({
          meetingId: realMeetingId,
          userId: currentUser.id,
          participant_id: participantId || `host_${currentUser.id}`,
          manual_leave: true,
          reason: "manual",
          leave_type: "user_action",
        });

        if (leaveResult.success) {
          // console.log("Manual leave recorded successfully");
        }
      }

      await disconnectFromRoom();

      // REFRESH THE ENTIRE APPLICATION
      // console.log("Refreshing application after leaving meeting...");
      window.location.reload();
    } catch (error) {
      // console.error("Manual leave error:", error);
      // Still refresh even if there's an error
      window.location.reload();
    }
  };



  const handleFullscreen = () => {
    if (!isFullscreen) {
      meetingContainerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  const handleSaveSettings = useCallback(
    (newSettings) => {
      setMeetingSettings({
        ...newSettings,
        // Ensure whiteboard settings are preserved
        whiteboardEnabled:
          newSettings.whiteboardEnabled ?? meetingSettings.whiteboardEnabled,
        whiteboardHostOnly:
          newSettings.whiteboardHostOnly ?? meetingSettings.whiteboardHostOnly,
      });
      showNotificationMessage("Settings updated successfully");
    },
    [showNotificationMessage]
  );

  const startClientRecording = useCallback(async () => {
    try {
      // console.log("Starting client recording...");

      // Validate we have streams
      const streams = [];

      if (localStream) {
        // console.log("Adding local stream");
        streams.push(localStream);
      }

      // Add remote streams from LiveKit
      if (room && room.participants) {
        // console.log("Adding remote streams from room participants");
        room.participants.forEach((participant) => {
          participant.tracks.forEach((trackPub) => {
            if (trackPub.track && trackPub.track.mediaStreamTrack) {
              const stream = new MediaStream([trackPub.track.mediaStreamTrack]);
              streams.push(stream);
            }
          });
        });
      }

      if (streams.length === 0) {
        throw new Error("No media streams available for recording");
      }

      // console.log(`Client recording: ${streams.length} streams found`);

      // Create recording stream
      const recordingStream = await createRecordingStream(streams, {
        includeAudio: true,
        includeVideo: true,
        audioOnly: false,
      });

      setClientRecordingStream(recordingStream);

      // Create media recorder
      const recorder = createMediaRecorder(recordingStream, {
        mimeType: "video/webm;codecs=vp9,opus",
        videoBitsPerSecond: 2500000,
        audioBitsPerSecond: 128000,
      });

      const chunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
          setClientRecordedChunks([...chunks]);
          // console.log(`Recording chunk added, total chunks: ${chunks.length}`);
        }
      };

      recorder.onstart = () => {
        // console.log("Client MediaRecorder started");
        const metadata = createRecordingMetadata({
          meetingId: realMeetingId,
          userId: currentUser?.id,
          userName: getParticipantDisplayName(currentUser),
          startTime: new Date(),
        });
        setRecordingMetadata(metadata);
      };

      recorder.onstop = async () => {
        // console.log(
        //   `Client recording stopped, processing ${chunks.length} chunks`
        // );

        try {
          if (chunks.length === 0) {
            throw new Error("No recording data available");
          }

          setRecordingState((prev) => ({ ...prev, uploading: true }));

          const { blob, metadata } = processRecordingChunks(
            chunks,
            recorder.mimeType
          );
          // console.log(`Recording blob created: ${blob.size} bytes`);

          // Validate recording
          const validation = await validateRecordingBlob(blob, 1);
          if (!validation.valid) {
            throw new Error(validation.error);
          }

          // Create file
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const fileName = `client-meeting-${realMeetingId}-${timestamp}.webm`;
          const file = new File([blob], fileName, { type: blob.type });

          // Upload with progress tracking
          const uploadMetadata = {
            meeting_id: realMeetingId,
            title: `Meeting Recording - ${new Date().toLocaleDateString()}`,
            duration: validation.duration,
            fileSize: blob.size,
            recordingType: "client",
            user_id: currentUser?.id,
            user_email: currentUser?.email,
            ...recordingMetadata,
          };

          const uploadResult = await uploadRecording(file, uploadMetadata);

          if (uploadResult.success) {
            showNotificationMessage(
              "Recording uploaded and processed successfully!",
              "success"
            );

            // Refresh recordings list
            setTimeout(async () => {
              try {
                // await fetchAllRecordings();
                await hookInstance.fetchAllRecordings();
              } catch (refreshError) {
                console.error("Failed to refresh recordings:", refreshError);
              }
            }, 3000);
          } else {
            throw new Error(uploadResult.message || "Upload failed");
          }

          // Cleanup
          cleanupRecordingResources(recordingStream, recorder);
          setClientRecordingStream(null);
          setClientRecordedChunks([]);
          setClientMediaRecorder(null);
          setRecordingMetadata(null);
        } catch (error) {
          console.error("Client recording processing failed:", error);
          showNotificationMessage(
            `Recording processing failed: ${error.message}`,
            "error"
          );

          // Cleanup on error
          cleanupRecordingResources(recordingStream, recorder);
          setClientRecordingStream(null);
          setClientRecordedChunks([]);
          setClientMediaRecorder(null);
          setRecordingMetadata(null);
        } finally {
          setRecordingState((prev) => ({
            ...prev,
            uploading: false,
            uploadProgress: 0,
          }));
        }
      };

      recorder.onerror = (event) => {
        console.error("Client recording error:", event.error);
        showNotificationMessage(
          `Recording error: ${event.error?.message || "Unknown error"}`,
          "error"
        );
      };

      // Start recording
      setClientMediaRecorder(recorder);
      recorder.start(1000);

      // console.log("Client MediaRecorder started successfully");
    } catch (error) {
      // console.error("Failed to start client recording:", error);
      showNotificationMessage(
        `Failed to start recording: ${error.message}`,
        "error"
      );
      throw error;
    }
  }, [
    localStream,
    room,
    realMeetingId,
    currentUser,
    getParticipantDisplayName,
    showNotificationMessage,
    uploadRecording,
    fetchAllRecordings,
  ]);

  // Replace your stopClientRecording function with this:
  const stopClientRecording = useCallback(async () => {
    try {
      // console.log("Stopping client recording...");

      if (clientMediaRecorder && clientMediaRecorder.state !== "inactive") {
        // Stop the recorder (this will trigger the onstop event)
        clientMediaRecorder.stop();
        showNotificationMessage("Processing recording...", "info");
      } else {
        throw new Error("No active client recording to stop");
      }
    } catch (error) {
      console.error("Failed to stop client recording:", error);
      showNotificationMessage(
        `Failed to stop recording: ${error.message}`,
        "error"
      );

      // Force cleanup
      if (clientRecordingStream) {
        cleanupRecordingResources(clientRecordingStream, clientMediaRecorder);
        setClientRecordingStream(null);
      }

      setClientMediaRecorder(null);
      setClientRecordedChunks([]);
      setRecordingMetadata(null);
    }
  }, [clientMediaRecorder, clientRecordingStream, showNotificationMessage]);

  const handleToggleRecording = useCallback(async () => {
    if (!hasHostPrivileges) {
      showNotificationMessage(
        "Only hosts and co-hosts can control recording",
        "warning"
      );
      return;
    }

    const meetingIdForRecording = realMeetingId || meetingData?.id;
    if (!meetingIdForRecording) {
      showNotificationMessage("No meeting ID available", "error");
      return;
    }

    try {
      if (recordingState.isRecording) {
        // Stop recording
        // console.log("Stopping recording...");
        showNotificationMessage("Stopping recording...", "info");

        // **ADD THIS: Broadcast stop to all participants**
        if (room && room.localParticipant) {
          const encoder = new TextEncoder();
          const recordingData = encoder.encode(
            JSON.stringify({
              type: "recording_status",
              action: "stop",
              recording: false,
              stoppedBy: currentUser.id,
              stoppedByName: getParticipantDisplayName(currentUser),
              timestamp: Date.now(),
            })
          );
          await room.localParticipant.publishData(
            recordingData,
            DataPacket_Kind.RELIABLE
          );
        }

        if (recordingState.method === "server") {
          const response = await stopMeetingRecording(meetingIdForRecording);

          if (response && response.success !== false) {
            setRecordingState({
              isRecording: false,
              method: null,
              startTime: null,
              duration: 0,
              error: null,
              uploading: false,
              uploadProgress: 0,
            });

            showNotificationMessage(
              "Server recording stopped successfully",
              "success"
            );
          } else {
            throw new Error(
              response?.message || "Failed to stop server recording"
            );
          }
        } else if (recordingState.method === "client" && clientMediaRecorder) {
          await stopClientRecording();

          setRecordingState((prev) => ({
            ...prev,
            isRecording: false,
            method: null,
            startTime: null,
            duration: 0,
          }));

          showNotificationMessage(
            "Client recording stopped successfully",
            "success"
          );
        } else {
          throw new Error("No active recording method found");
        }
      } else {
        // Start recording
        // console.log("Starting recording...");
        showNotificationMessage("Starting recording...", "info");

        // Try server recording first
        try {
          const response = await startMeetingRecording(meetingIdForRecording, {
            user_id: currentUser?.id,
            recording_type: "server",
            quality: "hd",
            include_audio: true,
            include_video: true,
          });

          if (response && response.success !== false) {
            setRecordingState({
              isRecording: true,
              method: "server",
              startTime: Date.now(),
              duration: 0,
              error: null,
              uploading: false,
              uploadProgress: 0,
            });

            // **ADD THIS: Broadcast start to all participants**
            if (room && room.localParticipant) {
              const encoder = new TextEncoder();
              const recordingData = encoder.encode(
                JSON.stringify({
                  type: "recording_status",
                  action: "start",
                  recording: true,
                  method: "server",
                  startedBy: currentUser.id,
                  startedByName: getParticipantDisplayName(currentUser),
                  timestamp: Date.now(),
                })
              );
              await room.localParticipant.publishData(
                recordingData,
                DataPacket_Kind.RELIABLE
              );
            }

            showNotificationMessage(
              "Server recording started successfully",
              "success"
            );
            return;
          } else {
            throw new Error(response?.message || "Server recording failed");
          }
        } catch (serverError) {
          console.warn(
            "Server recording failed, trying client recording:",
            serverError
          );

          // Fallback to client recording
          const support = checkRecordingSupport();
          if (support.client) {
            setRecordingState({
              isRecording: true,
              method: "client",
              startTime: Date.now(),
              duration: 0,
              error: null,
              uploading: false,
              uploadProgress: 0,
            });

            await startClientRecording();

            // **ADD THIS: Broadcast client recording start**
            if (room && room.localParticipant) {
              const encoder = new TextEncoder();
              const recordingData = encoder.encode(
                JSON.stringify({
                  type: "recording_status",
                  action: "start",
                  recording: true,
                  method: "client",
                  startedBy: currentUser.id,
                  startedByName: getParticipantDisplayName(currentUser),
                  timestamp: Date.now(),
                })
              );
              await room.localParticipant.publishData(
                recordingData,
                DataPacket_Kind.RELIABLE
              );
            }

            showNotificationMessage(
              "Client recording started successfully",
              "success"
            );
          } else {
            throw new Error("No recording method available");
          }
        }
      }
    } catch (error) {
      console.error("Recording error:", error);
      showNotificationMessage(`Recording error: ${error.message}`, "error");

      setRecordingState({
        isRecording: false,
        method: null,
        startTime: null,
        duration: 0,
        error: error.message,
        uploading: false,
        uploadProgress: 0,
      });
    }
  }, [
    hasHostPrivileges,
    realMeetingId,
    meetingData?.id,
    recordingState.isRecording,
    recordingState.method,
    clientMediaRecorder,
    currentUser?.id,
    room,
    getParticipantDisplayName,
    showNotificationMessage,
    startMeetingRecording,
    stopMeetingRecording,
    checkRecordingSupport,
    startClientRecording,
    stopClientRecording,
  ]);

  const handleCopyMeetingLink = async () => {
    try {
      await navigator.clipboard.writeText(meetingLink);
      showNotificationMessage("Meeting link copied to clipboard!", "success");
    } catch (error) {
      console.error("Failed to copy link:", error);
      showNotificationMessage("Failed to copy link", "error");
    }
  };

  const handleShareMeetingLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: meetingData?.title || "Join Video Meeting",
          text: "Join our video meeting",
          url: meetingLink,
        });
      } catch (error) {
        console.error("Error sharing:", error);
        handleCopyMeetingLink(); // Fallback to copy
      }
    } else {
      handleCopyMeetingLink(); // Fallback for browsers without Web Share API
    }
  };
  const toggleMenuItems = [
    {
      icon: <RadioButtonChecked />,
      label: recordingState.isRecording ? "Stop Recording" : "Start Recording",
      action: handleToggleRecording,
      show: hasHostPrivileges,
    },
    {
      icon: <WhiteboardIcon />,
      label: "Open Whiteboard",
      action: handleToggleWhiteboard,
      show: hasHostPrivileges && meetingSettings.whiteboardEnabled,
    },
    {
      icon: <Share />,
      label: "Copy Meeting Link",
      action: handleCopyMeetingLink,
      show: true,
    },
    {
      icon: <MeetingRoomIcon />,
      label: "End Meeting",
      action: () => setShowEndMeetingDialog(true),
      show: hasHostPrivileges,
    },
    {
      icon: isFullscreen ? <FullscreenExit /> : <Fullscreen />,
      label: isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen",
      action: handleFullscreen,
      show: true,
    },
  ];



  const handleEndMeeting = async () => {
    setShowEndMeetingDialog(false);

    // FIXED: Both hosts and co-hosts can end meetings
    if (!hasHostPrivileges) {
      showNotificationMessage(
        "Only hosts and co-hosts can end the meeting",
        "error"
      );
      return;
    }

    if (!realMeetingId) {
      showNotificationMessage("No meeting ID available", "error");
      return;
    }

    try {
      // console.log("Host/Co-host ending meeting for everyone");
      showNotificationMessage("Ending meeting for all participants...", "info");

      const result = await endMeetingForEveryone(realMeetingId);

      if (result.success) {
        showNotificationMessage("Meeting ended successfully", "success");

        setTimeout(() => {
          if (onLeaveMeeting) {
            onLeaveMeeting();
          }
        }, 2000);
      }
    } catch (error) {
      console.error("End meeting error:", error);
      showNotificationMessage(
        `Failed to end meeting: ${error.message}`,
        "error"
      );
    }
  };

  const getConnectionQualityColor = () => {
    if (!actualIsConnected) return "#f44336";
    switch (connectionQuality) {
      case "good":
        return "#4caf50";
      case "medium":
        return "#ff9800";
      case "poor":
        return "#f44336";
      default:
        return "#4caf50";
    }
  };

  const formatRecordingDuration = (seconds) => {
    if (!seconds || seconds <= 0) return "0:00";

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  // Hand raise handlers
  const handleToggleHandRaise = useCallback(async () => {
    if (!meetingSettings.handRaiseEnabled) {
      showNotificationMessage(
        "Hand raise is disabled in this meeting",
        "warning"
      );
      return;
    }

    // If user has host privileges, open the panel and reload hands
    if (hasHostPrivileges) {
      if (!handRaiseOpen) {
        loadRaisedHands();
      }
      setHandRaiseOpen(!handRaiseOpen);
      return;
    }

    // Regular participants raise/lower their hand
    try {
      await toggleHandRaise();
      showNotificationMessage(
        isHandRaised ? "Hand lowered" : "Hand raised",
        "success"
      );
    } catch (error) {
      showNotificationMessage(
        `Failed to ${isHandRaised ? "lower" : "raise"} hand: ${error.message}`,
        "error"
      );
    }
  }, [
    toggleHandRaise,
    isHandRaised,
    meetingSettings.handRaiseEnabled,
    showNotificationMessage,
    hasHostPrivileges,
    handRaiseOpen,
  ]);

  const handleAcknowledgeHand = useCallback(
    async (handId) => {
      const hand = raisedHands.find((h) => h.id === handId);
      if (!hand) return;

      try {
        await acknowledgeHand(hand.user_id, "acknowledge");
        showNotificationMessage(
          `Acknowledged ${hand.user?.full_name || "participant"}'s hand`,
          "success"
        );
      } catch (error) {
        showNotificationMessage(
          `Failed to acknowledge hand: ${error.message}`,
          "error"
        );
      }
    },
    [acknowledgeHand, raisedHands, showNotificationMessage]
  );

  const handleDenyHand = useCallback(
    async (handId) => {
      const hand = raisedHands.find((h) => h.id === handId);
      if (!hand) return;

      try {
        await acknowledgeHand(hand.user_id, "deny");
        showNotificationMessage(
          `Denied ${hand.user?.full_name || "participant"}'s hand`,
          "info"
        );
      } catch (error) {
        showNotificationMessage(
          `Failed to deny hand: ${error.message}`,
          "error"
        );
      }
    },
    [acknowledgeHand, raisedHands, showNotificationMessage]
  );

  const handleClearAllHands = useCallback(async () => {
    if (!hasHostPrivileges) {
      showNotificationMessage(
        "Only hosts and co-hosts can clear all hands",
        "warning"
      );
      return;
    }

    try {
      await clearAllHands();
      showNotificationMessage("All hands cleared", "success");
    } catch (error) {
      showNotificationMessage(
        `Failed to clear hands: ${error.message}`,
        "error"
      );
    }
  }, [clearAllHands, hasHostPrivileges, showNotificationMessage]);


  const openChatPanel = useCallback(() => {
    setParticipantsOpen(false); // Close participants first
    setChatOpen(true);
    setChatStats((prev) => ({ ...prev, unread: 0, hasNewMessages: false }));
    setUnreadMessages(0);
  }, []);

  const openParticipantsPanel = useCallback(() => {
    setChatOpen(false); // Close chat first
    setParticipantsOpen(true);
  }, []);

  const closeAllPanels = useCallback(() => {
    setChatOpen(false);
    setParticipantsOpen(false);
      setHandRaiseOpen(false);  // ✅ Ensure this is included

  }, []);



// Update your handleToggleChat to close hand raise
const handleToggleChat = useCallback(() => {
  const willOpen = !chatOpen;
  
  if (willOpen) {
    // Close ALL panels including hand raise when opening chat
    setParticipantsOpen(false);
    setReactionsOpen(false);
    setHandRaiseOpen(false);  // ✅ ADD THIS
    setShowToggleMenu(false);
    
    // Clear unread count
    setChatStats((prev) => ({
      ...prev,
      unread: 0,
      hasNewMessages: false,
    }));
    setUnreadMessages(0);
  }
  
  setChatOpen(willOpen);
}, [chatOpen]);

// Update your handleParticipantsButtonClick to close hand raise
const handleParticipantsButtonClick = useCallback(() => {
  const now = Date.now();
  const timeDiff = now - lastParticipantsClickTime;

  if (timeDiff < 400) {
    // Double click detected - close
    if (participantsOpen) {
      setParticipantsOpen(false);
      showNotificationMessage("Participants panel closed", "info");
    }
  } else {
    // Single click - toggle and close others
    const willOpen = !participantsOpen;
    
    if (willOpen) {
      // Close ALL panels including hand raise when opening participants
      setChatOpen(false);
      setReactionsOpen(false);
      setHandRaiseOpen(false);  // ✅ ADD THIS
      setShowToggleMenu(false);
    }
    
    setParticipantsOpen(willOpen);
  }

  setLastParticipantsClickTime(now);
}, [lastParticipantsClickTime, participantsOpen, showNotificationMessage]);

// Update your handleToggleReactions to close hand raise
const handleToggleReactions = useCallback(() => {
  const willOpen = !reactionsOpen;
  
  if (willOpen) {
    // Close ALL panels including hand raise when opening reactions
    setChatOpen(false);
    setParticipantsOpen(false);
    setHandRaiseOpen(false);  // ✅ ADD THIS
    setShowToggleMenu(false);
  }
  
  setReactionsOpen(willOpen);
}, [reactionsOpen]);

// Update your handleToggleMenu to close hand raise
const handleToggleMenu = useCallback(() => {
  const willOpen = !showToggleMenu;
  
  if (willOpen) {
    // Close ALL panels including hand raise when opening menu
    setChatOpen(false);
    setParticipantsOpen(false);
    setReactionsOpen(false);
    setHandRaiseOpen(false);  // ✅ ADD THIS
  }
  
  setShowToggleMenu(willOpen);
}, [showToggleMenu]);

// Update your handleToggleAttendance to close hand raise
const handleToggleAttendance = useCallback(() => {
  // Close hand raise when toggling attendance
  setHandRaiseOpen(false);  // ✅ ADD THIS
  
  // Toggle minimized state
  setAttendanceMinimized(!attendanceMinimized);

  if (attendanceMinimized) {
    showNotificationMessage("Attendance tracker expanded", "info");
  } else {
    showNotificationMessage("Attendance tracker minimized", "info");
  }
}, [attendanceMinimized, showNotificationMessage]);

  // Update your recording label function:
  const getRecordingLabel = useCallback(() => {
    const duration = recordingState.duration;
    const formattedDuration = formatRecordingDuration(duration);

    if (recordingState.uploading) {
      return `Uploading... ${recordingState.uploadProgress}%`;
    }

    if (recordingState.method === "client") {
      return `REC (Browser) ${formattedDuration}`;
    } else if (recordingState.method === "server") {
      return `REC (Server) ${formattedDuration}`;
    }

    return `REC ${formattedDuration}`;
  }, [recordingState]);

  // ADD THIS TO YOUR EXISTING useEffect FOR CLEANUP:
  useEffect(() => {
    return () => {
      // Cleanup client recording resources on unmount
      if (clientRecordingStream) {
        cleanupRecordingResources(clientRecordingStream, clientMediaRecorder);
      }
    };
  }, [clientRecordingStream, clientMediaRecorder]);

  // ADD THIS TO MONITOR UPLOAD PROGRESS:
  useEffect(() => {
    if (hookUploadProgress > 0) {
      setUploadProgress(hookUploadProgress);
    }
  }, [hookUploadProgress]);

  // Monitor screen share requests
  useEffect(() => {
    if (currentScreenShareRequest && hasHostPrivileges) {
      // FIXED: Co-hosts can handle requests
      handleScreenShareRequestReceived();
    }
  }, [
    currentScreenShareRequest,
    hasHostPrivileges,
    handleScreenShareRequestReceived,
  ]);
  useEffect(() => {
    const handleKeyboard = (event) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case "w":
            event.preventDefault();
            handleToggleWhiteboard();
            break;
          default:
            break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, [handleToggleWhiteboard]);
  // FIXED: Debug attendance tracker initialization
  useEffect(() => {
    // console.log("🎯 Attendance Tracker Render Check:", {
    //   attendanceEnabled,
    //   realMeetingId: !!realMeetingId,
    //   currentUserId: !!currentUser?.id,
    //   actualIsConnected,
    //   meetingEnded,
    //   shouldRender: attendanceEnabled && realMeetingId && currentUser?.id,
    //   userName: getParticipantDisplayName(currentUser),
    // });
  }, [
    attendanceEnabled,
    realMeetingId,
    currentUser?.id,
    actualIsConnected,
    meetingEnded,
    getParticipantDisplayName,
    currentUser,
  ]);
  // Monitor screen share permissions and close waiting overlay
  useEffect(() => {
    if (screenSharePermissions.hasPermission && showScreenShareWaiting) {
      // console.log("Permission granted, closing waiting overlay");
      setShowScreenShareWaiting(false);
      if (screenShareWaitingTimeout) {
        clearTimeout(screenShareWaitingTimeout);
        setScreenShareWaitingTimeout(null);
      }
    }

    if (!screenSharePermissions.pendingRequest && showScreenShareWaiting) {
      // console.log("Request no longer pending, closing waiting overlay");
      setShowScreenShareWaiting(false);
      if (screenShareWaitingTimeout) {
        clearTimeout(screenShareWaitingTimeout);
        setScreenShareWaitingTimeout(null);
      }
    }
  }, [
    screenSharePermissions.hasPermission,
    screenSharePermissions.pendingRequest,
    showScreenShareWaiting,
    screenShareWaitingTimeout,
  ]);

  // Monitor screen sharing state changes to close waiting overlay
  useEffect(() => {
    if (
      (screenSharing || livekitLocalIsScreenSharing) &&
      showScreenShareWaiting
    ) {
      // console.log("Screen sharing started, closing waiting overlay");
      setShowScreenShareWaiting(false);
      if (screenShareWaitingTimeout) {
        clearTimeout(screenShareWaitingTimeout);
        setScreenShareWaitingTimeout(null);
      }
    }
  }, [
    screenSharing,
    livekitLocalIsScreenSharing,
    showScreenShareWaiting,
    screenShareWaitingTimeout,
  ]);

  useEffect(() => {
    const handleGlobalRefreshRequest = (event) => {
      const { reason, immediate } = event.detail || {};
      // console.log("🔄 Global refresh request received:", { reason, immediate });

      if (immediate) {
        // Bypass throttling for immediate requests
        loadLiveParticipants(true);
      } else {
        loadLiveParticipants();
      }
    };

    const handleParticipantRemovedGlobal = (event) => {
      // console.log("🔄 Global participant removed event - triggering refresh");
      // Always refresh after a removal
      setTimeout(() => {
        loadLiveParticipants(true);
      }, 1000);
    };

    window.addEventListener(
      "requestParticipantRefresh",
      handleGlobalRefreshRequest
    );
    window.addEventListener(
      "participantRemoved",
      handleParticipantRemovedGlobal
    );

    return () => {
      window.removeEventListener(
        "requestParticipantRefresh",
        handleGlobalRefreshRequest
      );
      window.removeEventListener(
        "participantRemoved",
        handleParticipantRemovedGlobal
      );
    };
  }, [loadLiveParticipants]);

  useEffect(() => {
    const handleGlobalNameRefresh = () => {
      // console.log("🔄 Global name refresh event received in MeetingRoom");
      setTimeout(() => {
        loadLiveParticipants();
      }, 100);
    };

    window.addEventListener("refreshParticipantNames", handleGlobalNameRefresh);

    return () => {
      window.removeEventListener(
        "refreshParticipantNames",
        handleGlobalNameRefresh
      );
    };
  }, [loadLiveParticipants]);

  // Monitor hand raise notifications
  useEffect(() => {
    if (hasHostPrivileges && pendingHandsCount > 0) {
      setShowHandNotification(true);
      const timer = setTimeout(() => setShowHandNotification(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [hasHostPrivileges, pendingHandsCount]);

  // Performance monitoring
  useEffect(() => {
    let frameCount = 0;
    let lastCheck = Date.now();

    const monitorPerformance = () => {
      frameCount++;
      const now = Date.now();
      const elapsed = now - lastCheck;

      if (elapsed >= 1000) {
        const fps = frameCount;
        frameCount = 0;
        lastCheck = now;

        setPerformanceMetrics((prev) => ({
          ...prev,
          fps,
          bandwidth: fps > 20 ? "good" : fps > 10 ? "medium" : "poor",
        }));

        if (fps < 15 && allParticipants.length > 40) {
          setPerformanceWarning(
            "Performance is degraded with 40+ participants. Consider reducing video quality."
          );
        } else if (fps < 20 && allParticipants.length > 30) {
          setPerformanceWarning(
            "Performance may be affected. Consider disabling some video streams."
          );
        } else {
          setPerformanceWarning(null);
        }

        if (performance.memory) {
          const memoryUsage =
            (performance.memory.usedJSHeapSize /
              performance.memory.jsHeapSizeLimit) *
            100;
          if (memoryUsage > 80) {
            setPerformanceWarning(
              "High memory usage detected. Some features may be slow."
            );
          }
        }
      }

      performanceMonitorRef.current = requestAnimationFrame(monitorPerformance);
    };

    performanceMonitorRef.current = requestAnimationFrame(monitorPerformance);

    return () => {
      if (performanceMonitorRef.current) {
        cancelAnimationFrame(performanceMonitorRef.current);
      }
    };
  }, [allParticipants.length]);

  // Auto-connect effect
  useEffect(() => {
    if (
      realMeetingId &&
      currentUser &&
      !hasInitialConnectionRef.current &&
      !actualIsConnected &&
      !isConnecting
    ) {
      establishLiveKitConnection();
    }

    return () => {
      connectionAttemptRef.current = false;
      hasInitialConnectionRef.current = false;
      connectionRetryCountRef.current = 0;
      audioInitializedRef.current = false;
      videoInitializedRef.current = false;

      if (queueCheckIntervalRef.current) {
        clearInterval(queueCheckIntervalRef.current);
        queueCheckIntervalRef.current = null;
      }

      if (coHostSyncTimerRef.current) {
        clearInterval(coHostSyncTimerRef.current);
        coHostSyncTimerRef.current = null;
      }
    };
  }, [
    realMeetingId,
    currentUser,
    actualIsConnected,
    isConnecting,
    establishLiveKitConnection,
  ]);

  // FIXED: Co-host sync effect with immediate privilege activation
  useEffect(() => {
    if (realMeetingId && actualIsConnected) {
      // console.log(
      //   "🔄 Setting up co-host auto-sync with immediate privilege activation"
      // );
      loadCoHosts();

      // Set up periodic sync for co-host changes
      const coHostSyncInterval = setInterval(() => {
        // console.log("🔄 Periodic co-host sync");
        loadCoHosts();
      }, PERFORMANCE_CONFIG.COHOST_SYNC_INTERVAL);

      return () => {
        clearInterval(coHostSyncInterval);
      };
    }
  }, [realMeetingId, actualIsConnected, loadCoHosts]);

  // Set up global handlers for co-host events
  useEffect(() => {
    window.reloadCoHosts = loadCoHosts;
    window.showNotificationMessage = showNotificationMessage;
    window.handleForcedLeave = handleLeaveMeeting;

    return () => {
      delete window.reloadCoHosts;
      delete window.showNotificationMessage;
      delete window.handleForcedLeave;
    };
  }, [loadCoHosts, showNotificationMessage, handleLeaveMeeting]);

  // Participant sync effect
  useEffect(() => {
    if (realMeetingId && actualIsConnected) {
      // console.log("Auto-sync disabled to prevent automatic leaves");
      loadLiveParticipants();

      return () => {
        if (participantUpdateTimerRef.current) {
          clearInterval(participantUpdateTimerRef.current);
        }
      };
    }
  }, [realMeetingId, actualIsConnected, loadLiveParticipants]);

  // Performance monitoring effect
  useEffect(() => {
    updatePerformanceMetrics();
  }, [participantCount, currentPerformanceMode, updatePerformanceMetrics]);

  // Sync with LiveKit states
  useEffect(() => {
    if (audioInitializedRef.current) {
      setAudioEnabled(
        livekitAudioEnabled !== undefined ? livekitAudioEnabled : false
      );
    }
  }, [livekitAudioEnabled]);

  useEffect(() => {
    if (videoInitializedRef.current) {
      setVideoEnabled(
        livekitVideoEnabled !== undefined ? livekitVideoEnabled : false
      );
    }
  }, [livekitVideoEnabled]);

  useEffect(() => {
    setScreenSharing(
      livekitScreenSharing !== undefined
        ? livekitScreenSharing
        : propScreenSharing
    );
  }, [propScreenSharing, livekitScreenSharing]);


  useEffect(() => {
    let interval;

    if (recordingState.isRecording && recordingState.startTime) {
      // console.log("Starting recording timer...");

      interval = setInterval(() => {
        try {
          const now = Date.now();
          const duration = Math.floor((now - recordingState.startTime) / 1000);

          setRecordingState((prev) => ({ ...prev, duration }));

          if (duration % 60 === 0 && duration > 0) {
            // console.log(
            //   `Recording duration: ${Math.floor(duration / 60)}m ${duration % 60
            //   }s`
            // );
          }
        } catch (error) {
          // console.error("Recording timer error:", error);
          clearInterval(interval);
        }
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [recordingState.isRecording, recordingState.startTime]);

  // Handle meeting ended state
  useEffect(() => {
    if (meetingEnded) {
      showNotificationMessage("Meeting has ended", "warning");

      setTimeout(() => {
        if (onLeaveMeeting) {
          onLeaveMeeting();
        }
      }, 5000);
    }
  }, [meetingEnded, onLeaveMeeting, showNotificationMessage]);

  // Cleanup effect for screen share waiting timeout
  useEffect(() => {
    return () => {
      if (screenShareWaitingTimeout) {
        clearTimeout(screenShareWaitingTimeout);
      }
    };
  }, [screenShareWaitingTimeout]);

  // Fullscreen event listeners
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Add this useEffect after the other useEffect hooks
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    window.reloadLiveParticipants = loadLiveParticipants;
    window.showNotificationMessage = showNotificationMessage;
    window.handleForcedLeave = handleLeaveMeeting;

    return () => {
      delete window.reloadLiveParticipants;
      delete window.showNotificationMessage;
      delete window.handleForcedLeave;
    };
  }, [loadLiveParticipants, showNotificationMessage, handleLeaveMeeting]);

  useEffect(() => {
    let refreshInterval;

    if (actualIsConnected && hasHostPrivileges) {
      refreshInterval = setInterval(async () => {
        try {
          await loadLiveParticipants();
        } catch (error) {
          console.warn("Auto-refresh failed:", error);
        }
      }, 10000);
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [actualIsConnected, hasHostPrivileges, loadLiveParticipants]);

  // Add this useEffect to listen for participant removal events
  useEffect(() => {
    const handleParticipantRemovedEvent = (event) => {
      const { removedUserId, removedUserName, removedBy } = event.detail;

      // console.log("MeetingRoom: Received participant removed event:", {
      //   removedUserId,
      //   removedUserName,
      //   removedBy,
      // });

      // Update local state immediately if not already updated
      setLiveParticipants((prev) => {
        const isAlreadyRemoved = !prev.some((p) => {
          const pUserId = p.User_ID || p.user_id || p.ID;
          return pUserId?.toString() === removedUserId?.toString();
        });

        if (isAlreadyRemoved) {
          // console.log(
          //   "MeetingRoom: Participant already removed from local state"
          // );
          return prev;
        }

        const updated = prev.filter((p) => {
          const pUserId = p.User_ID || p.user_id || p.ID;
          return pUserId?.toString() !== removedUserId?.toString();
        });

        // console.log("MeetingRoom: Updated participants after removal event:", {
        //   before: prev.length,
        //   after: updated.length,
        // });

        return updated;
      });
    };

    window.addEventListener(
      "participantRemoved",
      handleParticipantRemovedEvent
    );

    return () => {
      window.removeEventListener(
        "participantRemoved",
        handleParticipantRemovedEvent
      );
    };
  }, []);

  useEffect(() => {
    const handleNewMessage = (event) => {
      const { messageCount, hasUnread } = event.detail || {};

      // console.log("New message event received:", {
      //   messageCount,
      //   hasUnread,
      //   chatOpen,
      // });

      if (!chatOpen && hasUnread) {
        setChatStats((prev) => ({
          ...prev,
          unread: prev.unread + 1,
          total: messageCount || prev.total + 1,
          hasNewMessages: true,
        }));
        setUnreadMessages((prev) => prev + 1);
      }

      if (messageCount !== undefined) {
        setTotalMessages(messageCount);
        setChatStats((prev) => ({
          ...prev,
          total: messageCount,
        }));
      }
    };

    const handleChatStatsUpdate = (event) => {
      const { totalMessages: total, unreadMessages: unread } =
        event.detail || {};

      // console.log("Chat stats update:", { total, unread, chatOpen });

      setChatStats((prev) => ({
        ...prev,
        total: total || prev.total,
        unread: chatOpen ? 0 : unread || prev.unread,
        hasNewMessages: !chatOpen && (unread > 0 || prev.hasNewMessages),
      }));

      if (total !== undefined) setTotalMessages(total);
      if (unread !== undefined && !chatOpen) setUnreadMessages(unread);
    };

    // Listen for chat events
    window.addEventListener("newChatMessage", handleNewMessage);
    window.addEventListener("chatStatsUpdated", handleChatStatsUpdate);

    return () => {
      window.removeEventListener("newChatMessage", handleNewMessage);
      window.removeEventListener("chatStatsUpdated", handleChatStatsUpdate);
    };
  }, [chatOpen]);

  useEffect(() => {
    if (realMeetingId && currentUser) {
      const generatedLink = `${window.location.origin}/meeting/${realMeetingId}?token=${currentUser.id}`;
      setMeetingLink(generatedLink);
    }
  }, [realMeetingId, currentUser]);

  useEffect(() => {
    // Ensure mutual exclusivity of panels
    if (chatOpen && participantsOpen) {
      // This shouldn't happen, but if it does, prioritize the most recently opened
      console.warn("Both panels open simultaneously, closing participants");
      setParticipantsOpen(false);
    }
  }, [chatOpen, participantsOpen]);

  useEffect(() => {
    const handleKeyPress = (event) => {
      // Only handle if no input is focused
      if (document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA' ||
        document.activeElement.isContentEditable) {
        return;
      }

      if (event.key === 'c' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleToggleChat();
      } else if (event.key === 'p' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleParticipantsButtonClick();
      } else if (event.key === 'Escape') {
        // Close any open panels
        if (chatOpen || participantsOpen) {
          closeAllPanels();
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [handleToggleChat, handleParticipantsButtonClick, chatOpen, participantsOpen, closeAllPanels]);
  useEffect(() => {
    const handleKeyboard = (event) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'w':
            event.preventDefault();
            // RESTRICT: Check privileges before opening
            if (hasHostPrivileges && meetingSettings.whiteboardEnabled) {
              handleToggleWhiteboard();
            } else if (!hasHostPrivileges) {
              showNotificationMessage(
                "Only hosts and co-hosts can access the whiteboard",
                "warning"
              );
            }
            break;
          case 'a': // Attendance shortcut
            event.preventDefault();
            handleToggleAttendance();
            break;
          default:
            break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, [handleToggleWhiteboard, handleToggleAttendance, hasHostPrivileges, meetingSettings.whiteboardEnabled, showNotificationMessage]);

  // Close panels when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Don't close if clicking on the buttons themselves
      const isControlButton = event.target.closest('button[aria-label], .MuiIconButton-root');
      if (isControlButton) return;

      // Don't close if clicking inside the panels - FIXED: Added more specific selectors
      const isChatPanel = event.target.closest('.chat-panel-container, [class*="ChatPanel"]');
      const isParticipantsPanel = event.target.closest(
        '.participants-panel-container, [class*="ParticipantsList"], [class*="MuiList"], [class*="MuiMenu"], [class*="MuiDialog"]'
      );
      const isReactionsPanel = event.target.closest('.reactions-panel-container, [class*="ReactionsManager"]');
      const isToggleMenu = event.target.closest('.toggle-menu-container, [class*="MuiCard"]');
      const isHandRaisePanel = event.target.closest('.hand-raise-panel-container');

      // CRITICAL FIX: Don't close if clicking any MUI dropdown/menu/modal elements
      const isMuiElement = event.target.closest(
        '.MuiPopover-root, .MuiModal-root, .MuiBackdrop-root, .MuiMenu-root, .MuiMenuItem-root, .MuiListItem-root'
      );

      if (isChatPanel || isParticipantsPanel || isReactionsPanel || isToggleMenu || isHandRaisePanel || isMuiElement) {
        return;
      }

      // Close all open panels
      if (chatOpen) setChatOpen(false);
      if (participantsOpen) setParticipantsOpen(false);
      if (showToggleMenu) setShowToggleMenu(false);
      if (handRaiseOpen) setHandRaiseOpen(false);
    };

    // Add event listener with capture phase to catch events early
    document.addEventListener('mousedown', handleClickOutside, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [chatOpen, participantsOpen, showToggleMenu, handRaiseOpen]);

  // Listen for reactions via LiveKit data channel - SIMPLIFIED TO AVOID CONFLICTS
  // ✅ CLEANED: Single data listener for non-reaction events only

  useEffect(() => {
    setIsRecording(recordingState.isRecording);
  }, [recordingState.isRecording]);


  // Auto-refresh raised hands for hosts/co-hosts every 5 seconds
  useEffect(() => {
    if (!hasHostPrivileges || !realMeetingId || !handRaiseInitialized) return;

    // Initial load
    // console.log('Loading raised hands for host/co-host');
    loadRaisedHands();

    // Poll every 5 seconds for new hands
    const interval = setInterval(() => {
      // console.log('Auto-refreshing raised hands');
      loadRaisedHands();
    }, 5000);

    return () => clearInterval(interval);
  }, [hasHostPrivileges, realMeetingId, loadRaisedHands, handRaiseInitialized]);

  // Listen for reactions via LiveKit data channel
  // Close whiteboard tab if user loses host privileges
  useEffect(() => {
    if (!hasHostPrivileges && availableTabs.includes('whiteboard')) {
      // console.log('User lost host privileges - closing whiteboard tab');
      handleCloseTab('whiteboard');
      showNotificationMessage(
        "Whiteboard closed - host privileges required",
        "info"
      );
    }
  }, [hasHostPrivileges, availableTabs, handleCloseTab, showNotificationMessage]);





  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (payload, participant) => {
      try {
        const decoder = new TextDecoder();
        const data = JSON.parse(decoder.decode(payload));

        const currentUserId = currentUser?.id?.toString();

        // Handle force mute audio
        if (data.type === "force_mute_audio" &&
          data.target_user_id?.toString() === currentUserId) {
          console.log("🔇 Received force mute command");

          if (livekitToggleAudio && audioEnabled) {
            livekitToggleAudio();
          }

          showNotificationMessage(
            `Your microphone was muted by ${data.muted_by_name || 'host'}`,
            "warning"
          );
        }

        // Handle allow unmute audio
        if (data.type === "allow_unmute_audio" &&
          data.target_user_id?.toString() === currentUserId) {
          console.log("🔊 Received unmute permission");

          showNotificationMessage(
            `You can now unmute your microphone`,
            "info"
          );
        }

        // Handle force mute video
        if (data.type === "force_mute_video" &&
          data.target_user_id?.toString() === currentUserId) {
          console.log("📹 Received force mute video command");

          if (livekitToggleVideo && videoEnabled) {
            livekitToggleVideo();
          }

          showNotificationMessage(
            `Your camera was turned off by ${data.muted_by_name || 'host'}`,
            "warning"
          );
        }

        // Handle allow unmute video
        if (data.type === "allow_unmute_video" &&
          data.target_user_id?.toString() === currentUserId) {
          console.log("📹 Received video permission");

          showNotificationMessage(
            `You can now turn on your camera`,
            "info"
          );
        }

        // Handle spotlight
        if (data.type === "spotlight_participant") {
          console.log("✨ Received spotlight command");

          // Update local state for all participants
          setLiveParticipants(prev =>
            prev.map(p => {
              const pId = (p.id || p.user_id || p.User_ID)?.toString();
              if (pId === data.target_user_id?.toString()) {
                return { ...p, spotlighted: data.spotlight };
              }
              // Remove spotlight from others if adding new
              if (data.spotlight && p.spotlighted) {
                return { ...p, spotlighted: false };
              }
              return p;
            })
          );

          if (data.target_user_id?.toString() === currentUserId) {
            showNotificationMessage(
              data.spotlight
                ? `✨ You have been spotlighted by ${data.set_by_name || 'host'}`
                : `Spotlight removed by ${data.set_by_name || 'host'}`,
              "info"
            );
          }
        }

        // Handle pin
        if (data.type === "pin_participant") {
          console.log("📌 Received pin command");

          // Update local state
          setLiveParticipants(prev =>
            prev.map(p => {
              const pId = (p.id || p.user_id || p.User_ID)?.toString();
              if (pId === data.target_user_id?.toString()) {
                return { ...p, pinned: data.pinned };
              }
              return p;
            })
          );

          if (data.target_user_id?.toString() === currentUserId) {
            showNotificationMessage(
              data.pinned
                ? `📌 Your video has been pinned by ${data.set_by_name || 'host'}`
                : `Your video has been unpinned by ${data.set_by_name || 'host'}`,
              "info"
            );
          }
        }

        // Handle volume
        if (data.type === "set_volume" &&
          data.target_user_id?.toString() === currentUserId) {
          console.log("🔊 Received volume adjustment");

          // Update local state
          setLiveParticipants(prev =>
            prev.map(p => {
              const pId = (p.id || p.user_id || p.User_ID)?.toString();
              if (pId === data.target_user_id?.toString()) {
                return { ...p, volume: data.volume };
              }
              return p;
            })
          );

          showNotificationMessage(
            `🔊 Volume adjusted to ${data.volume}% by ${data.set_by_name || 'host'}`,
            "info"
          );
        }

      } catch (error) {
        console.error("Error processing control command:", error);
      }
    };

    room.on("dataReceived", handleDataReceived);

    return () => {
      room.off("dataReceived", handleDataReceived);
    };
  }, [
    room,
    currentUser?.id,
    audioEnabled,
    videoEnabled,
    livekitToggleAudio,
    livekitToggleVideo,
    showNotificationMessage
  ]);


  // Add this useEffect to enforce mutual exclusivity
useEffect(() => {
  const openPanels = [
    chatOpen && 'chat',
    participantsOpen && 'participants',
    reactionsOpen && 'reactions',
    handRaiseOpen && 'handRaise',
    showToggleMenu && 'menu'
  ].filter(Boolean);

  // If more than one panel is open (shouldn't happen but safety check)
  if (openPanels.length > 1) {
    console.warn('Multiple panels open simultaneously:', openPanels);
    // Keep only the most recently opened (last in the list)
    const keepOpen = openPanels[openPanels.length - 1];
    
    if (keepOpen !== 'chat') setChatOpen(false);
    if (keepOpen !== 'participants') setParticipantsOpen(false);
    if (keepOpen !== 'reactions') setReactionsOpen(false);
    if (keepOpen !== 'handRaise') setHandRaiseOpen(false);
    if (keepOpen !== 'menu') setShowToggleMenu(false);
  }
}, [chatOpen, participantsOpen, reactionsOpen, handRaiseOpen, showToggleMenu]);


  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (payload, participant) => {
      try {
        const decoder = new TextDecoder();
        const data = JSON.parse(decoder.decode(payload));

        const currentUserId = currentUser?.id?.toString();

        // Handle force mute audio
        if (data.type === "force_mute_audio" &&
          data.target_user_id?.toString() === currentUserId) {
          console.log("🔇 Received force mute command from host");

          if (livekitToggleAudio && audioEnabled) {
            livekitToggleAudio();
            showNotificationMessage(
              `Your microphone was muted by ${data.muted_by_name || 'host'}`,
              "warning"
            );
          }
        }

        // Handle allow unmute audio
        if (data.type === "allow_unmute_audio" &&
          data.target_user_id?.toString() === currentUserId) {
          console.log("🔊 Received unmute permission from host");
          showNotificationMessage(
            `You can now unmute your microphone`,
            "info"
          );
        }

        // Handle force mute video
        if (data.type === "force_mute_video" &&
          data.target_user_id?.toString() === currentUserId) {
          console.log("📹 Received force mute video command from host");

          if (livekitToggleVideo && videoEnabled) {
            livekitToggleVideo();
            showNotificationMessage(
              `Your camera was turned off by ${data.muted_by_name || 'host'}`,
              "warning"
            );
          }
        }

        // Handle allow unmute video
        if (data.type === "allow_unmute_video" &&
          data.target_user_id?.toString() === currentUserId) {
          console.log("📹 Received video permission from host");
          showNotificationMessage(
            `You can now turn on your camera`,
            "info"
          );
        }

        // Handle spotlight
        if (data.type === "spotlight_participant") {
          console.log("✨ Received spotlight command");

          if (data.target_user_id?.toString() === currentUserId) {
            showNotificationMessage(
              data.spotlight
                ? `You have been spotlighted by ${data.set_by_name || 'host'}`
                : `Spotlight removed by ${data.set_by_name || 'host'}`,
              "info"
            );
          }
        }

        // Handle pin
        if (data.type === "pin_participant") {
          console.log("📌 Received pin command");

          if (data.target_user_id?.toString() === currentUserId) {
            showNotificationMessage(
              data.pinned
                ? `Your video has been pinned by ${data.set_by_name || 'host'}`
                : `Your video has been unpinned by ${data.set_by_name || 'host'}`,
              "info"
            );
          }
        }

        // Handle volume
        if (data.type === "set_volume" &&
          data.target_user_id?.toString() === currentUserId) {
          console.log("🔊 Received volume adjustment");
          showNotificationMessage(
            `Volume adjusted to ${data.volume}% by ${data.set_by_name || 'host'}`,
            "info"
          );
        }

      } catch (error) {
        console.error("Error processing control command:", error);
      }
    };

    room.on("dataReceived", handleDataReceived);

    return () => {
      room.off("dataReceived", handleDataReceived);
    };
  }, [room, currentUser?.id, audioEnabled, videoEnabled, livekitToggleAudio, livekitToggleVideo, showNotificationMessage]);


  return (
    <MeetingContainer ref={meetingContainerRef}>
      {/* Meeting Ended Overlay */}
      {meetingEnded && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
            textAlign: 'center',
          }}
        >
          <MeetingRoomIcon sx={{ fontSize: 120, color: '#ef4444', mb: 3 }} />
          <Typography
            variant="h3"
            sx={{ mb: 2, fontWeight: 600, color: '#ef4444' }}
          >
            Meeting Ended
          </Typography>
          <Typography variant="h6" sx={{ mb: 1, color: 'grey.300' }}>
            This meeting has been ended by the host
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mb: 4,
              color: 'grey.400',
              textAlign: 'center',
              maxWidth: 400,
            }}
          >
            Thank you for participating. You will be redirected shortly.
          </Typography>
          <Button
            variant="contained"
            onClick={() => onLeaveMeeting && onLeaveMeeting()}
            sx={{
              mt: 2,
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #f87171 0%, #ef4444 100%)' },
              px: 4,
              py: 1.5,
              borderRadius: 2,
            }}
            startIcon={<ExitToApp />}
          >
            Leave Now
          </Button>
        </Box>
      )}

      <TabsContainer>
        {/* Browser Tabs */}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', flex: 1, overflow: 'hidden' }}>
          {availableTabs.map((tab) => (
            <BrowserTab
              key={tab}
              active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              <Box className="tab-icon">
                {getTabIcon(tab)}
              </Box>
              <span className="tab-title">{getTabTitle(tab)}</span>

              {/* Close button - hide for meeting tab */}
              {tab !== 'meeting' && (
                <TabCloseButton
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab);
                  }}
                >
                  <Close />
                </TabCloseButton>
              )}
            </BrowserTab>
          ))}


        </Box>

      </TabsContainer>


      {/* Tab Content Area - Complete Implementation */}
      <Box sx={{
        pt: '64px', // Account for tab navigation
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>



        <Dialog
          open={showEndMeetingDialog}
          onClose={() => {
            // console.log("🔴 END MEETING: Dialog cancelled");
            setShowEndMeetingDialog(false);
          }}
          PaperProps={{
            sx: {
              background: 'rgba(45, 55, 72, 0.98)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'white',
              borderRadius: 2,
            }
          }}
        >
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MeetingRoomIcon sx={{ color: '#ef4444' }} />
              End Meeting for Everyone
            </Box>
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ mb: 2 }}>
              Are you sure you want to end this meeting for all participants? This action cannot be undone.
            </Typography>
            <Alert
              severity="warning"
              sx={{
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: 'white'
              }}
            >
              <Typography variant="body2">• All participants will be immediately disconnected</Typography>
              <Typography variant="body2">• The meeting will be permanently closed</Typography>
              <Typography variant="body2">• Any ongoing recordings will be stopped and saved</Typography>
              {coHosts.length > 0 && (
                <Typography variant="body2">• All co-host privileges will be revoked</Typography>
              )}
              {attendanceEnabled && (
                <Typography variant="body2">• AI attendance tracking will be terminated and saved</Typography>
              )}
            </Alert>
          </DialogContent>
          <DialogActions sx={{ p: 3 }}>
            <Button
              onClick={() => {
                // console.log("🔴 END MEETING: Dialog cancelled via button");
                setShowEndMeetingDialog(false);
              }}
              sx={{ color: 'white' }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                // console.log("🔴 END MEETING: Dialog confirmed via button");
                handleEndMeeting();
              }}
              variant="contained"
              startIcon={<MeetingRoomIcon />}
              sx={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #f87171 0%, #ef4444 100%)'
                }
              }}
            >
              End Meeting
            </Button>
          </DialogActions>
        </Dialog>

        {/* Screen Share Request Dialog - For Host/Co-Host */}
        {showScreenShareRequest && currentScreenShareRequest && hasHostPrivileges && (
          <Dialog
            open={showScreenShareRequest && currentScreenShareRequest !== null}
            onClose={() => setShowScreenShareRequest(false)}
            PaperProps={{
              sx: {
                borderRadius: 3,
                background: 'rgba(255, 255, 255, 0.98)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
                minWidth: 400,
              }
            }}
          >
            <DialogTitle sx={{ pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ScreenShare sx={{ color: '#1a73e8', fontSize: 28 }} />
                <Box>
                  <Typography variant="h6" sx={{ color: '#1f2937', fontWeight: 500, fontSize: '1.125rem' }}>
                    Screen Share Request
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#5f6368' }}>
                    Participant wants to share their screen
                  </Typography>
                </Box>
              </Box>
            </DialogTitle>

            <DialogContent>
              <Box sx={{
                p: 2.5,
                backgroundColor: '#f8f9fa',
                borderRadius: 2,
                border: '1px solid #e8eaed',
                mb: 2
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                  <Avatar
                    sx={{
                      width: 48,
                      height: 48,
                      backgroundColor: '#1a73e8',
                      fontSize: '1.25rem',
                      fontWeight: 600,
                    }}
                  >
                    {currentScreenShareRequest?.user_name?.charAt(0).toUpperCase() || 'U'}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="body1"
                      sx={{
                        color: '#1f2937',
                        fontWeight: 600,
                        fontSize: '1rem',
                        mb: 0.3
                      }}
                    >
                      {currentScreenShareRequest?.user_name || 'Unknown User'}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#6b7280',
                        fontSize: '0.75rem',
                        display: 'block'
                      }}
                    >
                      User ID: {currentScreenShareRequest?.user_id || 'N/A'}
                    </Typography>
                  </Box>
                </Box>

                <Divider sx={{ my: 1.5 }} />

                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Security sx={{ fontSize: 18, color: '#1967d2', mt: 0.2 }} />
                  <Typography variant="caption" sx={{ color: '#5f6368', lineHeight: 1.4 }}>
                    Requesting screen share permission
                  </Typography>
                </Box>
              </Box>

              <Alert
                severity="info"
                sx={{
                  backgroundColor: '#e8f0fe',
                  border: '1px solid #d2e3fc',
                  '& .MuiAlert-icon': { color: '#1967d2' }
                }}
              >
                <Typography variant="body2" sx={{ color: '#1967d2' }}>
                  This participant will be able to share their screen with all meeting participants.
                </Typography>
              </Alert>
            </DialogContent>

            <DialogActions sx={{ p: 3, pt: 2 }}>
              <Button
                onClick={handleDenyScreenShare}
                variant="outlined"
                sx={{
                  textTransform: 'none',
                  borderColor: '#e8eaed',
                  color: '#5f6368',
                  px: 3,
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.04)',
                    borderColor: '#d2d3d4',
                  }
                }}
              >
                Deny
              </Button>
              <Button
                onClick={handleApproveScreenShare}
                variant="contained"
                sx={{
                  textTransform: 'none',
                  background: '#1a73e8',
                  color: 'white',
                  px: 3,
                  boxShadow: 'none',
                  '&:hover': {
                    background: '#1557b0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                  }
                }}
              >
                Approve
              </Button>
            </DialogActions>
          </Dialog>
        )}
        <Dialog
          open={showLeaveDialog}
          onClose={() => {
            // console.log("🚪 LEAVE MEETING: Dialog cancelled");
            setShowLeaveDialog(false);
          }}
          PaperProps={{
            sx: {
              background: 'rgba(45, 55, 72, 0.98)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'white',
              borderRadius: 2,
            }
          }}
        >
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ExitToApp sx={{ color: '#ef4444' }} />
              Leave Meeting
            </Box>
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ mb: 2 }}>
              Are you sure you want to leave this meeting?
            </Typography>

            {/* Show different messages based on user role */}
            {isHost && (
              <Alert severity="info" sx={{ mb: 2, backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'white' }}>
                As the host, the meeting will continue for other participants.
              </Alert>
            )}

            {(isCoHost || coHostPrivilegesActive) && !isHost && (
              <Alert severity="info" sx={{ mb: 2, backgroundColor: 'rgba(249, 115, 22, 0.1)', color: 'white' }}>
                Your co-host privileges will be temporarily suspended.
              </Alert>
            )}

            {queueStatus?.status === "queued" && (
              <Alert severity="warning" sx={{ mb: 2, backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'white' }}>
                You are currently in the connection queue.
              </Alert>
            )}

            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              • Your attendance data will be saved
              • Any ongoing recordings will continue
              • You can rejoin using the same meeting link
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 3 }}>
            <Button
              onClick={() => {
                // console.log("🚪 LEAVE MEETING: Dialog cancelled via button");
                setShowLeaveDialog(false);
              }}
              sx={{ color: 'white' }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                // console.log("🚪 LEAVE MEETING: Dialog confirmed via button");
                handleLeaveMeeting();
              }}
              variant="contained"
              startIcon={<ExitToApp />}
              sx={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #f87171 0%, #ef4444 100%)'
                }
              }}
            >
              Leave Meeting
            </Button>

          </DialogActions>
        </Dialog>



        {/* MEETING TAB CONTENT */}
        {activeTab === 'meeting' && (
          <>

{/* Recording Indicator */}
          {recordingState.isRecording && (
            <Chip
              icon={<RadioButtonChecked />}
              label={`REC ${formatRecordingDuration(recordingState.duration)}`}
              sx={{
                height: 26,
                backgroundColor: '#ef4444',
                color: 'white',
                fontWeight: 500,
                fontSize: '12px',
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%': { opacity: 1 },
                  '50%': { opacity: 0.8 },
                  '100%': { opacity: 1 },
                },
                '& .MuiChip-icon': {
                  color: 'white',
                  fontSize: 12,
                }
              }}
            />
          )}

            {/* Screen Share Permission Waiting Overlay */}
            {showScreenShareWaiting && (
              <Box
                sx={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 0, 0, 0.8)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 15000,
                  textAlign: 'center',
                }}
              >
                <Card
                  sx={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: 2,
                    color: 'white',
                    minWidth: 300,
                    margin: 1,
                  }}
                >
                  <CardContent sx={{ textAlign: 'center', p: 3 }}>
                    <HourglassEmpty sx={{ fontSize: 64, mb: 2, color: '#2196f3' }} />
                    <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
                      Waiting for Host/Co-Host Approval
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 2, color: 'grey.300' }}>
                      Your screen share request has been sent to the hosts.
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'grey.400' }}>
                      Please wait for a host or co-host to approve your request...
                    </Typography>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setShowScreenShareWaiting(false);
                        if (screenShareWaitingTimeout) {
                          clearTimeout(screenShareWaitingTimeout);
                        }
                      }}
                      sx={{ mt: 3, color: 'white', borderColor: 'white' }}
                    >
                      Cancel Request
                    </Button>
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* Status Indicators */}
            <Box
              sx={{
                position: 'fixed',
                top: 80,
                right: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                zIndex: 999,
              }}
            >
              {/* Hand Raise Notification for Hosts */}
              {hasHostPrivileges && pendingHandsCount > 0 && !handRaiseOpen && (
                <Card
                  sx={{
                    background: 'rgba(245, 158, 11, 0.95)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: 1.5,
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      background: 'rgba(245, 158, 11, 1)',
                      transform: 'translateX(-5px)',
                    }
                  }}
                  onClick={() => setHandRaiseOpen(true)}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PanTool sx={{ fontSize: 16 }} />
                      <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {pendingHandsCount} Hand{pendingHandsCount > 1 ? 's' : ''} Raised
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Box>

            {/* Main Content Area */}
            <Box sx={{
              flex: 1,
              display: 'flex',
              position: 'relative',
              overflow: 'hidden',
              minHeight: 0,
              pb: '10px',
              px: 1,
            }}>

              {/* Attendance Tracker Overlay - IN MEETING TAB */}
              {attendanceEnabled && realMeetingId && currentUser?.id && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 16,
                    right: chatOpen || participantsOpen ? 428 : 16,
                    width: attendanceMinimized ? 'auto' : 400,
                    maxHeight: attendanceMinimized ? 'auto' : 'calc(100vh - 200px)',
                    zIndex: 1100,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <AttendanceTracker
                    meetingId={realMeetingId}
                    userId={currentUser.id}
                    userName={getParticipantDisplayName(currentUser)}
                    isActive={actualIsConnected}
                    cameraEnabled={videoEnabled}
                    onViolation={handleAttendanceViolation}
                    onStatusChange={handleAttendanceStatusChange}
                    onSessionTerminated={handleAttendanceSessionTerminated}
                    minimized={attendanceMinimized}
                    onToggleMinimized={() => setAttendanceMinimized(!attendanceMinimized)}
                    isHost={isHost}
                    isCoHost={isCoHost || coHostPrivilegesActive}
                    effectiveRole={effectiveRole}
                    onCameraToggle={handleCameraToggle}
                  />
                </Box>
              )}



              {/* Video Grid Container */}
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  overflow: 'hidden',
                  minHeight: 0,
                  height: '100%',
                  position: 'relative',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  borderRadius: '12px',
                  margin: 0,
                  marginRight: chatOpen || participantsOpen ? '8px' : 0,
                }}
                className={`
            ${enhancedScreenShareData.stream ? "screen-share-active" : ""}
            ${currentPerformanceMode === "optimized"
                    ? "performance-optimized"
                    : ""
                  }
            ${isFullscreen ? "fullscreen-mode" : ""}
          `}
              >
                {actualIsConnected || allParticipants.length > 0 ? (
                  <VideoGrid
                    participants={allParticipants}
                    localStream={localStream}
                    currentUser={currentUser}
                    screenShareStream={enhancedScreenShareData.stream}
                    isScreenSharing={
                      !!enhancedScreenShareData.stream &&
                      !!enhancedScreenShareData.sharer
                    }
                    screenSharer={enhancedScreenShareData.sharer}
                    remoteStreams={combinedStreams}
                    onMuteParticipant={() => { }}
                    onRemoveParticipant={handleRemoveParticipant}
                    onPromoteToHost={handlePromoteToCoHost}
                    onRemoveCoHost={handleRemoveCoHost}
                    onParticipantRemoved={(removedUserId) => {
                      // console.log("VideoGrid callback: Participant removed:", removedUserId);
                      setLiveParticipants((prev) =>
                        prev.filter((p) => {
                          const pUserId = p.User_ID || p.user_id || p.ID;
                          return pUserId?.toString() !== removedUserId?.toString();
                        })
                      );
                      setParticipantStats((prev) => ({
                        ...prev,
                        total: Math.max(0, prev.total - 1),
                        active: Math.max(0, prev.active - 1),
                      }));
                      setTimeout(() => {
                        handleParticipantsUpdated();
                      }, 500);
                    }}
                    viewMode={viewMode}
                    containerHeight="100%"
                    containerWidth="100%"
                    performanceMode={currentPerformanceMode}
                    maxParticipants={currentMaxParticipants}
                    isHost={hasHostPrivileges}
                    coHosts={coHosts}
                    attendanceData={currentAttendanceData}
                  />
                ) : (
                  <Box
                    sx={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 100%)',
                      borderRadius: 2,
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      gap: 2,
                    }}
                  >
                    {isConnecting || connectionAttemptRef.current ? (
                      <>
                        <CircularProgress size={64} sx={{ color: '#3b82f6' }} />
                        <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                          Connecting to meeting...
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                          Please wait while we establish the connection
                        </Typography>
                      </>
                    ) : (
                      <>
                        <VideoCall sx={{ fontSize: 64, color: 'rgba(255,255,255,0.5)', mb: 2 }} />
                        <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>
                          {actualIsConnected
                            ? `${allParticipants.length} participants in meeting`
                            : "Connection failed"}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
                          {actualIsConnected
                            ? hasHostPrivileges
                              ? "Students will appear here when they join"
                              : "You will see yourself and the host when connected"
                            : "Please check your connection and try again"}
                        </Typography>
                        {!actualIsConnected && (
                          <Button
                            variant="outlined"
                            onClick={establishLiveKitConnection}
                            disabled={connectionRetryCountRef.current >= PERFORMANCE_CONFIG.MAX_RETRIES}
                            sx={{
                              mt: 2,
                              color: 'white',
                              borderColor: 'rgba(255,255,255,0.3)',
                              '&:hover': {
                                borderColor: 'rgba(255,255,255,0.5)',
                                backgroundColor: 'rgba(255,255,255,0.05)'
                              }
                            }}
                          >
                            {connectionRetryCountRef.current >= PERFORMANCE_CONFIG.MAX_RETRIES
                              ? "Max retries reached - Refresh page"
                              : "Retry Connection"}
                          </Button>
                        )}
                      </>
                    )}
                  </Box>
                )}
              </Box>




              {/* Chat Panel */}
              {chatOpen && (
                <Box
                  className="chat-panel-container"
                  sx={{
                    width: 450,
                    height: '100%',
                    minHeight: 0,
                    background: 'rgba(26, 32, 44, 0.98)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    margin: 0,
                    overflow: 'hidden',
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <ChatPanel
                    isOpen={chatOpen}
                    isChatOpen={chatOpen}
                    onClose={handleToggleChat}
                    meetingId={realMeetingId}
                    currentUser={currentUser}
                    participants={allParticipants}
                    isHost={hasHostPrivileges}
                    chatPermissions={{
                      canSendMessages: meetingSettings.chatEnabled,
                      canUploadFiles: true,
                    }}
                    onUnreadCountChange={(count) => {
                      setUnreadMessages(count);
                      setChatStats((prev) => ({
                        ...prev,
                        unread: chatOpen ? 0 : count,
                        hasNewMessages: !chatOpen && count > 0,
                      }));
                    }}
                    onTotalMessagesChange={(total) => {
                      setTotalMessages(total);
                      setChatStats((prev) => ({
                        ...prev,
                        total: total,
                      }));
                    }}
                    onMessageReceived={(message) => {
                      if (!chatOpen) {
                        setChatStats((prev) => ({
                          ...prev,
                          unread: prev.unread + 1,
                          total: prev.total + 1,
                          hasNewMessages: true,
                        }));
                        setUnreadMessages((prev) => prev + 1);
                      }
                    }}
                    onChatOpened={() => {
                      setChatStats((prev) => ({
                        ...prev,
                        unread: 0,
                        hasNewMessages: false,
                      }));
                      setUnreadMessages(0);
                    }}
                  />
                </Box>
              )}

              {/* Participants Panel */}
              {participantsOpen && (
                <>
                  {/* Mobile Overlay */}
                  <Box
                    sx={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      zIndex: 1500,
                      display: { xs: 'block', lg: 'none' },
                    }}
                    onClick={() => setParticipantsOpen(false)}
                  />

                  {/* Desktop Side Panel */}
                  <Box
                    className="participants-panel-container"
                    sx={{
                      width: { lg: 400 },
                      height: '100%',
                      minHeight: 0,
                      background: 'rgba(26, 32, 44, 0.98)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      margin: 0,
                      overflow: 'hidden',
                      flexShrink: 0,
                      display: { xs: 'none', lg: 'flex' },
                      flexDirection: 'column',

                      [theme => theme.breakpoints.down('lg')]: {
                        position: 'fixed',
                        top: '10%',
                        left: '5%',
                        right: '5%',
                        width: 'auto',
                        height: '80vh',
                        maxHeight: '600px',
                        borderRadius: 2,
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        margin: 0,
                        zIndex: 1600,
                        display: 'flex',
                      }
                    }}
                  >
                    <ParticipantsList
                      participants={allParticipants}
                      currentUser={currentUser}
                      isHost={isHost}
                      isCoHost={isCoHost || coHostPrivilegesActive}
                      coHosts={coHosts}
                      onMuteParticipant={handleMuteParticipant}
                      onUnmuteParticipant={handleUnmuteParticipant}
                      onMuteVideo={handleMuteVideo}
                      onUnmuteVideo={handleUnmuteVideo}
                      onRemoveParticipant={handleRemoveParticipant}
                      onPromoteToCoHost={handlePromoteToCoHost}
                      onRemoveCoHost={handleRemoveCoHost}
                      hasHostPrivileges={hasHostPrivileges}
                      onParticipantsUpdated={handleParticipantsUpdated}
                      currentUserId={currentUser?.id}
                      onPanelClose={() => setParticipantsOpen(false)}
                    />
                  </Box>
                </>
              )}
            </Box>

            {/* Hand Raise Panel */}
            {handRaiseOpen && hasHostPrivileges && (
              <>
                {/* Backdrop for mobile */}
                <Box
                  sx={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    backdropFilter: 'blur(4px)',
                    WebkitBackdropFilter: 'blur(4px)',
                    zIndex: 1400,
                    display: { xs: 'block', md: 'none' }
                  }}
                  onClick={() => setHandRaiseOpen(false)}
                />

                <Box
                  sx={{
                    position: 'fixed',
                    top: { xs: '10%', md: 80 },
                    right: { xs: '5%', md: 24 },
                    left: { xs: '5%', md: 'auto' },
                    width: { xs: 'auto', md: 380 },
                    maxWidth: { xs: '90vw', md: '380px' },
                    maxHeight: { xs: '70vh', md: '60vh' },
                    background: 'rgba(26, 32, 44, 0.98)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    borderRadius: 2,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                    zIndex: 1500,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {/* Hand Raise Panel Header */}
                  <Box
                    sx={{
                      p: 2,
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(59, 130, 246, 0.1)',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PanTool sx={{ color: '#60a5fa', fontSize: 20 }} />
                      <Typography variant="h6" sx={{ color: 'white', fontWeight: 600 }}>
                        Raised Hands
                      </Typography>
                      {totalHandsCount > 0 && (
                        <Chip
                          label={totalHandsCount}
                          size="small"
                          sx={{
                            backgroundColor: '#f59e0b',
                            color: 'white',
                            height: 24,
                            fontSize: '0.75rem',
                          }}
                        />
                      )}
                    </Box>
                    <Box>
                      {totalHandsCount > 0 && (
                        <Tooltip title="Clear all hands">
                          <IconButton
                            onClick={handleClearAllHands}
                            size="small"
                            sx={{
                              color: 'rgba(239, 68, 68, 0.8)',
                              mr: 1,
                              '&:hover': {
                                color: '#ef4444',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)'
                              }
                            }}
                          >
                            <Clear />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>

                  {/* Hand Raise List Content */}
                  <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
                    {handRaiseLoading ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                        <CircularProgress size={32} sx={{ color: '#60a5fa' }} />
                      </Box>
                    ) : raisedHands.length > 0 ? (
                      <List dense>
                        {raisedHands.map((hand) => (
                          <ListItem
                            key={hand.id}
                            sx={{
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              borderRadius: 2,
                              mb: 1,
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                            }}
                          >
                            <ListItemAvatar>
                              <Avatar
                                sx={{
                                  backgroundColor: '#f59e0b',
                                  width: 36,
                                  height: 36,
                                }}
                              >
                                <PanTool sx={{ fontSize: 18, color: 'white' }} />
                              </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                              primary={
                                <Typography sx={{ color: 'white', fontWeight: 500 }}>
                                  {hand.user?.full_name || hand.user?.name || `User ${hand.user_id}`}
                                </Typography>
                              }
                              secondary={
                                <Typography sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.75rem' }}>
                                  {hand.created_at ? new Date(hand.created_at).toLocaleTimeString() : 'Just now'}
                                </Typography>
                              }
                            />
                            <ListItemSecondaryAction>
                              <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <Tooltip title="Acknowledge hand">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleAcknowledgeHand(hand.id)}
                                    sx={{
                                      color: '#4caf50',
                                      '&:hover': {
                                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                                      },
                                    }}
                                  >
                                    <Check sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Deny hand">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleDenyHand(hand.id)}
                                    sx={{
                                      color: '#f44336',
                                      '&:hover': {
                                        backgroundColor: 'rgba(244, 67, 54, 0.1)',
                                      },
                                    }}
                                  >
                                    <Clear sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </ListItemSecondaryAction>
                          </ListItem>
                        ))}
                      </List>
                    ) : (
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          p: 4,
                          textAlign: 'center',
                        }}
                      >
                        <PanTool sx={{ fontSize: 48, color: 'rgba(255, 255, 255, 0.3)', mb: 2 }} />
                        <Typography variant="h6" sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 1 }}>
                          No hands raised
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                          Students can raise their hands to ask questions
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Hand Raise Stats Footer */}
                  {(totalHandsCount > 0 || handRaiseStats) && (
                    <Box
                      sx={{
                        p: 2,
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        background: 'rgba(0, 0, 0, 0.2)',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                        Total: {totalHandsCount} • Pending: {pendingHandsCount}
                        {handRaiseStats?.acknowledged_today && ` • Acknowledged today: ${handRaiseStats.acknowledged_today}`}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </>
            )}

           <Box
  sx={{
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: { xs: '12px 16px 20px', md: '16px 24px 24px' },
    zIndex: 1000,
    marginRight: chatOpen || participantsOpen ? { xs: 0, lg: '428px' } : 0,
    transition: 'margin-right 0.7s cubic-bezier(0.22, 0.61, 0.36, 1)',
    willChange: 'margin-right',
  }}
>
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: { xs: 1, sm: 1 },
      maxWidth: 800,
      height: "90px",
      margin: '0 auto',
      padding: { xs: '16px 20px', sm: '18px 24px', md: '20px 28px' },
      background: 'rgba(32, 33, 36, 0.8)',
      backdropFilter: 'blur(10px)',
      borderRadius: '29px',
      overflow: 'visible',
      position: 'relative',
      transition: 'all 0.5s cubic-bezier(0.22, 0.61, 0.36, 1)',
    }}
  >
    {/* Audio Control */}
    <Tooltip title={audioEnabled ? "Mute" : "Unmute"}>
      <IconButton
        onClick={handleToggleAudio}
        disabled={!actualIsConnected}
        sx={{
          width: { xs: 44, sm: 48, md: 52 },
          height: { xs: 44, sm: 48, md: 52 },
          background: !audioEnabled ? '#ea4335' : '#3a3b3c',
          color: '#ffffff',
          borderRadius: '50%',
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          border: 'none',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,

          '&:hover': {
            background: !audioEnabled ? '#f28b82' : '#444648',
            transform: 'scale(1.08)',
            zIndex: 2,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          },

          '&:disabled': {
            opacity: 0.5,
            transition: 'opacity 0.3s ease',
          },
        }}
      >
        {audioEnabled ? <Mic /> : <MicOff />}
      </IconButton>
    </Tooltip>

    {/* Video Control */}
    <Tooltip title={videoEnabled ? "Turn off camera" : "Turn on camera"}>
      <IconButton
        onClick={handleToggleVideo}
        disabled={!actualIsConnected}
        sx={{
          width: { xs: 44, sm: 48, md: 52 },
          height: { xs: 44, sm: 48, md: 52 },
          background: !videoEnabled ? '#ea4335' : '#3a3b3c',
          color: '#ffffff',
          borderRadius: '50%',
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          border: 'none',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,

          '&:hover': {
            background: !videoEnabled ? '#f28b82' : '#444648',
            transform: 'scale(1.08)',
            zIndex: 2,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          },

          '&:disabled': {
            opacity: 0.5,
            transition: 'opacity 0.3s ease',
          },
        }}
      >
        {videoEnabled ? <Videocam /> : <VideocamOff />}
      </IconButton>
    </Tooltip>

    {/* Screen Share Control */}
    <Tooltip title={screenSharing || livekitLocalIsScreenSharing ? "Stop sharing" : "Share screen"}>
      <IconButton
        onClick={handleToggleScreenShare}
        disabled={!actualIsConnected}
        sx={{
          width: { xs: 44, sm: 48, md: 52 },
          height: { xs: 44, sm: 48, md: 52 },
          background: (screenSharing || livekitLocalIsScreenSharing) ? '#8ab4f8' : '#3a3b3c',
          color: (screenSharing || livekitLocalIsScreenSharing) ? '#202124' : '#ffffff',
          borderRadius: '50%',
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          border: 'none',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,

          '&:hover': {
            background: (screenSharing || livekitLocalIsScreenSharing) ? '#a8c7fa' : '#444648',
            transform: 'scale(1.08)',
            zIndex: 2,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          },

          '&:disabled': {
            opacity: 0.5,
            transition: 'opacity 0.3s ease',
          },
        }}
      >
        {screenSharing || livekitLocalIsScreenSharing ? <StopScreenShare /> : <ScreenShare />}
      </IconButton>
    </Tooltip>

    {/* Separator */}
    <Box sx={{
      width: '1px',
      height: 32,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      margin: { xs: '0 4px', sm: '0 8px' },
      display: { xs: 'none', sm: 'block' },
      flexShrink: 0,
      transition: 'all 0.3s ease',
    }} />

    {/* Reactions */}
    <Tooltip title="Send reaction">
      <IconButton
    onClick={handleToggleReactions} 
        disabled={!meetingSettings.reactionsEnabled || !actualIsConnected}
        sx={{
          width: { xs: 40, sm: 44, md: 48 },
          height: { xs: 40, sm: 44, md: 48 },
          background: reactionsOpen ? '#8ab4f8' : '#3a3b3c',
          color: reactionsOpen ? '#202124' : '#e8eaed',
          borderRadius: '50%',
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          border: 'none',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,
          '&:hover': {
            background: reactionsOpen ? '#a8c7fa' : '#444648',
            transform: 'scale(1.08)',
            zIndex: 2,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          },
          '&:disabled': {
            opacity: 0.5,
            transition: 'opacity 0.3s ease',
          },
        }}
      >
        <EmojiEmotions />
      </IconButton>
    </Tooltip>

    {/* Hand Raise */}
    {meetingSettings.handRaiseEnabled && (
      <Tooltip
        title={
          hasHostPrivileges
            ? `View raised hands${pendingHandsCount > 0 ? ` (${pendingHandsCount} pending)` : ""}`
            : isHandRaised
              ? "Lower hand"
              : "Raise hand"
        }
      >
        <IconButton
          onClick={handleToggleHandRaise}
          disabled={!actualIsConnected || handRaiseLoading}
          sx={{
            width: { xs: 40, sm: 44, md: 48 },
            height: { xs: 40, sm: 44, md: 48 },
            background: (isHandRaised || handRaiseOpen) ? '#8ab4f8' : '#3a3b3c',
            color: (isHandRaised || handRaiseOpen) ? '#202124' : '#e8eaed',
            borderRadius: '50%',
            transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            border: 'none',
            flexShrink: 0,
            position: 'relative',
            zIndex: 1,

            '&:hover': {
              background: (isHandRaised || handRaiseOpen) ? '#a8c7fa' : '#444648',
              transform: 'scale(1.08)',
              zIndex: 2,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
            },

            '&:disabled': {
              opacity: 0.5,
              transition: 'opacity 0.3s ease',
            },
          }}
        >
          <Badge
            badgeContent={
              hasHostPrivileges
                ? pendingHandsCount > 0
                  ? pendingHandsCount
                  : 0
                : isHandRaised
                  ? 1
                  : 0
            }
            color={hasHostPrivileges ? "warning" : "primary"}
            sx={{
              '& .MuiBadge-badge': {
                backgroundColor: hasHostPrivileges ? '#f59e0b' : '#8ab4f8',
                color: 'white',
                fontSize: '0.65rem',
                minWidth: 16,
                height: 16,
                transition: 'all 0.3s cubic-bezier(0.22, 0.61, 0.36, 1)',
              }
            }}
          >
            <PanTool />
          </Badge>

          {hasHostPrivileges && pendingHandsCount > 0 && (
            <Box
              sx={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: '#f59e0b',
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                '@keyframes pulse': {
                  '0%': { opacity: 1, transform: 'scale(1)' },
                  '50%': { opacity: 0.5, transform: 'scale(1.2)' },
                  '100%': { opacity: 1, transform: 'scale(1)' },
                },
              }}
            />
          )}
        </IconButton>
      </Tooltip>
    )}

    {/* Chat */}
    {meetingSettings.chatEnabled && (
      <Tooltip title={`Toggle chat${chatStats.unread > 0 ? ` (${chatStats.unread} unread)` : ""}`}>
        <IconButton
          onClick={handleToggleChat}
          sx={{
            width: { xs: 40, sm: 44, md: 48 },
            height: { xs: 40, sm: 44, md: 48 },
            background: chatOpen ? '#8ab4f8' : '#3a3b3c',
            color: chatOpen ? '#202124' : '#e8eaed',
            borderRadius: '50%',
            transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            border: 'none',
            flexShrink: 0,
            position: 'relative',
            zIndex: 1,

            '&:hover': {
              background: chatOpen ? '#a8c7fa' : '#444648',
              transform: 'scale(1.08)',
              zIndex: 2,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
            },
          }}
        >
          <Badge
            badgeContent={chatOpen ? 0 : chatStats.unread}
            color="error"
            sx={{
              '& .MuiBadge-badge': {
                backgroundColor: '#ea4335',
                fontSize: '0.65rem',
                minWidth: 16,
                height: 16,
                transition: 'all 0.3s cubic-bezier(0.22, 0.61, 0.36, 1)',
              }
            }}
          >
            <Chat />
          </Badge>
        </IconButton>
      </Tooltip>
    )}

    {/* Attendance Toggle */}
    <Tooltip title={attendanceMinimized ? "Expand attendance tracker" : "Minimize attendance tracker"}>
      <IconButton
        onClick={handleToggleAttendance}
        sx={{
          width: { xs: 40, sm: 44, md: 48 },
          height: { xs: 40, sm: 44, md: 48 },
          background: attendanceMinimized ? '#3a3b3c' : '#34a853',
          color: attendanceMinimized ? '#e8eaed' : '#202124',
          borderRadius: '50%',
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          border: 'none',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,

          '&:hover': {
            background: attendanceMinimized ? '#444648' : '#5bb974',
            transform: 'scale(1.08)',
            zIndex: 2,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          },
        }}
      >
        {attendanceMinimized ? <VisibilityOff /> : <Visibility />}

        {/* Status indicator dot */}
        {attendanceEnabled && !attendanceMinimized && currentAttendanceData.sessionActive && (
          <Box
            sx={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: currentAttendanceData.attendancePercentage > 80 ? '#22c55e' :
                currentAttendanceData.attendancePercentage > 60 ? '#f59e0b' : '#ef4444',
              border: '2px solid rgba(32, 33, 36, 0.95)',
              animation: currentAttendanceData.violations.length > 0 ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
              transition: 'background-color 0.5s cubic-bezier(0.22, 0.61, 0.36, 1)',
            }}
          />
        )}
      </IconButton>
    </Tooltip>

    {/* Participants */}
    <Tooltip title={`${participantsOpen ? "Close" : "Open"} participants`}>
      <IconButton
        onClick={handleParticipantsButtonClick}
        sx={{
          width: { xs: 40, sm: 44, md: 48 },
          height: { xs: 40, sm: 44, md: 48 },
          background: participantsOpen ? '#8ab4f8' : '#3a3b3c',
          color: participantsOpen ? '#202124' : '#e8eaed',
          borderRadius: '50%',
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          border: 'none',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,

          '&:hover': {
            background: participantsOpen ? '#a8c7fa' : '#444648',
            transform: 'scale(1.08)',
            zIndex: 2,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          },
        }}
      >
        <Badge
          badgeContent={allParticipants.length}
          color="primary"
          sx={{
            '& .MuiBadge-badge': {
              backgroundColor: '#8ab4f8',
              color: '#202124',
              fontSize: '0.65rem',
              minWidth: 16,
              height: 16,
              fontWeight: 600,
              transition: 'all 0.3s cubic-bezier(0.22, 0.61, 0.36, 1)',
            }
          }}
        >
          <People />
        </Badge>
      </IconButton>
    </Tooltip>

    {/* More Options */}
    <Tooltip title="More options">
      <IconButton
 onClick={handleToggleMenu}        sx={{
          width: { xs: 40, sm: 44, md: 48 },
          height: { xs: 40, sm: 44, md: 48 },
          background: showToggleMenu ? '#8ab4f8' : '#3a3b3c',
          color: showToggleMenu ? '#202124' : '#e8eaed',
          borderRadius: '50%',
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          border: 'none',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,

          '&:hover': {
            background: showToggleMenu ? '#a8c7fa' : '#444648',
            transform: 'scale(1.08)',
            zIndex: 2,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          },
        }}
      >
        <MoreVert />
      </IconButton>
    </Tooltip>

    {/* Separator */}
    <Box sx={{
      width: '1px',
      height: 32,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      margin: { xs: '0 4px', sm: '0 8px' },
      display: { xs: 'none', sm: 'block' },
      flexShrink: 0,
      transition: 'all 0.3s ease',
    }} />

    {/* Leave Meeting */}
    <Tooltip title="Leave meeting">
      <IconButton
        onClick={() => setShowLeaveDialog(true)}
        sx={{
          width: { xs: 48, sm: 52, md: 56 },
          height: { xs: 48, sm: 52, md: 56 },
          background: '#ea4335',
          color: '#ffffff',
          borderRadius: '50%',
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          border: 'none',
          marginLeft: { xs: 0.5, sm: 1 },
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,

          '&:hover': {
            background: '#f28b82',
            transform: 'scale(1.08)',
            zIndex: 2,
            boxShadow: '0 12px 32px rgba(234, 67, 53, 0.5)',
          },
        }}
      >
        <CallEnd />
      </IconButton>
    </Tooltip>
  </Box>
</Box>


            {/* ✅ COMPLETE REACTIONS SYSTEM - WORKING VERSION */}
            <ReactionsManager
              // Required Props
              meetingId={realMeetingId}
              currentUser={currentUser}
              room={room}

              // Participants
              allParticipants={allParticipants}

              // UI State
              reactionsOpen={reactionsOpen}
              onReactionsToggle={setReactionsOpen}

              // Settings
              reactionsEnabled={meetingSettings.reactionsEnabled}
              isConnected={actualIsConnected}
              isHost={isHost}
              isCoHost={isCoHost}

              // Callbacks
              onNotification={showNotificationMessage}
              onError={(error) => console.error('Reactions error:', error)}

              // Optional Customization
              showSoundControl={true}
              soundEnabled={true}
              showDebugInfo={false}
              enableReactionHistory={true}
              enableReactionStats={true}
              autoHideReactions={true}
              reactionDisplayDuration={5000}
              maxVisibleReactions={10}
            />


            {/* Toggle Menu - Redesigned */}
            {showToggleMenu && (
              <Fade in={showToggleMenu}>
                <Card
                  className="toggle-menu-container"
                  sx={{
                    position: 'fixed',
                    bottom: { xs: 120, md: 140 },
                    right: { xs: '50%', md: chatOpen || participantsOpen ? 660 : 240 },
                    transform: { xs: 'translateX(50%)', md: 'none' },
                    background: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: 1.5,
                    border: '1px solid rgba(0, 0, 0, 0.08)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
                    color: '#1f2937',
                    width: 280,
                    maxHeight: '50vh',
                    overflow: 'auto',
                    zIndex: 10000,
                    transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >


                  {/* Menu Items */}
                  <List sx={{ p: 1 }}>
                    {toggleMenuItems
                      .filter((item) => item.show)
                      .map((item, index) => (
                        <ListItem
                          key={index}
                          button
                          onClick={() => {
                            item.action();
                            setShowToggleMenu(false);
                          }}
                          sx={{
                            borderRadius: 2,
                            mb: 0.5,
                            py: 1.5,
                            px: 2,
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            '&:hover': {
                              backgroundColor: 'rgba(0, 0, 0, 0.04)',
                              transform: 'translateX(4px)',
                            },
                          }}
                        >
                          {/* Icon */}
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 40,
                              height: 40,
                              borderRadius: '50%',
                              backgroundColor: getMenuItemColor(item.label),
                              color: 'white',
                              mr: 2,
                              flexShrink: 0,
                            }}
                          >
                            {item.icon}
                          </Box>

                          {/* Label */}
                          <ListItemText
                            primary={item.label}
                            primaryTypographyProps={{
                              color: '#1f2937',
                              fontSize: '0.875rem',
                              fontWeight: 500,
                            }}
                          />

                          {/* Badge for recording */}
                          {item.label.includes('Recording') && recordingState.isRecording && (
                            <Chip
                              label="LIVE"
                              size="small"
                              sx={{
                                height: 20,
                                backgroundColor: '#ef4444',
                                color: 'white',
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                animation: 'pulse 2s infinite',
                              }}
                            />
                          )}

                          {/* Badge for attendance */}
                          {item.label.includes('Attendance') && attendanceEnabled && (
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: currentAttendanceData.attendancePercentage > 80
                                  ? '#22c55e'
                                  : currentAttendanceData.attendancePercentage > 60
                                    ? '#f59e0b'
                                    : '#ef4444',
                              }}
                            />
                          )}
                        </ListItem>
                      ))}
                  </List>

                </Card>
              </Fade>
            )}

            {/* Upload Progress */}
            {recordingState.uploading && recordingState.uploadProgress > 0 && (
              <Box
                sx={{
                  position: 'fixed',
                  top: 64,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 10001,
                  minWidth: 300,
                  background: 'rgba(59, 130, 246, 0.9)',
                  backdropFilter: 'blur(16px)',
                  color: 'white',
                  padding: 2,
                  borderRadius: 2,
                }}
              >
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Uploading Recording... {recordingState.uploadProgress}%
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={recordingState.uploadProgress}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: 'rgba(255,255,255,0.3)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: '#4caf50',
                    },
                  }}
                />
              </Box>
            )}

            {/* Meeting Link Popup - Google Meet Style */}
            {showMeetingLinkPopup && !meetingLinkMinimized && (
              <Fade in={showMeetingLinkPopup && !meetingLinkMinimized}>
                <Card
                  sx={{
                    position: 'fixed',
                    top: '50%',
                    left: 24,
                    transform: 'translateY(-50%)',
                    background: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: 1.5,
                    border: '1px solid rgba(0, 0, 0, 0.08)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
                    color: '#1f2937',
                    width: 360,
                    maxWidth: 'calc(100vw - 48px)',
                    zIndex: 10001,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    {/* Header */}
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        mb: 2,
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{
                          color: '#1f2937',
                          fontWeight: 500,
                          fontSize: '1.125rem',
                        }}
                      >
                        Your meeting's ready
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => setShowMeetingLinkPopup(false)}
                        sx={{
                          color: '#6b7280',
                          mt: -0.5,
                          '&:hover': {
                            backgroundColor: 'rgba(0, 0, 0, 0.04)'
                          }
                        }}
                      >
                        <Close sx={{ fontSize: 20 }} />
                      </IconButton>
                    </Box>


                    {/* Description */}
                    <Typography
                      variant="body2"
                      sx={{
                        color: '#5f6368',
                        fontSize: '0.875rem',
                        mb: 2,
                        lineHeight: 1.5,
                      }}
                    >
                      Or share this meeting link with others that you want in the meeting
                    </Typography>

                    {/* Meeting Link Box */}
                    <Box
                      sx={{
                        backgroundColor: '#f8f9fa',
                        borderRadius: 1.5,
                        p: 1.5,
                        mb: 2,
                        border: '1px solid #e8eaed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          color: '#1f2937',
                          fontSize: '0.875rem',
                          wordBreak: 'break-all',
                          flex: 1,
                          // fontFamily: 'monospace',
                        }}
                      >
                        {meetingLink}
                      </Typography>
                      <Tooltip title="Copy meeting link">
                        <IconButton
                          size="small"
                          onClick={handleCopyMeetingLink}
                          sx={{
                            color: '#5f6368',
                            flexShrink: 0,
                            '&:hover': {
                              backgroundColor: 'rgba(0, 0, 0, 0.04)',
                              color: '#1a73e8',
                            }
                          }}
                        >
                          <ContentCopy sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>

                    {/* Security Notice */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        p: 1.5,
                        backgroundColor: '#e8f0fe',
                        borderRadius: 1.5,
                        border: '1px solid #d2e3fc',
                      }}
                    >
                      <Security
                        sx={{
                          fontSize: 20,
                          color: '#1967d2',
                          mt: 0.2,
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        variant="caption"
                        sx={{
                          color: '#1967d2',
                          fontSize: '0.75rem',
                          lineHeight: 1.4,
                        }}
                      >
                        People who use this meeting link must get your permission before they can join.
                      </Typography>
                    </Box>

                    {/* User Info */}
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#5f6368',
                        fontSize: '0.75rem',
                        mt: 2,
                        display: 'block',
                      }}
                    >
                      Joined as {currentUser?.email || getParticipantDisplayName(currentUser)}
                    </Typography>
                  </CardContent>
                </Card>
              </Fade>
            )}



            {/* Minimized Meeting Info Button */}
            {meetingLinkMinimized && (
              <Tooltip title="Meeting details">
                <IconButton
                  onClick={() => {
                    setMeetingLinkMinimized(false);
                    setShowMeetingLinkPopup(true);
                  }}
                  sx={{
                    position: 'fixed',
                    bottom: 24,
                    left: 24,
                    width: 48,
                    height: 48,
                    background: 'white',
                    color: '#5f6368',
                    border: '1px solid #e8eaed',
                    borderRadius: '50%',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
                    zIndex: 10001,
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',

                    '&:hover': {
                      background: '#f8f9fa',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.16)',
                      color: '#1967d2',
                    },
                  }}
                >
                  <MeetingRoomIcon />
                </IconButton>
              </Tooltip>
            )}
          </>
        )}

        {/* WHITEBOARD TAB CONTENT */}
        {activeTab === 'whiteboard' && availableTabs.includes('whiteboard') && (
          <Box sx={{ flex: 1, height: '100%', overflow: 'hidden', background: '#f8f9fa' }}>
            {hasHostPrivileges ? (
              <Whiteboard
                meetingId={realMeetingId}
                currentUser={currentUser}
                participants={allParticipants}
                isHost={hasHostPrivileges}
                socket={room}
                onClose={() => handleCloseTab('whiteboard')}
                isOpen={true}
                onError={handleWhiteboardError}
                onSuccess={handleWhiteboardSuccess}
                sx={{
                  height: '100%',
                  width: '100%',
                  '& .MuiPaper-root': {
                    borderRadius: 0,
                    height: '100%',
                  },
                }}
              />
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: 2,
                  p: 4,
                }}
              >
                <WhiteboardIcon sx={{ fontSize: 64, color: 'rgba(0, 0, 0, 0.3)' }} />
                <Typography variant="h5" sx={{ color: 'rgba(0, 0, 0, 0.7)', textAlign: 'center' }}>
                  Whiteboard Access Restricted
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(0, 0, 0, 0.5)', textAlign: 'center', maxWidth: 400 }}>
                  Only hosts and co-hosts can access the whiteboard. Please contact the meeting host if you need whiteboard access.
                </Typography>
                <Button
                  variant="outlined"
                  onClick={() => handleCloseTab('whiteboard')}
                  sx={{ mt: 2 }}
                >
                  Close Whiteboard
                </Button>
              </Box>
            )}
          </Box>
        )}
      </Box>



      {/* Enhanced Notification Snackbar */}
      <Snackbar
        open={showNotification}
        autoHideDuration={4000}
        onClose={() => setShowNotification(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowNotification(false)}
          severity={notification?.severity || 'info'}
          sx={{
            width: '100%',
            background: 'rgba(45, 55, 72, 0.98)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 2,
            color: 'white',
          }}
        >
          {notification?.message}
        </Alert>
      </Snackbar>
    </MeetingContainer>
  );
});

export default MeetingRoom;