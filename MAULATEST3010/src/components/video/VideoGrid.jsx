// src/components/video/VideoGrid.jsx - FIXED VERSION WITH IMPROVED UI AND HOST VISIBILITY
import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import {
  Box,
  Grid,
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Chip,
  Avatar,
  useTheme,
  alpha,
  Pagination,
  Button,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider
} from '@mui/material';
import {
  MoreVert,
  Mic,
  MicOff,
  Videocam,
  VideocamOff,
  VolumeUp,
  Star,
  Monitor,
  PanTool,
  Person,
  ViewModule,
  ViewComfy,
  ViewStream,
  PushPin,
  PushPinOutlined,
  Fullscreen,
  FullscreenExit,
  PersonOff,
  VolumeOff,
  Warning,
  SupervisorAccount
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import VideoPlayer from './VideoPlayer';
import { throttle, debounce } from 'lodash';

// Performance configuration
const PERFORMANCE_CONFIG = {
  MAX_VISIBLE_PARTICIPANTS: 25,
  MAX_PARTICIPANTS_PER_PAGE: 25,
  COMPACT_MODE_PARTICIPANTS: 49,
  COMFORTABLE_MODE_PARTICIPANTS: 25,
  FOCUS_MODE_PARTICIPANTS: 10,
  THROTTLE_DELAY: 200,
  DEBOUNCE_DELAY: 100,
  STREAM_UPDATE_DELAY: 500
};

// FIXED: Improved GridContainer with proper spacing
const GridContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  height: '100%',
  padding: theme.spacing(1),
  paddingBottom: theme.spacing(12), // FIXED: Proper spacing from control bar
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: '#0a0a0a',
  position: 'relative',
  
  // FIXED: Responsive padding
  '@media (max-width: 768px)': {
    padding: theme.spacing(0.5),
    paddingBottom: theme.spacing(11),
  }
}));

// FIXED: Enhanced RoleBasedGrid with better spacing and border radius
const RoleBasedGrid = styled(Box, {
  shouldForwardProp: (prop) => !['isHost', 'participantCount'].includes(prop)
})(({ theme, isHost, participantCount }) => {
  if (isHost) {
    // Host sees all students and co-hosts in grid layout
    const cols = Math.min(6, Math.ceil(Math.sqrt(participantCount || 1)));
    const rows = Math.ceil((participantCount || 1) / cols);
    
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap: theme.spacing(1.5), // FIXED: Better spacing
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      minHeight: 0,
      padding: theme.spacing(1),
    };
  } else {
    // FIXED: Student view with improved spacing and layout
    const count = participantCount || 1;
    
    let gridConfig;
    
    if (count === 1) {
      gridConfig = {
        columns: '1fr',
        rows: '1fr',
        maxHeight: '75vh'
      };
    } else if (count === 2) {
      gridConfig = {
        columns: '1fr 1fr',
        rows: '1fr',
        maxHeight: '70vh'
      };
    } else if (count === 3) {
      gridConfig = {
        columns: 'repeat(3, 1fr)',
        rows: '1fr',
        maxHeight: '65vh'
      };
    } else if (count === 4) {
      gridConfig = {
        columns: 'repeat(2, 1fr)',
        rows: 'repeat(2, 1fr)',
        maxHeight: '75vh'
      };
    } else if (count <= 6) {
      gridConfig = {
        columns: 'repeat(3, 1fr)',
        rows: 'repeat(2, 1fr)',
        maxHeight: '80vh'
      };
    } else {
      gridConfig = {
        columns: 'repeat(auto-fit, minmax(280px, 1fr))',
        rows: 'repeat(auto-fit, minmax(210px, 1fr))',
        maxHeight: '85vh'
      };
    }

    return {
      display: 'grid',
      gridTemplateColumns: gridConfig.columns,
      gridTemplateRows: gridConfig.rows,
      gap: theme.spacing(1.5), // FIXED: Consistent spacing
      width: '100%',
      height: '100%',
      maxHeight: gridConfig.maxHeight,
      overflow: 'hidden',
      minHeight: 0,
      padding: theme.spacing(1.5),
      alignItems: 'center',
      justifyItems: 'center',
      
      // FIXED: Better video container sizing
      '& > *': {
        width: '100%',
        height: '100%',
        minHeight: count <= 3 ? '280px' : count <= 6 ? '220px' : '180px',
        maxHeight: count <= 3 ? '450px' : count <= 6 ? '320px' : '250px',
        borderRadius: theme.spacing(1.5), // FIXED: Better border radius
        overflow: 'hidden',
        
        // Maintain aspect ratio
        aspectRatio: count <= 2 ? '16/10' : count <= 4 ? '16/9' : '4/3',
        
        // Smooth transitions
        transition: 'all 0.3s ease',
        
        // Ensure proper centering
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        
        // FIXED: Add subtle shadow for better visual separation
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      },
      
      // Responsive adjustments for smaller screens
      '@media (max-width: 1200px)': {
        gap: theme.spacing(1),
        padding: theme.spacing(1),
        
        '& > *': {
          minHeight: count <= 3 ? '220px' : count <= 6 ? '180px' : '160px',
          maxHeight: count <= 3 ? '350px' : count <= 6 ? '250px' : '200px',
          borderRadius: theme.spacing(1),
        }
      },
      
      '@media (max-width: 768px)': {
        gridTemplateColumns: count > 2 ? 'repeat(2, 1fr)' : gridConfig.columns,
        gap: theme.spacing(0.75),
        padding: theme.spacing(0.5),
        
        '& > *': {
          minHeight: '140px',
          maxHeight: '180px',
          aspectRatio: '16/9',
          borderRadius: theme.spacing(0.75),
        }
      }
    };
  }
});

