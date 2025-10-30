import React, { useState, useRef } from 'react';
import {
  Box,
  Button,
  Avatar,
  IconButton,
  Typography,
  LinearProgress,
  Alert,
  Stack,
  useTheme,
  alpha,
  Fade,
  Backdrop,
  CircularProgress
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  PhotoCamera as CameraIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Close as CloseIcon
} from '@mui/icons-material';

const ImageUpload = ({
  value,
  onChange,
  onError,
  variant = "avatar", // "avatar" | "banner" | "square"
  size = "large", // "small" | "medium" | "large"
  maxSize = 5 * 1024 * 1024, // 5MB
  acceptedFormats = ['image/jpeg', 'image/png', 'image/webp'],
  showProgress = true,
  disabled = false,
  placeholder = "Upload Image",
  helperText = "",
  required = false
}) => {
  const theme = useTheme();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(value || null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const getAvatarSize = () => {
    switch (size) {
      case 'small': return 64;
      case 'medium': return 96;
      case 'large': return 128;
      default: return 96;
    }
  };

  const getBannerHeight = () => {
    switch (size) {
      case 'small': return 120;
      case 'medium': return 160;
      case 'large': return 200;
      default: return 160;
    }
  };

  const validateFile = (file) => {
    if (!file) return "No file selected";
    
    if (file.size > maxSize) {
      return `File size must be less than ${(maxSize / (1024 * 1024)).toFixed(1)}MB`;
    }
    
    if (!acceptedFormats.includes(file.type)) {
      return `Please upload ${acceptedFormats.map(f => f.split('/')[1]).join(', ')} files only`;
    }
    
    return null;
  };

  const handleFileSelect = async (file) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      if (onError) onError(validationError);
      return;
    }

    setError('');
    setUploading(true);
    setProgress(0);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target.result);
      };
      reader.readAsDataURL(file);

      // Simulate upload progress
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      // Call onChange with file
      if (onChange) {
        await onChange(file);
      }

      setProgress(100);
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 500);

    } catch (error) {
      setError(error.message || 'Upload failed');
      if (onError) onError(error.message);
      setUploading(false);
      setProgress(0);
    }
  };

  const handleInputChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    setError('');
    if (onChange) onChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openFileDialog = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const renderAvatarUpload = () => (
    <Box position="relative" display="inline-block">
      <Avatar
        src={preview}
        sx={{
          width: getAvatarSize(),
          height: getAvatarSize(),
          bgcolor: preview ? 'transparent' : alpha(theme.palette.primary.main, 0.1),
          border: dragActive ? `2px dashed ${theme.palette.primary.main}` : 'none',
          cursor: disabled ? 'default' : 'pointer',
          transition: 'all 0.3s ease',
          '&:hover': !disabled ? {
            transform: 'scale(1.05)',
            boxShadow: theme.shadows[4],
          } : {},
        }}
        onClick={openFileDialog}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {!preview && <CameraIcon sx={{ fontSize: getAvatarSize() * 0.4 }} />}
      </Avatar>

      {preview && !disabled && (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            handleRemove();
          }}
          sx={{
            position: 'absolute',
            top: -8,
            right: -8,
            bgcolor: theme.palette.error.main,
            color: 'white',
            '&:hover': {
              bgcolor: theme.palette.error.dark,
            }
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );

  const renderBannerUpload = () => (
    <Box
      sx={{
        width: '100%',
        height: getBannerHeight(),
        border: dragActive 
          ? `2px dashed ${theme.palette.primary.main}`
          : `2px dashed ${alpha(theme.palette.divider, 0.5)}`,
        borderRadius: 2,
        position: 'relative',
        overflow: 'hidden',
        cursor: disabled ? 'default' : 'pointer',
        bgcolor: preview ? 'transparent' : alpha(theme.palette.background.paper, 0.5),
        backgroundImage: preview ? `url(${preview})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transition: 'all 0.3s ease',
        '&:hover': !disabled ? {
          borderColor: theme.palette.primary.main,
          bgcolor: alpha(theme.palette.primary.main, 0.02),
        } : {},
      }}
      onClick={openFileDialog}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {!preview && (
        <Stack
          alignItems="center"
          justifyContent="center"
          height="100%"
          spacing={1}
          sx={{
            color: theme.palette.text.secondary,
          }}
        >
          <UploadIcon sx={{ fontSize: 48, opacity: 0.7 }} />
          <Typography variant="body2" textAlign="center">
            {placeholder}
          </Typography>
          <Typography variant="caption" color="text.disabled">
            Drag & drop or click to upload
          </Typography>
        </Stack>
      )}

      {preview && !disabled && (
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            handleRemove();
          }}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            bgcolor: alpha(theme.palette.background.paper, 0.9),
            '&:hover': {
              bgcolor: theme.palette.background.paper,
            }
          }}
        >
          <DeleteIcon />
        </IconButton>
      )}
    </Box>
  );

  return (
    <Box>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats.join(',')}
        onChange={handleInputChange}
        style={{ display: 'none' }}
        disabled={disabled}
      />

      {variant === 'avatar' ? renderAvatarUpload() : renderBannerUpload()}

      {/* Progress Bar */}
      {showProgress && uploading && (
        <Box mt={2}>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              borderRadius: 1,
              height: 6,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              '& .MuiLinearProgress-bar': {
                borderRadius: 1,
              }
            }}
          />
          <Typography variant="caption" color="text.secondary" mt={0.5}>
            Uploading... {progress}%
          </Typography>
        </Box>
      )}

      {/* Helper Text */}
      {helperText && !error && (
        <Typography variant="caption" color="text.secondary" mt={1} display="block">
          {helperText}
        </Typography>
      )}

      {/* Error Message */}
      {error && (
        <Fade in={!!error}>
          <Alert 
            severity="error" 
            sx={{ mt: 1 }}
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        </Fade>
      )}

      {/* Loading Backdrop */}
      <Backdrop
        sx={{ 
          color: '#fff', 
          zIndex: theme.zIndex.drawer + 1,
          bgcolor: alpha(theme.palette.background.default, 0.8)
        }}
        open={uploading}
      >
        <Stack alignItems="center" spacing={2}>
          <CircularProgress color="inherit" />
          <Typography variant="h6">Uploading...</Typography>
        </Stack>
      </Backdrop>
    </Box>
  );
};

export default ImageUpload;