// src/hooks/useLiveKit.js - FIXED HOOK CALL ERRORS AND REACT QUEUE ISSUES
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Room,
  RoomEvent,
  Track,
  TrackPublication,
  ParticipantEvent,
  ConnectionState,
  LocalParticipant,
  RemoteParticipant,
  createLocalTracks,
  createLocalVideoTrack,
  createLocalAudioTrack,
  LocalVideoTrack,
  LocalAudioTrack,
  DataPacket_Kind,
  VideoPresets,
  ScreenSharePresets,
  RemoteTrackPublication,
} from "livekit-client";
import { throttle, debounce } from "lodash";
import { API_BASE_URL } from "../utils/constants";
import { participantsAPI, queueAPI } from "../services/api";
import { meetingsAPI } from '../services/api';

// Enhanced performance configuration for 50+ participants
const PERFORMANCE_CONFIG = {
  MAX_VIDEO_PARTICIPANTS: 300,
  THROTTLE_DELAYS: {
    PARTICIPANT_UPDATE: 200,
    STATE_UPDATE: 100,
    TRACK_UPDATE: 150,
  },
  CONNECTION: {
    CONNECTION_TIMEOUT: 30000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000,
    HEARTBEAT_INTERVAL: 30000,
    RECONNECT_DELAY: 5000,
    STABILITY_CHECK_INTERVAL: 100,
    STABILITY_CHECK_COUNT: 10,
  },
  MEMORY: {
    MAX_CACHED_STREAMS: 50,
    MAX_MESSAGES: 100,
    MAX_REACTIONS: 10,
  },
  PARTICIPANT_SYNC_INTERVAL: 10000,
  VIDEO_QUALITY: {
    LOCAL: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: 15,
    },
    REMOTE: {
      width: { ideal: 320 },
      height: { ideal: 240 },
      frameRate: 10,
    },
  },
};

// CRITICAL FIX: Ensure this is a proper React hook with stable structure
const useLiveKit = () => {
  // FIXED: Initialize all state with proper default values to prevent queue issues
  const [room, setRoom] = useState(null);
  const [connectionState, setConnectionState] = useState("disconnected");
  const [participants, setParticipants] = useState([]);
  const [localParticipant, setLocalParticipant] = useState(null);
  const [remoteParticipants, setRemoteParticipants] = useState(new Map());

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  // Media State - Start with audio/video OFF
  const [localTracks, setLocalTracks] = useState({
    audio: null,
    video: null,
    screenShare: null,
  });
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);

  // Screen share tracking
  const [screenSharingParticipant, setScreenSharingParticipant] = useState(null);
  const [localIsScreenSharing, setLocalIsScreenSharing] = useState(false);
  const [screenShareTrack, setScreenShareTrack] = useState(null);

  // Screen Share Permission System
  const [screenSharePermissions, setScreenSharePermissions] = useState({
    requiresHostApproval: true,
    hasPermission: false,
    pendingRequest: false,
    requestId: null,
    hostUserId: null
  });
  const [screenShareRequests, setScreenShareRequests] = useState([]);
  const [currentScreenShareRequest, setCurrentScreenShareRequest] = useState(null);

  // Chat and Data
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);

  // Meeting Info
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [roomMetadata, setRoomMetadata] = useState({});

  // Queue management state
  const [queueStatus, setQueueStatus] = useState(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [maxParticipants, setMaxParticipants] = useState(50);
  const [performanceMode, setPerformanceMode] = useState("standard");

  // Meeting control state
  const [meetingEnded, setMeetingEnded] = useState(false);

  // FIXED: Initialize all refs properly to prevent undefined errors
  const roomRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const connectionReadyRef = useRef(false);
  const isConnectedRef = useRef(false);
  const connectionAttemptRef = useRef(false);
  const connectionTimeoutRef = useRef(null);
  const mediaInitializedRef = useRef(false);
  const eventHandlersRef = useRef(new Map());
  const streamCacheRef = useRef(new Map());
  const lastUpdateTimeRef = useRef(0);
  const userIdRef = useRef(null);
  const screenShareStreamRef = useRef(null);
  const queuePollIntervalRef = useRef(null);
  const audioTrackRef = useRef(null);
  const videoTrackRef = useRef(null);
  const remoteAudioElementsRef = useRef(new Map());
  const remoteAudioTracksRef = useRef(new Map());
  const localParticipantIdentityRef = useRef(null);
  const localParticipantSidRef = useRef(null);
  const currentMeetingIdRef = useRef(null);
const isCoHostRef = useRef(false); 
  // Connection lock to prevent multiple simultaneous attempts
  const connectionLockRef = useRef(false);
  const activeConnectionRef = useRef(null);

  // Track mute states - START MUTED
  const audioMutedRef = useRef(true);
  const videoMutedRef = useRef(true);
  const speakerMutedRef = useRef(false);

  // Track muted participants to not play their audio
  const mutedParticipantsRef = useRef(new Set());

  // Screen share state tracking ref
  const screenShareStateRef = useRef({
    isPublishing: false,
    videoTrackPublished: false,
    audioTrackPublished: false,
    publishingPromises: new Map()
  });

  // Permission system refs
  const isHostRef = useRef(false);
  const screenShareCallbacksRef = useRef(new Map());

  // CRITICAL FIX: Create throttled function with useMemo to prevent recreation
  const throttledParticipantUpdate = useMemo(
    () =>
      throttle(
        (updateFn) => {
          const now = Date.now();
          if (now - lastUpdateTimeRef.current > 50) {
            lastUpdateTimeRef.current = now;
            setRemoteParticipants((prev) => {
              const newMap = new Map(prev);
              updateFn(newMap);
              return newMap;
            });
          }
        },
        PERFORMANCE_CONFIG.THROTTLE_DELAYS.PARTICIPANT_UPDATE,
        { leading: true, trailing: true }
      ),
    [] // Empty dependency array for stable reference
  );

  // Cleanup all audio elements
  const cleanupAllAudioElements = useCallback(() => {
    remoteAudioElementsRef.current.forEach((audioElement, participantSid) => {
      if (audioElement && audioElement.parentNode) {
        audioElement.pause();
        audioElement.srcObject = null;
        audioElement.remove();
      }
    });
    remoteAudioElementsRef.current.clear();
    remoteAudioTracksRef.current.clear();
    mutedParticipantsRef.current.clear();
  }, []);

  // Check if participant is local
  const isLocalParticipant = useCallback((participant) => {
    if (!participant) return false;

    const roomLocalParticipant = roomRef.current?.localParticipant;
    if (!roomLocalParticipant) return false;

    if (participant.sid === roomLocalParticipant.sid) {
      return true;
    }

    if (participant.identity === roomLocalParticipant.identity) {
      return true;
    }

    const currentUserId = userIdRef.current?.toString();
    const participantUserId = participant.identity?.split("_")[1];

    if (
      currentUserId &&
      participantUserId &&
      currentUserId === participantUserId
    ) {
      return true;
    }

    return false;
  }, []);

  // Attach remote audio track
// FIXED: Better audio element attachment
const attachRemoteAudioTrack = useCallback(
  (track, participant) => {
    if (isLocalParticipant(participant)) {
      return null;
    }


    // Clean up existing element first
    const existingElement = remoteAudioElementsRef.current.get(participant.sid);
    if (existingElement) {
      existingElement.pause();
      existingElement.srcObject = null;
      if (existingElement.parentNode) {
        existingElement.remove();
      }
    }

    const audioElement = track.attach();
    if (audioElement) {
      // FIXED: Ensure audio element is properly configured
      audioElement.autoplay = true;
      audioElement.playsInline = true;
      audioElement.controls = false;
      audioElement.style.display = "none";
      audioElement.volume = speakerMutedRef.current ? 0 : 1;

      // Add data attributes for identification
      audioElement.setAttribute("data-participant-sid", participant.sid);
      audioElement.setAttribute("data-participant-identity", participant.identity);
      audioElement.setAttribute("data-livekit-audio", "true"); // For recording detection

      remoteAudioElementsRef.current.set(participant.sid, audioElement);
      document.body.appendChild(audioElement);

      // FIXED: Better audio playback handling
      const playPromise = audioElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
          })
          .catch((err) => {
            console.warn("Audio autoplay blocked:", err);
            // Try to play with user gesture
            document.addEventListener('click', () => {
              audioElement.play().catch(console.warn);
            }, { once: true });
          });
      }

      return audioElement;
    }

    return null;
  },
  [isLocalParticipant]
);

  // Remove audio for participant
  const removeParticipantAudio = useCallback((participant) => {

    const audioElement = remoteAudioElementsRef.current.get(participant.sid);
    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
      if (audioElement.parentNode) {
        audioElement.remove();
      }
    }
    remoteAudioElementsRef.current.delete(participant.sid);
  }, []);

  // Handle reactions
  const handleReaction = useCallback((data) => {
    const reactionId = Date.now();
    setReactions((prev) => {
      const newReactions = [
        ...prev.slice(-PERFORMANCE_CONFIG.MEMORY.MAX_REACTIONS + 1),
        {
          id: reactionId,
          emoji: data.emoji,
          userName: data.user_name,
          userId: data.user_id,
          timestamp: data.timestamp,
        },
      ];

      setTimeout(() => {
        setReactions((current) => current.filter((r) => r.id !== reactionId));
      }, 3000);

      return newReactions;
    });
  }, []);

  // Handle meeting ended signal
  // In useLiveKit.js - Update handleMeetingEnded function
