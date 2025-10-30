//  COMPLETE FIXED: AuthContext.jsx - With Photo Support
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '../utils/constants';

// Configure axios to include credentials (cookies) with all requests
axios.defaults.withCredentials = true;

const AuthContext = createContext();

const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  token: localStorage.getItem('token'),
};

const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_START':
    case 'REGISTER_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token ?? state.token ?? localStorage.getItem('token'),
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case 'REGISTER_SUCCESS':
      return {
        ...state,
        // keep the user profile if you want to pre-fill forms,
        // but DO NOT authenticate or set a token
        user: action.payload.user,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };
    case 'LOGIN_FAILURE':
    case 'REGISTER_FAILURE':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };
    case 'UPDATE_PROFILE':
      return {
        ...state,
        user: { ...state.user, ...action.payload },
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };
    case 'INIT_AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case 'INIT_AUTH_FAILURE':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };
    default:
      return state;
  }
};

// FIXED: Helper function to normalize user object with consistent properties
const normalizeUserObject = (userData, email = null) => {
  if (!userData) return null;
  
  // Get the name from various possible properties
  const name = userData.full_name || 
               userData.name || 
               userData.Name || 
               userData.firstName || 
               userData.displayName || 
               'User';

  return {
    id: userData.id || userData.Id || userData.user_id || userData.User_Id,
    name: name,
    full_name: name,
    displayName: name,
    firstName: userData.firstName || name.split(' ')[0],
    lastName: userData.lastName || name.split(' ').slice(1).join(' '),
    email: userData.email || email || userData.Email || '',
    phone_number: userData.phone_number || userData.phoneNumber || '',
    address: userData.address || '',
    country: userData.country || '',
    country_code: userData.country_code || '',
    languages: userData.languages || 'English',
    profile_picture: userData.profile_picture || userData.profilePicture || '',
    photo_id: userData.photo_id || userData.Photo_Id || null,
    role: userData.role || 'user',
    sessionTimeout: userData.sessionTimeout || userData.Session_Timeout,
    created_at: userData.created_at || userData.Created_At,
    updated_at: userData.updated_at || userData.Updated_At
  };
};

const fetchUserFromDB = async (id) => {
  const { data } = await axios.get(`${API_BASE_URL}${API_ENDPOINTS.GET_USER_BY_ID}/${id}`);
  return {
    id: data.ID,
    full_name: data.full_name,
    email: data.email,
    phone_number: data.phone_number || '',
    address: data.address || '',
    country: data.country || '',
    country_code: data.country_code || '',
    languages: data.languages ? data.languages.split(',').map(s => s.trim()).filter(Boolean) : [],
    status: data.Status !== 0,
    status_code: data.status_Code,
    agreeToTerms: !!data.agreeToTerms,
    photo_id: data.profile_photo_id || null,
    created_at: data.Created_At,
    updated_at: data.Updated_At,
    name: data.full_name,
    displayName: data.full_name,
    firstName: (data.full_name || '').split(' ')[0] || data.full_name,
  };
};


