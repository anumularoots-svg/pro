import { authAPI } from './api';
import { TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY } from '@/utils/constants';

class AuthService {
  constructor() {
    this.user = null;
    this.token = null;
    this.refreshToken = null;
    this.init();
  }

  init() {
    // Load user data from localStorage on initialization
    const token = localStorage.getItem(TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    const user = localStorage.getItem(USER_KEY);

    if (token && refreshToken && user) {
      this.token = token;
      this.refreshToken = refreshToken;
      this.user = JSON.parse(user);
    }
  }

  // Login user
  async login(credentials) {
    try {
      const response = await authAPI.login(credentials);
      const { access, refresh, user } = response;

      // Store tokens and user data
      this.token = access;
      this.refreshToken = refresh;
      this.user = user;

      // Save to localStorage
      localStorage.setItem(TOKEN_KEY, access);
      localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      return { success: true, user };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Register new user
  async register(userData) {
    try {
      const response = await authAPI.register(userData);
      
      // Auto-login after successful registration if tokens are returned
      if (response.access && response.refresh) {
        const { access, refresh, user } = response;
        
        this.token = access;
        this.refreshToken = refresh;
        this.user = user;

        localStorage.setItem(TOKEN_KEY, access);
        localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
        localStorage.setItem(USER_KEY, JSON.stringify(user));

        return { success: true, user, autoLogin: true };
      }

      // If email verification is required
      return { success: true, requiresVerification: true };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Logout user
  async logout() {
    try {
      if (this.refreshToken) {
        await authAPI.logout();
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local data regardless of API call success
      this.clearAuthData();
    }
  }

  // Clear authentication data
  clearAuthData() {
    this.user = null;
    this.token = null;
    this.refreshToken = null;
    
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  // Forgot password
  async forgotPassword(email) {
    try {
      await authAPI.forgotPassword(email);
      return { success: true };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Reset password
  async resetPassword(token, password) {
    try {
      await authAPI.resetPassword(token, password);
      return { success: true };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Verify email
  async verifyEmail(token) {
    try {
      const response = await authAPI.verifyEmail(token);
      
      // Auto-login after successful verification if tokens are returned
      if (response.access && response.refresh) {
        const { access, refresh, user } = response;
        
        this.token = access;
        this.refreshToken = refresh;
        this.user = user;

        localStorage.setItem(TOKEN_KEY, access);
        localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
        localStorage.setItem(USER_KEY, JSON.stringify(user));

        return { success: true, user, autoLogin: true };
      }

      return { success: true };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Get current user profile
  async getProfile() {
    try {
      const user = await authAPI.getProfile();
      this.user = user;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Update user profile
  async updateProfile(data) {
    try {
      const user = await authAPI.updateProfile(data);
      this.user = user;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Change password
  async changePassword(data) {
    try {
      await authAPI.changePassword(data);
      return { success: true };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!(this.token && this.refreshToken && this.user);
  }

  // Get current user
  getCurrentUser() {
    return this.user;
  }

  // Get authentication token
  getToken() {
    return this.token;
  }

  // Check if user has specific role
  hasRole(role) {
    return this.user?.role === role;
  }

  // Check if user has permission
  hasPermission(permission) {
    return this.user?.permissions?.includes(permission);
  }

  // Get user's full name
  getUserDisplayName() {
    if (!this.user) return 'Anonymous';
    return this.user.full_name || this.user.email || 'User';
  }

  // Get user's avatar URL
  getUserAvatar() {
    return this.user?.profile_picture || null;
  }

  // Refresh authentication token
  async refreshAuthToken() {
    try {
      if (!this.refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await authAPI.refreshToken(this.refreshToken);
      const { access } = response;

      this.token = access;
      localStorage.setItem(TOKEN_KEY, access);

      return access;
    } catch (error) {
      this.clearAuthData();
      throw this.handleError(error);
    }
  }

  // Handle API errors
  handleError(error) {
    const message = error.response?.data?.message || 
                   error.response?.data?.detail || 
                   error.message || 
                   'An unexpected error occurred';
    
    const statusCode = error.response?.status;
    
    return {
      message,
      statusCode,
      errors: error.response?.data?.errors || null
    };
  }

  // Initialize password strength checker
  checkPasswordStrength(password) {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      numbers: /\d/.test(password),
      symbols: /[^A-Za-z0-9]/.test(password)
    };

    const passedChecks = Object.values(checks).filter(Boolean).length;
    let strength = 'weak';
    
    if (passedChecks >= 4) strength = 'strong';
    else if (passedChecks >= 3) strength = 'medium';

    return {
      strength,
      checks,
      score: passedChecks
    };
  }

  // Validate registration data
  validateRegistrationData(data) {
    const errors = {};

    // Full name validation
    if (!data.full_name || data.full_name.trim().length < 2) {
      errors.full_name = 'Full name must be at least 2 characters long';
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Password validation
    const passwordCheck = this.checkPasswordStrength(data.password);
    if (passwordCheck.strength === 'weak') {
      errors.password = 'Password must be at least 8 characters with uppercase, lowercase, and numbers';
    }

    // Confirm password validation
    if (data.password !== data.confirm_password) {
      errors.confirm_password = 'Passwords do not match';
    }

    // Phone number validation (if provided)
    if (data.phone_number && data.phone_number.trim()) {
      const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
      if (!phoneRegex.test(data.phone_number)) {
        errors.phone_number = 'Please enter a valid phone number';
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
}

// Create and export singleton instance
const authService = new AuthService();
export default authService;