// FIXED: ParticipantContainer with removed white borders and transitions
const ParticipantContainer = styled(Box, {
  shouldForwardProp: (prop) => !['isScreenShare', 'isSpeaker', 'isLocal', 'isMinimized', 'isPinned', 'isHost', 'isCoHost', 'isRemoving'].includes(prop)
})(({ theme, isScreenShare, isSpeaker, isLocal, isMinimized, isPinned, isHost, isCoHost, isRemoving }) => ({
  position: 'relative',
  borderRadius: theme.spacing(1.5),
  overflow: 'hidden',
  backgroundColor: '#1a1a1a',
  border: `2px solid ${
    isPinned ? theme.palette.warning.main :
    isScreenShare ? theme.palette.info.main : 
    isSpeaker ? theme.palette.success.main : 
    // isLocal ? theme.palette.primary.main :
    // isHost ? theme.palette.warning.main :
    // isCoHost ? '#ff5722' :
    'transparent' // FIXED: Removed white border - now transparent
  }`,
  // REMOVED: All transitions for no hover effects
  minHeight: isMinimized ? '80px' : isScreenShare ? '400px' : '120px',
  width: '100%',
  height: '100%',
  opacity: isRemoving ? 0.5 : 1,
  filter: isRemoving ? 'grayscale(100%)' : 'none',
  
  // FIXED: Removed all hover effects and transitions
  '&:hover': {
    '& .participant-controls': {
      opacity: 1,
    },
  },
  
  // REMOVED: Box shadow to eliminate any white lines
  boxShadow: 'none',
}));

// FIXED: Enhanced video labels with better styling
const StudentVideoLabel = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: theme.spacing(1),
  right: theme.spacing(1),
  backgroundColor: 'rgba(33, 150, 243, 0.9)',
  color: 'white',
  padding: theme.spacing(0.5, 1.5),
  borderRadius: theme.spacing(1.5), // FIXED: More rounded
  fontSize: '0.75rem',
  fontWeight: 600,
  zIndex: 20,
  backdropFilter: 'blur(8px)',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
}));

const HostVideoLabel = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: theme.spacing(1),
  right: theme.spacing(1),
  backgroundColor: 'rgba(255, 152, 0, 0.9)',
  color: 'white',
  padding: theme.spacing(0.5, 1.5),
  borderRadius: theme.spacing(1.5), // FIXED: More rounded
  fontSize: '0.75rem',
  fontWeight: 600,
  zIndex: 20,
  backdropFilter: 'blur(8px)',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
}));

const CoHostVideoLabel = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: theme.spacing(1),
  right: theme.spacing(1),
  backgroundColor: 'rgba(255, 87, 34, 0.9)',
  color: 'white',
  padding: theme.spacing(0.5, 1.5),
  borderRadius: theme.spacing(1.5), // FIXED: More rounded
  fontSize: '0.75rem',
  fontWeight: 600,
  zIndex: 20,
  backdropFilter: 'blur(8px)',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
}));

// FIXED: Enhanced ParticipantInfo with better background
const ParticipantInfo = styled(Box)(({ theme }) => ({
  position: 'absolute',
  bottom: theme.spacing(0.75),
  left: theme.spacing(0.75),
  right: theme.spacing(0.75),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderRadius: theme.spacing(1), // FIXED: Better border radius
  padding: theme.spacing(0.5, 1),
  backdropFilter: 'blur(12px)',
  zIndex: 10,
}));

const ViewControls = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: theme.spacing(1),
  right: theme.spacing(7),
  display: 'flex',
  gap: theme.spacing(0.5),
  zIndex: 20,
  backgroundColor: alpha(theme.palette.background.paper, 0.9),
  borderRadius: theme.spacing(1), // FIXED: Better border radius
  padding: theme.spacing(0.75),
  backdropFilter: 'blur(10px)',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
}));

// FIXED: Enhanced ScreenShareContainer
const ScreenShareContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  height: '100%',
  backgroundColor: '#000',
  borderRadius: theme.spacing(1.5), // FIXED: Better border radius
  overflow: 'hidden',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100%',
  maxHeight: '100%',
  boxShadow: '0 8px 25px rgba(0, 0, 0, 0.4)',
}));

const ParticipantMenuContainer = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: theme.spacing(0.75),
  right: theme.spacing(0.75),
  opacity: 0,
  transition: 'opacity 0.2s',
  zIndex: 15,
  '&.visible': {
    opacity: 1
  }
}));

