// Enhanced RecordingsPage.jsx with integrated trash functionality and document options
import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  IconButton,
  Chip,
  Stack,
  Avatar,
  Divider,
  useTheme,
  alpha,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  LinearProgress,
  ListItemIcon,
  ListItemText,
  Badge,
  Tabs,
  Tab,
  Tooltip,
  FormControl,
  InputLabel,
  Select
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Download as DownloadIcon,
  Share as ShareIcon,
  MoreVert as MoreIcon,
  Search as SearchIcon,
  VideoLibrary as VideoIcon,
  AccessTime as TimeIcon,
  Person as PersonIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ErrorOutline as ErrorIcon,
  Upload as UploadIcon,
  Description as DocumentIcon,
  Visibility as ViewIcon,
  PictureAsPdf as PdfIcon,
  Assessment as SummaryIcon,
  Subtitles as TranscriptIcon,
  Close as CloseIcon,
  Timeline as TimelineIcon,
  Block as BlockIcon,
  SubtitlesOff as SubtitlesOffIcon,
  ClosedCaption as ClosedCaptionIcon,
  AutoFixHigh as GenerateIcon,
  GetApp as GetAppIcon,
  // NEW: Trash-related icons
  DeleteOutlined as TrashIcon,
  RestoreFromTrash as RestoreIcon,
  DeleteForever as PermanentDeleteIcon,
  CleaningServices as EmptyTrashIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import DashboardLayout from '../layouts/DashboardLayout';
