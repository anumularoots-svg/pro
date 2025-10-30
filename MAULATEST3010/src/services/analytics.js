// src/services/analytics.js
import apiService from './api';

class AnalyticsService {
  constructor() {
    this.trackingStartTime = null;
    this.currentSession = null;
    this.engagementMetrics = {
      mouseMoves: 0,
      keystrokes: 0,
      clicks: 0,
      focusEvents: 0,
      scrollEvents: 0
    };
    this.attentionTracking = {
      isVisible: true,
      totalVisibleTime: 0,
      lastVisibilityChange: null
    };
    this.trackingInterval = null;
    this.heartbeatInterval = 30000; // 30 seconds
  }

  // Start session tracking
  async startSessionTracking(meetingId, userId) {
    try {
      this.trackingStartTime = new Date();
      this.currentSession = {
        meetingId,
        userId,
        startTime: this.trackingStartTime,
        entryTime: this.trackingStartTime
      };

      // Reset metrics
      this.resetEngagementMetrics();

      // Start event listeners
      this.startEventListeners();

      // Start visibility tracking
      this.startVisibilityTracking();

      // Start periodic updates
      this.startPeriodicUpdates();

      // Notify backend
      await this.notifySessionStart();

      return this.currentSession;
    } catch (error) {
      console.error('Failed to start session tracking:', error);
      throw error;
    }
  }

  // Stop session tracking
  async stopSessionTracking() {
    try {
      if (!this.currentSession) {
        return null;
      }

      const endTime = new Date();
      const sessionData = {
        ...this.currentSession,
        endTime,
        exitTime: endTime,
        duration: endTime - this.trackingStartTime,
        engagementMetrics: { ...this.engagementMetrics },
        attentionMetrics: this.calculateAttentionMetrics()
      };

      // Stop tracking
      this.stopEventListeners();
      this.stopPeriodicUpdates();

      // Send final session data
      await this.sendSessionData(sessionData);

      // Reset
      this.currentSession = null;
      this.trackingStartTime = null;

      return sessionData;
    } catch (error) {
      console.error('Failed to stop session tracking:', error);
      throw error;
    }
  }

  // Start event listeners for engagement tracking
  startEventListeners() {
    // Mouse movement tracking
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    
    // Keyboard tracking
    document.addEventListener('keydown', this.handleKeydown.bind(this));
    
    // Click tracking
    document.addEventListener('click', this.handleClick.bind(this));
    
    // Focus tracking
    window.addEventListener('focus', this.handleFocus.bind(this));
    window.addEventListener('blur', this.handleBlur.bind(this));
    
    // Scroll tracking
    document.addEventListener('scroll', this.handleScroll.bind(this));
  }

  // Stop event listeners
  stopEventListeners() {
    document.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    document.removeEventListener('keydown', this.handleKeydown.bind(this));
    document.removeEventListener('click', this.handleClick.bind(this));
    window.removeEventListener('focus', this.handleFocus.bind(this));
    window.removeEventListener('blur', this.handleBlur.bind(this));
    document.removeEventListener('scroll', this.handleScroll.bind(this));
  }

  // Event handlers
  handleMouseMove() {
    this.engagementMetrics.mouseMoves++;
  }

  handleKeydown() {
    this.engagementMetrics.keystrokes++;
  }

  handleClick() {
    this.engagementMetrics.clicks++;
  }

  handleFocus() {
    this.engagementMetrics.focusEvents++;
    this.handleVisibilityChange(true);
  }

  handleBlur() {
    this.handleVisibilityChange(false);
  }

  handleScroll() {
    this.engagementMetrics.scrollEvents++;
  }

  // Start visibility tracking
  startVisibilityTracking() {
    this.attentionTracking.lastVisibilityChange = new Date();
    
    // Page Visibility API
    document.addEventListener('visibilitychange', () => {
      this.handleVisibilityChange(!document.hidden);
    });
  }

  // Handle visibility change
  handleVisibilityChange(isVisible) {
    const now = new Date();
    
    if (this.attentionTracking.isVisible && !isVisible) {
      // Window lost focus - add visible time
      const visibleDuration = now - this.attentionTracking.lastVisibilityChange;
      this.attentionTracking.totalVisibleTime += visibleDuration;
    }
    
    this.attentionTracking.isVisible = isVisible;
    this.attentionTracking.lastVisibilityChange = now;
  }

  // Calculate attention metrics
  calculateAttentionMetrics() {
    const now = new Date();
    let totalVisibleTime = this.attentionTracking.totalVisibleTime;
    
    // Add current visible time if window is currently visible
    if (this.attentionTracking.isVisible) {
      totalVisibleTime += now - this.attentionTracking.lastVisibilityChange;
    }
    
    const totalSessionTime = now - this.trackingStartTime;
    const attentionPercentage = Math.round((totalVisibleTime / totalSessionTime) * 100);
    
    return {
      totalVisibleTime,
      totalSessionTime,
      attentionPercentage,
      isCurrentlyVisible: this.attentionTracking.isVisible
    };
  }

