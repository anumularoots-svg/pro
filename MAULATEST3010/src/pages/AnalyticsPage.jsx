// src/pages/AnalyticsPage.jsx - Analytics Dashboard with Enhanced Engagement Pie Chart
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Tab,
  Tabs,
  Paper,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
  useTheme,
  alpha,
  IconButton,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Group as GroupIcon,
  AccessTime as AccessTimeIcon,
  VideoCall as VideoIcon,
  Assessment as AssessmentIcon,
  Download as DownloadIcon,
  FilterList as FilterIcon,
  ArrowBack as ArrowBackIcon,
  Person as PersonIcon,
  SupervisorAccount as SupervisorAccountIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const AnalyticsPage = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    analyticsData, 
    loading, 
    error,
    fetchHostOverview,
    fetchHostMeetingReports,
    fetchHostEngagementDistribution,
    fetchHostTrends,
    fetchParticipantPersonalReport,
    fetchParticipantAttendance,
    fetchParticipantEngagement,
    getUserStats,
    clearError
  } = useAnalytics();
  
  const [tabValue, setTabValue] = useState(0);
  const [timeFilter, setTimeFilter] = useState('7days');
  const [meetingFilter, setMeetingFilter] = useState('all');
  const [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  });
  const [userRole, setUserRole] = useState('participant');
  const [personalStats, setPersonalStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Determine user role based on meeting history
  useEffect(() => {
    const determineUserRole = async () => {
      if (!user?.id) return;
      
      try {
        setIsLoadingStats(true);
        const userStats = await getUserStats();
        
        if (userStats && userStats.totalHostedMeetings > 0) {
          setUserRole('host'); 
        } else {
          setUserRole('participant');
        }
        setPersonalStats(userStats);
      } catch (error) {
        console.error('Error determining user role:', error);
        setUserRole('participant');
      } finally {
        setIsLoadingStats(false);
      }
    };

    if (user) {
      determineUserRole();
    }
  }, [user, getUserStats]);

  // Fetch analytics data based on role and filters
  useEffect(() => {
    const fetchAnalyticsData = async () => {
      if (!user?.id) return;
      
      try {
        clearError();
        
        const filters = {
          period: timeFilter,
          meetingType: meetingFilter,
          user_id: user.id,
          userId: user.id,
          host_id: user.id,
          timeframe: timeFilter,
          start_date: dateRange.start,
          end_date: dateRange.end,
          dateRange: dateRange
        };

        if (userRole === 'host') {
          // Fetch host analytics
          await Promise.allSettled([
            fetchHostOverview(filters),
            fetchHostMeetingReports(filters),
            fetchHostEngagementDistribution(filters),
            fetchHostTrends(filters)
          ]);
        } else {
          // Fetch participant personal analytics
          await Promise.allSettled([
            fetchParticipantPersonalReport(filters),
            fetchParticipantAttendance(filters),
            fetchParticipantEngagement(filters)
          ]);
        }
      } catch (error) {
        console.error('Error fetching analytics data:', error);
      }
    };

    if (user && !isLoadingStats) {
      fetchAnalyticsData();
    }
  }, [timeFilter, meetingFilter, dateRange, userRole, user, isLoadingStats]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleBackToDashboard = () => {
    navigate('/dashboard');
  };

  const handleRoleSwitch = (role) => {
    setUserRole(role);
    setTabValue(0);
  };

  // Safe data access with default values and chart data formatting
  const safeAnalyticsData = useMemo(() => ({
    hostOverview: analyticsData.hostOverview || {},
    hostMeetings: analyticsData.hostMeetings || [],
    hostEngagement: analyticsData.hostEngagement || { distribution: [] },
    hostTrends: analyticsData.hostTrends || { trends: [] },
    participantReport: analyticsData.participantReport || {},
    participantAttendance: analyticsData.participantAttendance || [],
    participantEngagement: analyticsData.participantEngagement || { engagementRecords: [], summary: {} }
  }), [analyticsData]);

  // Format data for attendance analytics (bar chart like in image)
  const attendanceChartData = useMemo(() => {
    const attendance = safeAnalyticsData.participantAttendance || [];
    if (!Array.isArray(attendance)) return [];
    
    return attendance.slice(-7).map(item => ({
      date: item.date || new Date().toISOString().split('T')[0],
      participants: item.attendance_percentage || 0,
    }));
  }, [safeAnalyticsData.participantAttendance]);

  // UPDATED: Enhanced engagement pie data showing activity breakdown
  const engagementPieData = useMemo(() => {
    const engagement = safeAnalyticsData.participantEngagement?.engagementRecords || [];
    if (!Array.isArray(engagement) || engagement.length === 0) {
      return [
        { name: 'No Data Available', value: 100, color: '#e0e0e0' }
      ];
    }
    
    // Calculate totals from the latest engagement record (most comprehensive)
    const latestRecord = engagement[engagement.length - 1] || engagement[0];
    
    if (!latestRecord) {
      return [
        { name: 'No Data Available', value: 100, color: '#e0e0e0' }
      ];
    }
    
    // Extract timing data
    const sessionDuration = latestRecord.session_duration || 3600; // Default 1 hour if not provided
    const breakDuration = latestRecord.break_timing?.actual_break_duration || 0;
    const pauseDuration = latestRecord.pause_timing?.total_pause_time || 0;
    const attendancePercentage = latestRecord.attendance_percentage || 0;
    const focusScore = latestRecord.focus_score || 0;
    
    // Calculate time distributions
    const totalEngagedTime = (sessionDuration * attendancePercentage) / 100;
    const breakTime = Math.min(breakDuration, totalEngagedTime);
    const pauseTime = Math.min(pauseDuration, totalEngagedTime - breakTime);
    const focusedTime = ((totalEngagedTime - breakTime - pauseTime) * focusScore) / 100;
    const unfocusedTime = totalEngagedTime - breakTime - pauseTime - focusedTime;
    const awayTime = sessionDuration - totalEngagedTime;
    
    // Convert to percentages
    const totalTime = sessionDuration;
    const activities = [
      {
        name: 'Focused Time',
        value: Math.round((focusedTime / totalTime) * 100),
        color: '#4caf50',
        duration: Math.round(focusedTime),
        description: 'Time actively engaged and focused'
      },
      {
        name: 'Unfocused Time', 
        value: Math.round((unfocusedTime / totalTime) * 100),
        color: '#ff9800',
        duration: Math.round(unfocusedTime),
        description: 'Time present but not fully focused'
      },
      {
        name: 'Break Time',
        value: Math.round((breakTime / totalTime) * 100),
        color: '#2196f3',
        duration: Math.round(breakTime),
        description: 'Planned break periods'
      },
      {
        name: 'Paused Time',
        value: Math.round((pauseTime / totalTime) * 100),
        color: '#9c27b0',
        duration: Math.round(pauseTime),
        description: 'Time when session was paused'
      },
      {
        name: 'Away Time',
        value: Math.round((awayTime / totalTime) * 100),
        color: '#f44336',
        duration: Math.round(awayTime),
        description: 'Time away from the session'
      }
    ].filter(item => item.value > 0); // Only show activities with time spent
    
    // Ensure total adds up to 100%
    const totalPercentage = activities.reduce((sum, item) => sum + item.value, 0);
    if (totalPercentage !== 100 && activities.length > 0) {
      const adjustment = (100 - totalPercentage) / activities.length;
      activities.forEach(item => {
        item.value = Math.max(0, Math.round(item.value + adjustment));
      });
    }
    
    return activities.length > 0 ? activities : [
      { name: 'No Activity Data', value: 100, color: '#e0e0e0', duration: 0, description: 'No engagement data available' }
    ];
  }, [safeAnalyticsData.participantEngagement]);

  // Format data for host trends (both bar and line charts)
  const hostTrendsData = useMemo(() => {
    const trends = safeAnalyticsData.hostTrends?.trends || [];
    if (!Array.isArray(trends)) return [];
    
    return trends.map(item => ({
      date: item.date || new Date().toISOString().split('T')[0],
      participants: item.meetings || item.participants || 0,
    }));
  }, [safeAnalyticsData.hostTrends]);

  // Format data for host meetings (bar chart)
  const hostMeetingsData = useMemo(() => {
    const meetings = safeAnalyticsData.hostMeetings || [];
    if (!Array.isArray(meetings)) return [];
    
    return meetings.slice(-7).map(item => ({
      date: item.date || new Date().toISOString().split('T')[0],
      participants: item.participants || 0,
    }));
  }, [safeAnalyticsData.hostMeetings]);

  // Custom tooltip for engagement pie chart
  const EngagementTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Box
          sx={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxWidth: '250px'
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            {data.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {data.description}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {data.value}% ({Math.floor(data.duration / 60)}m {data.duration % 60}s)
          </Typography>
        </Box>
      );
    }
    return null;
  };

  // Analytics Charts Component
  const AnalyticsChart = ({ title, data, chartType = 'bar', height = 400 }) => (
    <Card sx={{ mb: 4 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
          {title}
        </Typography>
        <ResponsiveContainer width="100%" height={height}>
          {chartType === 'bar' ? (
            <BarChart 
              data={data} 
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              barCategoryGap="40%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                axisLine={{ stroke: '#e0e0e0' }}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                axisLine={{ stroke: '#e0e0e0' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}
              />
              <Bar 
                dataKey="participants" 
                fill="#1976d2"
                radius={[4, 4, 0, 0]}
                name="participants"
                maxBarSize={60}
              />
            </BarChart>
          ) : chartType === 'line' ? (
            <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                axisLine={{ stroke: '#e0e0e0' }}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                axisLine={{ stroke: '#e0e0e0' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="participants" 
                stroke="#1976d2" 
                strokeWidth={3}
                dot={{ fill: '#1976d2', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#1976d2', strokeWidth: 2 }}
                name="participants"
              />
            </LineChart>
          ) : (
            <PieChart data={data}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}%`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<EngagementTooltip />} />
              <Legend 
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{ paddingTop: '20px' }}
                formatter={(value, entry) => (
                  <span style={{ color: entry.color }}>{value}</span>
                )}
              />
            </PieChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );

  // Metric Cards Component
  const MetricCard = ({ icon: IconComponent, value, label, color = 'primary' }) => (
    <Card sx={{ textAlign: 'center', py: 3 }}>
      <CardContent>
        <Box sx={{ mb: 2 }}>
          <IconComponent sx={{ fontSize: 48, color: theme.palette[color].main }} />
        </Box>
        <Typography variant="h3" sx={{ fontWeight: 'bold', color: theme.palette[color].main, mb: 1 }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </CardContent>
    </Card>
  );

  // Participant Metric Cards
  const ParticipantMetrics = () => {
    const stats = personalStats || {};
    const totalMinutes = stats.totalMinutes || 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);
    
    return (
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12}>
          <Alert severity="info" sx={{ mb: 3 }}>
            This is your personal meeting analytics report showing your attendance and participation metrics.
          </Alert>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            icon={VideoIcon}
            value={stats.totalMeetings || 0}
            label="Meetings Attended"
            color="primary"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            icon={AccessTimeIcon}
            value={`${hours}h ${minutes}.${Math.floor((totalMinutes % 1) * 60)}m`}
            label="Total Meeting Time"
            color="success"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            icon={TrendingUpIcon}
            value={`${Math.round(stats.averageAttendance || 0)}%`}
            label="Average Attendance"
            color="warning"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            icon={AssessmentIcon}
            value={stats.upcomingCount || 0}
            label="Upcoming Meetings"
            color="info"
          />
        </Grid>
      </Grid>
    );
  };

  // Host Metric Cards
  const HostMetrics = () => {
    const overview = safeAnalyticsData.hostOverview || {};
    const avgDurationMins = Math.round(overview.average_duration || 0);
    
    return (
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12}>
          <Alert severity="success" sx={{ mb: 3 }}>
            Host Analytics Dashboard - Full meeting analytics for meetings you've hosted.
          </Alert>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            icon={VideoIcon}
            value={overview.total_meetings || 0}
            label="Total Meetings Hosted"
            color="primary"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            icon={GroupIcon}
            value={overview.total_participants || 0}
            label="Total Participants"
            color="success"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            icon={AccessTimeIcon}
            value={avgDurationMins > 0 ? `${avgDurationMins}m` : '0m'}
            label="Avg. Meeting Duration"
            color="warning"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            icon={TrendingUpIcon}
            value={`${Math.round(overview.average_engagement || 0)}%`}
            label="Avg. Engagement Rate"
            color="info"
          />
        </Grid>
      </Grid>
    );
  };

  // Tab content components
  const OverviewTab = () => (
    <Grid container spacing={3}>
      {/* Metric Cards */}
      <Grid item xs={12}>
        {userRole === 'participant' ? <ParticipantMetrics /> : <HostMetrics />}
      </Grid>
      
      {/* Analytics Chart */}
      <Grid item xs={12}>
        {userRole === 'participant' ? (
          <AnalyticsChart 
            title="Attendance Analytics" 
            data={attendanceChartData} 
            chartType="bar"
          />
        ) : (
          <AnalyticsChart 
            title="Meeting Analytics" 
            data={hostMeetingsData} 
            chartType="bar"
          />
        )}
      </Grid>
    </Grid>
  );

  const AttendanceTab = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <AnalyticsChart 
          title="Attendance Analytics" 
          data={attendanceChartData} 
          chartType="bar"
        />
      </Grid>
    </Grid>
  );

  const EngagementTab = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <AnalyticsChart 
          title="Session Activity Distribution" 
          data={engagementPieData} 
          chartType="pie"
          height={500}
        />
      </Grid>
      
      {/* Color Legend */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Color Legend
            </Typography>
            <Grid container spacing={1}>
              {engagementPieData.filter(item => item.name !== 'No Data Available' && item.name !== 'No Activity Data').map((activity, index) => (
                <Grid item xs={12} sm={6} md={4} key={index}>
                  <Box sx={{ display: 'flex', alignItems: 'center', p: 1 }}>
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        backgroundColor: activity.color,
                        mr: 1.5,
                        flexShrink: 0
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {activity.name}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      </Grid>

      {/* Enhanced engagement metrics card */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Engagement Activity Summary
            </Typography>
            <Grid container spacing={2}>
              {engagementPieData.filter(item => item.name !== 'No Data Available' && item.name !== 'No Activity Data').map((activity, index) => (
                <Grid item xs={12} sm={6} md={4} lg={2.4} key={index}>
                  <Box sx={{ textAlign: 'center', p: 2, borderRadius: 2, backgroundColor: alpha(activity.color, 0.1) }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        backgroundColor: activity.color,
                        margin: '0 auto 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                        {activity.value}%
                      </Typography>
                    </Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                      {activity.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      {activity.description}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {Math.floor(activity.duration / 60)}m {activity.duration % 60}s
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const ReportsTab = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <AnalyticsChart 
          title="Meeting Trends" 
          data={hostTrendsData} 
          chartType="bar"
        />
      </Grid>
    </Grid>
  );

  if (isLoadingStats) {
    return (
      <Container maxWidth="xl" sx={{ py: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Analytics...
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton 
              onClick={handleBackToDashboard}
              sx={{ 
                mr: 2, 
                color: theme.palette.primary.main,
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                }
              }}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
              Analytics Dashboard
            </Typography>
          </Box>
          
          {/* Role Selector */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant={userRole === 'participant' ? 'contained' : 'outlined'}
              onClick={() => handleRoleSwitch('participant')}
              startIcon={<PersonIcon />}
              size="small"
            >
              Participant Analytics
            </Button>
            {personalStats && personalStats.totalHostedMeetings > 0 && (
              <Button
                variant={userRole === 'host' ? 'contained' : 'outlined'}
                onClick={() => handleRoleSwitch('host')}
                startIcon={<SupervisorAccountIcon />}
                size="small"
              >
                Host Analytics
              </Button>
            )}
          </Box>
        </Box>
        
        <Typography variant="body1" color="text.secondary" sx={{ ml: 7 }}>
          Comprehensive insights into your meeting performance and engagement
        </Typography>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Time Period</InputLabel>
              <Select
                value={timeFilter}
                label="Time Period"
                onChange={(e) => setTimeFilter(e.target.value)}
              >
                <MenuItem value="7days">Last 7 Days</MenuItem>
                <MenuItem value="30days">Last 30 Days</MenuItem>
                <MenuItem value="90days">Last 3 Months</MenuItem>
                <MenuItem value="1year">Last Year</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Meeting Type</InputLabel>
              <Select
                value={meetingFilter}
                label="Meeting Type"
                onChange={(e) => setMeetingFilter(e.target.value)}
              >
                <MenuItem value="all">All Meetings</MenuItem>
                <MenuItem value="InstantMeeting">Instant Meetings</MenuItem>
                <MenuItem value="ScheduleMeeting">Scheduled Meetings</MenuItem>
                <MenuItem value="CalendarMeeting">Calendar Meetings</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Button
              variant="outlined"
              startIcon={<FilterIcon />}
              fullWidth
              disabled
            >
              More Filters
            </Button>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              fullWidth
              disabled
            >
              Export Data
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Tabs */}
      <Box sx={{ mb: 3 }}>
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange}
          sx={{
            '& .MuiTabs-indicator': {
              backgroundColor: theme.palette.primary.main,
            },
          }}
        >
          <Tab label="OVERVIEW" />
          <Tab label="ATTENDANCE" />
          <Tab label="ENGAGEMENT" />
          {userRole === 'host' && <Tab label="REPORTS" />}
        </Tabs>
      </Box>

      {/* Loading and Error States */}
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* Tab Content */}
      <Box>
        {tabValue === 0 && <OverviewTab />}
        {tabValue === 1 && <AttendanceTab />}
        {tabValue === 2 && <EngagementTab />}
        {tabValue === 3 && userRole === 'host' && <ReportsTab />}
      </Box>
    </Container>
  );
};

export default AnalyticsPage;