export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      
      if (token && storedUser) {
        try {
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          const userData = JSON.parse(storedUser);
          
          // FIXED: Normalize the stored user data
          const normalizedUser = normalizeUserObject(userData);
          
          dispatch({
            type: 'INIT_AUTH_SUCCESS',
            payload: {
              user: normalizedUser,
              token: token
            }
          });
          
        } catch (error) {
          console.error('Token validation failed:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          delete axios.defaults.headers.common['Authorization'];
          dispatch({ type: 'INIT_AUTH_FAILURE' });
        }
      } else {
        dispatch({ type: 'INIT_AUTH_FAILURE' });
      }
    };

    initializeAuth();
  }, []);

  const login = async (credentials) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const loginData = { Credential: credentials.email, Password: credentials.password };
      const { data } = await axios.post(`${API_BASE_URL}${API_ENDPOINTS.LOGIN}`, loginData);

      const { Id } = data;

      // create a mock token to keep your current token-based flow
      const mockToken = `session_${Id}_${Date.now()}`;
      localStorage.setItem('token', mockToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${mockToken}`;

      // Pull the full DB row so Profile shows phone/address/country/languages
      const normalized = await fetchUserFromDB(Id);

      localStorage.setItem('user', JSON.stringify(normalized));
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: normalized, token: mockToken } });

      return { user: normalized, token: mockToken, message: data?.Message };
    } catch (error) {
      const msg = error.response?.data?.Error || error.response?.data?.message || 'Login failed';
      dispatch({ type: 'LOGIN_FAILURE', payload: msg });
      throw new Error(msg);
    }
  };

  const register = async (userData) => {
    dispatch({ type: 'REGISTER_START' });
    try {
      // Validate required fields including photo
      if (!userData.profile_photo) {
        throw new Error('Profile photo is required');
      }

      const registerData = {
        full_name: userData.full_name,
        email: userData.email,
        password: userData.password,
        phone_number: userData.phone_number || null,
        address: userData.address || null,
        country: userData.country || null,
        country_code: userData.country_code || null,
        languages: userData.languages || 'English',
        profile_photo: userData.profile_photo, // IMPORTANT: Include photo
        agreeToTerms: userData.agreeToTerms ? 1 : 0
      };
      
      console.log('🔐 Registration Data Check:');
      console.log('- Full Name:', registerData.full_name);
      console.log('- Email:', registerData.email);
      console.log('- Has Photo:', !!registerData.profile_photo);
      console.log('- Photo Length:', registerData.profile_photo?.length);
      console.log('- Photo Preview:', registerData.profile_photo?.substring(0, 100));
      
      const fullURL = `${API_BASE_URL}${API_ENDPOINTS.REGISTER}`;
      console.log('🔐 Full API URL:', fullURL);
      
      const response = await axios.post(fullURL, registerData);
      
      console.log('🔐 Registration response:', response.data);
      
      // Create user object with photo_id
      const userWithPhoto = {
        ...response.data,
        User_Id: response.data.User_Id,
        Photo_Id: response.data.Photo_Id,
        email: userData.email,
        full_name: userData.full_name
      };
      
      // FIXED: Normalize the registration response
      const normalizedUser = normalizeUserObject(userWithPhoto, userData.email);
      
      dispatch({ 
        type: 'REGISTER_SUCCESS',
        payload: { user: normalizedUser, token: null }
      });
      
      return normalizedUser;
    } catch (error) {
      console.error('🔐 Registration error:', error);
      console.error('🔐 Error response:', error.response?.data);
      console.error('🔐 Error status:', error.response?.status);
      
      const errorMessage = error.response?.data?.Error || 
                          error.response?.data?.message || 
                          error.message || 
                          'Registration failed';
      
      dispatch({
        type: 'REGISTER_FAILURE',
        payload: errorMessage,
      });
      throw new Error(errorMessage);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    dispatch({ type: 'LOGOUT' });
  };

  const updateProfile = async (form) => {
    dispatch({ type: 'PROFILE_UPDATE_START' });

    try {
      const userId =
        form.id ??
        state.user?.id ?? state.user?.Id ?? state.user?.user_id ?? state.user?.ID;

      if (!userId) throw new Error('User ID is required for profile update');

      const url = `${API_BASE_URL}/api/auth/update-profile/${userId}/`;

      // payload keys must match backend; languages must be string
      const payload = {
        full_name: form.full_name?.trim() ?? '',
        email: form.email?.trim() ?? '',
        phone_number: form.phone_number ?? null,
        country:
          typeof form.country === 'object'
            ? (form.country?.value || form.country?.code || form.country?.name)
            : (form.country ?? null),
        address: form.address ?? null,

        // backend column is VARCHAR(100)
        languages: Array.isArray(form.languages)
          ? form.languages.join(', ')
          : (form.languages || ''),

        // NOTE: these won't persist unless you add columns in DB
        // keeping them here is harmless; backend will ignore unknown fields
        email_notifications: !!form.email_notifications,
        meeting_reminders: !!form.meeting_reminders,
        recording_notifications: !!form.recording_notifications,
        show_email: !!form.show_email,
        show_phone: !!form.show_phone,
        auto_join_audio: !!form.auto_join_audio,
        auto_join_video: !!form.auto_join_video,
      };

      const { data } = await axios.put(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        withCredentials: true,
      });

      // server sends { user: {...} } — normalize for frontend
      const serverUser = data.user ?? data;

      const normalized = {
        ...state.user,
        ...serverUser,
        // convert "English, Hindi" -> ["English","Hindi"]
        languages: Array.isArray(serverUser?.languages)
          ? serverUser.languages
          : (typeof serverUser?.languages === 'string'
              ? serverUser.languages.split(',').map(s => s.trim()).filter(Boolean)
              : (serverUser?.languages ? [serverUser.languages] : [])
            ),
      };

      localStorage.setItem('user', JSON.stringify(normalized));
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: normalized, token: state.token } });

      return { ok: true, user: normalized };
    } catch (err) {
      console.error('Profile update failed:', err?.response?.data || err.message);
      dispatch({ type: 'PROFILE_UPDATE_ERROR', payload: err?.response?.data || err.message });
      return { ok: false, error: err?.response?.data || err.message };
    }
  };

  const forgotPassword = async (email) => {
    try {
      const response = await axios.post(`${API_BASE_URL}${API_ENDPOINTS.FORGOT_PASSWORD}`, { email: email });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.Error || error.response?.data?.message || 'Failed to send reset link');
    }
  };

  const resetPassword = async (data) => {
    try {
      const response = await axios.post(`${API_BASE_URL}${API_ENDPOINTS.RESET_PASSWORD}`, { 
        OTP: data.otp, 
        password: data.password,
        email: data.email
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.Error || error.response?.data?.message || 'Password reset failed');
    }
  };

  const verifyEmail = async (token) => {
    try {
      const response = await axios.post(`${API_BASE_URL}${API_ENDPOINTS.VERIFY_EMAIL}`, { token: token });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.Error || error.response?.data?.message || 'Email verification failed');
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const response = await axios.post(`${API_BASE_URL}${API_ENDPOINTS.CHANGE_PASSWORD}`, {
        current_password: currentPassword,
        new_password: newPassword
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.Error || error.response?.data?.message || 'Password change failed');
    }
  };

  const uploadProfilePicture = async (file) => {
    try {
      const formData = new FormData();
      formData.append('profile_picture', file);
      
      const response = await axios.post(`${API_BASE_URL}${API_ENDPOINTS.UPLOAD_PROFILE_PICTURE}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // FIXED: Normalize the updated user data
      const updatedUserData = { ...state.user, profile_picture: response.data.profile_picture };
      const normalizedUser = normalizeUserObject(updatedUserData);
      
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      
      dispatch({
        type: 'UPDATE_PROFILE',
        payload: normalizedUser
      });
      
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.Error || error.response?.data?.message || 'Failed to upload profile picture');
    }
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const validateToken = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}${API_ENDPOINTS.VALIDATE_TOKEN}`);
      return response.data;
    } catch (error) {
      logout();
      throw new Error('Session expired');
    }
  };

  // 🔍 DEBUG: Log current user state
  useEffect(() => {
    if (state.user) {
      console.log('🔐 AuthContext current user:', state.user);
      console.log('🔐 User properties:', Object.keys(state.user));
      console.log('🔐 User name variations:', {
        name: state.user.name,
        full_name: state.user.full_name,
        displayName: state.user.displayName,
        photo_id: state.user.photo_id
      });
    }
  }, [state.user]);

  const value = {
    ...state,
    loading: state.isLoading,
    login,
    register,
    logout,
    updateProfile,
    forgotPassword,
    resetPassword,
    verifyEmail,
    changePassword,
    uploadProfilePicture,
    validateToken,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

export const useAuth = useAuthContext;