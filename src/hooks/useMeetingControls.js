// src/hooks/useMeetingControls.js - Complete Meeting Controls Hook
import { useState, useCallback, useRef, useMemo } from 'react';
import { throttle } from 'lodash';
import { DataPacket_Kind } from 'livekit-client';
import { Track } from 'livekit-client';

const PERFORMANCE_CONFIG = {
  THROTTLE_DELAY: 200,
  INITIAL_MEDIA_DELAY: 100,
};
export const useMeetingControls = ({
  livekitToggleAudio,
  livekitToggleVideo,
  livekitStartScreenShare,
  livekitStopScreenShare,
  livekitLocalIsScreenSharing,
  enableAudio,
  enableVideo,
  isConnectionReady,
  onToggleAudio: propOnToggleAudio,
  onToggleVideo: propOnToggleVideo,
  showNotificationMessage,
  canShareScreenDirectly,
  hasHostPrivileges,
  meetingSettings,
  screenSharePermissions,
  room,
  forceStopParticipantScreenShare, // ✅ ADD THIS
  isHost, // ✅ ADD THIS
  isCoHost, // ✅ ADD THIS
  coHostPrivilegesActive, // ✅ ADD THIS
  currentUser, // ✅ ADD THIS
  enhancedScreenShareData, // ✅ ADD THIS
}) => {
  // State
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [showScreenShareWaiting, setShowScreenShareWaiting] = useState(false);
  const [screenShareWaitingTimeout, setScreenShareWaitingTimeout] = useState(null);
  const [audioInitStatus, setAudioInitStatus] = useState("");
  const [showAudioStatus, setShowAudioStatus] = useState(false);
  const [showScreenShareStopped, setShowScreenShareStopped] = useState(false);
const [screenShareStoppedBy, setScreenShareStoppedBy] = useState(null);

  // Refs
  const audioInitializedRef = useRef(false);
  const videoInitializedRef = useRef(false);

  // Show audio init status
  const showAudioInitStatus = useCallback((status) => {
    setAudioInitStatus(status);
    setShowAudioStatus(true);
    setTimeout(() => setShowAudioStatus(false), 3000);
  }, []);

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
            
            // 🔥 CRITICAL FIX: Broadcast state change immediately
            if (room?.localParticipant && currentUser) {
              const encoder = new TextEncoder();
              const stateData = encoder.encode(JSON.stringify({
                type: 'track_state_update',
                user_id: currentUser.id,
                track_kind: Track.Kind.Audio,
                enabled: true,
                timestamp: Date.now(),
              }));
              
              room.localParticipant.publishData(stateData, DataPacket_Kind.RELIABLE);
            }
            
            return;
          }
        }

       if (livekitToggleAudio && typeof livekitToggleAudio === "function") {
  showAudioInitStatus(audioEnabled ? "Muting..." : "Unmuting...");
  
  console.log("🎤 MeetingControls: Toggling audio - Before:", {
    audioEnabled,
    audioInitialized: audioInitializedRef.current
  });
  
  const newState = await livekitToggleAudio();
  
  console.log("🎤 MeetingControls: Toggling audio - After:", {
    newState,
    audioEnabled: newState
  });
  
  setAudioEnabled(newState);
  audioInitializedRef.current = true;
  showAudioInitStatus(
    newState ? "Microphone unmuted" : "Microphone muted"
  );
  showNotificationMessage(
    newState ? "Microphone unmuted" : "Microphone muted"
  );
  
  // 🔥 CRITICAL FIX: Broadcast state change immediately
  if (room?.localParticipant && currentUser) {
    const encoder = new TextEncoder();
    const stateData = encoder.encode(JSON.stringify({
      type: 'track_state_update',
      user_id: currentUser.id,
      track_kind: Track.Kind.Audio,
      enabled: newState,
      muted: !newState,
      timestamp: Date.now(),
    }));
    
    try {
      await room.localParticipant.publishData(stateData, DataPacket_Kind.RELIABLE);
      console.log("✅ Audio state broadcasted:", { enabled: newState, muted: !newState });
    } catch (err) {
      console.error("❌ Failed to broadcast audio state:", err);
    }
  }
  
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

        if (propOnToggleAudio) {
          const newState = propOnToggleAudio();
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
      propOnToggleAudio,
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

          console.log('🎥 Toggle video requested - current state:', {
            videoEnabled,
            videoInitialized: videoInitializedRef.current,
            hasRoom: !!room,
            hasLocalParticipant: !!room?.localParticipant
          });

          // 🔥 CASE 1: First time enabling video
          if (!videoEnabled && enableVideo && typeof enableVideo === "function") {
            console.log('📹 First time enabling video...');
            
            const result = await enableVideo();
            
            if (result) {
              setVideoEnabled(true);
              videoInitializedRef.current = true;
              
              console.log('✅ Video enabled for first time');
              
              // Wait for track to be fully published
              await new Promise(resolve => setTimeout(resolve, 800));
              
              // Verify track is published
              if (room?.localParticipant) {
                const videoPublication = room.localParticipant.getTrackPublication(Track.Source.Camera);
                console.log('📹 Video publication check:', {
                  hasPublication: !!videoPublication,
                  hasTrack: !!videoPublication?.track,
                  isPublished: !!videoPublication?.track?.mediaStreamTrack
                });
              }
              
              // Broadcast video state change
              if (room?.localParticipant && currentUser) {
                const encoder = new TextEncoder();
                const stateData = encoder.encode(JSON.stringify({
                  type: 'track_state_update',
                  user_id: currentUser.id,
                  participant_sid: room.localParticipant.sid,
                  participant_identity: room.localParticipant.identity,
                  track_kind: 'video',
                  enabled: true,
                  timestamp: Date.now(),
                }));
                
                await room.localParticipant.publishData(stateData, DataPacket_Kind.RELIABLE);
                console.log('✅ Video enabled - state broadcasted');
              }
              
              // Trigger local stream update
              window.dispatchEvent(new CustomEvent('localVideoEnabled', {
                detail: {
                  userId: currentUser.id,
                  isVideoEnabled: true,
                  timestamp: Date.now()
                }
              }));
              
              showNotificationMessage("Camera turned on");
              return;
            }
          }

          // 🔥 CASE 2: Toggle existing video track
          if (livekitToggleVideo && typeof livekitToggleVideo === "function") {
            console.log('🔄 Toggling existing video track...');
            
            const newState = await livekitToggleVideo();
            
            console.log('🎥 Video toggled - new state:', newState);
            
            setVideoEnabled(newState);
            videoInitializedRef.current = true;
            
            // Wait for track state to stabilize
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // Verify track state after toggle
            if (room?.localParticipant) {
              const videoPublication = room.localParticipant.getTrackPublication(Track.Source.Camera);
              console.log('📹 Video publication after toggle:', {
                hasPublication: !!videoPublication,
                hasTrack: !!videoPublication?.track,
                isMuted: videoPublication?.track?.isMuted,
                isEnabled: !videoPublication?.track?.isMuted,
                mediaStreamTrack: !!videoPublication?.track?.mediaStreamTrack,
                mediaStreamTrackEnabled: videoPublication?.track?.mediaStreamTrack?.enabled
              });
              
              // 🔥 CRITICAL FIX: If turning ON, ensure mediaStreamTrack is enabled
              if (newState && videoPublication?.track?.mediaStreamTrack) {
                videoPublication.track.mediaStreamTrack.enabled = true;
                console.log('✅ Force-enabled mediaStreamTrack');
              }
            }
            
            // Broadcast video state change with full details
            if (room?.localParticipant && currentUser) {
              const encoder = new TextEncoder();
              const stateData = encoder.encode(JSON.stringify({
                type: 'track_state_update',
                user_id: currentUser.id,
                participant_sid: room.localParticipant.sid,
                participant_identity: room.localParticipant.identity,
                track_kind: 'video',
                enabled: newState,
                timestamp: Date.now(),
              }));
              
              await room.localParticipant.publishData(stateData, DataPacket_Kind.RELIABLE);
              console.log(`✅ Video ${newState ? 'enabled' : 'disabled'} - state broadcasted`);
            }
            
            // Trigger stream update event
            window.dispatchEvent(new CustomEvent('localVideoToggled', {
              detail: {
                userId: currentUser.id,
                isVideoEnabled: newState,
                timestamp: Date.now()
              }
            }));
            
            showNotificationMessage(
              newState ? "Camera turned on" : "Camera turned off"
            );
            
            return;
          }
        } catch (error) {
          console.error("❌ Video toggle error:", error);
          showNotificationMessage(
            `Video toggle failed: ${error.message}`,
            "error"
          );
        }

        // Fallback
        if (propOnToggleVideo) {
          const newState = propOnToggleVideo();
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
      propOnToggleVideo,
      videoEnabled,
      showNotificationMessage,
      room,
      currentUser,
    ]
  );