// CRITICAL FIX: Enhanced stream getter with explicit host stream handling
const getParticipantStreamEnhanced = (participant, localStream, remoteStreams) => {
  if (!participant) {
    console.log('No participant provided');
    return null;
  }

  const participantId = participant.user_id || participant.participant_id;
  const isHost = participant.role === 'host' || participant.isHost;
  const isCoHost = participant.isCoHost;
  const isLocal = participant.isLocal;

  console.log('🎥 Getting stream for participant:', {
    id: participantId,
    name: participant.displayName,
    isLocal: isLocal,
    isHost: isHost,
    isCoHost: isCoHost,
    isVideoEnabled: participant.isVideoEnabled,
    video_enabled: participant.video_enabled,
    hasDirectStream: !!participant.stream
  });

  // CRITICAL FIX: First check if participant has direct stream
  if (participant.stream && participant.stream instanceof MediaStream) {
    console.log('✅ Using direct participant stream for:', participant.displayName);
    return participant.stream;
  }

  // CRITICAL FIX: For local participant (including local host)
  if (isLocal && localStream && localStream instanceof MediaStream) {
    console.log('✅ Using local stream for local participant:', participant.displayName);
    return localStream;
  }

  // CRITICAL FIX: Enhanced stream key generation with host-specific keys
  let streamKeys = [];
  
  if (participantId) {
    streamKeys.push(
      participantId.toString(),
      `user_${participantId}`,
      `participant_${participantId}`
    );
  }

  if (participant.participant_id && participant.participant_id !== participantId) {
    streamKeys.push(
      participant.participant_id,
      participant.participant_id.toString()
    );
  }

  if (participant.connection_id) {
    streamKeys.push(participant.connection_id);
  }

  if (participant.identity) {
    streamKeys.push(participant.identity);
  }

  if (participant.sid) {
    streamKeys.push(participant.sid);
  }

  // CRITICAL FIX: Enhanced host AND co-host specific stream keys
  if (isHost || isCoHost) {
    streamKeys.push(
      `host_${participantId}`,
      `cohost_${participantId}`,
      `host`,
      `cohost`,
      `instructor_${participantId}`,
      `teacher_${participantId}`,
      `admin_${participantId}`,
      `livekit_${participantId}`, // CRITICAL: LiveKit specific key
      `remote_${participantId}`, // CRITICAL: Remote stream key
    );
    
    // CRITICAL FIX: Check for generic host/cohost streams
    if (remoteStreams.has('host') || remoteStreams.has('cohost')) {
      const hostStream = remoteStreams.get('host') || remoteStreams.get('cohost');
      if (hostStream instanceof MediaStream && hostStream.getTracks().length > 0) {
        console.log('✅ Found generic host/cohost stream');
        return hostStream;
      }
    }
  }

  streamKeys = [...new Set(streamKeys.filter(Boolean))];
  
  // CRITICAL FIX: Try exact key matches first
  for (const key of streamKeys) {
    if (remoteStreams.has(key)) {
      const stream = remoteStreams.get(key);
      if (stream instanceof MediaStream && stream.getTracks().length > 0) {
        console.log('✅ Found stream with exact key:', key, 'for:', participant.displayName);
        return stream;
      }
    }
  }

  // CRITICAL FIX: Enhanced pattern matching for ALL remote participants
  for (const [streamKey, stream] of remoteStreams.entries()) {
    const keyStr = streamKey.toString().toLowerCase();
    const participantIdStr = participantId?.toString();
    
    // CRITICAL: Match by participant ID patterns
    if (participantIdStr && (
      keyStr === participantIdStr ||
      keyStr.includes(participantIdStr) ||
      keyStr.endsWith(`_${participantIdStr}`) ||
      keyStr.startsWith(`${participantIdStr}_`)
    )) {
      if (stream instanceof MediaStream && stream.getTracks().length > 0) {
        console.log('✅ Found stream with ID pattern match:', streamKey, 'for:', participant.displayName);
        return stream;
      }
    }

    // CRITICAL FIX: Enhanced host/co-host pattern matching
    if (isHost || isCoHost) {
      if (keyStr.includes('host') || 
          keyStr.includes('cohost') ||
          keyStr.includes('instructor') || 
          keyStr.includes('teacher') ||
          keyStr.includes('admin') ||
          keyStr.includes('livekit') ||
          keyStr.includes('remote')) {
        
        if (stream instanceof MediaStream && stream.getTracks().length > 0) {
          console.log('✅ Found host/cohost stream with pattern match:', streamKey, 'for:', participant.displayName);
          return stream;
        }
      }
    }
  }

  console.log('❌ No stream found for participant:', participant.displayName, 'Available streams:', Array.from(remoteStreams.keys()));
  return null;
};

