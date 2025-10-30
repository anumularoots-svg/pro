// // FIXED: Sidebar.jsx - Updated submenu navigation paths
// import React, { useState } from 'react';
// import { 
//   Drawer, 
//   List, 
//   ListItem, 
//   ListItemIcon, 
//   ListItemText,
//   Divider,
//   Typography,
//   Box,
//   Collapse,
//   IconButton,
//   Badge,
//   Tooltip,
//   useTheme,
//   useMediaQuery
// } from '@mui/material';
// import { 
//   Dashboard,
//   VideoCall,
//   Schedule,
//   CalendarMonth,
//   VideoLibrary,
//   Analytics,
//   Settings,
//   Person,
//   ExpandLess,
//   ExpandMore,
//   Add,
//   ChevronLeft,
//   ChevronRight,
//   AccessTime,
//   Event,
//   PlayCircle
// } from '@mui/icons-material';
// import { useNavigate, useLocation } from 'react-router-dom';

// const Sidebar = ({ open, onClose, variant = 'temporary' }) => {
//   const [meetingSubmenuOpen, setMeetingSubmenuOpen] = useState(false);
//   const [collapsed, setCollapsed] = useState(false);
//   const navigate = useNavigate();
//   const location = useLocation();
//   const theme = useTheme();
//   const isMobile = useMediaQuery(theme.breakpoints.down('md'));

//   const mainMenuItems = [
//     { 
//       text: 'Dashboard', 
//       icon: <Dashboard />, 
//       path: '/dashboard',
//       badge: null
//     },
//     { 
//       text: 'New Meeting', 
//       icon: <VideoCall />, 
//       path: '/meeting/new',
//       badge: null,
//       hasSubmenu: true,
//       submenu: [
//         { 
//           text: 'Instant Meeting', 
//           icon: <PlayCircle />, 
//           path: '/meeting/instant' // Create instant meeting
//         },
//         { 
//           text: 'Schedule Meeting', 
//           icon: <AccessTime />, 
//           path: '/meeting/schedule' // Go to schedule meeting page
//         },
//         { 
//           text: 'Calendar Meeting', 
//           icon: <Event />, 
//           path: '/meeting/calendar' // Go to calendar meeting page
//         }
//       ]
//     },
//     { 
//       text: 'Schedule', 
//       icon: <Schedule />, 
//       path: '/schedule',
//       badge: 3
//     },
//     { 
//       text: 'Calendar', 
//       icon: <CalendarMonth />, 
//       path: '/calendar',
//       badge: null
//     },
//     { 
//       text: 'Recordings', 
//       icon: <VideoLibrary />, 
//       path: '/recordings',
//       badge: 5
//     },
//     { 
//       text: 'Analytics', 
//       icon: <Analytics />, 
//       path: '/analytics',
//       badge: null
//     },
//   ];

//   const bottomMenuItems = [
//     { text: 'Profile', icon: <Person />, path: '/profile' },
//     { text: 'Settings', icon: <Settings />, path: '/settings' },
//   ];

//   const handleItemClick = (item) => {
//     if (item.hasSubmenu) {
//       setMeetingSubmenuOpen(!meetingSubmenuOpen);
//     } else {
//       navigate(item.path);
//       if (isMobile && onClose) {
//         onClose();
//       }
//     }
//   };

//   const handleSubmenuClick = (item) => {
//     navigate(item.path);
//     if (isMobile && onClose) {
//       onClose();
//     }
//     // FIXED: Close submenu after navigation
//     setMeetingSubmenuOpen(false);
//   };

//   const isSelected = (path) => location.pathname === path;

//   const drawerWidth = collapsed ? 72 : 280;

//   const drawerContent = (
//     <Box sx={{ 
//       height: '100%', 
//       display: 'flex', 
//       flexDirection: 'column',
//       bgcolor: 'background.paper'
//     }}>
//       {/* Header */}
//       <Box sx={{ 
//         p: collapsed ? 1 : 3, 
//         textAlign: 'center', 
//         bgcolor: 'primary.main',
//         position: 'relative'
//       }}>
//         {!collapsed && (
//           <>
//             <VideoCall sx={{ fontSize: 40, color: 'white', mb: 1 }} />
//             <Typography
//               variant="h5"
//               sx={{
//                 color: 'white',
//                 fontWeight: 'bold',
//                 textShadow: '0 2px 4px rgba(0,0,0,0.3)'
//               }}
//             >
//               MeetPro
//             </Typography>
//           </>
//         )}
        