const handleForceStopScreenShare = async (participant) => {
  if (!room || !forceStopParticipantScreenShare) return;
  
  try {
    // Stop the screen share
    await forceStopParticipantScreenShare(participant);
    
    // Send data channel message to notify participants
    if (room.localParticipant) {
      const encoder = new TextEncoder();
      const stopData = encoder.encode(
        JSON.stringify({
          type: "force_stop_screen_share",
          target_user_id: participant.user_id || participant.id,
          target_user_name: participant.name || participant.displayName || 'Participant',
          stopped_by_id: currentUser.id,
          stopped_by_name: currentUser.name || currentUser.full_name || 'Host',
          reason: "Stopped by host",
          timestamp: Date.now(),
        })
      );
      
      await room.localParticipant.publishData(
        stopData,
        DataPacket_Kind.RELIABLE
      );
    }
    
    // Trigger the callback to show dialog for host
    if (onScreenShareStopped) {
      onScreenShareStopped({
        stoppedBy: currentUser,
        stoppedParticipant: participant,
        isCurrentUser: false,
        reason: "Stopped by host",
      });
    }
    
    showNotificationMessage(
      `Stopped screen sharing for ${participant.name || participant.displayName}`,
      "success"
    );
  } catch (error) {
    console.error("Error stopping screen share:", error);
    showNotificationMessage("Failed to stop screen sharing", "error");
  }
};


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

      // ✅ CRITICAL FIX: Check if someone else is already sharing
      if (enhancedScreenShareData.stream && enhancedScreenShareData.sharer) {
        const currentUserId = currentUser?.id?.toString();
        const sharerUserId = enhancedScreenShareData.sharer.user_id?.toString();
        const sharerIdentity = enhancedScreenShareData.sharer.connection_id || 
                               enhancedScreenShareData.sharer.participant_id || 
                               enhancedScreenShareData.sharer.identity;
        
        // ✅ If someone else is sharing
        if (sharerUserId !== currentUserId) {
          // ✅ PROTECTION: Only hosts/co-hosts can stop other people's screen shares
          if (!hasHostPrivileges) {
            showNotificationMessage(
              `${enhancedScreenShareData.sharer.name || "A participant"} is already sharing their screen. Only hosts/co-hosts can stop their screen share.`,
              "error"
            );
            return;
          }
          
          // ✅ Host/Co-host stopping someone else's screen share
          console.log(`🛡️ Host/Co-host stopping ${enhancedScreenShareData.sharer.name}'s screen share`);
          showNotificationMessage(
            `Stopping ${enhancedScreenShareData.sharer.name || "participant"}'s screen share...`,
            "info"
          );
          
          // ✅ CRITICAL FIX: Enhanced target identification
          if (forceStopParticipantScreenShare) {
            // Get BOTH identity and user_id for proper targeting
            const targetIdentity = sharerIdentity || enhancedScreenShareData.sharer.connection_id;
            const targetUserId = enhancedScreenShareData.sharer.user_id;
            
            console.log("🛑 Stopping participant screen share with identifiers:", {
              targetIdentity,
              targetUserId,
              sharerName: enhancedScreenShareData.sharer.name
            });
            
            const success = await forceStopParticipantScreenShare(targetIdentity);
            
            if (success) {
              // ✅ CRITICAL: Send data channel message with BOTH identifiers
              if (room && room.localParticipant) {
                const encoder = new TextEncoder();
                const stopData = encoder.encode(
                  JSON.stringify({
                    type: "force_stop_screen_share",
                    target_identity: targetIdentity,  // ✅ LiveKit identity
                    target_user_id: targetUserId,      // ✅ Database user ID
                    target_user_name: enhancedScreenShareData.sharer.name || 'Participant',
                    stopped_by_id: currentUser.id,
                    stopped_by_name: currentUser.name || currentUser.full_name || 'Host',
                    reason: "Stopped by host",
                    timestamp: Date.now(),
                  })
                );
                
                await room.localParticipant.publishData(
                  stopData,
                  DataPacket_Kind.RELIABLE
                );
              }

              showNotificationMessage(
                `Stopped ${enhancedScreenShareData.sharer.name || "participant"}'s screen share`,
                "success"
              );
              
              // ✅ FIXED: Only set local state - NO DIALOG FOR HOST
              setScreenSharing(false);
            } else {
              showNotificationMessage(
                "Failed to stop screen share. Participant may have disconnected.",
                "warning"
              );
            }
          }
          return;
        }
        
        // ✅ If it's the current user sharing, allow them to stop
        if (sharerUserId === currentUserId) {
          console.log("🛑 User stopping their own screen share");
          if (livekitStopScreenShare) {
            const success = await livekitStopScreenShare();
            if (success) {
              setScreenSharing(false);
              showNotificationMessage("Screen sharing stopped", "success");
            }
          }
          return;
        }
      }

      try {
        if (screenSharing || livekitLocalIsScreenSharing) {
          // Stop screen sharing (own share)
          console.log("Stopping own screen share...");
          if (livekitStopScreenShare) {
            const success = await livekitStopScreenShare();
            if (success) {
              setScreenSharing(false);
              showNotificationMessage("Screen sharing stopped", "success");
            }
          }
        } else {
          // Start screen sharing
          console.log("Starting screen share...", {
            isHost,
            isCoHost,
            coHostPrivilegesActive,
            hasHostPrivileges,
            canShareScreenDirectly,
          });

          // UPDATED: HOSTS AND CO-HOSTS CAN SHARE DIRECTLY WITHOUT APPROVAL
          if (canShareScreenDirectly) {
            const userRole = isHost
              ? "Host"
              : isCoHost || coHostPrivilegesActive
                ? "Co-Host"
                : "Participant";
            console.log(
              `${userRole} starting screen share directly without approval`
            );

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

                console.log(
                  `${roleMessage} screen share started successfully:`,
                  {
                    sharingMode: result.sharingMode,
                    audioStrategy: result.audioStrategy,
                    hasSystemAudio: result.hasSystemAudio,
                  }
                );
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
            console.log(
              "Regular participant requesting screen share approval..."
            );

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
          console.log("Fallback screen share start...");
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
    forceStopParticipantScreenShare,
    showNotificationMessage,
    canShareScreenDirectly,
    hasHostPrivileges,
    meetingSettings.screenShareRequiresApproval,
    screenSharePermissions,
    isHost,
    isCoHost,
    coHostPrivilegesActive,
    currentUser?.id,
    currentUser?.name,
    currentUser?.full_name,
    enhancedScreenShareData,
    room,
    setScreenSharing,
    setShowScreenShareWaiting,
  ]
);
  // Camera toggle for attendance
  const handleCameraToggle = useCallback(
    async (enabled) => {
      try {
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

          setVideoEnabled(false);
          return Promise.resolve();
        }
      } catch (error) {
        console.error("❌ Camera toggle failed:", error);
        showNotificationMessage(
          `Camera toggle failed: ${error.message}`,
          "error"
        );
        throw error;
      }
    },
    [livekitToggleVideo, enableVideo, showNotificationMessage]
  );

 return {
  // State
  audioEnabled,
  videoEnabled,
  screenSharing,
  showScreenShareWaiting,
  screenShareWaitingTimeout,
  audioInitStatus,
  showAudioStatus,
  showScreenShareStopped, // ✅ ADD THIS
  screenShareStoppedBy, // ✅ ADD THIS
  
  // Setters
  setAudioEnabled,
  setVideoEnabled,
  setScreenSharing,
  setShowScreenShareWaiting,
  setScreenShareWaitingTimeout,
  setShowScreenShareStopped, // ✅ ADD THIS
  setScreenShareStoppedBy, // ✅ ADD THIS
  
  // Refs
  audioInitializedRef,
  videoInitializedRef,
  
  // Handlers
  handleToggleAudio,
  handleToggleVideo,
  handleToggleScreenShare,
  handleCameraToggle,
  showAudioInitStatus,
};
};