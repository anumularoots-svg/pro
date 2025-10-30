// AttendancePopup.jsx - Enhanced with Face Authentication Warnings
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  Alert,
  LinearProgress,
  Card,
  CardContent,
  IconButton,
  Slide,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  Warning,
  Error as ErrorIcon,
  CheckCircle,
  Info,
  Close,
  Coffee,
  Security,
  PersonOff,
  Block,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

const StyledDialog = styled(Dialog)(({ theme }) => ({
  '& .MuiDialog-paper': {
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    color: 'white',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: theme.spacing(2),
    minWidth: 400,
    maxWidth: 600,
    backdropFilter: 'blur(20px)',
  }
}));

const IconContainer = styled(Box)(({ theme, popuptype }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 64,
  height: 64,
  borderRadius: '50%',
  margin: theme.spacing(0, 'auto', 2),
  backgroundColor: 
    popuptype === 'error' ? 'rgba(244, 67, 54, 0.2)' :
    popuptype === 'warning' ? 'rgba(255, 152, 0, 0.2)' :
    popuptype === 'success' ? 'rgba(76, 175, 80, 0.2)' :
    'rgba(33, 150, 243, 0.2)',
  border: `2px solid ${
    popuptype === 'error' ? '#f44336' :
    popuptype === 'warning' ? '#ff9800' :
    popuptype === 'success' ? '#4caf50' :
    '#2196f3'
  }`
}));

const MetricCard = styled(Card)(({ theme }) => ({
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  margin: theme.spacing(0.5, 0),
}));