const handleMeetingEnded = useCallback((data) => {
  setMeetingEnded(true);

  if (window.showNotificationMessage) {
    window.showNotificationMessage(
      data.message || "Meeting has been ended by the host",
      "warning"
    );
  }

  setTimeout(async () => {
    try {
      await disconnectFromRoom();
      
      // AUTO-REFRESH WHEN MEETING ENDS
      window.location.reload();
      
    } catch (error) {
      console.error("Error during meeting end cleanup:", error);
      // Force refresh even if cleanup fails
      window.location.reload();
    }
  }, 5000); // 5 second delay to show end message
}, []);
  // FIXED: Remove circular dependency

  // Screen Share Permission Functions
  const requestScreenSharePermission = useCallback(async (userId, userName) => {
    if (!roomRef.current || !isConnectedRef.current) {
      throw new Error("Not connected to room");
    }

    const requestId = `ss_req_${Date.now()}_${userId}`;
    
    try {
      const encoder = new TextEncoder();
      const requestData = encoder.encode(
        JSON.stringify({
          type: "screen_share_request",
          request_id: requestId,
          user_id: userId,
          user_name: userName,
          timestamp: Date.now(),
          sender_id: roomRef.current.localParticipant.sid,
        })
      );

      roomRef.current.localParticipant.publishData(
        requestData,
        DataPacket_Kind.RELIABLE
      );

      setScreenSharePermissions(prev => ({
        ...prev,
        pendingRequest: true,
        requestId: requestId
      }));

      return requestId;

    } catch (error) {
      console.error("Failed to request screen share permission:", error);
      throw error;
    }
  }, []);

  const approveScreenShareRequest = useCallback(async (requestId, userId) => {
    if (!isHostRef.current) {
      throw new Error("Only hosts can approve screen share requests");
    }

    try {
      const encoder = new TextEncoder();
      const approvalData = encoder.encode(
        JSON.stringify({
          type: "screen_share_approval",
          request_id: requestId,
          user_id: userId,
          approved: true,
          timestamp: Date.now(),
          sender_id: roomRef.current.localParticipant.sid,
        })
      );

      roomRef.current.localParticipant.publishData(
        approvalData,
        DataPacket_Kind.RELIABLE
      );

      setScreenShareRequests(prev => 
        prev.filter(req => req.request_id !== requestId)
      );

      return true;

    } catch (error) {
      console.error("Failed to approve screen share request:", error);
      throw error;
    }
  }, []);

  const denyScreenShareRequest = useCallback(async (requestId, userId) => {
    if (!isHostRef.current) {
      throw new Error("Only hosts can deny screen share requests");
    }

    try {
      const encoder = new TextEncoder();
      const denialData = encoder.encode(
        JSON.stringify({
          type: "screen_share_approval",
          request_id: requestId,
          user_id: userId,
          approved: false,
          timestamp: Date.now(),
          sender_id: roomRef.current.localParticipant.sid,
        })
      );

      roomRef.current.localParticipant.publishData(
        denialData,
        DataPacket_Kind.RELIABLE
      );

      setScreenShareRequests(prev => 
        prev.filter(req => req.request_id !== requestId)
      );

      return true;

    } catch (error) {
      console.error("Failed to deny screen share request:", error);
      throw error;
    }
  }, []);

  const handleScreenShareRequest = useCallback((data) => {

    if (isHostRef.current) {
      setScreenShareRequests(prev => [...prev, {
        request_id: data.request_id,
        user_id: data.user_id,
        user_name: data.user_name,
        timestamp: data.timestamp,
        sender_id: data.sender_id
      }]);

      setCurrentScreenShareRequest({
        request_id: data.request_id,
        user_id: data.user_id,
        user_name: data.user_name,
        timestamp: data.timestamp
      });
    }
  }, []);

  const handleScreenShareApproval = useCallback((data) => {

    const currentUserId = userIdRef.current?.toString();
    if (data.user_id?.toString() === currentUserId) {
      if (data.approved) {
        setScreenSharePermissions(prev => ({
          ...prev,
          hasPermission: true,
          pendingRequest: false,
          requestId: null
        }));

        const callback = screenShareCallbacksRef.current.get(data.request_id);
        if (callback) {
          callback.resolve(true);
          screenShareCallbacksRef.current.delete(data.request_id);
        }
      } else {
        setScreenSharePermissions(prev => ({
          ...prev,
          hasPermission: false,
          pendingRequest: false,
          requestId: null
        }));

        const callback = screenShareCallbacksRef.current.get(data.request_id);
        if (callback) {
          callback.reject(new Error("Screen share request was denied by host"));
          screenShareCallbacksRef.current.delete(data.request_id);
        }
      }
    }

    setScreenShareRequests(prev => 
      prev.filter(req => req.request_id !== data.request_id)
    );
    setCurrentScreenShareRequest(null);
  }, []);


