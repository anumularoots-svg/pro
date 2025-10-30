// UPDATED: App.jsx with LiveKit Integration and Global Meeting Leave Handler

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './context/AuthContext';
import { MeetingProvider } from './context/MeetingContext';
import { LiveKitProvider } from './context/LiveKitContext';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeProvider as CustomThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/common/ErrorBoundary';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import MeetingLayout from './layouts/MeetingLayout';

// Pages
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import MeetingPage from './pages/MeetingPage';
import RecordingsPage from './pages/RecordingsPage';
import SchedulePage from './pages/SchedulePage';
import CalendarPage from './pages/CalendarPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import AnalyticsPage from './pages/AnalyticsPage';

// Import ScheduleMeeting component
import ScheduleMeeting from './components/meeting/ScheduleMeeting';

// Import SSL Certificate Handler for development
import SSLCertificateHandler from './components/SSLCertificateHandler';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useMUITheme } from './hooks/useMUITheme';

// Global Application Refresh Helper
const triggerApplicationRefresh = (reason = 'unknown', delay = 1000) => {
  console.log(`Triggering application refresh: ${reason} (${delay}ms delay)`);
  
  // Dispatch custom event
  window.dispatchEvent(new CustomEvent('applicationRefreshRequested', {
    detail: { reason, delay }
  }));
};

// Make it globally available
window.triggerApplicationRefresh = triggerApplicationRefresh;

// Enhanced LiveKit-compatible ReactionsProvider
const LiveKitReactionsProvider = ({ children }) => {
  const [reactions, setReactions] = React.useState([]);
  
  // Listen for LiveKit reactions
  React.useEffect(() => {
    const handleLiveKitReaction = (event) => {
      const { detail } = event;
      
      const newReaction = {
        id: `${detail.participant || 'unknown'}_${Date.now()}`,
        emoji: detail.reaction || detail.emoji,
        userName: detail.user_name || detail.participant_name || detail.participant || 'Someone',
        participantId: detail.user_id || detail.participant,
        timestamp: detail.timestamp || Date.now(),
        source: 'livekit'
      };
      
      console.log('Reaction received:', newReaction);
      
      addReaction(newReaction);
    };
    
    // Listen for both WebSocket (legacy) and LiveKit reactions
    window.addEventListener('livekit-reaction', handleLiveKitReaction);
    window.addEventListener('reaction-received', handleLiveKitReaction);
    
    return () => {
      window.removeEventListener('livekit-reaction', handleLiveKitReaction);
      window.removeEventListener('reaction-received', handleLiveKitReaction);
    };
  }, []);
  
  const addReaction = React.useCallback((reaction) => {
    const newReaction = {
      id: reaction.id || `${reaction.participantId || 'unknown'}_${Date.now()}`,
      emoji: reaction.emoji || reaction.reaction,
      userName: reaction.userName || reaction.user_name || reaction.participant || 'Someone',
      participantId: reaction.participantId || reaction.user_id,
      timestamp: reaction.timestamp || Date.now(),
      source: reaction.source || 'manual'
    };
    
    setReactions(prev => {
      // Prevent duplicates
      const exists = prev.some(r => r.id === newReaction.id);
      if (exists) return prev;
      
      return [...prev, newReaction];
    });
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== newReaction.id));
    }, 5000);
  }, []);
  
  const clearReactions = React.useCallback(() => {
    setReactions([]);
  }, []);
  
  const sendReaction = React.useCallback((emoji, userName = 'You') => {
    // This will be handled by LiveKit context, but we can add local display
    const reaction = {
      id: `local_${Date.now()}`,
      emoji,
      userName,
      participantId: 'local',
      timestamp: Date.now(),
      source: 'local'
    };
    
    addReaction(reaction);
  }, [addReaction]);
  
  const value = {
    reactions,
    addReaction,
    clearReactions,
    sendReaction
  };
  
  // Create context
  const ReactionsContext = React.createContext(value);
  
  return (
    <ReactionsContext.Provider value={value}>
      {children}
    </ReactionsContext.Provider>
  );
};