const AttendancePopup = ({
  open,
  message,
  type = 'warning',
  onClose,
  attendanceData = {},
  onTakeBreak,
  currentViolations = [],
  continuousTime = 0,
  autoHide = true,
  hideCloseButton = false,
  faceAuthStatus = 'verified',
  unauthorizedCount = 0,
}) => {
  const getIcon = () => {
    // Check for face authentication issues first
    if (faceAuthStatus === 'blocked' || (type === 'error' && message.includes('Unauthorized'))) {
      return <Block sx={{ fontSize: 32, color: '#9c27b0' }} />;
    }
    if (faceAuthStatus === 'unauthorized' || (type === 'warning' && message.includes('Unauthorized'))) {
      return <PersonOff sx={{ fontSize: 32, color: '#ff9800' }} />;
    }

    // Default icons based on type
    switch (type) {
      case 'error':
        return <ErrorIcon sx={{ fontSize: 32, color: '#f44336' }} />;
      case 'warning':
        return <Warning sx={{ fontSize: 32, color: '#ff9800' }} />;
      case 'success':
        return <CheckCircle sx={{ fontSize: 32, color: '#4caf50' }} />;
      case 'info':
      default:
        return <Info sx={{ fontSize: 32, color: '#2196f3' }} />;
    }
  };

  const getTitle = () => {
    // Check for face authentication issues
    if (faceAuthStatus === 'blocked' || (type === 'error' && message.includes('Unauthorized'))) {
      return '🚫 Session Blocked';
    }
    if (faceAuthStatus === 'unauthorized' || (type === 'warning' && message.includes('Unauthorized'))) {
      return '⚠️ Face Authentication Warning';
    }

    // Default titles based on type
    switch (type) {
      case 'error':
        return 'Attendance Alert';
      case 'warning':
        return 'Warning Issued';
      case 'success':
        return 'Attendance Update';
      case 'info':
      default:
        return 'Information';
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getActionButtons = () => {
    const buttons = [];

    // No action buttons for blocked state
    if (faceAuthStatus === 'blocked' || (type === 'error' && message.includes('Unauthorized') && message.includes('blocked'))) {
      buttons.push(
        <Button
          key="close-blocked"
          variant="contained"
          onClick={onClose}
          sx={{
            backgroundColor: '#9c27b0',
            '&:hover': {
              backgroundColor: '#7b1fa2'
            }
          }}
        >
          Understood
        </Button>
      );
      return buttons;
    }

    if (type === 'warning' && !attendanceData.breakUsed && onTakeBreak && faceAuthStatus === 'verified') {
      buttons.push(
        <Button
          key="break"
          variant="outlined"
          startIcon={<Coffee />}
          onClick={() => {
            onTakeBreak();
            onClose();
          }}
          sx={{
            color: '#2196f3',
            borderColor: '#2196f3',
            '&:hover': {
              backgroundColor: 'rgba(33, 150, 243, 0.1)',
              borderColor: '#1976d2'
            }
          }}
        >
          Take 30s Break
        </Button>
      );
    }

    if (!hideCloseButton) {
      buttons.push(
        <Button
          key="close"
          variant="contained"
          onClick={onClose}
          sx={{
            backgroundColor: 
              type === 'error' ? '#f44336' :
              type === 'warning' ? '#ff9800' :
              type === 'success' ? '#4caf50' :
              '#2196f3',
            '&:hover': {
              backgroundColor: 
                type === 'error' ? '#d32f2f' :
                type === 'warning' ? '#f57c00' :
                type === 'success' ? '#388e3c' :
                '#1976d2'
            }
          }}
        >
          {type === 'error' ? 'Understood' : 'OK'}
        </Button>
      );
    }

    return buttons;
  };

  const renderFaceAuthAlert = () => {
    if (faceAuthStatus === 'verified') return null;

    const isBlocked = faceAuthStatus === 'blocked';
    const severity = isBlocked ? 'error' : 'warning';
    const borderColor = isBlocked ? '#9c27b0' : '#ff9800';
    const bgColor = isBlocked ? 'rgba(156, 39, 176, 0.1)' : 'rgba(255, 152, 0, 0.1)';

    return (
      <Alert 
        severity={severity}
        icon={isBlocked ? <Block /> : <PersonOff />}
        sx={{ 
          mb: 2,
          backgroundColor: bgColor,
          border: `1px solid ${borderColor}`,
          color: 'white',
          '& .MuiAlert-icon': { color: borderColor }
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          {isBlocked ? '🚫 UNAUTHORIZED USER - BLOCKED' : '⚠️ UNAUTHORIZED USER DETECTED'}
        </Typography>
        <Typography variant="body2">
          {isBlocked 
            ? `You have been detected as an unauthorized user ${unauthorizedCount} times. You are now blocked from this meeting and will be removed.`
            : `Warning ${unauthorizedCount}/3: Face authentication failed. Ensure you are the registered user. After 3 failed attempts, you will be blocked from the meeting.`
          }
        </Typography>
        {!isBlocked && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#ffcc02' }}>
            💡 Tip: Ensure proper lighting and face the camera directly
          </Typography>
        )}
      </Alert>
    );
  };

  const renderAttendanceStats = () => {
    if (type === 'error' || !attendanceData.attendancePercentage || faceAuthStatus === 'blocked') {
      return null;
    }

    return (
      <MetricCard>
        <CardContent sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
            Current Attendance Status
          </Typography>
          
          {(attendanceData.popupCount || 0) >= (attendanceData.maxPopups || 4) * 0.75 && (
            <Alert severity="warning" sx={{ 
              mt: 1,
              backgroundColor: 'rgba(255, 152, 0, 0.1)',
              border: '1px solid rgba(255, 152, 0, 0.3)',
              '& .MuiAlert-icon': { color: '#ff9800' }
            }}>
              <Typography variant="caption">
                Approaching warning limit. Consider taking a break or improving position.
              </Typography>
            </Alert>
          )}
        </CardContent>
      </MetricCard>
    );
  };

  const renderSessionTips = () => {
    const isAuthIssue = faceAuthStatus !== 'verified';

    return (
      <MetricCard>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Security sx={{ fontSize: 18, color: isAuthIssue ? '#ff9800' : '#2196f3' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {isAuthIssue ? 'Face Authentication Tips' : 'AI Monitoring Guidelines'}
            </Typography>
          </Box>
          
          {isAuthIssue ? (
            <List dense>
              <ListItem sx={{ px: 0, py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <CheckCircle sx={{ fontSize: 14, color: '#ff9800' }} />
                </ListItemIcon>
                <ListItemText 
                  primary="Ensure you are the registered user"
                  sx={{ '& .MuiListItemText-primary': { fontSize: '0.7rem', fontWeight: 600 } }}
                />
              </ListItem>
              <ListItem sx={{ px: 0, py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <CheckCircle sx={{ fontSize: 14, color: '#ff9800' }} />
                </ListItemIcon>
                <ListItemText 
                  primary="Face the camera directly with good lighting"
                  sx={{ '& .MuiListItemText-primary': { fontSize: '0.7rem' } }}
                />
              </ListItem>
              <ListItem sx={{ px: 0, py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <CheckCircle sx={{ fontSize: 14, color: '#ff9800' }} />
                </ListItemIcon>
                <ListItemText 
                  primary="Remove any face coverings or obstructions"
                  sx={{ '& .MuiListItemText-primary': { fontSize: '0.7rem' } }}
                />
              </ListItem>
              <ListItem sx={{ px: 0, py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <ErrorIcon sx={{ fontSize: 14, color: '#f44336' }} />
                </ListItemIcon>
                <ListItemText 
                  primary="3 failed attempts will block you from the meeting"
                  sx={{ '& .MuiListItemText-primary': { fontSize: '0.7rem', color: '#f44336', fontWeight: 600 } }}
                />
              </ListItem>
            </List>
          ) : (
            <List dense>
              <ListItem sx={{ px: 0, py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <CheckCircle sx={{ fontSize: 14, color: '#4caf50' }} />
                </ListItemIcon>
                <ListItemText 
                  primary="Keep face visible and centered"
                  sx={{ '& .MuiListItemText-primary': { fontSize: '0.7rem' } }}
                />
              </ListItem>
              <ListItem sx={{ px: 0, py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <CheckCircle sx={{ fontSize: 14, color: '#4caf50' }} />
                </ListItemIcon>
                <ListItemText 
                  primary="Maintain upright posture"
                  sx={{ '& .MuiListItemText-primary': { fontSize: '0.7rem' } }}
                />
              </ListItem>
              <ListItem sx={{ px: 0, py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <CheckCircle sx={{ fontSize: 14, color: '#4caf50' }} />
                </ListItemIcon>
                <ListItemText 
                  primary="Keep eyes open and focused"
                  sx={{ '& .MuiListItemText-primary': { fontSize: '0.7rem' } }}
                />
              </ListItem>
              <ListItem sx={{ px: 0, py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <CheckCircle sx={{ fontSize: 14, color: '#4caf50' }} />
                </ListItemIcon>
                <ListItemText 
                  primary="Use 30-second break wisely if needed"
                  sx={{ '& .MuiListItemText-primary': { fontSize: '0.7rem' } }}
                />
              </ListItem>
            </List>
          )}
        </CardContent>
      </MetricCard>
    );
  };

  return (
    <StyledDialog
      open={open}
      onClose={onClose}
      TransitionComponent={Slide}
      TransitionProps={{
        direction: 'down',
        timeout: 400
      }}
      PaperProps={{
        sx: {
          animation: type === 'error' ? 'shake 0.6s ease-in-out' : 
                   type === 'warning' ? 'pulse 0.8s ease-in-out' : 'none',
          '@keyframes shake': {
            '0%': { transform: 'translateX(0)' },
            '25%': { transform: 'translateX(-5px)' },
            '50%': { transform: 'translateX(5px)' },
            '75%': { transform: 'translateX(-5px)' },
            '100%': { transform: 'translateX(0)' }
          },
          '@keyframes pulse': {
            '0%': { transform: 'scale(1)' },
            '50%': { transform: 'scale(1.02)' },
            '100%': { transform: 'scale(1)' }
          }
        }
      }}
    >
      <DialogContent sx={{ textAlign: 'center', p: 3 }}>
        {!hideCloseButton && (
          <IconButton
            onClick={onClose}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: 'grey.400',
              '&:hover': { color: 'white' }
            }}
          >
            <Close />
          </IconButton>
        )}

        <IconContainer popuptype={type}>
          {getIcon()}
        </IconContainer>

        <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 600 }}>
          {getTitle()}
        </Typography>

        <Typography variant="body1" sx={{ mb: 2, color: 'grey.300' }}>
          {message}
        </Typography>

        {/* Face Authentication Alert */}
        {renderFaceAuthAlert()}

        {type === 'warning' && continuousTime > 0 && faceAuthStatus === 'verified' && (
          <Alert 
            severity="warning" 
            sx={{ 
              mb: 2, 
              backgroundColor: 'rgba(255, 152, 0, 0.1)',
              border: '1px solid rgba(255, 152, 0, 0.3)',
              color: 'white',
              '& .MuiAlert-icon': { color: '#ff9800' }
            }}
          >
            <Typography variant="body2">
              Issue detected for {formatTime(continuousTime)}. Please correct immediately to avoid session termination.
            </Typography>
          </Alert>
        )}

        {type === 'error' && message.includes('Session') && !message.includes('Unauthorized') && (
          <Alert 
            severity="error" 
            sx={{ 
              mb: 2, 
              backgroundColor: 'rgba(244, 67, 54, 0.1)',
              border: '1px solid rgba(244, 67, 54, 0.3)',
              color: 'white',
              '& .MuiAlert-icon': { color: '#f44336' }
            }}
          >
            <Typography variant="body2">
              Your session has been terminated due to attendance violations. Your attendance record has been saved. Contact your instructor if you need assistance.
            </Typography>
          </Alert>
        )}

        {renderAttendanceStats()}
        {type === 'warning' && renderSessionTips()}
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0, justifyContent: 'center' }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
          {getActionButtons()}
        </Box>
      </DialogActions>
    </StyledDialog>
  );
};

export default AttendancePopup;