//         {collapsed && (
//           <VideoCall sx={{ fontSize: 32, color: 'white', my: 1 }} />
//         )}

//         {/* Collapse Toggle - Desktop Only */}
//         {!isMobile && variant === 'permanent' && (
//           <IconButton
//             onClick={() => setCollapsed(!collapsed)}
//             sx={{
//               position: 'absolute',
//               right: -12,
//               top: '50%',
//               transform: 'translateY(-50%)',
//               bgcolor: 'background.paper',
//               border: '1px solid',
//               borderColor: 'divider',
//               width: 24,
//               height: 24,
//               '&:hover': { bgcolor: 'action.hover' }
//             }}
//           >
//             {collapsed ? <ChevronRight fontSize="small" /> : <ChevronLeft fontSize="small" />}
//           </IconButton>
//         )}
//       </Box>
      
//       {/* Main Menu */}
//       <List sx={{ flexGrow: 1, px: collapsed ? 1 : 2, py: 2 }}>
//         {mainMenuItems.map((item) => (
//           <Box key={item.text}>
//             <Tooltip title={collapsed ? item.text : ''} placement="right">
//               <ListItem
//                 button
//                 onClick={() => handleItemClick(item)}
//                 selected={isSelected(item.path)}
//                 sx={{
//                   borderRadius: 2,
//                   mb: 1,
//                   minHeight: 48,
//                   justifyContent: collapsed ? 'center' : 'flex-start',
//                   px: collapsed ? 1 : 2,
//                   bgcolor: isSelected(item.path) ? 'primary.light' : 'transparent',
//                   color: isSelected(item.path) ? 'primary.contrastText' : 'text.primary',
//                   '&:hover': {
//                     bgcolor: isSelected(item.path) ? 'primary.main' : 'action.hover',
//                     transform: 'translateX(4px)'
//                   },
//                   '&.Mui-selected': {
//                     bgcolor: 'primary.light',
//                     '&:hover': { bgcolor: 'primary.main' },
//                   },
//                   transition: 'all 0.2s ease-in-out'
//                 }}
//               >
//                 <ListItemIcon sx={{ 
//                   color: 'inherit', 
//                   minWidth: collapsed ? 'auto' : 40,
//                   justifyContent: 'center'
//                 }}>
//                   {item.badge && !collapsed ? (
//                     <Badge badgeContent={item.badge} color="error">
//                       {item.icon}
//                     </Badge>
//                   ) : (
//                     item.icon
//                   )}
//                 </ListItemIcon>
                
//                 {!collapsed && (
//                   <>
//                     <ListItemText 
//                       primary={item.text} 
//                       primaryTypographyProps={{ fontWeight: 500 }}
//                     />
//                     {item.badge && (
//                       <Badge badgeContent={item.badge} color="error" />
//                     )}
//                     {item.hasSubmenu && (
//                       meetingSubmenuOpen ? <ExpandLess /> : <ExpandMore />
//                     )}
//                   </>
//                 )}
//               </ListItem>
//             </Tooltip>
            
//             {/* Submenu */}
//             {item.hasSubmenu && !collapsed && (
//               <Collapse in={meetingSubmenuOpen} timeout="auto" unmountOnExit>
//                 <List component="div" disablePadding>
//                   {item.submenu.map((subItem) => (
//                     <Tooltip key={subItem.text} title={collapsed ? subItem.text : ''} placement="right">
//                       <ListItem
//                         button
//                         onClick={() => handleSubmenuClick(subItem)}
//                         selected={isSelected(subItem.path)}
//                         sx={{
//                           pl: 4,
//                           borderRadius: 2,
//                           ml: 2,
//                           mr: 1,
//                           mb: 0.5,
//                           minHeight: 40,
//                           bgcolor: isSelected(subItem.path) ? 'primary.light' : 'transparent',
//                           '&:hover': {
//                             bgcolor: 'action.hover',
//                             transform: 'translateX(4px)'
//                           },
//                           transition: 'all 0.2s ease-in-out'
//                         }}
//                       >
//                         <ListItemIcon sx={{ minWidth: 32 }}>
//                           {subItem.icon}
//                         </ListItemIcon>
//                         <ListItemText 
//                           primary={subItem.text}
//                           primaryTypographyProps={{ fontSize: '0.9rem' }}
//                         />
//                       </ListItem>
//                     </Tooltip>
//                   ))}
//                 </List>
//               </Collapse>
//             )}
//           </Box>
//         ))}
//       </List>
      