import RecordingPlayer from '../components/recording/RecordingPlayer';
import { useRecording } from '../hooks/useRecording';
import { recordingsAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
const RecordingsPage = () => {
  const theme = useTheme();
  
  const { user: authUser } = useAuth();
  
  const getCurrentUser = () => {
    const sources = [
      authUser,
      JSON.parse(localStorage.getItem('user') || '{}'),
      {
        email: localStorage.getItem('user_email'),
        id: localStorage.getItem('user_id'),
        name: localStorage.getItem('user_name')
      }
    ];

    for (const source of sources) {
      if (source && (source.id || source.email)) {
        return {
          email: source.email || '',
          id: source.id || source.Id || '',
          name: source.name || source.Name || source.full_name || 'User'
        };
      }
    }

    return { email: '', id: '', name: 'User' };
  };

  const currentUser = getCurrentUser();
  
  const {
    recordings,
    trashedRecordings,
    trashStats,
    loading,
    error,
    pagination,
    fetchAllRecordings,
    fetchTrashedRecordings,
    moveToTrash,
    restoreFromTrash,
    permanentDelete,
    getTrashStats,
    emptyTrash,
    getRecordingStreamUrl,
    formatDuration,
    loadMoreRecordings,
    documentMethods
  } = useRecording();
  // const { notifications, fetchNotifications } = useNotifications();
  const { notifications, fetchRecordingNotifications } = useNotifications();
  // Get document methods from the hook
  const {
    downloadTranscript,
    downloadSummary,
    viewTranscript,
    viewSummary,
    getMindmapUrl
  } = documentMethods || recordingsAPI;

  // NEW: Tab state for Active/Trash views
  const [currentTab, setCurrentTab] = useState(0); // 0 = Active, 1 = Trash

  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState('all');
  const [selectedRecording, setSelectedRecording] = useState(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [selectedRecordingId, setSelectedRecordingId] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // NEW: Trash-related dialogs
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(false);
  const [restoreConfirmDialog, setRestoreConfirmDialog] = useState(false);
  const [permanentDeleteDialog, setPermanentDeleteDialog] = useState(false);
  const [emptyTrashDialog, setEmptyTrashDialog] = useState(false);

  // Enhanced host detection function (same as before)
  const isUserHostOfRecording = (recording) => {
    if (!recording || !currentUser.id) {
      return false;
    }

    const possibleHostFields = [
      'user_id', 'host_id', 'Host_ID', 'uploaded_by', 'owner_id', 'creator_id', 'author_id'
    ];

    const currentUserId = String(currentUser.id).trim();
    
    for (const field of possibleHostFields) {
      const recordingUserId = recording[field];
      
      if (recordingUserId != null) {
        const recordingUserIdStr = String(recordingUserId).trim();
        
        if (recordingUserIdStr === currentUserId) {
          return true;
        }
      }
    }

    if (currentUser.email) {
      const emailFields = ['email', 'user_email', 'host_email', 'uploaded_by_email'];
      const currentEmail = currentUser.email.toLowerCase().trim();
      
      for (const field of emailFields) {
        const recordingEmail = recording[field];
        if (recordingEmail && String(recordingEmail).toLowerCase().trim() === currentEmail) {
          return true;
        }
      }
    }

    return false;
  };

  // State to track if user has recordings they can move to trash (hosts with their own recordings)
  const [userCanAccessTrash, setUserCanAccessTrash] = useState(false);

  // Load recordings on component mount
  // In RecordingsPage.jsx - Replace the existing useEffect:
  useEffect(() => {
  const loadRecordings = async () => {
    try {
      setApiError(null);
      
      if (!currentUser.id) {
        setApiError('Missing user credentials. Please log in again.');
        setIsInitialLoading(false);
        return;
      }
      
      // Load active recordings
      const activeRecordingsResponse = await fetchAllRecordings({ 
        page: 1, 
        limit: 50,
        user_id: currentUser.id
      });
      
      // Only show trash tab if user is HOST of any recordings
      const isHostOfAnyRecordings = (activeRecordingsResponse?.videos || []).some(recording => 
        isUserHostOfRecording(recording)
      );
      
      setUserCanAccessTrash(isHostOfAnyRecordings);
      
      // Only load trash if user is host
      if (isHostOfAnyRecordings) {
        await Promise.all([
          fetchTrashedRecordings(),
          getTrashStats()
        ]);
      }
      
    } catch (err) {
      console.error('Failed to load recordings:', err);
      setApiError(err.message || 'Failed to load recordings');
    } finally {
      setIsInitialLoading(false);
    }
  };

  loadRecordings();
}, [currentUser.id, fetchAllRecordings, fetchTrashedRecordings, getTrashStats]);
useEffect(() => {
  console.log('🎥 Recordings Page: Fetching RECORDING notifications only');
  fetchRecordingNotifications(); // Only recording notifications
}, [fetchRecordingNotifications]);
  // Get current recordings list based on active tab and user permissions
  const getCurrentRecordings = () => {
    if (currentTab === 0) {
      return recordings;
    } else if (currentTab === 1 && userCanAccessTrash) {
      return trashedRecordings;
    }
    return []; // Return empty array if user doesn't have permissions for trash
  };

  // Transform recordings with better host detection and logging
  const transformRecordings = (recordingsList) => {
    return recordingsList.map(recording => {
      const isHost = isUserHostOfRecording(recording);
      
      return {
        id: recording._id || recording.id,
        meeting_name: recording.original_filename || recording.title || 'Meeting Recording',
        file_name: recording.original_filename || `recording_${recording._id}`,
        duration: recording.duration ? formatDuration(recording.duration) : '0:00',
        file_size: recording.file_size || 'Unknown',
        created_at: recording.timestamp || recording.created_at || new Date(),
        trashed_at: recording.trashed_at,
        host_name: `User ${recording.user_id || 'Unknown'}`,
        participants_count: 0,
        thumbnail: recording.image_url || `/api/recordings/${recording._id}/thumbnail`,
        
        // Document availability
        transcription_available: recording.transcription_available || !!recording.transcript_url,
        summary_available: recording.summary_available || !!recording.summary_url,
        mindmap_available: !!recording.image_url,
        subtitles_available: recording.subtitles_available || !!recording.subtitles_url || false,
        
        quality: 'HD',
        status: recording.is_trashed ? 'trashed' : 'processed',
        streamUrl: recording.streamUrl || getRecordingStreamUrl(recording._id, currentUser.email, currentUser.id),
        
        // Document URLs
        transcript_url: recording.transcript_url,
        summary_url: recording.summary_url,
        image_url: recording.image_url,
        subtitles_url: recording.subtitles_url,
        
        // MongoDB specific fields
        _id: recording._id,
        meeting_id: recording.meeting_id,
        user_id: recording.user_id,
        
        // Host check with logging
        isUserHost: isHost,
        is_trashed: recording.is_trashed || false
      };
    });
  };

  const displayRecordings = transformRecordings(getCurrentRecordings());

  const filteredRecordings = displayRecordings.filter(recording => {
    const matchesSearch = (recording.meeting_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (recording.host_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (recording.file_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterBy === 'all') return matchesSearch;
    if (filterBy === 'transcribed') return matchesSearch && recording.transcription_available;
    if (filterBy === 'recent') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return matchesSearch && new Date(recording.created_at) > weekAgo;
    }
    
    return matchesSearch;
  });

  // Tab change handler - Only allow trash tab for users who have recordings they can move to trash
  const handleTabChange = (event, newValue) => {
    // Don't allow switching to trash tab if user doesn't have recordings they can move to trash
    if (newValue === 1 && !userCanAccessTrash) {
      console.warn('User does not have recordings they can move to trash');
      return;
    }
    
    setCurrentTab(newValue);
    setSearchQuery(''); // Clear search when switching tabs
    setFilterBy('all'); // Reset filter when switching tabs
  };

  // Menu open with better state management
  const handleMenuOpen = (event, recordingId) => {
    setSelectedRecordingId(recordingId);
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedRecordingId(null);
  };

  // Play recording handler
  const handlePlay = (recording) => {
    if (recording.is_trashed) {
      alert('Cannot play trashed recordings. Please restore first.');
      return;
    }
    
    setSelectedRecording({
      id: recording.id,
      title: recording.meeting_name || recording.file_name,
      duration: recording.duration,
      videoUrl: recording.streamUrl || getRecordingStreamUrl(recording.id, currentUser.email, currentUser.id),
      thumbnailUrl: recording.thumbnail,
      quality: recording.quality || 'HD',
      fileSize: recording.file_size,
      recordedAt: recording.created_at,
      participants: [],
      transcription: [],
      chatMessages: [],
      currentUser: currentUser
    });
    setPlayerOpen(true);
  };

  // Move to trash handler - Update trash access based on remaining hosted recordings
  const handleMoveToTrash = async (recording) => {
    try {
      await moveToTrash(recording.id, {
        user_id: currentUser.id,
        email: currentUser.email
      });
      
      // Check if user still has recordings they can move to trash after this deletion
      const remainingRecordings = recordings.filter(r => r.id !== recording.id);
      const stillHasRecordingsToTrash = remainingRecordings.some(r => isUserHostOfRecording(r));
      setUserCanAccessTrash(stillHasRecordingsToTrash);
      
      // If user no longer has recordings to trash and is on trash tab, switch to active tab
      if (!stillHasRecordingsToTrash && currentTab === 1) {
        setCurrentTab(0);
      }
      
      alert('Recording moved to trash successfully!');
      
    } catch (err) {
      console.error('Move to trash failed:', err);
      
      if (err.response?.status === 403) {
        setApiError('Permission denied: Only the meeting host can delete this recording');
      } else {
        setApiError('Failed to move recording to trash: ' + err.message);
      }
    }
    handleMenuClose();
  };

  // Restore from trash handler - User should still have trash access after restoring their own recording
  const handleRestoreFromTrash = async (recording) => {
    try {
      await restoreFromTrash(recording.id, {
        user_id: currentUser.id,
        email: currentUser.email
      });
      
      // After restoring, user should still have trash access since they just restored their own recording
      setUserCanAccessTrash(true);
      
      alert('Recording restored successfully!');
      
    } catch (err) {
      console.error('Restore failed:', err);
      setApiError('Failed to restore recording: ' + err.message);
    }
    handleMenuClose();
  };

  // NEW: Permanent delete handler
  const handlePermanentDelete = async (recording) => {
    try {
      await permanentDelete(recording.id, {
        user_id: currentUser.id,
        email: currentUser.email
      });
      
      alert('Recording permanently deleted!');
      
    } catch (err) {
      console.error('Permanent delete failed:', err);
      setApiError('Failed to permanently delete recording: ' + err.message);
    }
    handleMenuClose();
  };

  // NEW: Empty trash handler
  const handleEmptyTrash = async () => {
    try {
      await emptyTrash();
      alert('Trash emptied successfully!');
      setEmptyTrashDialog(false);
    } catch (err) {
      console.error('Empty trash failed:', err);
      setApiError('Failed to empty trash: ' + err.message);
    }
  };

  // NEW: View transcript handler
  const handleViewTranscript = (recording) => {
    if (recording.is_trashed) {
      alert('Cannot view transcript of trashed recordings. Please restore first.');
      return;
    }
    
    if (!recording.transcription_available) {
      alert('Transcript not available for this recording.');
      return;
    }
    
    try {
      const transcriptUrl = viewTranscript(
        recording.id, 
        currentUser.email, 
        currentUser.id
      );
      
      if (transcriptUrl) {
        window.open(transcriptUrl, '_blank');
      } else {
        alert('Transcript URL not available.');
      }
    } catch (err) {
      console.error('Failed to open transcript:', err);
      alert('Failed to open transcript: ' + err.message);
    }
  };

  // NEW: Download transcript handler
  const handleDownloadTranscript = async (recording) => {
    if (recording.is_trashed) {
      alert('Cannot download transcript of trashed recordings. Please restore first.');
      return;
    }
    
    if (!recording.transcription_available) {
      alert('Transcript not available for this recording.');
      return;
    }
    
    try {
      await downloadTranscript(
        recording.id,
        currentUser.email,
        currentUser.id,
        `transcript_${recording.meeting_name || recording.id}.pdf`
      );
      
      alert('Transcript download started!');
    } catch (err) {
      console.error('Failed to download transcript:', err);
      alert('Failed to download transcript: ' + err.message);
    }
  };

  // NEW: View summary handler
  const handleViewSummary = (recording) => {
    if (recording.is_trashed) {
      alert('Cannot view summary of trashed recordings. Please restore first.');
      return;
    }
    
    if (!recording.summary_available) {
      alert('Summary not available for this recording.');
      return;
    }
    
    try {
      const summaryUrl = viewSummary(
        recording.id, 
        currentUser.email, 
        currentUser.id
      );
      
      if (summaryUrl) {
        window.open(summaryUrl, '_blank');
      } else {
        alert('Summary URL not available.');
      }
    } catch (err) {
      console.error('Failed to open summary:', err);
      alert('Failed to open summary: ' + err.message);
    }
  };

  // NEW: Download summary handler
  const handleDownloadSummary = async (recording) => {
    if (recording.is_trashed) {
      alert('Cannot download summary of trashed recordings. Please restore first.');
      return;
    }
    
    if (!recording.summary_available) {
      alert('Summary not available for this recording.');
      return;
    }
    
    try {
      await downloadSummary(
        recording.id,
        currentUser.email,
        currentUser.id,
        `summary_${recording.meeting_name || recording.id}.pdf`
      );
      
      alert('Summary download started!');
    } catch (err) {
      console.error('Failed to download summary:', err);
      alert('Failed to download summary: ' + err.message);
    }
  };

  // Other existing handlers (download, share, etc.) remain the same...
  const handleDownload = (recording) => {
    if (recording.is_trashed) {
      alert('Cannot download trashed recordings. Please restore first.');
      return;
    }
    
    try {
      const streamUrl = recording.streamUrl || getRecordingStreamUrl(recording.id);
      const link = document.createElement('a');
      link.href = streamUrl;
      link.download = recording.file_name || `recording-${recording.id}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setApiError('Failed to download recording');
    }
    
    handleMenuClose();
  };

  // Show loading state only during initial load
  if (isInitialLoading || (loading && displayRecordings.length === 0)) {
    return (
      <DashboardLayout>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <Stack alignItems="center" spacing={2}>
            <CircularProgress size={60} />
            <Typography variant="h6">Loading recordings...</Typography>
          </Stack>
        </Box>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Box
        sx={{
          flexGrow: 1,
          background: `linear-gradient(135deg, ${alpha(theme.palette.background.default, 0.9)} 0%, ${alpha(theme.palette.primary.main, 0.02)} 100%)`,
          minHeight: '100vh',
          pt: 2
        }}
      >
        <Container maxWidth="xl" sx={{ py: 3 }}>
          {/* Header */}
          <Box mb={4}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <VideoIcon sx={{ fontSize: 32, color: theme.palette.primary.main }} />
                <Typography variant="h4" fontWeight={700} color="text.primary">
                  Meeting Recordings
                </Typography>
              </Stack>
            </Stack>

            {/* Tabs - Only show trash tab for hosts who have recordings they can move to trash */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <Tabs value={currentTab} onChange={handleTabChange}>
                <Tab 
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <VideoIcon />
                      Active Recordings ({recordings.length})
                    </Box>
                  } 
                />
                
                {/* Only show trash tab if user has recordings they can move to trash */}
                {userCanAccessTrash && (
                  <Tab 
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Badge badgeContent={trashStats.total_count} color="error">
                          <TrashIcon />
                        </Badge>
                        Trash ({trashStats.total_count})
                      </Box>
                    } 
                  />
                )}
              </Tabs>
            </Box>

            {/* Show API Error if any */}
            {(error || apiError) && (
              <Alert 
                severity="error" 
                sx={{ mb: 2 }}
                onClose={() => setApiError(null)}
              >
                <ErrorIcon sx={{ mr: 1 }} />
                {error || apiError}
                <Button 
                  size="small" 
                  onClick={() => window.location.reload()}
                  sx={{ ml: 2 }}
                >
                  Retry
                </Button>
              </Alert>
            )}

            {/* Trash statistics and actions - Only show if user has host permissions */}
            {userCanAccessTrash && currentTab === 1 && trashStats.total_count > 0 && (
              <Alert 
                severity="info" 
                sx={{ mb: 2 }}
                action={
                  <Stack direction="row" spacing={1}>
                    <Button 
                      size="small" 
                      startIcon={<EmptyTrashIcon />}
                      onClick={() => setEmptyTrashDialog(true)}
                      color="error"
                      variant="outlined"
                    >
                      Empty Trash
                    </Button>
                  </Stack>
                }
              >
                <InfoIcon sx={{ mr: 1 }} />
                {trashStats.total_count} recordings in trash • 
                Total size: {(trashStats.total_size / (1024 * 1024)).toFixed(2)} MB •
                Recordings will be permanently deleted after 15 days
              </Alert>
            )}

            {/* Search and Filters */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
              <TextField
                placeholder={`Search ${currentTab === 0 ? 'active' : 'trashed'} recordings...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ minWidth: 300 }}
              />
              
              <Stack direction="row" spacing={1}>
                {['all', 'recent', 'transcribed'].map((filter) => (
                  <Chip
                    key={filter}
                    label={filter.charAt(0).toUpperCase() + filter.slice(1)}
                    variant={filterBy === filter ? "filled" : "outlined"}
                    color={filterBy === filter ? "primary" : "default"}
                    onClick={() => setFilterBy(filter)}
                    sx={{ textTransform: 'capitalize' }}
                  />
                ))}
              </Stack>
              
              <Typography variant="body2" color="text.secondary">
                {filteredRecordings.length} recording(s) found
              </Typography>
            </Stack>
          </Box>

          {/* Recordings Grid */}
          <Grid container spacing={3}>
            {filteredRecordings.length === 0 ? (
              <Grid item xs={12}>
                <Card sx={{ textAlign: 'center', py: 8 }}>
                  <CardContent>
                    {currentTab === 0 ? (
                      <>
                        <VideoIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary" mb={1}>
                          No active recordings found
                        </Typography>
                        <Typography variant="body2" color="text.disabled" mb={3}>
                          {searchQuery || filterBy !== 'all' 
                            ? 'Try adjusting your search criteria' 
                            : 'No recordings available in your database'}
                        </Typography>
                      </>
                    ) : userCanAccessTrash ? (
                      <>
                        <TrashIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary" mb={1}>
                          Trash is empty
                        </Typography>
                        <Typography variant="body2" color="text.disabled" mb={3}>
                          Deleted recordings will appear here
                        </Typography>
                      </>
                    ) : (
                      <>
                        <BlockIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary" mb={1}>
                          No Trash Access
                        </Typography>
                        <Typography variant="body2" color="text.disabled" mb={3}>
                          You need to be the host of recordings to access trash functionality
                        </Typography>
                      </>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ) : (
              filteredRecordings.map((recording) => (
                <Grid item xs={12} md={6} lg={4} key={recording.id}>
                  <Card
                    sx={{
                      height: '100%',
                      transition: 'all 0.3s ease',
                      cursor: recording.is_trashed ? 'default' : 'pointer',
                      opacity: recording.is_trashed ? 0.7 : 1,
                      '&:hover': {
                        transform: recording.is_trashed ? 'none' : 'translateY(-4px)',
                        boxShadow: recording.is_trashed ? theme.shadows[1] : theme.shadows[8],
                      },
                      border: recording.is_trashed 
                        ? `1px solid ${theme.palette.error.light}` 
                        : `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                      borderRadius: 2,
                    }}
                  >
                    {/* Thumbnail */}
                    <Box
                      sx={{
                        height: 180,
                        background: recording.is_trashed 
                          ? `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.1)} 0%, ${alpha(theme.palette.error.main, 0.2)} 100%)`
                          : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        borderRadius: '8px 8px 0 0'
                      }}
                    >
                      <IconButton
                        onClick={() => handlePlay(recording)}
                        disabled={recording.is_trashed}
                        sx={{
                          bgcolor: recording.is_trashed 
                            ? alpha(theme.palette.error.main, 0.5)
                            : alpha(theme.palette.primary.main, 0.9),
                          color: 'white',
                          width: 64,
                          height: 64,
                          '&:hover': {
                            bgcolor: recording.is_trashed 
                              ? alpha(theme.palette.error.main, 0.5)
                              : theme.palette.primary.dark,
                            transform: recording.is_trashed ? 'none' : 'scale(1.1)',
                          },
                          '&:disabled': {
                            bgcolor: alpha(theme.palette.error.main, 0.3),
                            color: 'rgba(255,255,255,0.5)'
                          }
                        }}
                      >
                        <PlayIcon sx={{ fontSize: 32 }} />
                      </IconButton>

                      {/* Duration Badge */}
                      <Chip
                        label={recording.duration || '0:00'}
                        size="small"
                        sx={{
                          position: 'absolute',
                          bottom: 8,
                          right: 8,
                          bgcolor: alpha(theme.palette.background.paper, 0.9),
                          backdropFilter: 'blur(4px)',
                        }}
                      />

                      {/* Status Badge */}
                      <Chip
                        label={recording.is_trashed ? 'TRASHED' : recording.status}
                        size="small"
                        color={recording.is_trashed ? 'error' : recording.status === 'processed' ? 'success' : 'warning'}
                        sx={{
                          position: 'absolute',
                          top: 8,
                          left: 8,
                        }}
                      />

                      {/* Host badge */}
                      {recording.isUserHost && (
                        <Chip
                          label="You're the Host"
                          size="small"
                          color="primary"
                          sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            fontSize: '0.7rem'
                          }}
                        />
                      )}

                      {/* NEW: Trash date overlay */}
                      {recording.is_trashed && recording.trashed_at && (
                        <Box
                          sx={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: 'linear-gradient(transparent, rgba(244,67,54,0.8))',
                            color: 'white',
                            p: 1,
                            textAlign: 'center'
                          }}
                        >
                          <Typography variant="caption">
                            Deleted: {format(new Date(recording.trashed_at), 'MMM dd, yyyy')}
                          </Typography>
                        </Box>
                      )}
                    </Box>

                    <CardContent sx={{ flexGrow: 1 }}>
                      <Stack spacing={2}>
                        {/* Title */}
                        <Typography 
                          variant="h6" 
                          fontWeight={600} 
                          noWrap
                          sx={{ 
                            textDecoration: recording.is_trashed ? 'line-through' : 'none',
                            color: recording.is_trashed ? 'text.secondary' : 'text.primary'
                          }}
                        >
                          {recording.meeting_name || recording.file_name}
                        </Typography>

                        {/* Host Info */}
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                            {(recording.host_name || 'U').charAt(0)}
                          </Avatar>
                          <Typography variant="body2" color="text.secondary">
                            {recording.host_name || `User ${recording.user_id}`}
                            {recording.isUserHost && (
                              <Typography component="span" variant="caption" color="primary" sx={{ ml: 1 }}>
                                (You)
                              </Typography>
                            )}
                          </Typography>
                        </Stack>

                        {/* Details */}
                        <Stack spacing={1}>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <TimeIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              {recording.created_at 
                                ? format(new Date(recording.created_at), 'MMM dd, yyyy • HH:mm')
                                : 'Unknown date'
                              }
                            </Typography>
                          </Stack>
                          
                          {recording.meeting_id && (
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <PersonIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                Meeting: {recording.meeting_id}
                              </Typography>
                            </Stack>
                          )}
                        </Stack>

                        {/* Tags */}
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          <Chip 
                            label={recording.file_size || 'Unknown'} 
                            size="small" 
                            variant="outlined" 
                          />
                          
                          {recording.subtitles_available ? (
                            <Chip 
                              label="Subtitles" 
                              size="small" 
                              color="success" 
                              variant="outlined"
                              icon={<ClosedCaptionIcon />}
                            />
                          ) : (
                            <Chip 
                              label="No Subtitles" 
                              size="small" 
                              color="default" 
                              variant="outlined"
                              icon={<SubtitlesOffIcon />}
                            />
                          )}
                          
                          {recording.transcription_available && (
                            <Chip 
                              label="Transcript" 
                              size="small" 
                              color="success" 
                              variant="outlined"
                              icon={<TranscriptIcon />}
                            />
                          )}
                          {recording.summary_available && (
                            <Chip 
                              label="Summary" 
                              size="small" 
                              color="info" 
                              variant="outlined"
                              icon={<SummaryIcon />}
                            />
                          )}
                          {recording.mindmap_available && (
                            <Chip 
                              label="Mind Map" 
                              size="small" 
                              color="secondary" 
                              variant="outlined"
                              icon={<TimelineIcon />}
                            />
                          )}
                          {recording.quality && (
                            <Chip 
                              label={recording.quality} 
                              size="small" 
                              color="primary" 
                              variant="outlined" 
                            />
                          )}
                        </Stack>
                      </Stack>
                    </CardContent>

                    <Divider />

                    <CardActions sx={{ justifyContent: 'space-between', px: 2 }}>
                      {/* Different actions based on trash status */}
                      {recording.is_trashed ? (
                        // Trash actions
                        <Stack direction="row" spacing={1}>
                          <Tooltip title="Restore Recording">
                            <Button
                              size="small"
                              startIcon={<RestoreIcon />}
                              onClick={() => {
                                setSelectedRecording(recording);
                                setRestoreConfirmDialog(true);
                              }}
                              disabled={!recording.isUserHost}
                              sx={{ textTransform: 'none' }}
                            >
                              Restore
                            </Button>
                          </Tooltip>
                          
                          <Tooltip title="Delete Permanently">
                            <Button
                              size="small"
                              startIcon={<PermanentDeleteIcon />}
                              onClick={() => {
                                setSelectedRecording(recording);
                                setPermanentDeleteDialog(true);
                              }}
                              disabled={!recording.isUserHost}
                              color="error"
                              sx={{ textTransform: 'none' }}
                            >
                              Delete Forever
                            </Button>
                          </Tooltip>
                        </Stack>
                      ) : (
                        // Active actions - Enhanced with document options
                        <Stack direction="row" spacing={1}>
                          <Tooltip title="Play Recording">
                            <Button
                              size="small"
                              startIcon={<PlayIcon />}
                              onClick={() => handlePlay(recording)}
                              sx={{ textTransform: 'none' }}
                            >
                              Play
                            </Button>
                          </Tooltip>
                          
                          {recording.transcription_available && (
                            <Tooltip title="View Transcript">
                              <Button
                                size="small"
                                startIcon={<ViewIcon />}
                                onClick={() => handleViewTranscript(recording)}
                                sx={{ textTransform: 'none' }}
                              >
                                Transcript
                              </Button>
                            </Tooltip>
                          )}
                        </Stack>
                      )}

                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, recording.id)}
                      >
                        <MoreIcon />
                      </IconButton>
                    </CardActions>
                  </Card>
                </Grid>
              ))
            )}
          </Grid>

          {/* Loading indicator for pagination */}
          {loading && displayRecordings.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <CircularProgress />
            </Box>
          )}
        </Container>

        {/* Enhanced Context Menu with document options */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
        >
          {(() => {
            const recording = filteredRecordings.find(r => r.id === selectedRecordingId);
            
            if (!recording) return null;

            if (recording.is_trashed) {
              // Trash menu options
              return [
                <MenuItem key="restore" onClick={() => {
                  setSelectedRecording(recording);
                  setRestoreConfirmDialog(true);
                  handleMenuClose();
                }} disabled={!recording.isUserHost}>
                  <ListItemIcon><RestoreIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Restore Recording</ListItemText>
                </MenuItem>,
                
                <MenuItem key="permanent-delete" onClick={() => {
                  setSelectedRecording(recording);
                  setPermanentDeleteDialog(true);
                  handleMenuClose();
                }} disabled={!recording.isUserHost} sx={{ color: 'error.main' }}>
                  <ListItemIcon><PermanentDeleteIcon fontSize="small" color="error" /></ListItemIcon>
                  <ListItemText>Delete Permanently</ListItemText>
                </MenuItem>
              ];
            } else {
              // Active recording menu options with enhanced document options
              return [
                <MenuItem key="play" onClick={() => {
                  handlePlay(recording);
                  handleMenuClose();
                }}>
                  <ListItemIcon><PlayIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Play Video</ListItemText>
                </MenuItem>,
                
                <MenuItem key="download-video" onClick={() => {
                  handleDownload(recording);
                  handleMenuClose();
                }}>
                  <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Download Video</ListItemText>
                </MenuItem>,
                
                <Divider key="divider1" />,
                
                // NEW: Document options section
                ...(recording.transcription_available ? [
                  <MenuItem key="view-transcript" onClick={() => {
                    handleViewTranscript(recording);
                    handleMenuClose();
                  }}>
                    <ListItemIcon><ViewIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>View Transcript (PDF)</ListItemText>
                  </MenuItem>,
                  
                  <MenuItem key="download-transcript" onClick={() => {
                    handleDownloadTranscript(recording);
                    handleMenuClose();
                  }}>
                    <ListItemIcon><PdfIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Download Transcript</ListItemText>
                  </MenuItem>
                ] : []),
                
                ...(recording.summary_available ? [
                  <MenuItem key="view-summary" onClick={() => {
                    handleViewSummary(recording);
                    handleMenuClose();
                  }}>
                    <ListItemIcon><ViewIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>View Summary (PDF)</ListItemText>
                  </MenuItem>,
                  
                  <MenuItem key="download-summary" onClick={() => {
                    handleDownloadSummary(recording);
                    handleMenuClose();
                  }}>
                    <ListItemIcon><SummaryIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Download Summary</ListItemText>
                  </MenuItem>
                ] : []),
                
                ...(recording.mindmap_available ? [
                  <MenuItem key="view-mindmap" onClick={() => {
                    const mindmapUrl = getMindmapUrl(recording.id, currentUser.email, currentUser.id);
                    window.open(mindmapUrl, '_blank');
                    handleMenuClose();
                  }}>
                    <ListItemIcon><TimelineIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>View Mind Map</ListItemText>
                  </MenuItem>
                ] : []),
                
                <Divider key="divider2" />,
                
                // Host-only delete option (now moves to trash)
                ...(recording.isUserHost ? [
                  <MenuItem key="delete" onClick={() => {
                    setSelectedRecording(recording);
                    setDeleteConfirmDialog(true);
                    handleMenuClose();
                  }} sx={{ color: 'error.main' }}>
                    <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
                    <ListItemText>Move to Trash</ListItemText>
                  </MenuItem>
                ] : [])
              ].flat().filter(Boolean);
            }
          })()}
        </Menu>

        {/* NEW: Confirmation Dialogs */}
        
        {/* Move to Trash Confirmation */}
        <Dialog open={deleteConfirmDialog} onClose={() => setDeleteConfirmDialog(false)}>
          <DialogTitle>Move Recording to Trash?</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to move "{selectedRecording?.meeting_name || selectedRecording?.file_name}" to trash? 
              You can restore it later if needed.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirmDialog(false)}>Cancel</Button>
            <Button 
              color="error" 
              variant="contained" 
              onClick={() => {
                if (selectedRecording) handleMoveToTrash(selectedRecording);
                setDeleteConfirmDialog(false);
              }}
            >
              Move to Trash
            </Button>
          </DialogActions>
        </Dialog>

        {/* Restore Confirmation */}
        <Dialog open={restoreConfirmDialog} onClose={() => setRestoreConfirmDialog(false)}>
          <DialogTitle>Restore Recording?</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to restore "{selectedRecording?.meeting_name || selectedRecording?.file_name}"? 
              It will be moved back to your active recordings.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRestoreConfirmDialog(false)}>Cancel</Button>
            <Button 
              color="success" 
              variant="contained" 
              onClick={() => {
                if (selectedRecording) handleRestoreFromTrash(selectedRecording);
                setRestoreConfirmDialog(false);
              }}
            >
              Restore
            </Button>
          </DialogActions>
        </Dialog>

        {/* Permanent Delete Confirmation */}
        <Dialog open={permanentDeleteDialog} onClose={() => setPermanentDeleteDialog(false)}>
          <DialogTitle sx={{ color: 'error.main' }}>Permanently Delete Recording?</DialogTitle>
          <DialogContent>
            <Alert severity="error" sx={{ mb: 2 }}>
              This action cannot be undone! The recording and all associated files will be permanently deleted.
            </Alert>
            <Typography>
              Are you sure you want to permanently delete "{selectedRecording?.meeting_name || selectedRecording?.file_name}"?
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPermanentDeleteDialog(false)}>Cancel</Button>
            <Button 
              color="error" 
              variant="contained" 
              onClick={() => {
                if (selectedRecording) handlePermanentDelete(selectedRecording);
                setPermanentDeleteDialog(false);
              }}
            >
              Delete Forever
            </Button>
          </DialogActions>
        </Dialog>

        {/* Empty Trash Confirmation */}
        <Dialog open={emptyTrashDialog} onClose={() => setEmptyTrashDialog(false)}>
          <DialogTitle sx={{ color: 'error.main' }}>Empty Trash?</DialogTitle>
          <DialogContent>
            <Alert severity="error" sx={{ mb: 2 }}>
              This will permanently delete ALL recordings in trash. This action cannot be undone!
            </Alert>
            <Typography>
              Are you sure you want to permanently delete all {trashStats.total_count} recordings in trash?
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEmptyTrashDialog(false)}>Cancel</Button>
            <Button 
              color="error" 
              variant="contained" 
              onClick={handleEmptyTrash}
            >
              Empty Trash
            </Button>
          </DialogActions>
        </Dialog>

        {/* Recording Player Dialog */}
        <Dialog
          open={playerOpen}
          onClose={() => setPlayerOpen(false)}
          maxWidth="lg"
          fullWidth
          sx={{
            '& .MuiDialog-paper': {
              minHeight: '80vh',
              maxHeight: '90vh'
            }
          }}
        >
          <DialogTitle>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="h6">
                {selectedRecording?.title || 'Recording Player'}
              </Typography>
              <IconButton onClick={() => setPlayerOpen(false)}>
                <CloseIcon />
              </IconButton>
            </Stack>
          </DialogTitle>
          <DialogContent sx={{ p: 0 }}>
            {selectedRecording && (
              <RecordingPlayer recordingData={selectedRecording} />
            )}
          </DialogContent>
        </Dialog>
      </Box>
    </DashboardLayout>
  );
};

export default RecordingsPage;