// Memoized participant renderer with enhanced video display logic
const ParticipantRenderer = memo(({ 
  participant, 
  localStream,
  remoteStreams,
  isMinimized,
  onParticipantMenu,
  isSpeaking,
  isScreenShare,
  isPinned,
  onPinParticipant,
  isHost,
  currentUserId,
  showLabel,
  labelType,
  onRemoveParticipant,
  onPromoteToHost,
  onRemoveCoHost,
  onParticipantRemoved
}) => {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null, title: '', message: '' });
  const [isRemoving, setIsRemoving] = useState(false);
  
  // CRITICAL FIX: Get stream with enhanced logic
  const stream = useMemo(() => {
    return getParticipantStreamEnhanced(participant, localStream, remoteStreams);
  }, [participant, localStream, remoteStreams]);

  const handleMenuOpen = (event) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    if (onParticipantMenu) {
      onParticipantMenu(event, participant);
    }
  };
  
  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  // CRITICAL FIX: Enhanced video display logic with better host handling
  const shouldShowVideo = useMemo(() => {
    const videoEnabled = participant.isVideoEnabled || participant.video_enabled;
    const hasStream = !!stream;
    const isHostUser = participant.role === 'host' || participant.isHost;
    const isCoHostUser = participant.isCoHost;
    const streamHasVideoTracks = stream ? stream.getVideoTracks().length > 0 : false;
    
    console.log('🎥 Video display check for', participant.displayName, ':', {
      videoEnabled,
      hasStream,
      isHostUser,
      isCoHostUser,
      streamTracks: stream ? stream.getTracks().length : 0,
      videoTracks: streamHasVideoTracks ? stream.getVideoTracks().length : 0,
      isLocal: participant.isLocal
    });
    
    // CRITICAL FIX: More permissive video display logic
    // Show video if:
    // 1. We have a stream with video tracks AND video is enabled, OR
    // 2. We have a valid stream (for hosts/co-hosts, be more permissive), OR
    // 3. For local participants, show if stream exists
    const shouldShow = (hasStream && streamHasVideoTracks && videoEnabled) ||
                      (hasStream && streamHasVideoTracks && (isHostUser || isCoHostUser || participant.isLocal));
    
    console.log('🎯 Final decision - shouldShowVideo:', shouldShow, 'for:', participant.displayName);
    return shouldShow;
  }, [participant.isVideoEnabled, participant.video_enabled, participant.role, participant.isHost, participant.isCoHost, participant.isLocal, stream, participant.displayName]);

  // Participant removal handlers (keeping existing logic)
  const handleRemoveParticipant = () => {
    setConfirmDialog({
      open: true,
      action: 'remove',
      title: 'Remove Participant',
      message: `Are you sure you want to remove ${participant.displayName} from the meeting? They will be disconnected immediately.`
    });
    handleMenuClose();
  };

  const handlePromoteToHost = () => {
    setConfirmDialog({
      open: true,
      action: 'promote',
      title: 'Make Co-Host',
      message: `Are you sure you want to make ${participant.displayName} a co-host? They will gain host privileges including the ability to manage other participants.`
    });
    handleMenuClose();
  };

  const handleRemoveCoHost = () => {
    setConfirmDialog({
      open: true,
      action: 'remove_cohost',
      title: 'Remove Co-Host Privileges',
      message: `Are you sure you want to remove co-host privileges from ${participant.displayName}? They will lose all host abilities and become a regular participant.`
    });
    handleMenuClose();
  };

  const handleConfirmAction = async () => {
    const participantId = participant.user_id || participant.participant_id;
    
    try {
      setIsRemoving(true);
      
      if (confirmDialog.action === 'remove' && onRemoveParticipant) {
        console.log('VideoGrid: Removing participant:', participant.displayName, 'ID:', participantId);
        
        const removalData = {
          userId: participantId,
          user_id: participantId,
          participantId: participantId,
          participant: {
            ...participant,
            user_id: participantId,
            displayName: participant.displayName,
            name: participant.displayName,
            full_name: participant.displayName,
            Full_Name: participant.displayName
          },
          reason: 'removed_by_host_or_cohost',
          removeType: 'kick',
          force_disconnect: true,
          removedBy: currentUserId,
          removedByName: 'Host/Co-Host'
        };
        
        console.log('VideoGrid: Sending removal data:', removalData);
        
        if (onParticipantRemoved) {
          console.log('VideoGrid: Calling immediate removal callback');
          onParticipantRemoved(participantId);
        }
        
        const result = await onRemoveParticipant(removalData);
        
        if (result && result.success === false) {
          console.error('VideoGrid: Failed to remove participant:', result.error);
          if (window.showNotificationMessage) {
            window.showNotificationMessage(`Failed to remove participant: ${result.error}`, 'error');
          }
          setIsRemoving(false);
          return;
        }
        
        console.log('VideoGrid: Participant removed successfully:', participant.displayName);
        
      } else if (confirmDialog.action === 'promote' && onPromoteToHost) {
        console.log('VideoGrid: Promoting participant to co-host:', participant.displayName, 'ID:', participantId);
        
        const promotionData = {
          participantId: participantId,
          userId: participant.user_id,
          participant: participant,
          newRole: 'co-host',
          promotedBy: currentUserId
        };
        
        console.log('VideoGrid: Sending promotion data:', promotionData);
        const result = await onPromoteToHost(promotionData);
        
        if (result && result.success === false) {
          console.error('VideoGrid: Failed to promote participant:', result.error);
          setIsRemoving(false);
          return;
        }
        
        console.log('VideoGrid: Participant promoted successfully:', participant.displayName);
        setIsRemoving(false);
        
      } else if (confirmDialog.action === 'remove_cohost' && onRemoveCoHost) {
        console.log('VideoGrid: Removing co-host privileges from:', participant.displayName, 'ID:', participantId);
        
        const result = await onRemoveCoHost(participant.user_id, participant.displayName);
        
        if (result && result.success === false) {
          console.error('VideoGrid: Failed to remove co-host:', result.error);
          setIsRemoving(false);
          return;
        }
        
        console.log('VideoGrid: Co-host privileges removed successfully:', participant.displayName);
        setIsRemoving(false);
      }
      
    } catch (error) {
      console.error('VideoGrid: Error performing action:', confirmDialog.action, error);
      setIsRemoving(false);
      
      let errorMessage = 'An error occurred';
      if (confirmDialog.action === 'remove') {
        errorMessage = `Failed to remove ${participant.displayName}: ${error.message}`;
      } else if (confirmDialog.action === 'promote') {
        errorMessage = `Failed to promote ${participant.displayName}: ${error.message}`;
      } else if (confirmDialog.action === 'remove_cohost') {
        errorMessage = `Failed to remove co-host privileges: ${error.message}`;
      }
      
      console.error(errorMessage);
      
      if (window.showNotificationMessage) {
        window.showNotificationMessage(errorMessage, 'error');
      }
      
    } finally {
      setConfirmDialog({ open: false, action: null, title: '', message: '' });
    }
  };

  const handleCancelAction = () => {
    console.log('VideoGrid: Action cancelled by user');
    setIsRemoving(false);
    setConfirmDialog({ open: false, action: null, title: '', message: '' });
  };

  if (isRemoving) {
    return null;
  }
  
  return (
    <>
      <ParticipantContainer
        isScreenShare={isScreenShare}
        isSpeaker={isSpeaking}
        isLocal={participant.isLocal}
        isMinimized={isMinimized}
        isPinned={isPinned}
        isHost={participant.role === 'host' || participant.isHost}
        isCoHost={participant.isCoHost}
        isRemoving={isRemoving}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* FIXED: Enhanced role labels */}
        {showLabel && labelType === 'student' && (
          <StudentVideoLabel>
           YOU
          </StudentVideoLabel>
        )}
        
        {showLabel && labelType === 'host' && (
          <HostVideoLabel>
            HOST VIDEO
          </HostVideoLabel>
        )}

        {showLabel && labelType === 'cohost' && (
          <CoHostVideoLabel>
            CO-HOST VIDEO
          </CoHostVideoLabel>
        )}

        {/* CRITICAL FIX: Enhanced video display with better stream handling */}
        {shouldShowVideo ? (
          <VideoPlayer
            stream={stream}
            participant={participant}
            isLocal={participant.isLocal}
            isMuted={!participant.isAudioEnabled}
            isVideoEnabled={participant.isVideoEnabled || participant.video_enabled}
            participantName={participant.displayName}
            participantId={participant.user_id}
            quality={participant.connectionQuality || 'good'}
            volume={1.0}
            showControls={!isMinimized}
            compact={isMinimized}
            isScreenShare={isScreenShare}
          />
        ) : (
          // FIXED: Clean avatar/placeholder with no white lines or shadows
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#2a2a2a',
              color: 'white',
              opacity: isRemoving ? 0.5 : 1,
              filter: isRemoving ? 'grayscale(100%)' : 'none',
              borderRadius: 1.5,
              border: 'none', // FIXED: No border
            }}
          >
            <Avatar 
              sx={{ 
                width: 80, 
                height: 80, 
                fontSize: '2rem',
                backgroundColor: participant.isLocal ? '#1976d2' : 
                                 (participant.role === 'host' || participant.isHost) ? '#ff9800' :
                                 participant.isCoHost ? '#ff5722' : '#666',
                mb: 1,
                opacity: isRemoving ? 0.5 : 1,
                border: 'none', // FIXED: Remove any border
                boxShadow: 'none', // FIXED: Remove shadow
              }}
            >
              {participant.displayName?.charAt(0)?.toUpperCase() || 'U'}
            </Avatar>
            <Typography variant="body2" sx={{ opacity: isRemoving ? 0.3 : 0.7, fontWeight: 500 }}>
              {isRemoving ? 'Removing...' :
               !stream ? 
                (participant.isVideoEnabled || participant.video_enabled ? 'Connecting...' : 'Camera off') : 
                'Camera off'
              }
            </Typography>
            {(participant.role === 'host' || participant.isHost) && (
              <Typography variant="caption" sx={{ 
                opacity: isRemoving ? 0.3 : 0.8, 
                mt: 0.5, 
                fontWeight: 600,
                color: '#ff9800'
              }}>
                Host
              </Typography>
            )}
            {participant.isCoHost && (
              <Typography variant="caption" sx={{ 
                opacity: isRemoving ? 0.3 : 0.8, 
                mt: 0.5, 
                fontWeight: 600,
                color: '#ff5722'
              }}>
                Co-Host
              </Typography>
            )}
          </Box>
        )}

        {/* Participant controls menu */}
        {isHost && !participant.isLocal && !isRemoving && (
          <ParticipantMenuContainer className={isHovered ? 'visible participant-controls' : 'participant-controls'}>
            <IconButton
              size="small"
              onClick={handleMenuOpen}
              sx={{ 
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: 'white',
                backdropFilter: 'blur(8px)',
                '&:hover': {
                  backgroundColor: 'rgba(0,0,0,0.9)',
                  transform: 'scale(1.1)',
                }
              }}
            >
              <MoreVert fontSize="small" />
            </IconButton>
          </ParticipantMenuContainer>
        )}

        {/* FIXED: Enhanced ParticipantInfo */}
        <ParticipantInfo>
          <Box display="flex" alignItems="center" gap={0.5}>
            <Typography variant="caption" color="white" noWrap sx={{ 
              maxWidth: '120px', 
              fontSize: '0.7rem',
              fontWeight: 500
            }}>
              {participant.displayName}
              {participant.isLocal && ' (You)'}
              {isRemoving && ' (Removing...)'}
            </Typography>

            {isScreenShare && <Monitor sx={{ fontSize: 14, color: theme.palette.info.main }} />}
            {participant.handRaised && <PanTool sx={{ fontSize: 14, color: theme.palette.warning.main }} />}
            {(participant.role === 'host' || participant.isHost) && <Star sx={{ fontSize: 14, color: theme.palette.warning.main }} />}
            {participant.isCoHost && <SupervisorAccount sx={{ fontSize: 14, color: '#ff5722' }} />}
            {isPinned && <PushPin sx={{ fontSize: 14, color: theme.palette.warning.main }} />}
          </Box>

          <Box display="flex" alignItems="center" gap={0.5}>
            <Tooltip title={participant.isAudioEnabled ? "Audio on" : "Audio off"}>
              <Box sx={{ color: participant.isAudioEnabled ? 'success.main' : 'error.main' }}>
                {participant.isAudioEnabled ? <Mic sx={{ fontSize: 14 }} /> : <MicOff sx={{ fontSize: 14 }} />}
              </Box>
            </Tooltip>

            <Tooltip title={(participant.isVideoEnabled || participant.video_enabled) ? "Video on" : "Video off"}>
              <Box sx={{ color: (participant.isVideoEnabled || participant.video_enabled) ? 'success.main' : 'error.main' }}>
                {(participant.isVideoEnabled || participant.video_enabled) ? <Videocam sx={{ fontSize: 14 }} /> : <VideocamOff sx={{ fontSize: 14 }} />}
              </Box>
            </Tooltip>
          </Box>
        </ParticipantInfo>

        {/* Enhanced participant menu */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
          PaperProps={{
            sx: {
              bgcolor: '#2a2a2a',
              color: 'white',
              border: '1px solid #444',
              minWidth: '220px',
              borderRadius: 1.5, // FIXED: Better border radius
            },
          }}
        >
          {!participant.isLocal && isHost && (
            <>
              <MenuItem onClick={handleRemoveParticipant}>
                <PersonOff sx={{ mr: 1, color: '#f44336' }} />
                Remove from meeting
              </MenuItem>
              
              {participant.role !== 'host' && !participant.isHost && !participant.isCoHost && (
                <MenuItem onClick={handlePromoteToHost}>
                  <Star sx={{ mr: 1, color: '#ff5722' }} />
                  Make co-host
                </MenuItem>
              )}
              
              {participant.isCoHost && (
                <MenuItem onClick={handleRemoveCoHost}>
                  <PersonOff sx={{ mr: 1, color: '#ff5722' }} />
                  Remove co-host privileges
                </MenuItem>
              )}
              
              <Divider sx={{ bgcolor: '#444', my: 0.5 }} />
            </>
          )}
          
          <MenuItem onClick={() => {
            onPinParticipant(participant.user_id);
            handleMenuClose();
          }}>
            {isPinned ? <PushPinOutlined sx={{ mr: 1 }} /> : <PushPin sx={{ mr: 1 }} />}
            {isPinned ? 'Unpin participant' : 'Pin participant'}
          </MenuItem>
        </Menu>
      </ParticipantContainer>

      {/* Enhanced confirmation dialog */}
      <Dialog
        open={confirmDialog.open}
        onClose={handleCancelAction}
        PaperProps={{
          sx: {
            bgcolor: '#2a2a2a',
            color: 'white',
            border: '1px solid #444',
            minWidth: 320,
            maxWidth: 520,
            borderRadius: 2, // FIXED: Better border radius
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning sx={{ 
            color: confirmDialog.action === 'remove' ? 'error.main' : 
                   confirmDialog.action === 'remove_cohost' ? '#ff5722' : 'warning.main' 
          }} />
          {confirmDialog.title}
        </DialogTitle>
        <DialogContent sx={{ pb: 2 }}>
          <Typography sx={{ mb: 2 }}>
            {confirmDialog.message}
          </Typography>
          
          {confirmDialog.action === 'remove' && (
            <Box sx={{ 
              p: 2, 
              borderRadius: 1.5, // FIXED: Better border radius
              bgcolor: 'rgba(244, 67, 54, 0.1)', 
              border: '1px solid rgba(244, 67, 54, 0.3)' 
            }}>
              <Typography variant="body2" sx={{ color: '#f44336', fontWeight: 500 }}>
                Warning: This action cannot be undone.
              </Typography>
              <Typography variant="caption" sx={{ color: 'grey.400', display: 'block', mt: 0.5 }}>
                • The participant will be immediately disconnected<br />
                • They will see a "removed from meeting" message<br />
                • They cannot rejoin without being re-invited
              </Typography>
            </Box>
          )}
          
          {confirmDialog.action === 'promote' && (
            <Box sx={{ 
              p: 2, 
              borderRadius: 1.5, // FIXED: Better border radius
              bgcolor: 'rgba(255, 152, 0, 0.1)', 
              border: '1px solid rgba(255, 152, 0, 0.3)' 
            }}>
              <Typography variant="body2" sx={{ color: '#ff9800', fontWeight: 500 }}>
                Co-host privileges include:
              </Typography>
              <Typography variant="caption" sx={{ color: 'grey.400', display: 'block', mt: 0.5 }}>
                • Recording control • Remove participants • Manage settings • Full meeting control
              </Typography>
            </Box>
          )}
          
          {confirmDialog.action === 'remove_cohost' && (
            <Box sx={{ 
              p: 2, 
              borderRadius: 1.5, // FIXED: Better border radius
              bgcolor: 'rgba(255, 87, 34, 0.1)', 
              border: '1px solid rgba(255, 87, 34, 0.3)' 
            }}>
              <Typography variant="body2" sx={{ color: '#ff5722', fontWeight: 500 }}>
                This will remove all host privileges:
              </Typography>
              <Typography variant="caption" sx={{ color: 'grey.400', display: 'block', mt: 0.5 }}>
                • No recording control • Cannot remove participants • Limited access
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button 
            onClick={handleCancelAction} 
            sx={{ color: 'grey.400', borderRadius: 1.5 }}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmAction} 
            variant="contained"
            sx={{ 
              bgcolor: confirmDialog.action === 'remove' ? 'error.main' : 
                       confirmDialog.action === 'remove_cohost' ? '#ff5722' : 'warning.main',
              color: 'white',
              borderRadius: 1.5, // FIXED: Better border radius
              '&:hover': {
                bgcolor: confirmDialog.action === 'remove' ? 'error.dark' : 
                         confirmDialog.action === 'remove_cohost' ? '#e64a19' : 'warning.dark',
              },
              minWidth: 140
            }}
          >
            {confirmDialog.action === 'remove' ? 'Remove Participant' : 
             confirmDialog.action === 'remove_cohost' ? 'Remove Co-Host' : 'Make Co-Host'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
});

// MAIN VideoGrid component with CRITICAL FIXES for host visibility
function VideoGrid({
  participants = [],
  localStream,
  remoteStreams = new Map(),
  screenShareStream,
  isScreenSharing = false,
  screenSharer,
  currentUser,
  onMuteParticipant,
  onRemoveParticipant,
  onPromoteToHost,
  onRemoveCoHost,
  onParticipantRemoved,
  viewMode = 'auto',
  containerHeight = '100%',
  containerWidth = '100%',
  isHost = false,
  coHosts = [],
}) {
  const theme = useTheme();
  const [currentPage, setCurrentPage] = useState(1);
  const [participantsPerPage, setParticipantsPerPage] = useState(PERFORMANCE_CONFIG.COMFORTABLE_MODE_PARTICIPANTS);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeSpeakers, setActiveSpeakers] = useState(new Set());
  const [pinnedParticipants, setPinnedParticipants] = useState(new Set());
  const [displayMode, setDisplayMode] = useState('comfortable');
  
  const [locallyRemovedParticipants, setLocallyRemovedParticipants] = useState(new Set());

  const isCurrentUserHost = isHost;

  console.log('🎥 VideoGrid - User role check:', {
    isHost,
    isCurrentUserHost,
    currentUser: currentUser ? { id: currentUser.id, name: currentUser.name } : null,
    participantsCount: participants.length,
    coHostsCount: coHosts.length,
    remoteStreamsCount: remoteStreams.size,
    localStreamExists: !!localStream
  });


  // 🚀 Debug: Detailed role mapping with correct name extraction
const resolveName = (p) =>
  p.displayName || p.name || p.full_name || p.user_name || `User-${p.user_id}`;

const hostList = participants
  .filter(p => p.role === 'host' || p.isHost)
  .map(p => ({
    id: p.user_id,
    name: resolveName(p)
  }));

const coHostList = participants
  .filter(p => p.isCoHost)
  .map(p => ({
    id: p.user_id,
    name: resolveName(p)
  }));

const participantList = participants
  .filter(p => !p.isHost && !p.isCoHost)
  .map(p => ({
    id: p.user_id,
    name: resolveName(p)
  }));

console.log('🧩 Current Meeting Role Breakdown:', {
  totalParticipants: participants.length,
  hosts: hostList,
  coHosts: coHostList,
  participants: participantList,
  currentUser: {
    id: currentUser?.id,
    name: currentUser?.name || currentUser?.displayName || `User-${currentUser?.id}`,
    role: isCurrentUserHost ? 'host' : 'participant'
  }
});

  // Event handling for participant removal
  useEffect(() => {
    const handleParticipantRemovedEvent = (event) => {
      const { removedUserId } = event.detail;
      console.log('VideoGrid: Received participant removed event:', removedUserId);
      
      setLocallyRemovedParticipants(prev => new Set([...prev, removedUserId]));
      
      setTimeout(() => {
        setLocallyRemovedParticipants(prev => {
          const newSet = new Set(prev);
          newSet.delete(removedUserId);
          return newSet;
        });
      }, 5000);
    };

    const handleParticipantListChanged = (event) => {
      const { action, userId } = event.detail || {};
      console.log('VideoGrid: Participant list changed:', { action, userId });
      
      if (action === 'remove' && userId) {
        setLocallyRemovedParticipants(prev => new Set([...prev, userId]));
      } else if (action === 'backend_refresh') {
        setLocallyRemovedParticipants(new Set());
      }
    };

    window.addEventListener('participantRemoved', handleParticipantRemovedEvent);
    window.addEventListener('participantListChanged', handleParticipantListChanged);

    return () => {
      window.removeEventListener('participantRemoved', handleParticipantRemovedEvent);
      window.removeEventListener('participantListChanged', handleParticipantListChanged);
    };
  }, []);

  const handleImmediateParticipantRemoval = useCallback((removedUserId) => {
    console.log('VideoGrid: Immediate participant removal callback:', removedUserId);
    
    setLocallyRemovedParticipants(prev => new Set([...prev, removedUserId]));
    
    if (onParticipantRemoved) {
      onParticipantRemoved(removedUserId);
    }
  }, [onParticipantRemoved]);

  // CRITICAL FIX: Enhanced participant filtering with better host visibility logic
  const filteredParticipants = useMemo(() => {
    console.log('🎥 VideoGrid - Filtering participants - Raw data:', {
      allParticipants: participants.map(p => ({
        id: p.user_id,
        name: p.displayName,
        role: p.role,
        isHost: p.isHost,
        isCoHost: p.isCoHost,
        isLocal: p.isLocal,
        Leave_Time: p.Leave_Time,
        Status: p.Status
      })),
      isCurrentUserHost,
      currentUserId: currentUser?.id,
      coHostsCount: coHosts.length,
      locallyRemovedParticipants: Array.from(locallyRemovedParticipants)
    });

    if (isCurrentUserHost) {
      // CRITICAL FIX: Host sees ALL non-host participants (students AND co-hosts)
      const nonHostParticipants = participants.filter(p => {
        if (locallyRemovedParticipants.has(p.user_id)) {
          console.log('VideoGrid: Filtering out locally removed participant:', p.user_id);
          return false;
        }
        
        if (p.Leave_Time) {
          console.log('VideoGrid: Filtering out participant with Leave_Time:', p.user_id);
          return false;
        }
        
        if (p.Status === 'offline' || p.Status === 'removed' || p.Status === 'left') {
          console.log('VideoGrid: Filtering out participant with status:', p.Status, p.user_id);
          return false;
        }
        
        return (p.role !== 'host' && !p.isHost) && 
               !p.isLocal && 
               p.user_id !== currentUser?.id;
      });
      
      console.log('🎥 VideoGrid: Host view - showing students and co-hosts:', nonHostParticipants.map(p => ({
        id: p.user_id,
        name: p.displayName,
        role: p.role,
        isCoHost: p.isCoHost
      })));
      
      return nonHostParticipants;
    } else {
      // CRITICAL FIX: Students see themselves AND ALL hosts/co-hosts
      const localParticipant = participants.find(p => {
        return (p.isLocal || p.user_id === currentUser?.id) && 
               !locallyRemovedParticipants.has(p.user_id) &&
               !p.Leave_Time && 
               p.Status !== 'offline' && 
               p.Status !== 'removed' && 
               p.Status !== 'left';
      });
      
      // CRITICAL FIX: Find ALL hosts and co-hosts (including original hosts)
      const hostsAndCoHosts = participants.filter(p => {
        if (locallyRemovedParticipants.has(p.user_id)) {
          console.log('🎥 VideoGrid: Student view - filtering out locally removed host/cohost:', p.user_id);
          return false;
        }
        
        if (p.Leave_Time) {
          console.log('🎥 VideoGrid: Student view - filtering out host/cohost with Leave_Time:', p.user_id);
          return false;
        }
        
        if (p.Status === 'offline' || p.Status === 'removed' || p.Status === 'left') {
          console.log('🎥 VideoGrid: Student view - filtering out host/cohost with status:', p.Status, p.user_id);
          return false;
        }
        
        // CRITICAL FIX: Include ALL hosts (original and co-hosts) - NOT local user
        return ((p.role === 'host' || p.isHost) || p.isCoHost) && 
               !p.isLocal && 
               p.user_id !== currentUser?.id;
      });
      
      console.log('🎥 VideoGrid: Student view - showing self + hosts/co-hosts:', {
        localParticipant: localParticipant ? { 
          id: localParticipant.user_id, 
          name: localParticipant.displayName, 
          isLocal: localParticipant.isLocal
        } : null,
        hostsAndCoHosts: hostsAndCoHosts.map(p => ({ 
          id: p.user_id, 
          name: p.displayName, 
          role: p.role,
          isHost: p.isHost,
          isCoHost: p.isCoHost
        })),
        totalVisible: (localParticipant ? 1 : 0) + hostsAndCoHosts.length
      });
      
      const result = [localParticipant, ...hostsAndCoHosts].filter(Boolean);
      console.log('🎥 VideoGrid: Student view final result:', result.length, 'participants');
      return result;
    }
  }, [participants, isCurrentUserHost, currentUser?.id, coHosts.length, locallyRemovedParticipants]);

  // Handle participant menu
  const handleParticipantMenu = useCallback((event, participant) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedParticipant(participant);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setAnchorEl(null);
    setSelectedParticipant(null);
  }, []);

  // Handle pin participant
  const handlePinParticipant = useCallback((participantId) => {
    setPinnedParticipants(prev => {
      const newSet = new Set(prev);
      if (newSet.has(participantId)) {
        newSet.delete(participantId);
      } else {
        if (newSet.size >= 4) {
          const firstPinned = newSet.values().next().value;
          newSet.delete(firstPinned);
        }
        newSet.add(participantId);
      }
      return newSet;
    });
  }, []);

  // FIXED: Enhanced screen share rendering
  const renderScreenShareView = useCallback(() => {
    const screenShareParticipant = participants.find(p => p.isScreenSharing) || 
                                   (screenSharer ? participants.find(p => p.user_id === screenSharer.user_id) : null);
    
    const activeScreenStream = screenShareStream || 
                              (screenShareParticipant ? getParticipantStreamEnhanced(screenShareParticipant, localStream, remoteStreams) : null);
    
    if (!activeScreenStream && !screenShareStream) {
      return null;
    }

    return (
      <Box sx={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        gap: 0,
        padding: 0,
        backgroundColor: '#000',
        position: 'relative'
      }}>
        <ScreenShareContainer>
          <VideoPlayer
            stream={activeScreenStream}
            participant={screenShareParticipant || { 
              displayName: screenSharer?.name || 'Screen Share', 
              isScreenSharing: true,
              user_id: screenSharer?.user_id || 'screen_share',
              isLocal: screenShareParticipant?.isLocal || screenSharer?.isLocal || false,
              isAudioEnabled: true,
              isVideoEnabled: true
            }}
            isLocal={screenShareParticipant?.isLocal || screenSharer?.isLocal || false}
            isMuted={false}
            isVideoEnabled={true}
            participantName={screenShareParticipant?.displayName || screenSharer?.name || 'Screen Share'}
            participantId={screenShareParticipant?.user_id || screenSharer?.user_id || 'screen_share'}
            quality="good"
            volume={1.0}
            showControls={true}
            compact={false}
            isScreenShare={true}
          />
          
          <Box
            sx={{
              position: 'absolute',
              top: theme.spacing(1),
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(33,150,243,0.9)',
              color: 'white',
              padding: theme.spacing(0.5, 1.5),
              borderRadius: theme.spacing(2), // FIXED: Better border radius
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing(0.5),
              fontSize: '0.8rem',
              zIndex: 50,
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
          >
            <Monitor sx={{ fontSize: 16 }} />
            <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
              {screenShareParticipant?.displayName || screenSharer?.name || 'Someone'} is sharing
            </Typography>
          </Box>
        </ScreenShareContainer>
      </Box>
    );
  }, [
    participants, screenShareStream, screenSharer, localStream, remoteStreams,
    handleParticipantMenu, activeSpeakers, pinnedParticipants, 
    handlePinParticipant, isCurrentUserHost, currentUser, theme
  ]);

  // Handle screen sharing
  if (isScreenSharing || screenShareStream || participants.some(p => p.isScreenSharing)) {
    return (
      <GridContainer sx={{ height: containerHeight, width: containerWidth, padding: 0 }}>
        {renderScreenShareView()}
      </GridContainer>
    );
  }

  return (
    <GridContainer sx={{ height: containerHeight, width: containerWidth, position: 'relative' }}>
      {/* Role-based participants grid */}
      <RoleBasedGrid isHost={isCurrentUserHost} participantCount={filteredParticipants.length}>
        {filteredParticipants.map((participant, index) => {
          const isStudentInStudentView = !isCurrentUserHost && participant.isLocal;
          const isHostInStudentView = !isCurrentUserHost && (participant.role === 'host' || participant.isHost) && !participant.isLocal;
          const isCoHostInStudentView = !isCurrentUserHost && participant.isCoHost && !participant.isLocal;
          
          let labelType = null;
          if (!isCurrentUserHost) {
             if (isHostInStudentView) labelType = 'host';
            else if (isCoHostInStudentView) labelType = 'cohost';
          }
          
          return (
            <ParticipantRenderer
              key={participant.user_id || participant.participant_id || index}
              participant={participant}
              localStream={localStream}
              remoteStreams={remoteStreams}
              isMinimized={false}
              onParticipantMenu={handleParticipantMenu}
              isSpeaking={activeSpeakers.has(participant.user_id)}
              isScreenShare={participant.isScreenSharing}
              isPinned={pinnedParticipants.has(participant.user_id)}
              onPinParticipant={handlePinParticipant}
              isHost={isCurrentUserHost}
              currentUserId={currentUser?.id}
              showLabel={!isCurrentUserHost}
              labelType={labelType}
              onRemoveParticipant={onRemoveParticipant}
              onPromoteToHost={onPromoteToHost}
              onRemoveCoHost={onRemoveCoHost}
              onParticipantRemoved={handleImmediateParticipantRemoval}
            />
          );
        })}
      </RoleBasedGrid>

      {/* FIXED: Enhanced empty state */}
      {filteredParticipants.length === 0 && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'grey.400',
            textAlign: 'center'
          }}
        >
          <Avatar sx={{ 
            width: 80, 
            height: 80, 
            mb: 2, 
            backgroundColor: '#333',
            fontSize: '2rem'
          }}>
            <Person sx={{ fontSize: 40 }} />
          </Avatar>
          <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
            {isCurrentUserHost ? 'No participants in meeting' : 'Waiting for participants...'}
          </Typography>
          <Typography variant="body2" sx={{ maxWidth: 400, lineHeight: 1.6 }}>
            {isCurrentUserHost 
              ? 'Students and co-hosts will appear here when they join the meeting'
              : 'You will see yourself and the hosts/co-hosts when connected'
            }
          </Typography>
        </Box>
      )}

      {/* Performance info for host with many participants */}
      {isCurrentUserHost && filteredParticipants.length > 20 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: theme.spacing(2),
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(255, 152, 0, 0.9)',
            color: 'white',
            padding: theme.spacing(0.75, 1.5),
            borderRadius: theme.spacing(1.5), // FIXED: Better border radius
            zIndex: 40,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            Managing {filteredParticipants.length} participant videos. Performance optimized.
          </Typography>
        </Box>
      )}
    </GridContainer>
  );
}

export default memo(VideoGrid);