//       <Divider sx={{ mx: collapsed ? 1 : 2 }} />
      
//       {/* Bottom Menu */}
//       <List sx={{ px: collapsed ? 1 : 2, py: 1 }}>
//         {bottomMenuItems.map((item) => (
//           <Tooltip key={item.text} title={collapsed ? item.text : ''} placement="right">
//             <ListItem
//               button
//               onClick={() => {
//                 navigate(item.path);
//                 if (isMobile && onClose) onClose();
//               }}
//               selected={isSelected(item.path)}
//               sx={{
//                 borderRadius: 2,
//                 mb: 1,
//                 minHeight: 48,
//                 justifyContent: collapsed ? 'center' : 'flex-start',
//                 px: collapsed ? 1 : 2,
//                 '&.Mui-selected': {
//                   bgcolor: 'primary.light',
//                   color: 'primary.contrastText',
//                 },
//                 '&:hover': {
//                   transform: 'translateX(4px)'
//                 },
//                 transition: 'all 0.2s ease-in-out'
//               }}
//             >
//               <ListItemIcon sx={{ 
//                 color: 'inherit', 
//                 minWidth: collapsed ? 'auto' : 40,
//                 justifyContent: 'center'
//               }}>
//                 {item.icon}
//               </ListItemIcon>
//               {!collapsed && <ListItemText primary={item.text} />}
//             </ListItem>
//           </Tooltip>
//         ))}
//       </List>
//     </Box>
//   );

//   if (variant === 'permanent') {
//     return (
//       <Drawer
//         variant="permanent"
//         sx={{
//           width: drawerWidth,
//           flexShrink: 0,
//           [`& .MuiDrawer-paper`]: {
//             width: drawerWidth,
//             boxSizing: 'border-box',
//             borderRight: '1px solid',
//             borderColor: 'divider',
//             boxShadow: '4px 0 20px rgba(0,0,0,0.05)',
//             transition: 'width 0.3s ease-in-out'
//           },
//         }}
//       >
//         {drawerContent}
//       </Drawer>
//     );
//   }

//   return (
//     <Drawer
//       anchor="left"
//       open={open}
//       onClose={onClose}
//       variant={variant}
//       ModalProps={{ keepMounted: true }}
//       sx={{
//         [`& .MuiDrawer-paper`]: {
//           width: 280,
//           boxSizing: 'border-box',
//         },
//       }}
//     >
//       {drawerContent}
//     </Drawer>
//   );
// };

// export default Sidebar;

















