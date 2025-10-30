import React, { useState } from "react";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Badge,
  Tooltip,
  useTheme,
  useMediaQuery,
  Divider,
  ListItemIcon,
  ListItemText,
  ClickAwayListener,
} from "@mui/material";
import {
  Notifications,
  Settings,
  VideoCall,
  ExitToApp,
  Person,
  KeyboardArrowDown,
} from "@mui/icons-material";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom"; // ✅ ADD useLocation
import { useNotificationContext } from "../context/NotificationContext";
import NotificationDropdown from "../components/common/NotificationDropdown";

const MainLayout = ({ children }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const { user, logout } = useAuth();
  const { unreadCount = 0 } = useNotificationContext();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const handleMenu = (event) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const handleNotificationToggle = () => {
    setNotificationOpen(!notificationOpen);
  };

  const handleNotificationClose = () => {
    setNotificationOpen(false);
  };

  const handleLogout = () => {
    logout();
    handleClose();
    navigate("/auth");
  };

  return (
    <>
      <Box
        sx={{
          flexGrow: 1,
          minHeight: "100vh",
          bgcolor: "background.default",
          position: "relative",
        }}
      >
        <AppBar
          position="fixed"
          elevation={0}
          sx={{
            bgcolor: "#3c6af6ff",
            color: "text.primary",
            borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
          }}
        >
          <Toolbar
            sx={{
              minHeight: { xs: 64, sm: 70 },
              px: { xs: 2, sm: 9, md: 4 },
            }}
          >
            {/* Left Side - Logo/Branding */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
              }}
            >
              {/* Logo */}
              {!logoError ? (
                <Box
                  component="img"
                  src="../../public/assests/images/IMeetPro.png"
                  alt="MeetPro Logo"
                  onError={() => setLogoError(true)}
                  sx={{
                    height: { xs: 42, sm: 82 },
                    width: "auto",
                    maxWidth: { xs: "120px", sm: "140px" },
                    objectFit: "contain",
                    borderRadius: "15px",
                    cursor: "pointer",
                  }}
                  onClick={() => navigate("/dashboard")}
                />
              ) : (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    cursor: "pointer",
                    py: 1,
                    px: { xs: 1, sm: 2 },
                    borderRadius: 2,
                    "&:hover": {
                      bgcolor: "rgba(45, 91, 229, 0.05)",
                    },
                  }}
                  onClick={() => navigate("/dashboard")}
                >
                  <VideoCall
                    sx={{
                      fontSize: { xs: 28, sm: 32 },
                      color: "#2d5be5ff",
                    }}
                  />
                  <Typography
                    variant={isMobile ? "h6" : "h5"}
                    sx={{
                      color: "#3c6af6ff",
                      fontWeight: "bold",
                      letterSpacing: "0.5px",
                      fontSize: { xs: "1.1rem", sm: "1.3rem" },
                    }}
                  >
                    MeetPro
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Spacer to push content to the right */}
            <Box sx={{ flexGrow: 1 }} />

            {/* Action Buttons */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: { xs: 1, sm: 1.5 },
              }}
            >
              {/* Notifications */}
              <ClickAwayListener onClickAway={handleNotificationClose}>
                <Box sx={{ position: "relative" }}>
                  <Tooltip title="Notifications">
                    <IconButton
                      onClick={handleNotificationToggle}
                      color="inherit"
                      sx={{
                        bgcolor: "#3c6af6ff",
                        color: "#ffffff",
                        border: "1px solid rgba(0, 0, 0, 0.08)",
                        "&:hover": {
                          borderColor: "primary.main",
                          transform: "translateY(-1px)",
                        },
                        transition: "all 0.2s ease-in-out",
                      }}
                    >
                      <Badge
                        badgeContent={unreadCount}
                        sx={{
                          "& .MuiBadge-badge": {
                            bgcolor: "#EF4444",
                            color: "#ffffff",
                            fontSize: "0.7rem",
                            minWidth: "18px",
                            height: "18px",
                            boxShadow: "0 2px 8px rgba(239, 68, 68, 0.4)",
                          },
                        }}
                      >
                        <Notifications />
                      </Badge>
                    </IconButton>
                  </Tooltip>

                  {/* ✅ FIXED: Notification Dropdown - removed comment from prop */}
                  <NotificationDropdown
                    open={notificationOpen}
                    onClose={handleNotificationClose}
                    filterType="all"
                  />
                </Box>
              </ClickAwayListener>

              {/* Profile Menu */}
              <Tooltip title="Profile Menu">
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    color: "#ffffff",
                  }}
                >
                  <IconButton
                    onClick={handleMenu}
                    sx={{
                      p: 0.5,
                      bgcolor: "#3c6af6ff",
                      borderRadius: "12px",
                      "&:hover": {
                        bgcolor: "#3c6af6ff",
                        color: "#ffffff",
                      },
                      transition: "all 0.2s ease-in-out",
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", px: 1 }}>
                      <Avatar
                        src={user?.profile_picture}
                        sx={{
                          width: { xs: 32, sm: 36 },
                          height: { xs: 32, sm: 36 },
                          border: "2px solid rgba(255,255,255,0.5)",
                          mr: !isMobile ? 1 : 0,
                        }}
                      >
                        {user?.full_name?.charAt(0) || "U"}
                      </Avatar>
                    </Box>
                  </IconButton>
                </Box>
              </Tooltip>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Profile Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
          PaperProps={{
            sx: {
              mt: 2,
              borderRadius: 1,
              minWidth: 250,
              boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
              border: "1px solid rgba(0,0,0,0.05)",
              overflow: "hidden",
            },
          }}
          transformOrigin={{ horizontal: "right", vertical: "top" }}
          anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        >
          {/* Profile Header */}
          <Box sx={{ p: 3, bgcolor: "primary.main", color: "#ffffff" }}>
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <Avatar
                src={user?.profile_picture}
                sx={{
                  width: 50,
                  height: 50,
                  mr: 2,
                  border: "3px solid rgba(255,255,255,0.3)",
                }}
              >
                {user?.full_name?.charAt(0) || "S"}
              </Avatar>
              <Box>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 600, lineHeight: 1.2 }}
                >
                  {user?.full_name || "U"}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ opacity: 0.8, fontSize: "0.8rem" }}
                >
                  {user?.email || "User@gmail.com"}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Divider />

          {/* Menu Items */}
          <MenuItem
            onClick={() => {
              navigate("/profile");
              handleClose();
            }}
            sx={{ py: 1.5 }}
          >
            <ListItemIcon>
              <Person fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="My Profile"
              secondary="View and edit profile"
              secondaryTypographyProps={{ fontSize: "0.75rem" }}
            />
          </MenuItem>

          <MenuItem
            onClick={() => {
              navigate("/settings");
              handleClose();
            }}
            sx={{ py: 1.5 }}
          >
            <ListItemIcon>
              <Settings fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Settings"
              secondary="App preferences"
              secondaryTypographyProps={{ fontSize: "0.75rem" }}
            />
          </MenuItem>

          <Divider />

          <MenuItem
            onClick={handleLogout}
            sx={{ py: 1.5, color: "error.main" }}
          >
            <ListItemIcon>
              <ExitToApp fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText
              primary="Sign Out"
              secondary="See you later!"
              secondaryTypographyProps={{ fontSize: "0.75rem" }}
            />
          </MenuItem>
        </Menu>

        {/* Main Content */}
        <Box
          component="main"
          sx={{
            mt: { xs: 8, sm: 8.75 },
            minHeight: { xs: "calc(100vh - 64px)", sm: "calc(100vh - 70px)" },
            bgcolor: "background.default",
          }}
        >
          {children}
        </Box>
      </Box>
    </>
  );
};

export default MainLayout;