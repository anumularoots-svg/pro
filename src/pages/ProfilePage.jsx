import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  TextField,
  Stack,
  Avatar,
  Divider,
  useTheme,
  alpha,
  Paper,
  IconButton,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Alert,
  Snackbar,
  InputAdornment,
  OutlinedInput,
  Breadcrumbs,
  Link,
  Tooltip,
  Badge,
  LinearProgress,
  CardHeader,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
} from "@mui/material";
import {
  Person as PersonIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  PhotoCamera as CameraIcon,
  Security as SecurityIcon,
  Notifications as NotificationIcon,
  Language as LanguageIcon,
  LocationOn as LocationIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Business as BusinessIcon,
  Home as HomeIcon,
  NavigateNext as NavigateNextIcon,
  VerifiedUser as VerifiedIcon,
  Star as StarIcon,
  Settings as SettingsIcon,
  Visibility as VisibilityIcon,
  VolumeUp as AudioIcon,
  Videocam as VideoIcon,
  Shield as ShieldIcon,
  AccountCircle as AccountIcon,
  CloudUpload as UploadIcon,
} from "@mui/icons-material";
import DashboardLayout from "../layouts/DashboardLayout";
import ImageUpload from "../components/common/ImageUpload";
import { useAuth } from "../hooks/useAuth";

// ✅ API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://192.168.48.201:8221';