// Participant removal handler
// In useLiveKit.js - Update handleParticipantRemoved function
const handleParticipantRemoved = useCallback((data) => {

  const currentUserId = userIdRef.current?.toString();
  
  if (data.target_user_id?.toString() === currentUserId) {
    
    if (window.showNotificationMessage) {
      window.showNotificationMessage(
        data.message || "You have been removed from the meeting by the host",
        "error"
      );
    }

    // Set meeting ended state
    setMeetingEnded(true);

    // AUTO-REFRESH AFTER REMOVAL
    setTimeout(async () => {
      try {        
        // Clean up everything
        cleanupAllAudioElements();
        
        // Disconnect from room
        if (roomRef.current) {
          await roomRef.current.disconnect();
        }
        
        // REFRESH THE ENTIRE APPLICATION
        window.location.reload();
        
      } catch (error) {
        console.error("Error during forced disconnect:", error);
        // Force refresh even if cleanup fails
        window.location.reload();
      }
    }, 2000); // 2 second delay to show removal message
  }
}, [cleanupAllAudioElements]);

  // CRITICAL FIX: Handle disconnection properly
  const handleDisconnection = useCallback((reason) => {
  
  // Check if this is a forced disconnection (user was removed)
  const isForcedDisconnect = reason === 'KICKED' || 
                            reason === 'REMOVED' || 
                            reason === 2 || // LiveKit disconnect code for kicked
                            meetingEnded;

  if (isForcedDisconnect) {
    // Don't attempt reconnection for forced disconnects
    setMeetingEnded(true);
  }

  setIsConnected(false);
  isConnectedRef.current = false;
  connectionReadyRef.current = false;
  setConnectionState("disconnected");

  // Clear media states
  setIsScreenSharing(false);
  setLocalIsScreenSharing(false);
  setScreenSharingParticipant(null);
  setScreenShareTrack(null);
  screenShareStreamRef.current = null;

  // Clear track references
  audioTrackRef.current = null;
  videoTrackRef.current = null;
  localParticipantSidRef.current = null;

  // Clear connection lock
  connectionLockRef.current = false;
  activeConnectionRef.current = null;

  // Clear screen share state
  screenShareStateRef.current.isPublishing = false;
  screenShareStateRef.current.videoTrackPublished = false;
  screenShareStateRef.current.audioTrackPublished = false;
  screenShareStateRef.current.publishingPromises.clear();

  // Reset screen share permissions
  setScreenSharePermissions({
    requiresHostApproval: true,
    hasPermission: false,
    pendingRequest: false,
    requestId: null,
    hostUserId: null
  });

  // Clean up all audio elements
  cleanupAllAudioElements();

  // Enhanced reconnection logic - but NOT for forced disconnects
  if (!isForcedDisconnect && 
      reason !== "LEAVE" &&
      reason !== "USER_DISCONNECT" &&
      !meetingEnded) {
    
    if (reconnectTimeoutRef.current === null) {

      reconnectTimeoutRef.current = setTimeout(async () => {
        reconnectTimeoutRef.current = null;

        if (!isConnectedRef.current && roomRef.current && !meetingEnded) {

          try {
            await roomRef.current.reconnect();

            setIsConnected(true);
            isConnectedRef.current = true;
            connectionReadyRef.current = true;
            setConnectionState("connected");
          } catch (reconnectError) {
            console.error("Reconnection failed:", reconnectError);
            connectionAttemptRef.current = false;
          }
        }
      }, 5000);
    }
  } else {
  }
}, [cleanupAllAudioElements, meetingEnded]);

  // CRITICAL FIX: Setup event listeners with stable callbacks
  const setupOptimizedEventListeners = useCallback(
    (room) => {
      if (!room) return;

      // FIXED: Use proper throttle with stable references
      const handleConnectionStateChanged = throttle((state) => {
        setConnectionState(state);
        setIsConnected(state === ConnectionState.Connected);
        isConnectedRef.current = state === ConnectionState.Connected;
      }, 1000);

      const handleTrackSubscribed = debounce(
        (track, publication, participant) => {

          if (isLocalParticipant(participant)) {
            return;
          }

          if (track.kind === Track.Kind.Audio) {
            remoteAudioTracksRef.current.set(participant.sid, track);

            if (publication.isMuted) {
              mutedParticipantsRef.current.add(participant.sid);
            } else {
              mutedParticipantsRef.current.delete(participant.sid);
              attachRemoteAudioTrack(track, participant);
            }
          }

          if (publication.source === Track.Source.ScreenShare) {
            setScreenSharingParticipant(participant);
            setIsScreenSharing(true);

            if (track && track.mediaStreamTrack) {
              const screenStream = new MediaStream([track.mediaStreamTrack]);
              screenShareStreamRef.current = screenStream;
              setScreenShareTrack(track);
            } else if (track && typeof track.attach === "function") {
              try {
                const element = track.attach();
                screenShareStreamRef.current = element;
                setScreenShareTrack(track);
              } catch (err) {
                console.error("Error attaching screen share:", err);
                screenShareStreamRef.current = track;
                setScreenShareTrack(track);
              }
            } else {
              screenShareStreamRef.current = track;
              setScreenShareTrack(track);
            }
          }
        },
        100
      );

      const handleParticipantConnected = throttle((participant) => {
        if (isLocalParticipant(participant)) {
          return;
        }


        throttledParticipantUpdate((map) => {
          map.set(participant.identity, participant);
        });

        setParticipantCount((prev) => prev + 1);
      }, 200);

      const handleParticipantDisconnected = throttle((participant) => {
        if (isLocalParticipant(participant)) return;

        const participantId = participant.identity;
        let userId = participant.identity;
        if (participant.identity?.includes('user_')) {
          userId = participant.identity.split('_')[1];
        }
        // Check if this is a forced removal
        const isForced = participant.metadata?.removed === true || 
                        participant.reason === 'KICKED' ||
                        participant.reason === 'REMOVED';

        // Clean up audio for disconnected participant
        removeParticipantAudio(participant);
        mutedParticipantsRef.current.delete(participant.sid);

        // CRITICAL: Remove from LiveKit participant state immediately
        throttledParticipantUpdate((map) => {
          map.delete(participant.identity);
          map.delete(participantId);
          map.delete(userId);
        });

        // Update participant count
        setParticipantCount((prev) => Math.max(0, prev - 1));

        // CRITICAL: Dispatch immediate removal events for UI updates
        window.dispatchEvent(new CustomEvent('participantLeft', {
          detail: {
            participantId: participantId,
            userId: userId,
            identity: participant.identity,
            isForced: isForced,
            timestamp: Date.now(),
            source: 'livekit_disconnect'
          }
        }));

        window.dispatchEvent(new CustomEvent('participantDisconnected', {
          detail: {
            participantId: participantId,
            userId: userId,
            identity: participant.identity,
            timestamp: Date.now(),
            source: 'livekit_disconnect'
          }
        }));

        // If this was a forced removal, dispatch specific removal event
        if (isForced) {
          window.dispatchEvent(new CustomEvent('participantRemoved', {
            detail: {
              removedUserId: userId,
              removedUserName: participant.name || `User ${userId}`,
              removedBy: 'system',
              timestamp: Date.now(),
              reason: 'forced_disconnect',
              meetingId: currentMeetingIdRef.current
            }
          }));
        }

      }, 200);

      const handleTrackUnsubscribed = debounce(
        (track, publication, participant) => {
          if (isLocalParticipant(participant)) return;
          if (track.kind === Track.Kind.Audio) {
            removeParticipantAudio(participant);
            remoteAudioTracksRef.current.delete(participant.sid);
            mutedParticipantsRef.current.delete(participant.sid);
          }

          if (publication.source === Track.Source.ScreenShare) {
            setScreenSharingParticipant((prev) => {
              if (prev?.sid === participant.sid) {
                screenShareStreamRef.current = null;
                setIsScreenSharing(false);
                return null;
              }
              return prev;
            });
          }
        },
        100
      );

const handleTrackPublished = (publication, participant) => {
  if (isLocalParticipant(participant)) {
    return;
  }

  console.log('🎬 Track published:', {
    participant: participant.identity,
    source: publication.source,
    kind: publication.kind,
    isSubscribed: publication.isSubscribed
  });

  // CRITICAL: Auto-subscribe to screen shares immediately
  if (publication.source === Track.Source.ScreenShare || 
      publication.source === Track.Source.ScreenShareAudio) {
    console.log('📺 Auto-subscribing to screen share track');
    if (!publication.isSubscribed && publication.isEnabled) {
      publication.setSubscribed(true);
    }
  } else {
    // Subscribe to other tracks as well
    if (!publication.isSubscribed && publication.isEnabled) {
      publication.setSubscribed(true);
    }
  }
};


      const handleDataReceived = throttle((payload, participant) => {
        try {
          const decoder = new TextDecoder();
          const data = JSON.parse(decoder.decode(payload));

          if (data.type === "chat_message") {
            setMessages((prev) => [
              ...prev.slice(-PERFORMANCE_CONFIG.MEMORY.MAX_MESSAGES + 1),
              {
                id: Date.now(),
                message: data.message,
                userName: data.user_name,
                userId: data.user_id,
                timestamp: data.timestamp,
              },
            ]);
          } else if (data.type === "reaction") {
            handleReaction(data);
          } else if (data.type === "meeting_ended") {
            handleMeetingEnded(data);
          } else if (data.type === "screen_share_request") {
            handleScreenShareRequest(data);
          } else if (data.type === "screen_share_approval") {
            handleScreenShareApproval(data);
          } else if (data.type === "participant_removed") {
            handleParticipantRemoved(data);
          }
        } catch (error) {
          console.error("Data parse error:", error);
        }
      }, 50);

      const handleTrackMuted = (publication, participant) => {

        if (publication.kind === Track.Kind.Audio && !isLocalParticipant(participant)) {
          mutedParticipantsRef.current.add(participant.sid);
          removeParticipantAudio(participant);
        }

        throttledParticipantUpdate((map) => {
          const p = map.get(participant.identity);
          if (p) map.set(participant.identity, { ...p });
        });
      };

      const handleTrackUnmuted = (publication, participant) => {

        if (publication.kind === Track.Kind.Audio && !isLocalParticipant(participant)) {
          mutedParticipantsRef.current.delete(participant.sid);
          const track = remoteAudioTracksRef.current.get(participant.sid);
          if (track) {
            attachRemoteAudioTrack(track, participant);
          }
        }

        throttledParticipantUpdate((map) => {
          const p = map.get(participant.identity);
          if (p) map.set(participant.identity, { ...p });
        });
      };

      const handleDisconnected = (reason) => {
        handleDisconnection(reason);
      };

      // Store handlers in ref for cleanup
      eventHandlersRef.current.clear();
      eventHandlersRef.current.set(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
      eventHandlersRef.current.set(RoomEvent.ParticipantConnected, handleParticipantConnected);
      eventHandlersRef.current.set(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      eventHandlersRef.current.set(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      eventHandlersRef.current.set(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      eventHandlersRef.current.set(RoomEvent.TrackPublished, handleTrackPublished);
      eventHandlersRef.current.set(RoomEvent.TrackMuted, handleTrackMuted);
      eventHandlersRef.current.set(RoomEvent.TrackUnmuted, handleTrackUnmuted);
      eventHandlersRef.current.set(RoomEvent.DataReceived, handleDataReceived);
      eventHandlersRef.current.set(RoomEvent.Disconnected, handleDisconnected);

      // Add event listeners
      room.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
      room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      room.on(RoomEvent.TrackPublished, handleTrackPublished);
      room.on(RoomEvent.TrackMuted, handleTrackMuted);
      room.on(RoomEvent.TrackUnmuted, handleTrackUnmuted);
      room.on(RoomEvent.DataReceived, handleDataReceived);
      room.on(RoomEvent.Disconnected, handleDisconnected);
    },
    [
      throttledParticipantUpdate,
      handleDisconnection,
      handleReaction,
      handleMeetingEnded,
      attachRemoteAudioTrack,
      removeParticipantAudio,
      isLocalParticipant,
      handleScreenShareRequest,
      handleScreenShareApproval,
      handleParticipantRemoved,
    ]
  );

  // CRITICAL FIX: Get access token without hooks in nested functions
  const getAccessTokenWithRetry = useCallback(async (meetingId, userId, displayName, isHost) => {
    let retryCount = 0;
    const maxRetries = PERFORMANCE_CONFIG.CONNECTION.MAX_RETRIES;

    while (retryCount < maxRetries) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/livekit/join-meeting/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
          },
          body: JSON.stringify({
            meeting_id: meetingId,
            user_id: userId,
            user_name: displayName,
            is_host: isHost || false,
            meetingId,
            userId,
            displayName,
            isHost: isHost || false
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.access_token) {
          return {
            success: true,
            accessToken: data.access_token,
            access_token: data.access_token,
            livekit_url: data.livekit_url,
            livekitUrl: data.livekit_url,
            meeting_info: data.meeting_info,
            meetingInfo: data.meeting_info,
            participant_identity: data.participant_identity,
            participantIdentity: data.participant_identity,
            room_name: data.room_name
          };
        } else {
          throw new Error("Invalid token response");
        }
      } catch (error) {
        retryCount++;
        console.warn(`Token retry ${retryCount}/${maxRetries}:`, error.message);

        if (retryCount >= maxRetries) {
          throw error;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, PERFORMANCE_CONFIG.CONNECTION.RETRY_DELAY * retryCount)
        );
      }
    }
  }, []);

  // Wait for stable connection
  const waitForStableConnection = useCallback(async (room, timeout = 15000) => {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = PERFORMANCE_CONFIG.CONNECTION.STABILITY_CHECK_INTERVAL;
      let lastState = room.state;
      let stableCount = 0;
      const requiredStableChecks = PERFORMANCE_CONFIG.CONNECTION.STABILITY_CHECK_COUNT;

      const checkConnection = () => {
        const elapsed = Date.now() - startTime;

        if (elapsed > timeout) {
          reject(new Error("Connection stability timeout"));
          return;
        }

        const currentState = room.state;

        if (currentState === ConnectionState.Connected && room.localParticipant) {
          if (currentState === lastState) {
            stableCount++;
            if (stableCount >= requiredStableChecks) {
              if (room.engine && room.engine.client && room.localParticipant.sid) {
                resolve(true);
                return;
              }
            }
          } else {
            stableCount = 0;
          }
        } else {
          stableCount = 0;
        }

        lastState = currentState;
        setTimeout(checkConnection, checkInterval);
      };

      checkConnection();
    });
  }, []);

  const checkExistingScreenShares = useCallback((room) => {
  if (!room) return;
  
  console.log('🔍 Checking for existing screen shares...');
  
  // Check all remote participants for screen share tracks
  room.remoteParticipants.forEach((participant) => {
    console.log(`Checking participant ${participant.identity}:`, {
      trackCount: participant.trackPublications.size,
      tracks: Array.from(participant.trackPublications.values()).map(pub => ({
        source: pub.source,
        kind: pub.kind,
        isSubscribed: pub.isSubscribed,
        track: !!pub.track
      }))
    });
    
    participant.trackPublications.forEach((publication) => {
      // Check for screen share video track
      if (publication.source === Track.Source.ScreenShare) {
        console.log('✅ Found existing screen share from:', participant.identity);
        
        // Subscribe to the track if not already subscribed
        if (!publication.isSubscribed) {
          publication.setSubscribed(true);
        }
        
        // If track is already available, set it immediately
        if (publication.track) {
          console.log('📺 Screen share track already available, setting state...');
          
          setScreenSharingParticipant(participant);
          setIsScreenSharing(true);
          
          // Create MediaStream from track
          if (publication.track.mediaStreamTrack) {
            const screenStream = new MediaStream([publication.track.mediaStreamTrack]);
            screenShareStreamRef.current = screenStream;
            setScreenShareTrack(publication.track);
            console.log('✅ Screen share state updated for late joiner');
          }
        }
      }
      
      // Check for screen share audio track
      if (publication.source === Track.Source.ScreenShareAudio) {
        console.log('🔊 Found existing screen share audio from:', participant.identity);
        if (!publication.isSubscribed) {
          publication.setSubscribed(true);
        }
      }
    });
  });
}, []);

  // Participant sync
  const startParticipantSync = useCallback((meetingId) => {
    if (!meetingId) return;

    currentMeetingIdRef.current = meetingId;

    const syncParticipants = async () => {
      try {
        const response = await participantsAPI.syncParticipantsOptimized(meetingId);
      } catch (error) {
        console.warn("Participant sync failed:", error);
      }
    };

    syncParticipants();

    const syncInterval = setInterval(
      syncParticipants,
      PERFORMANCE_CONFIG.PARTICIPANT_SYNC_INTERVAL
    );

    heartbeatIntervalRef.current = syncInterval;
  }, []);



  // Heartbeat
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) return;

    heartbeatIntervalRef.current = setInterval(() => {
      if (roomRef.current && isConnectedRef.current) {
        try {
          const encoder = new TextEncoder();
          const data = encoder.encode(
            JSON.stringify({
              type: "heartbeat",
              timestamp: Date.now(),
            })
          );
          roomRef.current.localParticipant.publishData(data, DataPacket_Kind.RELIABLE);
        } catch (error) {
          console.warn("Heartbeat failed:", error);
        }
      }
    }, PERFORMANCE_CONFIG.CONNECTION.HEARTBEAT_INTERVAL);
  }, []);

  // Cleanup existing connection
  const cleanupExistingConnection = useCallback(async () => {
    try {
      cleanupAllAudioElements();

      if (roomRef.current) {
        eventHandlersRef.current.forEach((handler, event) => {
          roomRef.current.off(event, handler);
        });
        eventHandlersRef.current.clear();

        if (roomRef.current.localParticipant) {
          const tracks = roomRef.current.localParticipant.tracks;
          if (tracks) {
            tracks.forEach((publication) => {
              if (publication.track) {
                publication.track.stop();
              }
            });
          }
        }

        if (roomRef.current.state !== ConnectionState.Disconnected) {
          await roomRef.current.disconnect(true);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        roomRef.current = null;
        setRoom(null);
      }

      localParticipantIdentityRef.current = null;
      localParticipantSidRef.current = null;
      currentMeetingIdRef.current = null;

      if (audioTrackRef.current) {
        audioTrackRef.current.stop();
        audioTrackRef.current = null;
      }
      if (videoTrackRef.current) {
        videoTrackRef.current.stop();
        videoTrackRef.current = null;
      }

      streamCacheRef.current.clear();
      screenShareStreamRef.current = null;

      // Reset screen share state
      screenShareStateRef.current.isPublishing = false;
      screenShareStateRef.current.videoTrackPublished = false;
      screenShareStateRef.current.audioTrackPublished = false;
      screenShareStateRef.current.publishingPromises.clear();

      // Reset permission system
      screenShareCallbacksRef.current.clear();
      setScreenSharePermissions({
        requiresHostApproval: true,
        hasPermission: false,
        pendingRequest: false,
        requestId: null,
        hostUserId: null
      });
      setScreenShareRequests([]);
      setCurrentScreenShareRequest(null);

      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    } catch (error) {
      console.warn("Cleanup error:", error);
    }
  }, [cleanupAllAudioElements]);

  // Recording functions
// UPDATED: Backend recording functions - remove all client-side recording logic
const startRecording = useCallback(async (meetingId, settings = {}) => {
  try {

    if (!roomRef.current || !isConnectedRef.current) {
      throw new Error("Not connected to room");
    }

    // Call backend recording API instead of browser recording
    const response = await meetingsAPI.startMeetingRecording(meetingId, {
      recording_type: 'server',
      quality: settings.quality || "hd",
      audio: settings.audio !== false,
      video: settings.video !== false,
      layout: settings.layout || "grid",
      include_system_audio: true,
      ...settings,
    });

    return { success: true, data: response };
  } catch (error) {
    console.error("Start recording failed:", error);
    throw error;
  }
}, []);

const stopRecording = useCallback(async (meetingId) => {
  try {

    // Call backend stop recording API
    const response = await meetingsAPI.stopMeetingRecording(meetingId);

    return { success: true, data: response };
  } catch (error) {
    console.error("Stop recording failed:", error);
    throw error;
  }
}, []);

  // Queue management functions
  const checkConnectionQueue = useCallback(async (meetingId, userId) => {
    try {
      const queueResponse = await queueAPI.checkQueue(meetingId, userId);
      setQueueStatus(queueResponse.queue_status);
      return queueResponse;
    } catch (error) {
      console.error("Queue check failed:", error);
      throw error;
    }
  }, []);

  const joinMeetingWithQueue = useCallback(async (meetingData) => {
    try {
      const queueResponse = await queueAPI.joinWithQueue(meetingData);

      setQueueStatus(queueResponse.queue_status);

      if (queueResponse.can_proceed) {
        return { success: true, queueStatus: queueResponse.queue_status };
      } else {
        return {
          success: false,
          queueStatus: queueResponse.queue_status,
          needsToWait: true,
        };
      }
    } catch (error) {
      console.error("Queue join failed:", error);
      throw error;
    }
  }, []);

  const waitForQueueTurn = useCallback(async (meetingId, userId) => {
    try {
      const queueResponse = await queueAPI.waitForQueueTurn(meetingId, userId);
      setQueueStatus(queueResponse.queue_status);
      return queueResponse;
    } catch (error) {
      console.error("Queue wait failed:", error);
      throw error;
    }
  }, []);

  // End meeting for everyone (host only)
  const endMeetingForEveryone = useCallback(async (meetingId) => {
    try {

      if (roomRef.current && isConnectedRef.current) {
        const encoder = new TextEncoder();
        const endMeetingData = encoder.encode(
          JSON.stringify({
            type: "meeting_ended",
            message: "Meeting has been ended by the host",
            timestamp: Date.now(),
            sender_id: roomRef.current.localParticipant.sid,
          })
        );

        roomRef.current.localParticipant.publishData(
          endMeetingData,
          DataPacket_Kind.RELIABLE
        );
      }

      const response = await fetch(
        `${API_BASE_URL}/api/meetings/${meetingId}/end`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
          body: JSON.stringify({
            reason: "host_ended",
            force_end: true,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to end meeting");
      }

      const result = await response.json();

      setMeetingEnded(true);
      // FIXED: Don't call disconnectFromRoom here to avoid circular dependency
      return { success: true, message: "Meeting ended successfully" };
    } catch (error) {
      console.error("End meeting failed:", error);
      throw error;
    }
  }, []);

  // CRITICAL FIX: Connection establishment without hook violations
// REPLACE the connectToRoom function in useLiveKit.js around line 1800
const connectToRoom = useCallback(
  async (meetingId, userId, displayName, options = {}) => {
    try {
      if (roomRef.current) {
        try {
          await roomRef.current.disconnect();
        } catch (e) {
        }
        roomRef.current = null;

        cleanupAllAudioElements();
        localParticipantSidRef.current = null;
        localParticipantIdentityRef.current = null;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (connectionLockRef.current) {
        if (activeConnectionRef.current) {
          return await activeConnectionRef.current;
        }
        return { success: false, error: "Connection in progress" };
      }

      if (isConnectedRef.current && roomRef.current?.state === ConnectionState.Connected) {
        return { success: true, room: roomRef.current };
      }

      connectionLockRef.current = true;

      const connectionPromise = (async () => {
        try {
          connectionAttemptRef.current = true;
          setIsConnecting(true);
          setError(null);
          setMeetingEnded(false);

          if (roomRef.current) {
            await cleanupExistingConnection();
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          if (!meetingId || !userId || !displayName) {
            throw new Error("Missing required parameters");
          }

          userIdRef.current = userId;
          currentMeetingIdRef.current = meetingId;
          isHostRef.current = options.isHost || false;
          isCoHostRef.current = options.isCoHost || false;

          // Set up permission system based on host status
          if (isHostRef.current) {
            setScreenSharePermissions(prev => ({
              ...prev,
              requiresHostApproval: false,
              hasPermission: true,
              hostUserId: userId
            }));
          } else {
            setScreenSharePermissions(prev => ({
              ...prev,
              requiresHostApproval: true,
              hasPermission: false,
              hostUserId: null
            }));
          }

          const tokenData = await getAccessTokenWithRetry(
            meetingId,
            userId,
            displayName,
            options.isHost
          );

          const newRoom = new Room({
            adaptiveStream: true,
            dynacast: true,
            publishDefaults: {
              audioPreset: "speech",
              videoCodec: "h264",
              stopMicTrackOnMute: false,
              stopVideoTrackOnMute: false,
              dtx: false,
              red: true,
              simulcast: true,
              screenShareSimulcast: true,
            },
            audioCaptureDefaults: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 2,
              sampleRate: 48000,
            },
            videoCaptureDefaults: {
              resolution: PERFORMANCE_CONFIG.VIDEO_QUALITY.LOCAL,
            },
          });

          roomRef.current = newRoom;
          setRoom(newRoom);

          setupOptimizedEventListeners(newRoom);

          let connectionSuccess = false;
          const connectionTimeout = setTimeout(() => {
            if (!connectionSuccess) {
              console.error("Connection timeout");
              newRoom.disconnect();
              throw new Error("Connection timeout");
            }
          }, 30000);

          try {
            await newRoom.connect(
              tokenData.livekit_url || tokenData.livekitUrl,
              tokenData.access_token || tokenData.accessToken,
              {
                autoSubscribe: true,
                publishOnly: false,
                reconnect: true,
                reconnectPolicy: {
                  maxRetries: 5,
                  nextRetryDelayInMs: (retryCount) => {
                    return Math.min(5000 * Math.pow(2, retryCount), 30000);
                  },
                },
              }
            );

            connectionSuccess = true;
            clearTimeout(connectionTimeout);


            if (newRoom.localParticipant) {
              localParticipantIdentityRef.current = newRoom.localParticipant.identity;
              localParticipantSidRef.current = newRoom.localParticipant.sid;
             
            }

            await waitForStableConnection(newRoom, 15000);

            if (newRoom.state !== ConnectionState.Connected) {
              throw new Error("Connection not stable");
            }

            connectionReadyRef.current = true;
            isConnectedRef.current = true;
            setIsConnected(true);
            setConnectionState("connected");
            setMeetingInfo(tokenData.meeting_info || tokenData.meetingInfo);
            setLocalParticipant(newRoom.localParticipant);

            // CRITICAL FIX: IMMEDIATELY publish tracks for recording bot detection
            
            audioMutedRef.current = true;
            videoMutedRef.current = true;
            setIsAudioEnabled(false);
            setIsVideoEnabled(false);
            mediaInitializedRef.current = false;

            // IMMEDIATE track publishing - don't wait
            setTimeout(async () => {
              try {
                
                // Publish video track immediately
                const videoTrack = await createLocalVideoTrack({
                  resolution: {
                    width: 640,
                    height: 480,
                    frameRate: 15,
                  },
                  facingMode: "user",
                });

                setTimeout(() => {
  checkExistingScreenShares(newRoom);
}, 1000);
                await newRoom.localParticipant.publishTrack(videoTrack, {
                  name: "camera",
                  source: Track.Source.Camera,
                  simulcast: false,
                  videoCodec: "h264",
                  stopTrackOnMute: false,
                });

                // IMMEDIATELY mute video but keep published
                await videoTrack.mute();

                // Publish audio track immediately
                const audioTrack = await createLocalAudioTrack({
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                  channelCount: 2,
                  sampleRate: 48000,
                });

                await newRoom.localParticipant.publishTrack(audioTrack, {
                  name: "microphone",
                  source: Track.Source.Microphone,
                  dtx: false,
                  red: true,
                  simulcast: false,
                  priority: "high",
                  stopTrackOnMute: false,
                });

                // IMMEDIATELY mute audio but keep published
                await audioTrack.mute();

                // Store track references
                audioTrackRef.current = audioTrack;
                videoTrackRef.current = videoTrack;

                // Verify publication
                setTimeout(() => {
                  const videoPublication = newRoom.localParticipant.getTrackPublication(Track.Source.Camera);
                  const audioPublication = newRoom.localParticipant.getTrackPublication(Track.Source.Microphone);
                  
                 
                  if (videoPublication?.track && audioPublication?.track) {
                    if (window.showNotificationMessage) {
                      window.showNotificationMessage(
                        "Connected with published tracks - recording ready (mic/camera muted)",
                        "success"
                      );
                    }
                  } else {
                    console.error("❌ FAILED: Tracks not properly published for recording bot");
                    if (window.showNotificationMessage) {
                      window.showNotificationMessage(
                        "Connection issue - recording may not work properly",
                        "error"
                      );
                      
                    }
                  }
                }, 2000);

              } catch (publishError) {
                console.error("❌ CRITICAL: Failed to publish tracks for recording bot:", publishError);
                if (window.showNotificationMessage) {
                  window.showNotificationMessage(
                    "Media setup failed - recording will not work",
                    "error"
                  );
                }
              }
            }, 500); // Very short delay

            startHeartbeat();
            startParticipantSync(meetingId);

            return {
              success: true,
              room: newRoom,
              meetingInfo: tokenData.meeting_info || tokenData.meetingInfo,
              participantIdentity: tokenData.participant_identity || tokenData.participantIdentity,
              tracksPublished: true, // We ensure tracks are published
            };
          } catch (connectError) {
            clearTimeout(connectionTimeout);
            throw connectError;
          }
        } catch (error) {
          console.error("Connection failed:", error);
          await cleanupExistingConnection();

          connectionAttemptRef.current = false;
          setIsConnecting(false);
          isConnectedRef.current = false;
          setIsConnected(false);

          throw error;
        } finally {
          connectionAttemptRef.current = false;
          setIsConnecting(false);
          connectionLockRef.current = false;
          activeConnectionRef.current = null;
        }
      })();

      activeConnectionRef.current = connectionPromise;
      return await connectionPromise;
    } catch (error) {
      console.error("Connection wrapper failed:", error);
      connectionLockRef.current = false;
      activeConnectionRef.current = null;
      throw error;
    }
  },
  [
    cleanupAllAudioElements,
    setupOptimizedEventListeners,
    cleanupExistingConnection,
    startHeartbeat,
    startParticipantSync,
    getAccessTokenWithRetry,
    waitForStableConnection
  ]
);


  // Enable audio - create track for first time when user unmutes
const enableAudio = useCallback(async () => {
  try {
    const activeRoom = roomRef.current;
    if (!activeRoom?.localParticipant) {
      console.warn("No active room for audio publishing");
      return false;
    }

    const existingAudioPub = activeRoom.localParticipant.getTrackPublication(Track.Source.Microphone);

    if (existingAudioPub?.track) {
      await existingAudioPub.track.unmute();
      audioTrackRef.current = existingAudioPub.track;
      audioMutedRef.current = false;
      setIsAudioEnabled(true);
      return true;
    }

    // Track doesn't exist, create and publish

    const audioTrack = await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 2,
      sampleRate: 48000,
    });

    audioTrackRef.current = audioTrack;

    // Publish track to LiveKit
    await activeRoom.localParticipant.publishTrack(audioTrack, {
      name: "microphone",
      source: Track.Source.Microphone,
      dtx: false,
      red: true,
      simulcast: false,
      priority: "high",
      stopTrackOnMute: false,
    });


    audioMutedRef.current = false;
    setLocalTracks((prev) => ({ ...prev, audio: audioTrack }));
    setIsAudioEnabled(true);
    mediaInitializedRef.current = true;

    return true;
  } catch (error) {
    console.error("❌ Audio enable/publish failed:", error);
    setError(`Audio error: ${error.message}`);
    return false;
  }
}, []);


  const disableAudio = useCallback(async () => {
    try {
      const activeRoom = roomRef.current;
      if (!activeRoom?.localParticipant) return false;

      const audioPublication = activeRoom.localParticipant.getTrackPublication(Track.Source.Microphone);

      if (audioPublication?.track) {
        await audioPublication.track.mute();
        audioMutedRef.current = true;
        setIsAudioEnabled(false);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Audio disable failed:", error);
      return false;
    }
  }, []);

  const toggleAudio = useCallback(async () => {
    try {
      const activeRoom = roomRef.current;
      if (!activeRoom?.localParticipant) return false;

      const audioPublication = activeRoom.localParticipant.getTrackPublication(Track.Source.Microphone);

      if (!audioPublication?.track) {
        return await enableAudio();
      }

      const isMuted = audioPublication.track.isMuted;

      if (isMuted) {
        await audioPublication.track.unmute();
        audioMutedRef.current = false;
        setIsAudioEnabled(true);
      } else {
        await audioPublication.track.mute();
        audioMutedRef.current = true;
        setIsAudioEnabled(false);
      }

      return !audioMutedRef.current;
    } catch (error) {
      console.error("Audio toggle failed:", error);
      return false;
    }
  }, [enableAudio]);



  // ADD this function to useLiveKit.js after other functions
const verifyTracksPublished = useCallback(() => {
  if (!roomRef.current?.localParticipant) {
    return false;
  }
  
  const participant = roomRef.current.localParticipant;
  const videoTrack = participant.getTrackPublication(Track.Source.Camera);
  const audioTrack = participant.getTrackPublication(Track.Source.Microphone);
  
  
  
  const hasPublishedTracks = !!(videoTrack?.track || audioTrack?.track);
  
  if (hasPublishedTracks) {
    if (window.showNotificationMessage) {
      window.showNotificationMessage(
        "Media tracks published - recording bot can detect content",
        "success"
      );
    }
  } else {
    console.error("❌ RECORDING BOT: NO TRACKS PUBLISHED - recording will fail");
    if (window.showNotificationMessage) {
      window.showNotificationMessage(
        "WARNING: No media tracks published - recording may fail",
        "error"
      );
    }
  }
  
  return hasPublishedTracks;
}, []);

// ADD this useEffect to useLiveKit.js to auto-verify tracks
useEffect(() => {
  if (isConnected && roomRef.current) {
    // Verify tracks are published 5 seconds after connection
    const verificationTimer = setTimeout(() => {
      verifyTracksPublished();
    }, 5000);
    
    // Also verify after 10 seconds as backup
    const backupTimer = setTimeout(() => {
      verifyTracksPublished();
    }, 10000);
    
    return () => {
      clearTimeout(verificationTimer);
      clearTimeout(backupTimer);
    };
  }
}, [isConnected, verifyTracksPublished]);






  // Speaker mute functions
  const muteSpeaker = useCallback(() => {
    speakerMutedRef.current = true;
    setIsSpeakerMuted(true);

    remoteAudioElementsRef.current.forEach((audioElement) => {
      if (audioElement) {
        audioElement.volume = 0;
      }
    });
  }, []);

  const unmuteSpeaker = useCallback(() => {
    speakerMutedRef.current = false;
    setIsSpeakerMuted(false);

    remoteAudioElementsRef.current.forEach((audioElement) => {
      if (audioElement) {
        audioElement.volume = 1;
      }
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    if (speakerMutedRef.current) {
      unmuteSpeaker();
    } else {
      muteSpeaker();
    }
    return !speakerMutedRef.current;
  }, [muteSpeaker, unmuteSpeaker]);

  // Enable video - create track for first time when user turns on camera
const enableVideo = useCallback(async () => {
  try {
    const activeRoom = roomRef.current;
    if (!activeRoom?.localParticipant) {
      console.warn("No active room for video publishing");
      return false;
    }

    const existingVideoPub = activeRoom.localParticipant.getTrackPublication(Track.Source.Camera);
    if (existingVideoPub?.track) {
      if (existingVideoPub.track.isMuted) {
        await existingVideoPub.track.unmute();
      }
      videoTrackRef.current = existingVideoPub.track;
      setIsVideoEnabled(true);
      return true;
    }
    const videoTrack = await createLocalVideoTrack({
      resolution: {
        width: 640,
        height: 480,
        frameRate: 15,
      },
      facingMode: "user",
    });

    videoTrackRef.current = videoTrack;

    // Publish track to LiveKit
    await activeRoom.localParticipant.publishTrack(videoTrack, {
      name: "camera",
      source: Track.Source.Camera,
      simulcast: false,
      videoCodec: "h264",
      stopTrackOnMute: false,
    });
    setLocalTracks((prev) => ({ ...prev, video: videoTrack }));
    setIsVideoEnabled(true);
    videoMutedRef.current = false;

    return true;
  } catch (error) {
    console.error("❌ Video enable/publish failed:", error);
    setError(`Video error: ${error.message}`);
    return false;
  }
}, []);

  const toggleVideo = useCallback(async () => {
    try {
      const activeRoom = roomRef.current;
      if (!activeRoom?.localParticipant) return isVideoEnabled;

      const videoPublication = activeRoom.localParticipant.getTrackPublication(Track.Source.Camera);

      if (!videoPublication?.track) {
        return await enableVideo();
      }

      if (videoPublication.track.isMuted) {
        await videoPublication.track.unmute();
        setIsVideoEnabled(true);
      } else {
        await videoPublication.track.mute();
        setIsVideoEnabled(false);
      }

      return !videoPublication.track.isMuted;
    } catch (error) {
      console.error("Video toggle failed:", error);
      return isVideoEnabled;
    }
  }, [isVideoEnabled, enableVideo]);

  // Helper function to detect sharing mode
  const detectSharingMode = useCallback((videoLabel) => {
    const label = videoLabel.toLowerCase();
    
    if (label.includes('tab') || label.includes('chrome')) {
      return 'chrome-tab';
    } else if (label.includes('window') || label.includes('application')) {
      return 'window';
    } else if (label.includes('screen') || label.includes('monitor') || label.includes('display')) {
      return 'entire-screen';
    }
    
    return 'unknown';
  }, []);

const updateCoHostStatus = useCallback((isCoHost) => {
  isCoHostRef.current = isCoHost;
  
  // CRITICAL: Update screen share permissions for co-hosts
  if (isCoHost && !isHostRef.current) {
    setScreenSharePermissions(prev => ({
      ...prev,
      requiresHostApproval: false,
      hasPermission: true,
      hostUserId: userIdRef.current
    }));
    
    // Notify parent about role change
    if (window.attendanceTracker?.updateRole) {
      window.attendanceTracker.updateRole('co-host');
    }
    
  } else if (!isCoHost && !isHostRef.current) {
    setScreenSharePermissions(prev => ({
      ...prev,
      requiresHostApproval: true,
      hasPermission: false,
      hostUserId: null
    }));    
    // Notify parent about role change
    if (window.attendanceTracker?.updateRole) {
      window.attendanceTracker.updateRole('participant');
    }
  }
}, []);

  // Internal stop function for cleanup without state updates
  const stopScreenShareInternal = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom?.localParticipant) return;


    try {
      // Stop video track
      const screenPub = activeRoom.localParticipant.getTrackPublication(Track.Source.ScreenShare);
      if (screenPub?.track) {
        await activeRoom.localParticipant.unpublishTrack(screenPub.track);
        screenPub.track.stop();
      }

      // Stop system audio track
      const screenAudioPub = activeRoom.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
      if (screenAudioPub?.track) {
        await activeRoom.localParticipant.unpublishTrack(screenAudioPub.track);
        screenAudioPub.track.stop();
      }

      // Clean up stream
      if (screenShareStreamRef.current) {
        if (screenShareStreamRef.current instanceof MediaStream) {
          screenShareStreamRef.current.getTracks().forEach(track => track.stop());
        }
        screenShareStreamRef.current = null;
      }

      // Reset internal state
      screenShareStateRef.current.videoTrackPublished = false;
      screenShareStateRef.current.audioTrackPublished = false;
      screenShareStateRef.current.publishingPromises.clear();

      // Reset permission for next time (unless host)
      if (!isHostRef.current) {
        setScreenSharePermissions(prev => ({
          ...prev,
          hasPermission: false
        }));
      }

    } catch (error) {
      console.error("Screen share cleanup error:", error);
    }
  }, []);

  // Enhanced monitoring with lower threshold
  const monitorSystemAudio = useCallback((audioTrack) => {
    if (!audioTrack || audioTrack.readyState !== 'live') {
      return;
    }

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = audioContext.createAnalyser();
      
      // Minimal processing for stability
      analyser.fftSize = 32;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      let audioDetected = false;
      let checkCount = 0;
      const maxChecks = 10;
      
      const checkAudio = setInterval(() => {
        if (!analyser) {
          clearInterval(checkAudio);
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        
        checkCount++;
        
        // Very low threshold for better detection
        if (average > 0.5) {
          if (!audioDetected) {
            audioDetected = true;
            
            if (window.showNotificationMessage) {
              window.showNotificationMessage(
                "System audio confirmed! Participants can hear YouTube/Spotify.",
                'success'
              );
            }
            
            clearInterval(checkAudio);
            audioContext.close();
            return;
          }
        }
        
        if (checkCount >= maxChecks) {
          if (!audioDetected) {
            if (window.showNotificationMessage) {
              window.showNotificationMessage(
                "System audio not detected. Ensure 'Share tab audio' is checked.",
                'warning'
              );
            }
          }
          clearInterval(checkAudio);
          audioContext.close();
        }
      }, 2000);

    } catch (error) {
      console.error("Audio monitoring failed:", error);
    }
  }, []);

  // More reliable feedback system
  const provideFeedback = useCallback((sharingMode, audioStrategy, hasSystemAudio) => {
    const messages = {
      'chrome-tab': {
        'system_audio': {
          message: 'Chrome Tab with system audio! YouTube/Spotify should work perfectly.',
          severity: 'success'
        },
        'system_audio_failed': {
          message: 'Chrome Tab shared but audio failed. Check "Share tab audio" was selected.',
          severity: 'warning' 
        },
        'no_audio_fallback': {
          message: 'Chrome Tab without audio. Make sure "Share tab audio" is checked.',
          severity: 'warning'
        },
        'audio_not_ready': {
          message: 'Audio track not ready. Try sharing again and ensure tab audio is selected.',
          severity: 'warning'
        }
      },
      'window': {
        'no_audio_fallback': {
          message: 'Window sharing blocks system audio. Use Chrome Tab for YouTube/Spotify.',
          severity: 'error'
        }
      },
      'entire-screen': {
        'no_audio_fallback': {
          message: 'Screen sharing blocks system audio. Use Chrome Tab for YouTube/Spotify.',
          severity: 'error'
        }
      }
    };

    if (window.showNotificationMessage) {
      const feedback = messages[sharingMode]?.[audioStrategy] || 
                      { message: 'Screen sharing started', severity: 'info' };
      
      window.showNotificationMessage(feedback.message, feedback.severity);

      // Additional specific guidance
      if (sharingMode === 'chrome-tab' && audioStrategy !== 'system_audio') {
        setTimeout(() => {
          window.showNotificationMessage(
            'For YouTube/Spotify: Select "Chrome Tab" → Check "Share tab audio" → Click Share',
            'info'
          );
        }, 3000);
      }
    }
  }, []);
  
  // Handle screen share errors with specific guidance
  const handleScreenShareError = useCallback((error) => {
    const errorMessages = {
      'NotAllowedError': 'Screen sharing permission denied. For YouTube audio: Select "Chrome Tab" and check "Share tab audio".',
      'NotSupportedError': 'Screen sharing not supported. Use Chrome, Edge, or Firefox.',
      'NotFoundError': 'No screen available to share.',
      'NotReadableError': 'Screen sharing blocked by system settings.',
      'AbortError': 'Screen sharing cancelled by user.',
    };

    const message = errorMessages[error.name] || `Screen share error: ${error.message}`;

    if (window.showNotificationMessage) {
      window.showNotificationMessage(message, 'error');
      
      // Additional YouTube-specific guidance
      if (error.name === 'NotAllowedError') {
        setTimeout(() => {
          window.showNotificationMessage(
            'For YouTube/Spotify audio: MUST select "Chrome Tab" (not Window/Screen) and check "Share tab audio"',
            'warning'
          );
        }, 2000);
      }
    }
  }, []);


// Screen share with permission system - UPDATED for co-host direct access
const startScreenShare = useCallback(async () => {
  // Prevent multiple simultaneous attempts
  if (screenShareStateRef.current.isPublishing) {
    return { success: false, error: "Already publishing" };
  }

  try {
    const activeRoom = roomRef.current;
    if (!activeRoom?.localParticipant) {
      throw new Error("Not connected to room");
    }

    screenShareStateRef.current.isPublishing = true;

    // UPDATED: Check if user needs host permission - Co-hosts should NOT need approval
    if (!isHostRef.current && 
        !isCoHostRef.current && // Co-hosts can share directly
        screenSharePermissions.requiresHostApproval) {
      
      if (!screenSharePermissions.hasPermission) {
        
        // Check if already has pending request
        if (screenSharePermissions.pendingRequest) {
          return { 
            success: false, 
            error: "Permission request already pending", 
            needsPermission: true,
            pending: true 
          };
        }

        // Get user info
        const displayName = localParticipant?.name || 
                           localParticipant?.identity || 
                           `User ${userIdRef.current}`;
        
        try {
          const requestId = await requestScreenSharePermission(userIdRef.current, displayName);
          
          // Wait for host approval
          return new Promise((resolve, reject) => {
            screenShareCallbacksRef.current.set(requestId, { resolve, reject });
            
            // Timeout after 30 seconds
            setTimeout(() => {
              const callback = screenShareCallbacksRef.current.get(requestId);
              if (callback) {
                screenShareCallbacksRef.current.delete(requestId);
                setScreenSharePermissions(prev => ({
                  ...prev,
                  pendingRequest: false,
                  requestId: null
                }));
                reject(new Error("Permission request timed out"));
              }
            }, 30000);
          });

        } catch (error) {
          console.error("Permission request failed:", error);
          return { 
            success: false, 
            error: error.message,
            needsPermission: true 
          };
        }
      }
    }

    // UPDATED: Hosts and Co-hosts can share directly without approval
    if (isHostRef.current || isCoHostRef.current) {
    } else {
    }


    // Stop any existing screen share first
    await stopScreenShareInternal();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Request screen capture with audio settings
    let screenStream = null;
    let hasSystemAudio = false;
    let audioStrategy = 'none';
    
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          mediaSource: 'screen',
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
          cursor: "always"
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,  
          autoGainControl: false,
          suppressLocalAudioPlayback: false,
          sampleRate: 48000,
          channelCount: 2,
          latency: 0.01,
          volume: 1.0,
          mediaSource: 'screen'
        },
        preferCurrentTab: false,
        systemAudio: "include",
        surfaceSwitching: "include"
      });

      const videoTrack = screenStream.getVideoTracks()[0];
      const systemAudioTrack = screenStream.getAudioTracks()[0];

      if (!videoTrack) {
        throw new Error("No video track captured");
      }

      hasSystemAudio = !!systemAudioTrack;
    
      // Detect sharing mode
      const sharingMode = detectSharingMode(videoTrack.label);

      // Publish video track first
      const liveKitScreenTrack = new LocalVideoTrack(videoTrack, {
        name: "screen_share",
        source: Track.Source.ScreenShare,
      });

      const videoPublishPromise = activeRoom.localParticipant.publishTrack(liveKitScreenTrack, {
  name: "screen_share", 
  source: Track.Source.ScreenShare,
  
  // ✅ CRITICAL: Enable simulcast for 300+ participants
  simulcast: true,
  screenShareSimulcast: true,
  
  // ✅ VP8 works better with simulcast
  videoCodec: "vp8",
  
  priority: "high",
  videoBitrate: 3000000, // 3 Mbps
  
  // Quality layers for different connection speeds
  videoQuality: {
    high: { maxBitrate: 3000000, maxFramerate: 30 },
    medium: { maxBitrate: 1200000, maxFramerate: 20 },
    low: { maxBitrate: 500000, maxFramerate: 15 }
  }
});

      screenShareStateRef.current.publishingPromises.set('video', videoPublishPromise);
      
      // Wait for video to be published
      await videoPublishPromise;
      screenShareStateRef.current.videoTrackPublished = true;

      await new Promise(resolve => setTimeout(resolve, 200));

      // Handle system audio
      if (hasSystemAudio && systemAudioTrack && systemAudioTrack.readyState === 'live') {
        
        try {
          const liveKitSystemAudioTrack = new LocalAudioTrack(systemAudioTrack, {
            name: "system_audio",
            source: Track.Source.ScreenShareAudio,
          });

          const audioPublishPromise = activeRoom.localParticipant.publishTrack(liveKitSystemAudioTrack, {
            name: "system_audio",
            source: Track.Source.ScreenShareAudio,
            dtx: false,
            red: false,
            simulcast: false,
            priority: "high",
            audioCodec: "opus",
            bitrate: 128000,
            stereo: true,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          });

          screenShareStateRef.current.publishingPromises.set('audio', audioPublishPromise);
          
          await audioPublishPromise;
          screenShareStateRef.current.audioTrackPublished = true;
          audioStrategy = 'system_audio';

          setTimeout(() => monitorSystemAudio(systemAudioTrack), 1000);
          
        } catch (audioError) {
          console.error("System audio publishing failed:", audioError);
          audioStrategy = 'system_audio_failed';
          screenShareStateRef.current.audioTrackPublished = false;
        }
      } else if (!hasSystemAudio) {
        audioStrategy = 'no_audio_fallback';
      } else if (systemAudioTrack?.readyState !== 'live') {
        audioStrategy = 'audio_not_ready';
      }

      // Verify tracks are published
      const videoPublication = activeRoom.localParticipant.getTrackPublication(Track.Source.ScreenShare);
      const audioPublication = hasSystemAudio ? 
        activeRoom.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio) : null;

      if (videoPublication?.track) {
        screenShareStreamRef.current = screenStream;
        setIsScreenSharing(true);
        setLocalIsScreenSharing(true);

        // Handle track ending
        videoTrack.onended = () => {
          stopScreenShare();
        };

        if (systemAudioTrack) {
          systemAudioTrack.onended = () => {
          };
        }

        provideFeedback(sharingMode, audioStrategy, hasSystemAudio);

        

        return { 
          success: true, 
          audioStrategy, 
          sharingMode, 
          hasSystemAudio,
          videoTrack: videoTrack.label,
          audioTrack: systemAudioTrack?.label || 'none',
          approved: true,
          userRole: isHostRef.current ? 'host' : isCoHostRef.current ? 'co-host' : 'participant'
        };
      } else {
        throw new Error("Video track publishing verification failed");
      }

    } catch (error) {
      console.error("Screen share request failed:", error);
      
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
      
      handleScreenShareError(error);
      throw error;
    }

  } catch (error) {
    console.error("Screen share wrapper failed:", error);
    
    screenShareStateRef.current.videoTrackPublished = false;
    screenShareStateRef.current.audioTrackPublished = false;
    setIsScreenSharing(false);
    setLocalIsScreenSharing(false);
    
    throw error;
  } finally {
    screenShareStateRef.current.isPublishing = false;
    screenShareStateRef.current.publishingPromises.clear();
  }
}, [
  stopScreenShareInternal, 
  monitorSystemAudio, 
  provideFeedback, 
  handleScreenShareError, 
  detectSharingMode,
  requestScreenSharePermission,
  screenSharePermissions,
  localParticipant
]);