  // Start periodic updates
  startPeriodicUpdates() {
    this.trackingInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);
  }

  // Stop periodic updates
  stopPeriodicUpdates() {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
  }

  // Send heartbeat with current metrics
  async sendHeartbeat() {
    if (!this.currentSession) return;

    try {
      const metrics = {
        meetingId: this.currentSession.meetingId,
        userId: this.currentSession.userId,
        timestamp: new Date(),
        engagementMetrics: { ...this.engagementMetrics },
        attentionMetrics: this.calculateAttentionMetrics()
      };

      await apiService.post('/analytics/heartbeat', metrics);
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
    }
  }

  // Notify session start
  async notifySessionStart() {
    try {
      await apiService.post('/analytics/session/start', {
        meetingId: this.currentSession.meetingId,
        userId: this.currentSession.userId,
        startTime: this.currentSession.startTime.toISOString()
      });
    } catch (error) {
      console.error('Failed to notify session start:', error);
    }
  }

  // Send session data
  async sendSessionData(sessionData) {
    try {
      await apiService.post('/analytics/session/end', {
        meetingId: sessionData.meetingId,
        userId: sessionData.userId,
        startTime: sessionData.startTime.toISOString(),
        endTime: sessionData.endTime.toISOString(),
        duration: sessionData.duration,
        engagementScore: this.calculateEngagementScore(sessionData),
        attentionPercentage: sessionData.attentionMetrics.attentionPercentage,
        metrics: {
          engagement: sessionData.engagementMetrics,
          attention: sessionData.attentionMetrics
        }
      });
    } catch (error) {
      console.error('Failed to send session data:', error);
    }
  }

  // Calculate engagement score
  calculateEngagementScore(sessionData) {
    const { engagementMetrics, attentionMetrics, duration } = sessionData;
    const durationMinutes = duration / (1000 * 60);
    
    // Normalize metrics based on duration
    const normalizedMouseMoves = Math.min(engagementMetrics.mouseMoves / durationMinutes, 100);
    const normalizedKeystrokes = Math.min(engagementMetrics.keystrokes / durationMinutes, 50);
    const normalizedClicks = Math.min(engagementMetrics.clicks / durationMinutes, 20);
    const attentionScore = attentionMetrics.attentionPercentage;
    
    // Weighted engagement score (0-100)
    const engagementScore = Math.round(
      (normalizedMouseMoves * 0.3) +
      (normalizedKeystrokes * 0.3) +
      (normalizedClicks * 0.2) +
      (attentionScore * 0.2)
    );
    
    return Math.min(engagementScore, 100);
  }

  // Get meeting analytics
  async getMeetingAnalytics(meetingId) {
    try {
      const response = await apiService.get(`/analytics/meeting/${meetingId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get meeting analytics:', error);
      throw error;
    }
  }

  // Get user analytics
  async getUserAnalytics(userId, timeRange = '30d') {
    try {
      const response = await apiService.get(`/analytics/user/${userId}?range=${timeRange}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get user analytics:', error);
      throw error;
    }
  }

  // Get attendance analytics for meeting
  async getAttendanceAnalytics(meetingId) {
    try {
      const response = await apiService.get(`/analytics/attendance/${meetingId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get attendance analytics:', error);
      throw error;
    }
  }

  // Get engagement trends
  async getEngagementTrends(timeRange = '7d') {
    try {
      const response = await apiService.get(`/analytics/engagement?range=${timeRange}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get engagement trends:', error);
      throw error;
    }
  }

  // Track specific events
  async trackEvent(eventType, eventData) {
    try {
      await apiService.post('/analytics/events', {
        meetingId: this.currentSession?.meetingId,
        userId: this.currentSession?.userId,
        eventType,
        eventData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to track event:', error);
    }
  }

  // Track chat activity
  trackChatMessage() {
    this.trackEvent('chat_message', {
      action: 'send_message'
    });
  }

  // Track reaction usage
  trackReaction(reactionType) {
    this.trackEvent('reaction', {
      type: reactionType
    });
  }

  // Track hand raise
  trackHandRaise(isRaised) {
    this.trackEvent('hand_raise', {
      raised: isRaised
    });
  }

  // Track screen share
  trackScreenShare(action) {
    this.trackEvent('screen_share', {
      action // 'start' or 'stop'
    });
  }

  // Track camera toggle
  trackCameraToggle(enabled) {
    this.trackEvent('camera_toggle', {
      enabled
    });
  }

  // Track microphone toggle
  trackMicrophoneToggle(enabled) {
    this.trackEvent('microphone_toggle', {
      enabled
    });
  }

  // Generate analytics report
  async generateReport(meetingId, reportType = 'comprehensive') {
    try {
      const response = await apiService.post('/analytics/reports/generate', {
        meetingId,
        reportType,
        includeCharts: true,
        format: 'json'
      });
      return response.data;
    } catch (error) {
      console.error('Failed to generate analytics report:', error);
      throw error;
    }
  }

  // Export analytics data
  async exportAnalytics(meetingId, format = 'csv') {
    try {
      const response = await apiService.get(`/analytics/export/${meetingId}?format=${format}`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `analytics_${meetingId}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      return true;
    } catch (error) {
      console.error('Failed to export analytics:', error);
      throw error;
    }
  }

  // Reset engagement metrics
  resetEngagementMetrics() {
    this.engagementMetrics = {
      mouseMoves: 0,
      keystrokes: 0,
      clicks: 0,
      focusEvents: 0,
      scrollEvents: 0
    };
  }

  // Get current session info
  getCurrentSession() {
    return this.currentSession;
  }

  // Get real-time metrics
  getRealTimeMetrics() {
    return {
      engagement: { ...this.engagementMetrics },
      attention: this.calculateAttentionMetrics(),
      sessionDuration: this.currentSession ? 
        new Date() - this.trackingStartTime : 0
    };
  }

  // Check if tracking is active
  isTracking() {
    return this.currentSession !== null;
  }

  // Cleanup
  cleanup() {
    this.stopSessionTracking();
    this.stopEventListeners();
    this.stopPeriodicUpdates();
  }
}

export default new AnalyticsService();