// Protected Route with better loading state
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        gap: '20px',
        backgroundColor: '#f5f5f5'
      }}>
        <div 
          style={{
            width: '50px',
            height: '50px',
            border: '4px solid #e3e3e3',
            borderTop: '4px solid #1976d2',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}
        />
        <div>Loading application...</div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }
  
  return isAuthenticated ? children : <Navigate to="/auth" replace />;
};

// Public Route with better loading state
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        gap: '20px',
        backgroundColor: '#f5f5f5'
      }}>
        <div 
          style={{
            width: '50px',
            height: '50px',
            border: '4px solid #e3e3e3',
            borderTop: '4px solid #1976d2',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}
        />
        <div>Checking authentication...</div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }
  
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />;
};

// App Content with LiveKit error boundary and Global Meeting Leave Handler
function AppContent() {
  const theme = useMUITheme();
  const { user } = useAuth();

  // GLOBAL MEETING LEAVE HANDLER - This handles all meeting exit scenarios
  React.useEffect(() => {
    console.log('Setting up global meeting leave handlers...');

    // Main meeting leave handler
    const handleMeetingLeave = (event) => {
      const { reason, forced, userId, currentUserId, immediate } = event.detail || {};
      
      console.log('Meeting leave detected:', { 
        reason, 
        forced, 
        userId, 
        currentUserId,
        immediate,
        currentUser: user?.id 
      });
      
      // Only refresh for the current user
      const currentUserIdToCheck = currentUserId || user?.id || user?.ID;
      const shouldRefresh = userId === currentUserIdToCheck || !userId || immediate;
      
      if (shouldRefresh) {
        let refreshDelay = 0;
        
        switch (reason) {
          case 'removed_by_host':
          case 'removed_by_cohost':
          case 'forced_disconnect':
          case 'kicked':
          case 'participant_removed':
            refreshDelay = 3000; // Show removal message first
            break;
          case 'meeting_ended':
          case 'host_ended_meeting':
          case 'meeting_terminated':
            refreshDelay = 5000; // Show meeting end message first
            break;
          case 'manual_leave':
          case 'user_disconnect':
          case 'browser_close':
          case 'network_disconnect':
          case 'connection_lost':
          case 'user_initiated':
            refreshDelay = 1000; // Quick refresh for manual leaves
            break;
          case 'immediate':
            refreshDelay = 0; // Immediate refresh
            break;
          default:
            refreshDelay = 1500; // Default delay
            break;
        }
        
        console.log(`Scheduling app refresh: ${reason} (${refreshDelay}ms delay)`);
        
        // Clear any meeting-related data and refresh
        setTimeout(() => {
          console.log(`Refreshing application after ${reason}`);
          
          try {
            // Clear meeting-related localStorage
            localStorage.removeItem('currentMeetingId');
            localStorage.removeItem('meetingData');
            localStorage.removeItem('participantData');
            localStorage.removeItem('meetingToken');
            localStorage.removeItem('livekit_token');
            localStorage.removeItem('meeting_participant_id');
            
            // Clear meeting-related sessionStorage
            sessionStorage.removeItem('meetingState');
            sessionStorage.removeItem('participantState');
            sessionStorage.removeItem('livekitState');
            
            // Force full page reload to dashboard
            window.location.href = '/dashboard';
          } catch (error) {
            console.error('Error during cleanup, forcing reload:', error);
            window.location.reload();
          }
        }, refreshDelay);
      }
    };

    // Enhanced forced leave handler
    const handleForcedLeave = (event) => {
      const { reason, message, removedUserId, targetUserId } = event.detail || {};
      console.log('Forced leave detected:', { reason, message, removedUserId, targetUserId });
      
      const currentUserIdToCheck = user?.id || user?.ID;
      const isCurrentUserRemoved = 
        removedUserId === currentUserIdToCheck || 
        targetUserId === currentUserIdToCheck;
      
      if (isCurrentUserRemoved) {
        console.log('Current user was forcibly removed - immediate refresh');
        
        setTimeout(() => {
          console.log('Force refreshing application due to forced removal');
          
          // Clear all meeting data immediately
          localStorage.removeItem('currentMeetingId');
          localStorage.removeItem('meetingData');
          localStorage.removeItem('participantData');
          localStorage.removeItem('meetingToken');
          
          // Force redirect to dashboard
          window.location.href = '/dashboard';
        }, 2000);
      }
    };

    // Meeting end handler
    const handleMeetingEnd = (event) => {
      const { reason, endedBy, meetingId } = event.detail || {};
      console.log('Meeting end detected:', { reason, endedBy, meetingId });
      
      setTimeout(() => {
        console.log('Refreshing application - meeting ended');
        
        // Clear meeting data
        localStorage.removeItem('currentMeetingId');
        localStorage.removeItem('meetingData');
        localStorage.removeItem('participantData');
        
        // Redirect to dashboard
        window.location.href = '/dashboard';
      }, 4000);
    };

    // Application refresh handler
    const handleApplicationRefresh = (event) => {
      const { reason, delay = 1000, clearAll = false } = event.detail || {};
      
      console.log(`Application refresh requested: ${reason} (${delay}ms delay)`);
      
      setTimeout(() => {
        if (clearAll) {
          // Clear all app data
          localStorage.clear();
          sessionStorage.clear();
        } else {
          // Clear only meeting-related data
          localStorage.removeItem('currentMeetingId');
          localStorage.removeItem('meetingData');
          localStorage.removeItem('participantData');
          localStorage.removeItem('meetingToken');
        }
        
        // Reset to dashboard
        window.location.href = '/dashboard';
      }, delay);
    };

    // Connection error handler
    const handleConnectionError = (event) => {
      const { error, critical, permanent } = event.detail || {};
      console.log('Connection error detected:', { error, critical, permanent });
      
      if (critical || permanent) {
        setTimeout(() => {
          console.log('Refreshing application due to critical connection error');
          localStorage.removeItem('currentMeetingId');
          localStorage.removeItem('meetingData');
          window.location.href = '/dashboard';
        }, 3000);
      }
    };

    // Network disconnect handler
    const handleNetworkDisconnect = (event) => {
      console.log('Network disconnect detected');
      
      // Give some time for reconnection, then refresh if needed
      setTimeout(() => {
        if (!navigator.onLine) {
          console.log('Still offline - will refresh when back online');
          
          const handleOnline = () => {
            console.log('Back online - refreshing application');
            localStorage.removeItem('currentMeetingId');
            localStorage.removeItem('meetingData');
            window.location.href = '/dashboard';
            window.removeEventListener('online', handleOnline);
          };
          
          window.addEventListener('online', handleOnline);
        }
      }, 5000);
    };

    // Listen for various leave and error events
    const events = [
      // Primary leave events
      ['meetingLeaveRequested', handleMeetingLeave],
      ['participantRemoved', handleForcedLeave],
      ['meetingEnded', handleMeetingEnd],
      ['forcedLeave', handleForcedLeave],
      
      // Application control events
      ['applicationRefreshRequested', handleApplicationRefresh],
      
      // Connection events
      ['connectionError', handleConnectionError],
      ['networkDisconnect', handleNetworkDisconnect],
      
      // Legacy event support
      ['meeting-leave', handleMeetingLeave],
      ['meeting-end', handleMeetingEnd],
      ['participant-removed', handleForcedLeave],
      
      // Browser events
      ['beforeunload', () => {
        // Clear meeting data on browser close
        localStorage.removeItem('currentMeetingId');
        localStorage.removeItem('meetingData');
      }]
    ];

    // Add all event listeners
    events.forEach(([eventName, handler]) => {
      window.addEventListener(eventName, handler);
    });
    
    console.log('Global meeting leave handlers registered');

    // Cleanup function
    return () => {
      console.log('Cleaning up global meeting leave handlers');
      events.forEach(([eventName, handler]) => {
        window.removeEventListener(eventName, handler);
      });
    };
  }, [user]); // Depend on user to get current user ID

  // Handle browser navigation events (back button, etc.)
  React.useEffect(() => {
    const handlePopState = (event) => {
      // If navigating away from meeting, clear meeting data
      if (window.location.pathname.includes('/meeting/')) {
        localStorage.removeItem('currentMeetingId');
        localStorage.removeItem('meetingData');
        localStorage.removeItem('participantData');
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* Add SSL Certificate Handler for development */}
      <SSLCertificateHandler />
      
      <Router>
        <ErrorBoundary>
          <Routes>
            {/* ============ PUBLIC ROUTES ============ */}
            <Route 
              path="/auth/*" 
              element={
                <PublicRoute>
                  <AuthLayout>
                    <AuthPage />
                  </AuthLayout>
                </PublicRoute>
              } 
            />
            
            {/* ============ MAIN DASHBOARD ============ */}
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <DashboardPage />
                  </MainLayout>
                </ProtectedRoute>
              } 
            />
            
            {/* ============ MEETING ROUTES ============ */}
            
            {/* Instant Meeting - Create and start immediately */}
            <Route 
              path="/instant-meeting" 
              element={
                <ProtectedRoute>
                  {/* <MeetingLayout> */}
                    <MeetingPage />
                  {/* </MeetingLayout> */}
                </ProtectedRoute>
              } 
            />
            
            {/* Join specific meeting by ID */}
            <Route 
              path="/meeting/:meetingId" 
              element={
                <ProtectedRoute>
                  {/* <MeetingLayout> */}
                    <MeetingPage />
                  {/* </MeetingLayout> */}
                </ProtectedRoute>
              } 
            />
            
            {/* ============ SCHEDULE MEETING ROUTES ============ */}
            
            <Route 
              path="/schedule-meeting" 
              element={
                <ProtectedRoute>
                  <ScheduleMeeting />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/meeting/schedule/edit/:id" 
              element={
                <ProtectedRoute>
                  <ScheduleMeeting />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/meeting/schedule/new" 
              element={
                <ProtectedRoute>
                  <ScheduleMeeting />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/meeting/schedule" 
              element={
                <ProtectedRoute>
                  <ScheduleMeeting />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/meeting/calendar" 
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <CalendarPage />
                  </MainLayout>
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/join-meeting" 
              element={
                <ProtectedRoute>
                  {/* <MeetingLayout> */}
                    <MeetingPage />
                  {/* </MeetingLayout> */}
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/recordings" 
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <RecordingsPage />
                  </MainLayout>
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/schedule" 
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <SchedulePage />
                  </MainLayout>
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/calendar" 
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <CalendarPage />
                  </MainLayout>
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/profile" 
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <ProfilePage />
                  </MainLayout>
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/settings" 
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <SettingsPage />
                  </MainLayout>
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/analytics" 
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <AnalyticsPage />
                  </MainLayout>
                </ProtectedRoute>
              } 
            />
            
            {/* ============ DEFAULT & ERROR ROUTES ============ */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ErrorBoundary>
      </Router>
    </ThemeProvider>
  );
}

// Main App component with LiveKit integration
function App() {
  // Development logging
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Meeting App starting with LiveKit integration and global leave handlers');
      console.log('LiveKit URL:', import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880');
      console.log('API Base URL:', import.meta.env.VITE_API_BASE_URL || 'https://192.168.48.201:8119');
    }
  }, []);

  // App-level refresh handler for emergency situations
  React.useEffect(() => {
    const handleEmergencyRefresh = (event) => {
      const { reason, immediate = false } = event.detail || {};
      
      console.log(`Emergency refresh requested: ${reason}`);
      
      if (immediate) {
        window.location.reload();
      } else {
        setTimeout(() => {
          localStorage.clear();
          sessionStorage.clear();
          window.location.href = '/dashboard';
        }, 1000);
      }
    };

    // Emergency refresh for critical errors
    window.addEventListener('emergencyRefreshRequested', handleEmergencyRefresh);
    
    return () => {
      window.removeEventListener('emergencyRefreshRequested', handleEmergencyRefresh);
    };
  }, []);

  return (
    <CustomThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <LiveKitProvider>
            <MeetingProvider>
              <LiveKitReactionsProvider>
                <AppContent />
              </LiveKitReactionsProvider>
            </MeetingProvider>
          </LiveKitProvider>
        </NotificationProvider>
      </AuthProvider>
    </CustomThemeProvider>
  );
}

export default App;