const stopScreenShare = useCallback(async () => {
  try {
    console.log('🛑 Stopping screen share...');
    
    const activeRoom = roomRef.current;
    if (!activeRoom?.localParticipant) {
      console.log('❌ No active room for stopping screen share');
      return false;
    }

    // CRITICAL: Get publications BEFORE any state changes
    const screenPub = activeRoom.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const screenAudioPub = activeRoom.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);

    console.log('📋 Current screen share publications:', {
      video: !!screenPub?.track,
      audio: !!screenAudioPub?.track
    });

    // IMMEDIATE unpublish - don't use internal function
    if (screenPub?.track) {
      console.log('🎬 Unpublishing video track...');
      await activeRoom.localParticipant.unpublishTrack(screenPub.track);
      screenPub.track.stop();
    }

    if (screenAudioPub?.track) {
      console.log('🔊 Unpublishing audio track...');
      await activeRoom.localParticipant.unpublishTrack(screenAudioPub.track);
      screenAudioPub.track.stop();
    }

    // Clean up stream
    if (screenShareStreamRef.current) {
      if (screenShareStreamRef.current instanceof MediaStream) {
        screenShareStreamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log('⏹️ Stopped track:', track.kind);
        });
      }
      screenShareStreamRef.current = null;
    }

    // Reset all screen share state IMMEDIATELY
    screenShareStateRef.current.isPublishing = false;
    screenShareStateRef.current.videoTrackPublished = false;
    screenShareStateRef.current.audioTrackPublished = false;
    screenShareStateRef.current.publishingPromises.clear();

    // Update UI state
    setLocalTracks(prev => ({ ...prev, screenShare: null }));
    setScreenShareTrack(null);
    setIsScreenSharing(false);
    setLocalIsScreenSharing(false);
    setScreenSharingParticipant(null);

    // Reset permission for next time (unless host/co-host)
    if (!isHostRef.current && !isCoHostRef.current) {
      setScreenSharePermissions(prev => ({
        ...prev,
        hasPermission: false
      }));
    }

    console.log('✅ Screen share stopped successfully');
    
    // Verify tracks are unpublished
    setTimeout(() => {
      const verifyScreenPub = activeRoom.localParticipant.getTrackPublication(Track.Source.ScreenShare);
      const verifyScreenAudioPub = activeRoom.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
      
      if (!verifyScreenPub?.track && !verifyScreenAudioPub?.track) {
        console.log('✅ Verified: Screen share tracks fully unpublished');
      } else {
        console.error('❌ WARNING: Screen share tracks still published!', {
          video: !!verifyScreenPub?.track,
          audio: !!verifyScreenAudioPub?.track
        });
      }
    }, 500);

    return true;

  } catch (error) {
    console.error("❌ Stop screen share failed:", error);
    
    // Force state reset even on error
    setIsScreenSharing(false);
    setLocalIsScreenSharing(false);
    setScreenShareTrack(null);
    setScreenSharingParticipant(null);
    
    return false;
  }
}, []);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing || localIsScreenSharing) {
      return await stopScreenShare();
    } else {
      try {
        const result = await startScreenShare();
        return result?.success || false;
      } catch (error) {
        console.error("Toggle screen share failed:", error);
        return false;
      }
    }
  }, [isScreenSharing, localIsScreenSharing, startScreenShare, stopScreenShare]);

  // Add state verification function
  const verifyScreenShareState = useCallback(() => {
    if (!roomRef.current?.localParticipant) return false;

    const videoPublication = roomRef.current.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const audioPublication = roomRef.current.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);

    const actualVideoState = !!videoPublication?.track?.enabled;
    const actualAudioState = !!audioPublication?.track?.enabled;

   

    // Fix state if out of sync
    if (isScreenSharing !== actualVideoState) {
      setIsScreenSharing(actualVideoState);
      setLocalIsScreenSharing(actualVideoState);
    }

    return actualVideoState;
  }, [isScreenSharing]);

  const getScreenShareStream = useCallback(() => {
    const ref = screenShareStreamRef.current;

    if (ref instanceof MediaStream) {
      return ref;
    }

    if (ref && ref.srcObject instanceof MediaStream) {
      return ref.srcObject;
    }

    if (ref && ref.mediaStreamTrack instanceof MediaStreamTrack) {
      return new MediaStream([ref.mediaStreamTrack]);
    }

    if (ref && typeof ref.attach === "function") {
      try {
        const element = ref.attach();
        if (element && element.srcObject instanceof MediaStream) {
          return element.srcObject;
        }
      } catch (err) {
        console.warn("Error getting screen share stream:", err);
      }
    }

    if (screenShareTrack && screenShareTrack.mediaStreamTrack) {
      return new MediaStream([screenShareTrack.mediaStreamTrack]);
    }

    return ref;
  }, [screenShareTrack]);

  // Disconnect
  const disconnectFromRoom = useCallback(async () => {
    try {

      connectionLockRef.current = false;
      activeConnectionRef.current = null;

      cleanupAllAudioElements();

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      if (isScreenSharing || localIsScreenSharing) {
        await stopScreenShare();
      }

      await cleanupExistingConnection();

      // Reset all states
      setRoom(null);
      setIsConnected(false);
      setConnectionState("disconnected");
      setParticipants([]);
      setLocalParticipant(null);
      setRemoteParticipants(new Map());
      setLocalTracks({ audio: null, video: null, screenShare: null });
      setIsAudioEnabled(false);
      setIsVideoEnabled(false);
      setIsScreenSharing(false);
      setLocalIsScreenSharing(false);
      setScreenSharingParticipant(null);
      setScreenShareTrack(null);
      setMeetingInfo(null);
      setError(null);
      setMeetingEnded(false);

      // Reset permission system
      setScreenSharePermissions({
        requiresHostApproval: true,
        hasPermission: false,
        pendingRequest: false,
        requestId: null,
        hostUserId: null
      });
      setScreenShareRequests([]);
      setCurrentScreenShareRequest(null);

      connectionReadyRef.current = false;
      isConnectedRef.current = false;
      mediaInitializedRef.current = false;
      currentMeetingIdRef.current = null;
      isHostRef.current = false;

    } catch (error) {
      console.error("Disconnect error:", error);
    }
  }, [
    cleanupAllAudioElements,
    cleanupExistingConnection,
    isScreenSharing,
    localIsScreenSharing,
    stopScreenShare,
  ]);

  // Send message
  const sendMessage = useCallback((type, data) => {
    if (!roomRef.current || !isConnectedRef.current) return false;

    try {
      const encoder = new TextEncoder();
      const packet = encoder.encode(
        JSON.stringify({
          type,
          ...data,
          timestamp: Date.now(),
          sender_id: roomRef.current.localParticipant.sid,
        })
      );

      roomRef.current.localParticipant.publishData(
        packet,
        DataPacket_Kind.RELIABLE
      );
      return true;
    } catch (error) {
      console.error("Send failed:", error);
      return false;
    }
  }, []);

  const sendChatMessage = useCallback(
    (message) => {
      return sendMessage("chat-message", { message });
    },
    [sendMessage]
  );

  const sendReaction = useCallback(
    (emoji) => {
      return sendMessage("reaction", { emoji });
    },
    [sendMessage]
  );

  // Get participants list
  const getParticipantsList = useCallback(() => {
    if (!roomRef.current) return [];

    try {
      const localPart = roomRef.current.localParticipant;
      const remoteParts = Array.from(
        roomRef.current.remoteParticipants.values()
      );

      const allParticipants = localPart
        ? [localPart, ...remoteParts]
        : remoteParts;

      return allParticipants.map((participant) => ({
        identity: participant.identity,
        name: participant.name || participant.identity,
        isLocal: participant.sid === localParticipantSidRef.current,
        connectionQuality: participant.connectionQuality || "unknown",
        isSpeaking: participant.isSpeaking || false,
        audioEnabled: participant.isMicrophoneEnabled || false,
        videoEnabled: participant.isCameraEnabled || false,
        isScreenSharing: !!participant.getTrackPublication?.(
          Track.Source.ScreenShare
        )?.track,
      }));
    } catch (error) {
      console.error("Get participants error:", error);
      return [];
    }
  }, []);

  // FIXED: Add proper useEffect for cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAllAudioElements();
      // FIXED: Don't call disconnectFromRoom in cleanup to avoid hooks issues
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, [cleanupAllAudioElements]);

 // REPLACE the return statement at the end of useLiveKit.js hook