const ProfilePage = () => {
  const navigate = useNavigate();
  
  // —— Canonical normalizers ——
  const asArray = (v, fb = []) =>
    Array.isArray(v)
      ? v
      : v == null || v === ""
      ? fb
      : typeof v === "string"
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [v];

  const asBool = (v, fb = false) => (typeof v === "boolean" ? v : fb);

  const mapUserToForm = (u) => ({
    id: u?.id ?? u?.Id ?? u?.user_id ?? u?.ID ?? null,
    full_name: u?.full_name ?? u?.name ?? "",
    email: u?.email ?? "",
    phone_number: u?.phone_number ?? u?.phone ?? "",
    address: u?.address ?? "",
    country: u?.country ?? "",
    languages: asArray(u?.languages, ["English"]),
    profile_picture: u?.profile_picture ?? u?.profile_photo ?? "", // Support both field names
    email_notifications: asBool(u?.email_notifications, true),
    meeting_reminders: asBool(u?.meeting_reminders, true),
    recording_notifications: asBool(u?.recording_notifications, true),
    show_email: asBool(u?.show_email, true),
    show_phone: asBool(u?.show_phone, false),
    auto_join_audio: asBool(u?.auto_join_audio, true),
    auto_join_video: asBool(u?.auto_join_video, false),
  });

  const theme = useTheme();
  const { user, updateProfile } = useAuth();
  console.log("DEBUG ProfilePage user object:", user);
  
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState(() => mapUserToForm(user));
  const [originalData, setOriginalData] = useState(() => mapUserToForm(user));
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  // Countries list
  const countries = [
    "United States",
    "Canada",
    "United Kingdom",
    "Germany",
    "France",
    "India",
    "Japan",
    "Australia",
    "Brazil",
    "Mexico",
    "China",
    "South Korea",
    "Italy",
    "Spain",
    "Netherlands",
    "Sweden",
    "Norway",
    "Denmark",
    "Switzerland",
  ];

  // Languages list
  const languages = [
    "English",
    "Spanish",
    "French",
    "German",
    "Italian",
    "Portuguese",
    "Chinese",
    "Japanese",
    "Korean",
    "Hindi",
    "Arabic",
    "Russian",
  ];

  const normalizeLanguages = (languageData) => asArray(languageData);

  console.log("formdata", formData);

  useEffect(() => {
    if (user) {
      const mapped = mapUserToForm(user);
      console.log('📸 ProfilePage mapped user data:', {
        profile_picture: mapped.profile_picture?.substring(0, 100),
        has_picture: !!mapped.profile_picture
      });
      setFormData(mapped);
      setOriginalData(mapped);
    }
  }, [user]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleLanguageChange = (event) => {
    setFormData((prev) => ({
      ...prev,
      languages: asArray(event.target.value),
    }));
  };

  // ✅ CORRECTED: Handle profile picture change using dedicated photo endpoint
  const handleProfilePictureChange = async (imageData) => {
    console.log('📸 Profile picture changed:', {
      hasData: !!imageData,
      dataLength: imageData?.length,
      dataPreview: imageData?.substring(0, 100)
    });
    
    if (imageData) {
      // Update local state immediately for instant preview
      handleInputChange("profile_picture", imageData);
      
      // ✅ Save to backend using DEDICATED PHOTO ENDPOINT
      setLoading(true);
      try {
        const userId = formData.id ?? user?.id ?? user?.Id ?? user?.ID;
        
        if (!userId) {
          throw new Error('User ID not found');
        }
        
        console.log('💾 Calling photo update endpoint for user:', userId);
        
        // ✅ Use the correct endpoint: /api/update-photo/{user_id}/
        const response = await fetch(`${API_BASE_URL}/api/update-photo/${userId}/`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            profile_photo: imageData  // Backend expects 'profile_photo' field
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.Error || 'Failed to update photo');
        }

        const data = await response.json();
        
        console.log('✅ Photo update response:', data);
        
        // Backend returns: { photo_id, s3_url, content_type, file_size }
        const photoUrl = data.s3_url || data.photo_data || imageData;
        
        // Update both formData and originalData to keep them in sync
        setFormData(prev => ({ ...prev, profile_picture: photoUrl }));
        setOriginalData(prev => ({ ...prev, profile_picture: photoUrl }));
        
        // ✅ Update user in localStorage
        const updatedUser = {
          ...user,
          profile_picture: photoUrl,
          profile_photo: photoUrl, // For compatibility
        };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        
        // Dispatch events to notify MainLayout and other components
        window.dispatchEvent(new CustomEvent('userUpdated', {
          detail: { user: updatedUser }
        }));
        
        window.dispatchEvent(new CustomEvent('profilePictureUpdated', {
          detail: { 
            profile_picture: photoUrl,
            user: updatedUser
          }
        }));
        
        setSnackbar({
          open: true,
          message: "Profile picture updated successfully!",
          severity: "success",
        });
        
        console.log('✅ Profile picture saved to backend and event dispatched');
        
      } catch (error) {
        console.error("❌ Profile picture save error:", error);
        setSnackbar({
          open: true,
          message: error.message || "Failed to update profile picture. Please try again.",
          severity: "error",
        });
        // Revert to original on error
        handleInputChange("profile_picture", originalData.profile_picture);
      } finally {
        setLoading(false);
      }
    } else {
      // Handle photo removal
      setLoading(true);
      try {
        const userId = formData.id ?? user?.id ?? user?.Id ?? user?.ID;
        
        // ✅ Call delete photo endpoint
        const response = await fetch(`${API_BASE_URL}/api/delete-photo/${userId}/`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (!response.ok) {
          throw new Error('Failed to remove photo');
        }
        
        handleInputChange("profile_picture", "");
        setOriginalData(prev => ({ ...prev, profile_picture: "" }));
        
        // Update localStorage
        const updatedUser = { ...user, profile_picture: "", profile_photo: "" };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        
        // Dispatch events
        window.dispatchEvent(new CustomEvent('userUpdated', {
          detail: { user: updatedUser }
        }));
        
        window.dispatchEvent(new CustomEvent('profilePictureUpdated', {
          detail: { profile_picture: "", user: updatedUser }
        }));
        
        setSnackbar({
          open: true,
          message: "Profile picture removed successfully!",
          severity: "success",
        });
      } catch (error) {
        console.error("❌ Profile picture removal error:", error);
        setSnackbar({
          open: true,
          message: "Failed to remove profile picture.",
          severity: "error",
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSave = async () => {
  setLoading(true);
  try {
    // ✅ Validate required fields before sending
    if (!formData.full_name || formData.full_name.trim() === "") {
      setSnackbar({
        open: true,
        message: "Full name is required",
        severity: "error",
      });
      setLoading(false);
      return;
    }

    // ✅ Prepare clean update payload
    const userId = formData.id ?? user?.id ?? user?.Id ?? user?.ID;
    
    const updatePayload = {
      full_name: formData.full_name.trim(),
      email: formData.email || user?.email || "",
      phone_number: formData.phone_number || "",
      address: formData.address || "",
      country: formData.country || "",
      languages: Array.isArray(formData.languages) 
        ? formData.languages 
        : formData.languages ? [formData.languages] : ["English"],
      email_notifications: formData.email_notifications ?? true,
      meeting_reminders: formData.meeting_reminders ?? true,
      recording_notifications: formData.recording_notifications ?? true,
      show_email: formData.show_email ?? true,
      show_phone: formData.show_phone ?? false,
      auto_join_audio: formData.auto_join_audio ?? true,
      auto_join_video: formData.auto_join_video ?? false,
    };

    console.log('💾 Saving profile with payload:', updatePayload);

    await updateProfile(updatePayload);

    setOriginalData(formData);
    setEditing(false);
    setSnackbar({
      open: true,
      message: "Profile updated successfully!",
      severity: "success",
    });
  } catch (error) {
    console.error("Profile update error:", error);
    setSnackbar({
      open: true,
      message: error.message || "Failed to update profile. Please try again.",
      severity: "error",
    });
  } finally {
    setLoading(false);
  }
};

  const handleCancel = () => {
    setFormData(originalData);
    setEditing(false);
  };

  const renderLanguageChips = () => {
    const languageArray = normalizeLanguages(formData.languages);

    if (languageArray.length === 0) {
      return (
        <Chip
          label="No languages set"
          size="small"
          variant="outlined"
          sx={{ opacity: 0.6 }}
        />
      );
    }

    return languageArray.map((lang, index) => (
      <Chip
        key={`${lang}-${index}`}
        label={lang}
        size="small"
        color="primary"
        variant="outlined"
        sx={{
          borderRadius: 1.5,
          fontWeight: 500,
          fontSize: '0.75rem',
        }}
      />
    ));
  };

  return (
    <DashboardLayout>
      <Box
        sx={{
          flexGrow: 1,
          backgroundColor: '#fafafa',
          minHeight: "100vh",
          pt: 2,
        }}
      >
        <Container maxWidth="xl" sx={{ py: 4 }}>
          {/* Professional Header with Breadcrumbs */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 4,
              backgroundColor: 'white',
              borderRadius: 2,
              border: '1px solid',
              borderColor: theme.palette.divider,
            }}
          >
            <Stack spacing={3}>
              <Breadcrumbs
                separator={<NavigateNextIcon fontSize="small" />}
                sx={{ color: 'text.secondary' }}
              >
                <Link
                  component="button"
                  variant="body2"
                  underline="hover"
                  color="inherit"
                  onClick={() => {
                    navigate('/dashboard');
                  }}
                  sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 0.5,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    '&:hover': {
                      color: theme.palette.primary.main,
                    }
                  }}
                >
                  <HomeIcon fontSize="small" />
                  Dashboard
                </Link>
                <Typography
                  variant="body2"
                  color="text.primary"
                  sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 0.5, 
                    fontWeight: 600,
                    color: theme.palette.primary.main,
                  }}
                >
                  <PersonIcon fontSize="small" />
                  Profile
                </Typography>
              </Breadcrumbs>

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                justifyContent="space-between"
                spacing={3}
              >
                <Box>
                  <Typography 
                    variant="h4" 
                    fontWeight={700} 
                    color="text.primary"
                    sx={{ mb: 1 }}
                  >
                    Profile Management
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    Manage your personal information, preferences, and account settings
                  </Typography>
                </Box>

                {!editing ? (
                  <Button
                    variant="contained"
                    startIcon={<EditIcon />}
                    onClick={() => setEditing(true)}
                    size="large"
                    sx={{
                      borderRadius: 2,
                      textTransform: "none",
                      px: 4,
                      py: 1.5,
                      fontWeight: 600,
                      boxShadow: theme.shadows[3],
                      '&:hover': {
                        boxShadow: theme.shadows[6],
                      }
                    }}
                  >
                    Edit Profile
                  </Button>
                ) : (
                  <Stack direction="row" spacing={2}>
                    <Button
                      variant="outlined"
                      startIcon={<CancelIcon />}
                      onClick={handleCancel}
                      size="large"
                      sx={{ 
                        textTransform: "none",
                        borderRadius: 2,
                        px: 3,
                        fontWeight: 600,
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={handleSave}
                      disabled={loading}
                      size="large"
                      sx={{ 
                        textTransform: "none",
                        borderRadius: 2,
                        px: 3,
                        fontWeight: 600,
                        boxShadow: theme.shadows[3],
                        '&:hover': {
                          boxShadow: theme.shadows[6],
                        }
                      }}
                    >
                      {loading ? "Saving..." : "Save Changes"}
                    </Button>
                  </Stack>
                )}
              </Stack>
            </Stack>
          </Paper>

          {loading && (
            <LinearProgress 
              sx={{ 
                mb: 2,
                borderRadius: 1,
                height: 4,
              }} 
            />
          )}

          <Grid container spacing={4}>
            {/* Left Column - Enhanced Profile Card with ImageUpload */}
            <Grid item xs={12} lg={4}>
              <Stack spacing={3}>
                {/* Main Profile Card */}
                <Card 
                  elevation={0}
                  sx={{ 
                    border: '1px solid',
                    borderColor: theme.palette.divider,
                    borderRadius: 3,
                  }}
                >
                  <CardContent sx={{ p: 4 }}>
                    <Stack alignItems="center" spacing={3}>
                      {/* Profile Picture Upload Section */}
                      <Stack alignItems="center" spacing={2}>
                        {/* Profile Picture Upload Section - Always Editable */}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            fontSize: '0.75rem',
                            fontWeight: 500,
                          }}
                        >
                          <UploadIcon fontSize="small" />
                          Click avatar to update photo - saves automatically
                        </Typography>

                        {/* Use ImageUpload Component */}
                        <ImageUpload
                          value={formData.profile_picture}
                          onChange={handleProfilePictureChange}
                          variant="avatar"
                          size="large"
                          maxSize={5 * 1024 * 1024} // 5MB
                          acceptedFormats={['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']}
                          disabled={loading}
                          editable={true} // Always editable - saves immediately
                          userName={formData.full_name || "User"}
                          helperText="Click or drag to upload (Max 5MB) - Saves automatically"
                          showProgress={true}
                        />

                      </Stack>

                      <Stack alignItems="center" spacing={1}>
                        <Typography variant="h5" fontWeight={700} textAlign="center">
                          {formData.full_name || "Your Name"}
                        </Typography>
                        <Typography variant="body1" color="text.secondary" textAlign="center">
                          {formData.email}
                        </Typography>
                        {formData.country && (
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <LocationIcon fontSize="small" color="action" />
                            <Typography variant="body2" color="text.secondary">
                              {formData.country}
                            </Typography>
                          </Stack>
                        )}
                      </Stack>

                      <Divider sx={{ width: '100%' }} />

                      <Box sx={{ width: '100%' }}>
                        <Typography variant="subtitle2" fontWeight={600} mb={2} color="text.secondary">
                          LANGUAGES
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
                          {renderLanguageChips()}
                        </Stack>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>

                {/* Account Status Card */}
                <Card 
                  elevation={0}
                  sx={{ 
                    border: '1px solid',
                    borderColor: theme.palette.divider,
                    borderRadius: 3,
                  }}
                >
                  <CardHeader
                    title="Account Overview"
                    titleTypographyProps={{ 
                      variant: 'h6', 
                      fontWeight: 600,
                      color: 'text.primary'
                    }}
                    avatar={
                      <AccountIcon color="primary" />
                    }
                  />
                  <CardContent sx={{ pt: 0 }}>
                    <List disablePadding>
                      <ListItem disableGutters>
                        <ListItemIcon>
                          <StarIcon color="primary" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText 
                          primary="Account Type"
                          primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                        />
                        <ListItemSecondaryAction>
                          <Chip 
                            label="Premium" 
                            color="primary" 
                            size="small"
                            sx={{ fontWeight: 600 }}
                          />
                        </ListItemSecondaryAction>
                      </ListItem>
                      
                      <ListItem disableGutters>
                        <ListItemIcon>
                          <VerifiedIcon color="success" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText 
                          primary="Verification Status"
                          primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                        />
                        <ListItemSecondaryAction>
                          <Chip 
                            label="Verified" 
                            color="success" 
                            size="small"
                            sx={{ fontWeight: 600 }}
                          />
                        </ListItemSecondaryAction>
                      </ListItem>

                      <ListItem disableGutters>
                        <ListItemIcon>
                          <PersonIcon color="action" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText 
                          primary="Member Since"
                          primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                        />
                        <ListItemSecondaryAction>
                          <Typography variant="body2" fontWeight={600}>
                            {user?.created_at
                              ? new Date(user.created_at).getFullYear()
                              : "2024"}
                          </Typography>
                        </ListItemSecondaryAction>
                      </ListItem>

                      <ListItem disableGutters>
                        <ListItemIcon>
                          <ShieldIcon 
                            color={user?.is_active !== false ? "success" : "error"} 
                            fontSize="small" 
                          />
                        </ListItemIcon>
                        <ListItemText 
                          primary="Account Status"
                          primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                        />
                        <ListItemSecondaryAction>
                          <Chip
                            label={user?.is_active !== false ? "Active" : "Inactive"}
                            color={user?.is_active !== false ? "success" : "error"}
                            size="small"
                            sx={{ fontWeight: 600 }}
                          />
                        </ListItemSecondaryAction>
                      </ListItem>
                    </List>
                  </CardContent>
                </Card>
              </Stack>
            </Grid>

            {/* Right Column - Enhanced Form */}
            <Grid item xs={12} lg={8}>
              <Stack spacing={4}>
                {/* Personal Information */}
                <Card 
                  elevation={0}
                  sx={{ 
                    border: '1px solid',
                    borderColor: theme.palette.divider,
                    borderRadius: 3,
                  }}
                >
                  <CardHeader
                    title="Personal Information"
                    subheader="Update your personal details and contact information"
                    titleTypographyProps={{ 
                      variant: 'h6', 
                      fontWeight: 600 
                    }}
                    subheaderTypographyProps={{ 
                      variant: 'body2',
                      color: 'text.secondary'
                    }}
                    avatar={
                      <PersonIcon color="primary" />
                    }
                  />
                  <CardContent>
                    <Grid container spacing={3}>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Full Name"
                          value={formData.full_name}
                          onChange={(e) => handleInputChange("full_name", e.target.value)}
                          disabled={!editing}
                          variant="outlined"
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              borderRadius: 2,
                            }
                          }}
                        />
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Email Address"
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleInputChange("email", e.target.value)}
                          disabled={!editing}
                          variant="outlined"
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <EmailIcon sx={{ color: "text.secondary" }} />
                              </InputAdornment>
                            ),
                          }}
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              borderRadius: 2,
                            }
                          }}
                        />
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Phone Number"
                          value={formData.phone_number}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                            handleInputChange("phone_number", v);
                          }}
                          disabled={!editing}
                          variant="outlined"
                          inputProps={{
                            maxLength: 10,
                            inputMode: "numeric",
                            pattern: "[0-9]*",
                          }}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <PhoneIcon sx={{ color: "text.secondary" }} />
                              </InputAdornment>
                            ),
                          }}
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              borderRadius: 2,
                            }
                          }}
                        />
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth disabled={!editing}>
                          <InputLabel>Country</InputLabel>
                          <Select
                            label="Country"
                            value={formData.country}
                            onChange={(e) => handleInputChange("country", e.target.value)}
                            input={
                              <OutlinedInput
                                label="Country"
                                startAdornment={
                                  <InputAdornment position="start">
                                    <LocationIcon sx={{ color: "text.secondary" }} />
                                  </InputAdornment>
                                }
                                sx={{ borderRadius: 2 }}
                              />
                            }
                            MenuProps={{
                              PaperProps: { 
                                style: { 
                                  maxHeight: 320,
                                  borderRadius: 12,
                                } 
                              },
                            }}
                          >
                            {countries.map((country) => (
                              <MenuItem key={country} value={country}>
                                {country}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          label="Address"
                          value={formData.address}
                          onChange={(e) => handleInputChange("address", e.target.value)}
                          disabled={!editing}
                          variant="outlined"
                          multiline
                          rows={3}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <BusinessIcon sx={{ color: "text.secondary" }} />
                              </InputAdornment>
                            ),
                          }}
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              borderRadius: 2,
                            }
                          }}
                        />
                      </Grid>
                      
                      <Grid item xs={12}>
                        <FormControl fullWidth disabled={!editing}>
                          <InputLabel>Languages</InputLabel>
                          <Select
                            multiple
                            label="Languages"
                            value={normalizeLanguages(formData.languages)}
                            onChange={handleLanguageChange}
                            input={
                              <OutlinedInput
                                label="Languages"
                                startAdornment={
                                  <InputAdornment position="start">
                                    <LanguageIcon sx={{ color: "text.secondary" }} />
                                  </InputAdornment>
                                }
                                sx={{ borderRadius: 2 }}
                              />
                            }
                            renderValue={(selected) => (
                              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                {normalizeLanguages(selected).map((value, index) => (
                                  <Chip
                                    key={`${value}-${index}`}
                                    label={value}
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                    sx={{ borderRadius: 1.5 }}
                                  />
                                ))}
                              </Box>
                            )}
                            MenuProps={{
                              PaperProps: { 
                                style: { 
                                  maxHeight: 320,
                                  borderRadius: 12,
                                } 
                              },
                            }}
                          >
                            {languages.map((language) => (
                              <MenuItem key={language} value={language}>
                                {language}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>

                {/* Notification Preferences */}
                <Card 
                  elevation={0}
                  sx={{ 
                    border: '1px solid',
                    borderColor: theme.palette.divider,
                    borderRadius: 3,
                  }}
                >
                  <CardHeader
                    title="Notification Preferences"
                    subheader="Manage how you receive updates and reminders"
                    titleTypographyProps={{ 
                      variant: 'h6', 
                      fontWeight: 600 
                    }}
                    subheaderTypographyProps={{ 
                      variant: 'body2',
                      color: 'text.secondary'
                    }}
                    avatar={
                      <NotificationIcon color="primary" />
                    }
                  />
                  <CardContent>
                    <List disablePadding>
                      <ListItem disableGutters>
                        <ListItemIcon>
                          <EmailIcon color="action" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Email Notifications"
                          secondary="Receive important updates via email"
                          primaryTypographyProps={{ fontWeight: 500 }}
                        />
                        <ListItemSecondaryAction>
                          <Switch
                            checked={formData.email_notifications}
                            onChange={(e) => handleInputChange("email_notifications", e.target.checked)}
                            disabled={!editing}
                            color="primary"
                          />
                        </ListItemSecondaryAction>
                      </ListItem>

                      <ListItem disableGutters>
                        <ListItemIcon>
                          <NotificationIcon color="action" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Meeting Reminders"
                          secondary="Get notified before scheduled meetings"
                          primaryTypographyProps={{ fontWeight: 500 }}
                        />
                        <ListItemSecondaryAction>
                          <Switch
                            checked={formData.meeting_reminders}
                            onChange={(e) => handleInputChange("meeting_reminders", e.target.checked)}
                            disabled={!editing}
                            color="primary"
                          />
                        </ListItemSecondaryAction>
                      </ListItem>

                      <ListItem disableGutters>
                        <ListItemIcon>
                          <VideoIcon color="action" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Recording Notifications"
                          secondary="Alerts when recordings are available"
                          primaryTypographyProps={{ fontWeight: 500 }}
                        />
                        <ListItemSecondaryAction>
                          <Switch
                            checked={formData.recording_notifications}
                            onChange={(e) => handleInputChange("recording_notifications", e.target.checked)}
                            disabled={!editing}
                            color="primary"
                          />
                        </ListItemSecondaryAction>
                      </ListItem>
                    </List>
                  </CardContent>
                </Card>

                {/* Privacy & Meeting Settings */}
                <Card 
                  elevation={0}
                  sx={{ 
                    border: '1px solid',
                    borderColor: theme.palette.divider,
                    borderRadius: 3,
                  }}
                >
                  <CardHeader
                    title="Privacy & Meeting Settings"
                    subheader="Control your privacy and default meeting preferences"
                    titleTypographyProps={{ 
                      variant: 'h6', 
                      fontWeight: 600 
                    }}
                    subheaderTypographyProps={{ 
                      variant: 'body2',
                      color: 'text.secondary'
                    }}
                    avatar={
                      <SecurityIcon color="primary" />
                    }
                  />
                  <CardContent>
                    <List disablePadding>
                      <ListItem disableGutters>
                        <ListItemIcon>
                          <VisibilityIcon color="action" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Show Email to Participants"
                          secondary="Display your email address to other meeting participants"
                          primaryTypographyProps={{ fontWeight: 500 }}
                        />
                        <ListItemSecondaryAction>
                          <Switch
                            checked={formData.show_email}
                            onChange={(e) => handleInputChange("show_email", e.target.checked)}
                            disabled={!editing}
                            color="primary"
                          />
                        </ListItemSecondaryAction>
                      </ListItem>

                      <ListItem disableGutters>
                        <ListItemIcon>
                          <PhoneIcon color="action" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Show Phone Number to Participants"
                          secondary="Display your phone number to other meeting participants"
                          primaryTypographyProps={{ fontWeight: 500 }}
                        />
                        <ListItemSecondaryAction>
                          <Switch
                            checked={formData.show_phone}
                            onChange={(e) => handleInputChange("show_phone", e.target.checked)}
                            disabled={!editing}
                            color="primary"
                          />
                        </ListItemSecondaryAction>
                      </ListItem>

                      <Divider sx={{ my: 2 }} />

                      <ListItem disableGutters>
                        <ListItemIcon>
                          <AudioIcon color="action" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Auto-join Audio in Meetings"
                          secondary="Automatically connect audio when joining meetings"
                          primaryTypographyProps={{ fontWeight: 500 }}
                        />
                        <ListItemSecondaryAction>
                          <Switch
                            checked={formData.auto_join_audio}
                            onChange={(e) => handleInputChange("auto_join_audio", e.target.checked)}
                            disabled={!editing}
                            color="primary"
                          />
                        </ListItemSecondaryAction>
                      </ListItem>

                      <ListItem disableGutters>
                        <ListItemIcon>
                          <VideoIcon color="action" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Auto-join Video in Meetings"
                          secondary="Automatically start video when joining meetings"
                          primaryTypographyProps={{ fontWeight: 500 }}
                        />
                        <ListItemSecondaryAction>
                          <Switch
                            checked={formData.auto_join_video}
                            onChange={(e) => handleInputChange("auto_join_video", e.target.checked)}
                            disabled={!editing}
                            color="primary"
                          />
                        </ListItemSecondaryAction>
                      </ListItem>
                    </List>
                  </CardContent>
                </Card>
              </Stack>
            </Grid>
          </Grid>
        </Container>

        {/* Enhanced Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert
            onClose={() => setSnackbar({ ...snackbar, open: false })}
            severity={snackbar.severity}
            variant="filled"
            sx={{ 
              width: "100%",
              borderRadius: 2,
              boxShadow: theme.shadows[8],
            }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </DashboardLayout>
  );
};

export default ProfilePage;