// Enhanced Sidebar.jsx - Modern UI with gradient design matching reference
import React, { useState } from 'react';
import { 
  Drawer, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText,
  Divider,
  Typography,
  Box,
  Collapse,
  IconButton,
  Badge,
  Tooltip,
  useTheme,
  useMediaQuery,
  Avatar
} from '@mui/material';
import { 
  Dashboard,
  VideoCall,
  Schedule,
  CalendarMonth,
  VideoLibrary,
  Analytics,
  Settings,
  Person,
  ExpandLess,
  ExpandMore,
  Add,
  ChevronLeft,
  ChevronRight,
  AccessTime,
  Event,
  PlayCircle,
  Notifications
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

const Sidebar = ({ open, onClose, variant = 'temporary' }) => {
  const [meetingSubmenuOpen, setMeetingSubmenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const mainMenuItems = [
    { 
      text: 'Dashboard', 
      icon: <Dashboard />, 
      path: '/dashboard',
      badge: null
    },
    { 
      text: 'New Meeting', 
      icon: <VideoCall />, 
      path: '/meeting/new',
      badge: null,
      hasSubmenu: true,
      submenu: [
        { 
          text: 'Instant Meeting', 
          icon: <PlayCircle />, 
          path: '/meeting/instant'
        },
        { 
          text: 'Schedule Meeting', 
          icon: <AccessTime />, 
          path: '/meeting/schedule'
        },
        { 
          text: 'Calendar Meeting', 
          icon: <Event />, 
          path: '/meeting/calendar'
        }
      ]
    },
    { 
      text: 'Schedule', 
      icon: <Schedule />, 
      path: '/schedule',
      badge: 3
    },
    { 
      text: 'Calendar', 
      icon: <CalendarMonth />, 
      path: '/calendar',
      badge: null
    },
    { 
      text: 'Recordings', 
      icon: <VideoLibrary />, 
      path: '/recordings',
      badge: 5
    },
    { 
      text: 'Analytics', 
      icon: <Analytics />, 
      path: '/analytics',
      badge: null
    },
  ];

  const bottomMenuItems = [
    { text: 'Profile', icon: <Person />, path: '/profile' },
    { text: 'Settings', icon: <Settings />, path: '/settings' },
  ];

  const handleItemClick = (item) => {
    if (item.hasSubmenu) {
      setMeetingSubmenuOpen(!meetingSubmenuOpen);
    } else {
      navigate(item.path);
      if (isMobile && onClose) {
        onClose();
      }
    }
  };

  const handleSubmenuClick = (item) => {
    navigate(item.path);
    if (isMobile && onClose) {
      onClose();
    }
    setMeetingSubmenuOpen(false);
  };

  const isSelected = (path) => location.pathname === path;

  const drawerWidth = collapsed ? 80 : 280;

  const drawerContent = (
    <Box sx={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      background: 'linear-gradient(180deg, #4F46E5 0%, #7C3AED 50%, #EC4899 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Decorative overlay */}
      <Box sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(10px)',
        zIndex: 0
      }} />
      
      {/* Main Menu */}
      <List sx={{ 
        flexGrow: 1, 
        px: collapsed ? 1.5 : 2, 
        py: 1,
        position: 'relative',
        zIndex: 1
      }}>
        {mainMenuItems.map((item) => (
          <Box key={item.text}>
            <Tooltip title={collapsed ? item.text : ''} placement="right">
              <ListItem
                button
                onClick={() => handleItemClick(item)}
                selected={isSelected(item.path)}
                sx={{
                  borderRadius: '12px',
                  mb: 1,
                  minHeight: 48,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  px: collapsed ? 1 : 2,
                  bgcolor: isSelected(item.path) ? 'rgba(255, 255, 255, 0.25)' : 'transparent',
                  color: 'white',
                  backdropFilter: isSelected(item.path) ? 'blur(10px)' : 'none',
                  border: isSelected(item.path) ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid transparent',
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(10px)',
                    transform: 'translateX(4px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)'
                  },
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                <ListItemIcon sx={{ 
                  color: 'white', 
                  minWidth: collapsed ? 'auto' : 40,
                  justifyContent: 'center'
                }}>
                  {item.badge && !collapsed ? (
                    <Badge 
                      badgeContent={item.badge} 
                      sx={{
                        '& .MuiBadge-badge': {
                          bgcolor: '#EF4444',
                          color: 'white',
                          fontSize: '0.7rem',
                          minWidth: '18px',
                          height: '18px'
                        }
                      }}
                    >
                      {item.icon}
                    </Badge>
                  ) : (
                    item.icon
                  )}
                </ListItemIcon>
                
                {!collapsed && (
                  <>
                    <ListItemText 
                      primary={item.text} 
                      primaryTypographyProps={{ 
                        fontWeight: 500,
                        fontSize: '0.9rem'
                      }}
                    />
                    {item.badge && (
                      <Badge 
                        badgeContent={item.badge} 
                        sx={{
                          '& .MuiBadge-badge': {
                            bgcolor: '#EF4444',
                            color: 'white',
                            fontSize: '0.7rem',
                            minWidth: '18px',
                            height: '18px'
                          }
                        }}
                      />
                    )}
                    {item.hasSubmenu && (
                      <Box sx={{ 
                        bgcolor: 'rgba(255, 255, 255, 0.2)', 
                        borderRadius: '6px',
                        p: 0.5,
                        ml: 1
                      }}>
                        {meetingSubmenuOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                      </Box>
                    )}
                  </>
                )}
              </ListItem>
            </Tooltip>
            
            {/* Submenu */}
            {item.hasSubmenu && !collapsed && (
              <Collapse in={meetingSubmenuOpen} timeout="auto" unmountOnExit>
                <List component="div" disablePadding sx={{ ml: 2 }}>
                  {item.submenu.map((subItem) => (
                    <Tooltip key={subItem.text} title={collapsed ? subItem.text : ''} placement="right">
                      <ListItem
                        button
                        onClick={() => handleSubmenuClick(subItem)}
                        selected={isSelected(subItem.path)}
                        sx={{
                          pl: 3,
                          borderRadius: '10px',
                          mb: 0.5,
                          minHeight: 40,
                          bgcolor: isSelected(subItem.path) ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                          color: 'white',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          '&:hover': {
                            bgcolor: 'rgba(255, 255, 255, 0.15)',
                            transform: 'translateX(4px)',
                            border: '1px solid rgba(255, 255, 255, 0.3)'
                          },
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      >
                        <ListItemIcon sx={{ 
                          minWidth: 32, 
                          color: 'white',
                          '& svg': { fontSize: '1.1rem' }
                        }}>
                          {subItem.icon}
                        </ListItemIcon>
                        <ListItemText 
                          primary={subItem.text}
                          primaryTypographyProps={{ 
                            fontSize: '0.85rem',
                            fontWeight: 400
                          }}
                        />
                      </ListItem>
                    </Tooltip>
                  ))}
                </List>
              </Collapse>
            )}
          </Box>
        ))}
      </List>
      
      {/* Divider */}
      <Box sx={{ 
        mx: collapsed ? 1.5 : 2, 
        height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
        my: 1
      }} />
      
      {/* Bottom Menu */}
      <List sx={{ 
        px: collapsed ? 1.5 : 2, 
        py: 1,
        position: 'relative',
        zIndex: 1
      }}>
        {bottomMenuItems.map((item) => (
          <Tooltip key={item.text} title={collapsed ? item.text : ''} placement="right">
            <ListItem
              button
              onClick={() => {
                navigate(item.path);
                if (isMobile && onClose) onClose();
              }}
              selected={isSelected(item.path)}
              sx={{
                borderRadius: '12px',
                mb: 1,
                minHeight: 48,
                justifyContent: collapsed ? 'center' : 'flex-start',
                px: collapsed ? 1 : 2,
                color: 'white',
                bgcolor: isSelected(item.path) ? 'rgba(255, 255, 255, 0.25)' : 'transparent',
                backdropFilter: isSelected(item.path) ? 'blur(10px)' : 'none',
                border: isSelected(item.path) ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid transparent',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(10px)',
                  transform: 'translateX(4px)',
                  border: '1px solid rgba(255, 255, 255, 0.3)'
                },
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              <ListItemIcon sx={{ 
                color: 'white', 
                minWidth: collapsed ? 'auto' : 40,
                justifyContent: 'center'
              }}>
                {item.icon}
              </ListItemIcon>
              {!collapsed && (
                <ListItemText 
                  primary={item.text}
                  primaryTypographyProps={{ 
                    fontWeight: 500,
                    fontSize: '0.9rem'
                  }}
                />
              )}
            </ListItem>
          </Tooltip>
        ))}
      </List>
    </Box>
  );

  if (variant === 'permanent') {
    return (
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box',
            border: 'none',
            boxShadow: '8px 0 32px rgba(0,0,0,0.12)',
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden'
          },
        }}
      >
        {drawerContent}
      </Drawer>
    );
  }

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      variant={variant}
      ModalProps={{ keepMounted: true }}
      sx={{
        [`& .MuiDrawer-paper`]: {
          width: 280,
          boxSizing: 'border-box',
          border: 'none',
          boxShadow: '8px 0 32px rgba(0,0,0,0.12)',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
};

export default Sidebar;