return {
  // Connection
  connectToRoom,
  connectToMeeting: connectToRoom,
  disconnectFromRoom,
  disconnect: disconnectFromRoom,
  isConnected,
  connected: isConnected,
  isConnecting,
  connectionState,
  error,
  room,

  // Queue
  queueStatus,
  checkConnectionQueue,
  joinMeetingWithQueue,
  waitForQueueTurn,

  // Meeting Control
  endMeetingForEveryone,
  meetingEnded,

  startRecording,
  stopRecording,

  // Participants
  participants,
  localParticipant,
  remoteParticipants,
  getParticipantsList,
  participantCount,
  maxParticipants,

  // Performance
  performanceMode,

  // Media Controls
  enableAudio,
  disableAudio,
  toggleAudio,
  enableVideo,
  toggleVideo,
  startScreenShare,
  stopScreenShare,
  toggleScreenShare,

  // Speaker Controls
  muteSpeaker,
  unmuteSpeaker,
  toggleSpeaker,
  isSpeakerMuted,

  // Screen Share Permission System
  screenSharePermissions,
  screenShareRequests,
  currentScreenShareRequest,
  requestScreenSharePermission,
  approveScreenShareRequest,
  denyScreenShareRequest,

  // Media State
  localTracks,
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  isSpeaking,
  screenShareTrack,

  // Screen Share State
  screenSharingParticipant,
  localIsScreenSharing,
  getScreenShareStream,
  verifyScreenShareState,
  updateCoHostStatus,

  // Communication
  sendChatMessage,
  sendReaction,
  sendMessage,
  checkExistingScreenShares,
  messages,
  reactions,

  // Meeting Info
  meetingInfo,
  roomMetadata,

  // CRITICAL: Add verification function for recording
  verifyTracksPublished,

  // Legacy compatibility
  connecting: isConnecting,
  connectionError: error,
  addEventListener: () => {},
  removeEventListener: () => {},
};
};

export { useLiveKit };
export default useLiveKit; 