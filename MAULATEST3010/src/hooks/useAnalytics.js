// src/hooks/useAnalytics.js - Fixed for role-based analytics
import { useState, useEffect, useCallback } from 'react';
import { analyticsAPI } from '../services/api';
import { useAuth } from './useAuth';

export const useAnalytics = () => {
  const { user } = useAuth();
  const [analyticsData, setAnalyticsData] = useState({
    // Host analytics data
    hostOverview: null,
    hostMeetings: [],
    hostEngagement: null,
    hostTrends: null,
    
    // Participant analytics data  
    participantReport: null,
    participantAttendance: [],
    participantEngagement: null,
    
    // Common data
    filters: null,
    preferences: null
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Clear error function
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Error handler
  const handleError = useCallback((error, context) => {
    console.error(`${context} error:`, error);
    const errorMessage = error.response?.data?.error || 
                        error.response?.data?.Error || 
                        error.message || 
                        `Failed to ${context.toLowerCase()}`;
    setError(errorMessage);
    return null;
  }, []);

  // HOST ANALYTICS FUNCTIONS
  const fetchHostOverview = useCallback(async (filters = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        timeframe: filters.period || filters.timeframe || '7days',
        meetingType: filters.meetingType || filters.meeting_type || 'all',
        user_id: filters.user_id || filters.userId || filters.host_id || user?.id
      };
      
      console.log('Fetching host overview with params:', params);
      const response = await analyticsAPI.getHostDashboardOverview(params);
      
      setAnalyticsData(prev => ({
        ...prev,
        hostOverview: response.data || response
      }));
      
      return response.data || response;
    } catch (err) {
      return handleError(err, 'Fetch host overview');
    } finally {
      setLoading(false);
    }
  }, [user, handleError]);

  const fetchHostMeetingReports = useCallback(async (filters = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        page: filters.page || 1,
        limit: filters.limit || 50,
        user_id: filters.user_id || filters.userId || filters.host_id || user?.id,
        timeframe: filters.period || filters.timeframe || '30days',
        meetingType: filters.meetingType || filters.meeting_type || 'all',
        'dateRange[start]': filters.dateRange?.start || filters.start_date,
        'dateRange[end]': filters.dateRange?.end || filters.end_date
      };
      
      // Remove undefined values
      Object.keys(params).forEach(key => {
        if (params[key] === undefined) {
          delete params[key];
        }
      });
      
      console.log('Fetching host meeting reports with params:', params);
      const response = await analyticsAPI.getHostMeetingReports(params);
      
      setAnalyticsData(prev => ({
        ...prev,
        hostMeetings: response.meetings || response.data || response,
        meetingReports: response.meetings || response.data || response // For backward compatibility
      }));
      
      return response;
    } catch (err) {
      return handleError(err, 'Fetch meeting reports');
    } finally {
      setLoading(false);
    }
  }, [user, handleError]);

  const fetchHostEngagementDistribution = useCallback(async (filters = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        timeframe: filters.period || filters.timeframe || '7days',
        meetingType: filters.meetingType || filters.meeting_type || 'all',
        user_id: filters.user_id || filters.userId || filters.host_id || user?.id,
        host_id: filters.user_id || filters.userId || filters.host_id || user?.id
      };
      
      console.log('Fetching host engagement distribution with params:', params);
      const response = await analyticsAPI.getHostEngagementDistribution(params);
      
      setAnalyticsData(prev => ({
        ...prev,
        hostEngagement: response.data || response
      }));
      
      return response.data || response;
    } catch (err) {
      return handleError(err, 'Fetch engagement distribution');
    } finally {
      setLoading(false);
    }
  }, [user, handleError]);

  const fetchHostTrends = useCallback(async (filters = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        timeframe: filters.period || filters.timeframe || '7days',
        metric: filters.metric || 'meetings',
        user_id: filters.user_id || filters.userId || filters.host_id || user?.id,
        host_id: filters.user_id || filters.userId || filters.host_id || user?.id
      };
      
      console.log('Fetching host trends with params:', params);
      const response = await analyticsAPI.getHostMeetingTrends(params);
      
      setAnalyticsData(prev => ({
        ...prev,
        hostTrends: response.data || response
      }));
      
      return response.data || response;
    } catch (err) {
      return handleError(err, 'Fetch meeting trends');
    } finally {
      setLoading(false);
    }
  }, [user, handleError]);

  // PARTICIPANT ANALYTICS FUNCTIONS
  const fetchParticipantPersonalReport = useCallback(async (filters = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        timeframe: filters.period || filters.timeframe || '30days',
        userId: filters.userId || filters.user_id || user?.id
      };
      
      console.log('Fetching participant personal report with params:', params);
      const response = await analyticsAPI.getParticipantPersonalReport(user?.id, params);
      
      setAnalyticsData(prev => ({
        ...prev,
        participantReport: response.data || response
      }));
      
      return response.data || response;
    } catch (err) {
      return handleError(err, 'Fetch personal report');
    } finally {
      setLoading(false);
    }
  }, [user, handleError]);

  const fetchParticipantAttendance = useCallback(async (filters = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        userId: filters.userId || filters.user_id || user?.id,
        dateRange: filters.dateRange ? JSON.stringify(filters.dateRange) : JSON.stringify({
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end: new Date().toISOString().split('T')[0]
        })
      };
      
      console.log('Fetching participant attendance with params:', params);
      const response = await analyticsAPI.getParticipantAttendance(user?.id, params);
      
      setAnalyticsData(prev => ({
        ...prev,
        participantAttendance: response.attendanceRecords || response.data || response
      }));
      
      return response;
    } catch (err) {
      return handleError(err, 'Fetch attendance data');
    } finally {
      setLoading(false);
    }
  }, [user, handleError]);

  const fetchParticipantEngagement = useCallback(async (filters = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        timeframe: filters.period || filters.timeframe || '30days',
        userId: filters.userId || filters.user_id || user?.id
      };
      
      console.log('Fetching participant engagement with params:', params);
      const response = await analyticsAPI.getParticipantEngagement(user?.id, params);
      
      setAnalyticsData(prev => ({
        ...prev,
        participantEngagement: response.data || response
      }));
      
      return response.data || response;
    } catch (err) {
      return handleError(err, 'Fetch engagement metrics');
    } finally {
      setLoading(false);
    }
  }, [user, handleError]);

  // COMMON FUNCTIONS
  const getUserStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        user_id: user?.id,
        userId: user?.id
      };
      
      console.log('Fetching user stats with params:', params);
      
      // Try the user stats endpoint first
      try {
        const response = await analyticsAPI.getUserStats?.(params);
        if (response?.data) {
          return response.data;
        }
      } catch (statsError) {
        console.warn('User stats endpoint failed, trying alternative:', statsError);
      }
      
      // Fallback: get basic user profile info
      try {
        const response = await analyticsAPI.getUserProfile();
        const userStats = {
          totalMeetings: response.meetingStats?.total || 0,
          totalHostedMeetings: response.hostStats?.total || 0,
          totalMinutes: response.meetingStats?.totalDuration || 0,
          averageAttendance: response.attendanceStats?.average || 0,
          upcomingCount: response.upcomingMeetings?.length || 0,
          role: response.role || 'participant'
        };
        return userStats;
      } catch (profileError) {
        console.warn('User profile endpoint failed:', profileError);
      }
      
      // Final fallback: return default stats
      return {
        totalMeetings: 0,
        totalHostedMeetings: 0,
        totalMinutes: 0,
        averageAttendance: 0,
        upcomingCount: 0,
        role: 'participant'
      };
    } catch (err) {
      console.error('Error fetching user statistics:', err);
      return {
        totalMeetings: 0,
        totalHostedMeetings: 0,
        totalMinutes: 0,
        averageAttendance: 0,
        upcomingCount: 0,
        role: 'participant'
      };
    } finally {
      setLoading(false);
    }
  }, [user]);

  const exportAnalyticsData = useCallback(async (exportConfig) => {
    try {
      setLoading(true);
      setError(null);
      
      const exportData = {
        type: exportConfig.userRole || 'participant',
        format: exportConfig.format || 'csv',
        filters: exportConfig.filters || {},
        userId: user?.id
      };
      
      const response = await analyticsAPI.exportAnalyticsData?.(exportData);
      
      if (response?.downloadUrl) {
        window.open(response.downloadUrl, '_blank');
      }
      
      return response;
    } catch (err) {
      return handleError(err, 'Export analytics data');
    } finally {
      setLoading(false);
    }
  }, [user, handleError]);

  // LEGACY FUNCTIONS (for backward compatibility)
  const fetchMeetingReports = useCallback(async (filters = {}) => {
    return await fetchHostMeetingReports(filters);
  }, [fetchHostMeetingReports]);

  const fetchEngagementMetrics = useCallback(async (meetingId) => {
    if (meetingId === 'overall') {
      return await fetchHostEngagementDistribution();
    }
    return await fetchParticipantEngagement({ meetingId });
  }, [fetchHostEngagementDistribution, fetchParticipantEngagement]);

  const getMeetingAnalytics = useCallback(async (meetingId) => {
    try {
      setLoading(true);
      const response = await fetchParticipantEngagement({ meetingId });
      return { success: true, analytics: response };
    } catch (err) {
      console.error('Get meeting analytics error:', err);
      setError('Failed to load meeting analytics');
      return { success: false, message: err.message || 'Failed to load analytics' };
    } finally {
      setLoading(false);
    }
  }, [fetchParticipantEngagement]);

  const getAttendanceReport = useCallback(async (dateRange) => {
    try {
      setLoading(true);
      const response = await fetchParticipantAttendance({ dateRange });
      return { success: true, report: response.attendanceRecords || [] };
    } catch (err) {
      console.error('Get attendance report error:', err);
      setError('Failed to load attendance report');
      return { success: false, message: err.message || 'Failed to load report' };
    } finally {
      setLoading(false);
    }
  }, [fetchParticipantAttendance]);

  return {
    // Data
    analyticsData,
    loading,
    error,
    
    // Host Analytics Functions
    fetchHostOverview,
    fetchHostMeetingReports,
    fetchHostEngagementDistribution,
    fetchHostTrends,
    
    // Participant Analytics Functions
    fetchParticipantPersonalReport,
    fetchParticipantAttendance,
    fetchParticipantEngagement,
    
    // Common Functions
    getUserStats,
    exportAnalyticsData,
    
    // Legacy Functions (for backward compatibility)
    fetchMeetingReports,
    fetchEngagementMetrics,
    getMeetingAnalytics,
    getAttendanceReport,
    
    // Utility Functions
    clearError
  };
};