# enhanced_logging_config.py
# Complete logging solution to capture ALL logs from meetings.py, participants.py, 
# chat_messages.py, cache_only_hand_raise.py, and recording_service.py
# This will intercept ALL logging calls and route them to the correct files

import logging
import logging.handlers
import os
import sys
import traceback
from datetime import datetime

class FileBasedFilter(logging.Filter):
    """Filter logs based on the source file"""
    
    def __init__(self, target_files):
        super().__init__()
        self.target_files = target_files
    
    def filter(self, record):
        # Check pathname first
        if hasattr(record, 'pathname'):
            filename = os.path.basename(record.pathname)
            return filename in self.target_files
        
        # Check filename attribute
        if hasattr(record, 'filename'):
            return record.filename in self.target_files
        
        # Check stack trace to find the calling file
        try:
            # Get the stack trace
            stack = traceback.extract_stack()
            for frame in reversed(stack):
                filename = os.path.basename(frame.filename)
                if filename in self.target_files:
                    return True
        except:
            pass
        
        return False

class APICallFilter(logging.Filter):
    """Filter to identify API-related logs"""
    
    def filter(self, record):
        message = record.getMessage().lower()
        
        # API indicators
        api_indicators = [
            'http/1.1', 'post ', 'get ', 'put ', 'delete ', 'options ',
            'status:', '- - [', 'api/', '/api', 'endpoint', 'request',
            'response', 'returned', 'json', 'received json'
        ]
        
        return any(indicator in message for indicator in api_indicators)

class LogInterceptor:
    """Intercept and route all logging calls"""
    
    def __init__(self):
        self.original_methods = {}
        self.setup_interception()
    
    def setup_interception(self):
        """Replace all logging methods with intercepting versions"""
        
        # Store original methods
        self.original_methods = {
            'debug': logging.debug,
            'info': logging.info,
            'warning': logging.warning,
            'error': logging.error,
            'critical': logging.critical,
            'exception': logging.exception
        }
        
        # Replace with intercepting methods
        logging.debug = self._intercept_debug
        logging.info = self._intercept_info
        logging.warning = self._intercept_warning
        logging.error = self._intercept_error
        logging.critical = self._intercept_critical
        logging.exception = self._intercept_exception
    
    def _get_calling_file(self):
        """Get the file that made the logging call"""
        try:
            # Get the call stack
            frame = sys._getframe()
            while frame:
                filename = os.path.basename(frame.f_code.co_filename)
                target_files = [
                    'meetings.py', 'participants.py', 
                    'chat_messages.py', 'cache_only_hand_raise.py',
                    'recording_service.py'
                ]
                if filename in target_files:
                    return filename
                frame = frame.f_back
        except:
            pass
        return None
    
    def _route_log(self, level, msg, *args, **kwargs):
        """Route log message to appropriate logger"""
        calling_file = self._get_calling_file()
        
        if calling_file == 'meetings.py':
            logger = logging.getLogger('meetings_module')
            getattr(logger, level)(msg, *args, **kwargs)
        elif calling_file == 'participants.py':
            logger = logging.getLogger('participants_module') 
            getattr(logger, level)(msg, *args, **kwargs)
        elif calling_file == 'chat_messages.py':
            logger = logging.getLogger('cache_chat_module')
            getattr(logger, level)(msg, *args, **kwargs)
        elif calling_file == 'cache_only_hand_raise.py':
            logger = logging.getLogger('cache_hand_raise_module')
            getattr(logger, level)(msg, *args, **kwargs)
        elif calling_file == 'recording_service.py':
            logger = logging.getLogger('recording_service_module')
            getattr(logger, level)(msg, *args, **kwargs)
        else:
            # Use original method for other files
            original_method = self.original_methods.get(level)
            if original_method:
                original_method(msg, *args, **kwargs)
    
    def _intercept_debug(self, msg, *args, **kwargs):
        self._route_log('debug', msg, *args, **kwargs)
    
    def _intercept_info(self, msg, *args, **kwargs):
        self._route_log('info', msg, *args, **kwargs)
    
    def _intercept_warning(self, msg, *args, **kwargs):
        self._route_log('warning', msg, *args, **kwargs)
    
    def _intercept_error(self, msg, *args, **kwargs):
        self._route_log('error', msg, *args, **kwargs)
    
    def _intercept_critical(self, msg, *args, **kwargs):
        self._route_log('critical', msg, *args, **kwargs)
    
    def _intercept_exception(self, msg, *args, **kwargs):
        self._route_log('error', msg, *args, **kwargs)

def setup_complete_logging():
    """Setup complete logging interception and routing"""
    
    # Create logs directory
    os.makedirs('logs', exist_ok=True)
    
    # Clear existing handlers from root logger
    root_logger = logging.getLogger()
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Set root logger level
    root_logger.setLevel(logging.DEBUG)
    
    # ============================================
    # CONFIGURE NAMED LOGGERS FROM CACHE SYSTEMS
    # ============================================
    
    # Redirect cache_chat logger to our cache_chat_module logger
    cache_chat_named_logger = logging.getLogger('cache_chat')
    cache_chat_named_logger.handlers.clear()
    cache_chat_named_logger.propagate = False
    cache_chat_named_logger.setLevel(logging.DEBUG)
    
    # Redirect cache_hand_raise logger to our cache_hand_raise_module logger  
    cache_hand_raise_named_logger = logging.getLogger('cache_hand_raise')
    cache_hand_raise_named_logger.handlers.clear()
    cache_hand_raise_named_logger.propagate = False
    cache_hand_raise_named_logger.setLevel(logging.DEBUG)
    
    # ============================================
    # MEETINGS MODULE LOGGER
    # ============================================
    
    meetings_logger = logging.getLogger('meetings_module')
    meetings_logger.setLevel(logging.DEBUG)
    meetings_logger.propagate = False
    
    # Meetings file handler
    meetings_handler = logging.handlers.RotatingFileHandler(
        'logs/meetings_module.log',
        maxBytes=15*1024*1024,  # 15MB
        backupCount=5,
        encoding='utf-8'
    )
    meetings_handler.setLevel(logging.DEBUG)
    
    meetings_formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(funcName)s:%(lineno)d - %(message)s'
    )
    meetings_handler.setFormatter(meetings_formatter)
    meetings_logger.addHandler(meetings_handler)
    
    # ============================================
    # PARTICIPANTS MODULE LOGGER
    # ============================================
    
    participants_logger = logging.getLogger('participants_module')
    participants_logger.setLevel(logging.DEBUG)
    participants_logger.propagate = False
    
    # Participants file handler
    participants_handler = logging.handlers.RotatingFileHandler(
        'logs/participants_module.log',
        maxBytes=15*1024*1024,  # 15MB
        backupCount=5,
        encoding='utf-8'
    )
    participants_handler.setLevel(logging.DEBUG)
    
    participants_formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(funcName)s:%(lineno)d - %(message)s'
    )
    participants_handler.setFormatter(participants_formatter)
    participants_logger.addHandler(participants_handler)
    
    # ============================================
    # CACHE CHAT MODULE LOGGER
    # ============================================
    
    cache_chat_logger = logging.getLogger('cache_chat_module')
    cache_chat_logger.setLevel(logging.DEBUG)
    cache_chat_logger.propagate = False
    
    # Cache chat file handler
    cache_chat_handler = logging.handlers.RotatingFileHandler(
        'logs/cache_chat_module.log',
        maxBytes=15*1024*1024,  # 15MB
        backupCount=5,
        encoding='utf-8'
    )
    cache_chat_handler.setLevel(logging.DEBUG)
    
    cache_chat_formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(funcName)s:%(lineno)d - %(message)s'
    )
    cache_chat_handler.setFormatter(cache_chat_formatter)
    cache_chat_logger.addHandler(cache_chat_handler)
    
    # Connect the named logger to this module logger
    cache_chat_named_logger.addHandler(cache_chat_handler)
    
    # ============================================
    # CACHE HAND RAISE MODULE LOGGER
    # ============================================
    
    cache_hand_raise_logger = logging.getLogger('cache_hand_raise_module')
    cache_hand_raise_logger.setLevel(logging.DEBUG)
    cache_hand_raise_logger.propagate = False
    
    # Cache hand raise file handler
    cache_hand_raise_handler = logging.handlers.RotatingFileHandler(
        'logs/cache_hand_raise_module.log',
        maxBytes=15*1024*1024,  # 15MB
        backupCount=5,
        encoding='utf-8'
    )
    cache_hand_raise_handler.setLevel(logging.DEBUG)
    
    cache_hand_raise_formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(funcName)s:%(lineno)d - %(message)s'
    )
    cache_hand_raise_handler.setFormatter(cache_hand_raise_formatter)
    cache_hand_raise_logger.addHandler(cache_hand_raise_handler)
    
    # Connect the named logger to this module logger
    cache_hand_raise_named_logger.addHandler(cache_hand_raise_handler)
    
    # ============================================
    # RECORDING SERVICE MODULE LOGGER
    # ============================================
    
    recording_service_logger = logging.getLogger('recording_service_module')
    recording_service_logger.setLevel(logging.DEBUG)
    recording_service_logger.propagate = False
    
    # Recording service file handler
    recording_service_handler = logging.handlers.RotatingFileHandler(
        'logs/recording_service_module.log',
        maxBytes=20*1024*1024,  # 20MB (larger for video processing logs)
        backupCount=5,
        encoding='utf-8'
    )
    recording_service_handler.setLevel(logging.DEBUG)
    
    recording_service_formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(funcName)s:%(lineno)d - %(message)s'
    )
    recording_service_handler.setFormatter(recording_service_formatter)
    recording_service_logger.addHandler(recording_service_handler)
    
    # ============================================
    # API LOGS (MAIN DEBUG FILES)
    # ============================================
    
    # Meetings API logger
    meetings_api_logger = logging.getLogger('meetings_api')
    meetings_api_logger.setLevel(logging.INFO)
    meetings_api_logger.propagate = False
    
    meetings_api_handler = logging.handlers.RotatingFileHandler(
        'meetings_debug.log',
        maxBytes=20*1024*1024,  # 20MB
        backupCount=3,
        encoding='utf-8'
    )
    meetings_api_handler.setLevel(logging.INFO)
    meetings_api_formatter = logging.Formatter(
        '%(asctime)s %(levelname)s [MEETINGS-API] %(message)s'
    )
    meetings_api_handler.setFormatter(meetings_api_formatter)
    meetings_api_logger.addHandler(meetings_api_handler)
    
    # Participants API logger
    participants_api_logger = logging.getLogger('participants_api')
    participants_api_logger.setLevel(logging.INFO)
    participants_api_logger.propagate = False
    
    participants_api_handler = logging.handlers.RotatingFileHandler(
        'participants_debug.log',
        maxBytes=20*1024*1024,  # 20MB
        backupCount=3,
        encoding='utf-8'
    )
    participants_api_handler.setLevel(logging.INFO)
    participants_api_formatter = logging.Formatter(
        '%(asctime)s %(levelname)s [PARTICIPANTS-API] %(message)s'
    )
    participants_api_handler.setFormatter(participants_api_formatter)
    participants_api_logger.addHandler(participants_api_handler)
    
    # Cache Chat API logger
    cache_chat_api_logger = logging.getLogger('cache_chat_api')
    cache_chat_api_logger.setLevel(logging.INFO)
    cache_chat_api_logger.propagate = False
    
    cache_chat_api_handler = logging.handlers.RotatingFileHandler(
        'cache_chat_debug.log',
        maxBytes=20*1024*1024,  # 20MB
        backupCount=3,
        encoding='utf-8'
    )
    cache_chat_api_handler.setLevel(logging.INFO)
    cache_chat_api_formatter = logging.Formatter(
        '%(asctime)s %(levelname)s [CACHE-CHAT-API] %(message)s'
    )
    cache_chat_api_handler.setFormatter(cache_chat_api_formatter)
    cache_chat_api_logger.addHandler(cache_chat_api_handler)
    
    # Cache Hand Raise API logger
    cache_hand_raise_api_logger = logging.getLogger('cache_hand_raise_api')
    cache_hand_raise_api_logger.setLevel(logging.INFO)
    cache_hand_raise_api_logger.propagate = False
    
    cache_hand_raise_api_handler = logging.handlers.RotatingFileHandler(
        'cache_hand_raise_debug.log',
        maxBytes=20*1024*1024,  # 20MB
        backupCount=3,
        encoding='utf-8'
    )
    cache_hand_raise_api_handler.setLevel(logging.INFO)
    cache_hand_raise_api_formatter = logging.Formatter(
        '%(asctime)s %(levelname)s [CACHE-HAND-RAISE-API] %(message)s'
    )
    cache_hand_raise_api_handler.setFormatter(cache_hand_raise_api_formatter)
    cache_hand_raise_api_logger.addHandler(cache_hand_raise_api_handler)
    
    # Recording Service API logger
    recording_service_api_logger = logging.getLogger('recording_service_api')
    recording_service_api_logger.setLevel(logging.INFO)
    recording_service_api_logger.propagate = False
    
    recording_service_api_handler = logging.handlers.RotatingFileHandler(
        'recording_service_debug.log',
        maxBytes=25*1024*1024,  # 25MB
        backupCount=3,
        encoding='utf-8'
    )
    recording_service_api_handler.setLevel(logging.INFO)
    recording_service_api_formatter = logging.Formatter(
        '%(asctime)s %(levelname)s [RECORDING-SERVICE-API] %(message)s'
    )
    recording_service_api_handler.setFormatter(recording_service_api_formatter)
    recording_service_api_logger.addHandler(recording_service_api_handler)
    
    # ============================================
    # CONSOLE HANDLER (ONLY CRITICAL ERRORS)
    # ============================================
    
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.CRITICAL)  # Only show critical errors
    console_formatter = logging.Formatter(
        '%(levelname)s - %(message)s'
    )
    console_handler.setFormatter(console_formatter)
    root_logger.addHandler(console_handler)
    
    # ============================================
    # SUPPRESS CONSOLE OUTPUT FOR CACHE LOGGERS
    # ============================================
    
    # Ensure cache loggers don't output to console
    cache_chat_named_logger.addHandler(logging.NullHandler())
    cache_hand_raise_named_logger.addHandler(logging.NullHandler())
    
    # ============================================
    # DJANGO/OTHER LOGS (FILTERED)
    # ============================================
    
    # Reduce noise from other loggers
    logging.getLogger('django').setLevel(logging.ERROR)
    logging.getLogger('requests').setLevel(logging.ERROR)
    logging.getLogger('urllib3').setLevel(logging.ERROR)
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    logging.getLogger('livekit').setLevel(logging.ERROR)
    logging.getLogger('livekit.rtc').setLevel(logging.ERROR)
    logging.getLogger('livekit.api').setLevel(logging.ERROR)
    logging.getLogger('livekit_ffi').setLevel(logging.ERROR)
    
    print("✅ Enhanced logging configuration loaded")
    print(f"📝 Meetings logs: logs/meetings_module.log")
    print(f"📝 Participants logs: logs/participants_module.log") 
    print(f"📝 Cache Chat logs: logs/cache_chat_module.log")
    print(f"📝 Cache Hand Raise logs: logs/cache_hand_raise_module.log")
    print(f"📝 Recording Service logs: logs/recording_service_module.log")
    print(f"📝 Meetings API: meetings_debug.log")
    print(f"📝 Participants API: participants_debug.log")
    print(f"📝 Cache Chat API: cache_chat_debug.log")
    print(f"📝 Cache Hand Raise API: cache_hand_raise_debug.log")
    print(f"📝 Recording Service API: recording_service_debug.log")
    print(f"📝 Console: Critical errors only")
    
    return True

def configure_enhanced_logging():
    """Main configuration function"""
    
    try:
        # Setup the logging system
        setup_complete_logging()
        
        # Setup log interception
        interceptor = LogInterceptor()
        
        # Store interceptor globally so it doesn't get garbage collected
        import builtins
        builtins._log_interceptor = interceptor
        
        # Test the loggers
        meetings_logger = logging.getLogger('meetings_module')
        participants_logger = logging.getLogger('participants_module')
        cache_chat_logger = logging.getLogger('cache_chat_module')
        cache_hand_raise_logger = logging.getLogger('cache_hand_raise_module')
        recording_service_logger = logging.getLogger('recording_service_module')
        
        meetings_logger.info("✅ Enhanced meetings logging active")
        participants_logger.info("✅ Enhanced participants logging active")
        cache_chat_logger.info("✅ Enhanced cache chat logging active")
        cache_hand_raise_logger.info("✅ Enhanced cache hand raise logging active")
        recording_service_logger.info("✅ Enhanced recording service logging active")
        
        return True
        
    except Exception as e:
        print(f"❌ Failed to configure enhanced logging: {e}")
        return False

# ============================================
# UTILITY FUNCTIONS
# ============================================

def log_meetings_activity(message):
    """Log meetings-specific activity"""
    logger = logging.getLogger('meetings_module')
    logger.info(f"[MEETINGS] {message}")

def log_participants_activity(message):
    """Log participants-specific activity"""
    logger = logging.getLogger('participants_module')
    logger.info(f"[PARTICIPANTS] {message}")

def log_cache_chat_activity(message):
    """Log cache chat-specific activity"""
    logger = logging.getLogger('cache_chat_module')
    logger.info(f"[CACHE-CHAT] {message}")

def log_cache_hand_raise_activity(message):
    """Log cache hand raise-specific activity"""
    logger = logging.getLogger('cache_hand_raise_module')
    logger.info(f"[CACHE-HAND-RAISE] {message}")

def log_recording_service_activity(message):
    """Log recording service-specific activity"""
    logger = logging.getLogger('recording_service_module')
    logger.info(f"[RECORDING-SERVICE] {message}")

def log_api_activity(module, endpoint, method, status_code, **kwargs):
    """Log API activity to appropriate API log"""
    logger_map = {
        'meetings': logging.getLogger('meetings_api'),
        'participants': logging.getLogger('participants_api'),
        'cache_chat': logging.getLogger('cache_chat_api'),
        'cache_hand_raise': logging.getLogger('cache_hand_raise_api'),
        'recording_service': logging.getLogger('recording_service_api')
    }
    
    logger = logger_map.get(module)
    if not logger:
        return
    
    message = f"{method} {endpoint} - Status: {status_code}"
    
    if 'execution_time' in kwargs:
        message += f" - Time: {kwargs['execution_time']:.2f}s"
    if 'user_id' in kwargs:
        message += f" - User: {kwargs['user_id']}"
    if 'meeting_id' in kwargs:
        message += f" - Meeting: {kwargs['meeting_id']}"
    if 'file_size' in kwargs:
        message += f" - FileSize: {kwargs['file_size']}"
    if 'redis_status' in kwargs:
        message += f" - Redis: {kwargs['redis_status']}"
    if 'video_duration' in kwargs:
        message += f" - Duration: {kwargs['video_duration']}"
    if 'frames_captured' in kwargs:
        message += f" - Frames: {kwargs['frames_captured']}"
    if 'audio_samples' in kwargs:
        message += f" - Audio: {kwargs['audio_samples']}"
    if 'recording_status' in kwargs:
        message += f" - RecStatus: {kwargs['recording_status']}"
    
    logger.info(message)

def test_logging():
    """Test the logging configuration"""
    print("\n🧪 Testing enhanced logging configuration...")
    
    # Test meetings logger
    meetings_logger = logging.getLogger('meetings_module')
    meetings_logger.debug("Debug message from meetings")
    meetings_logger.info("Info message from meetings")
    meetings_logger.warning("Warning message from meetings")
    meetings_logger.error("Error message from meetings")
    
    # Test participants logger
    participants_logger = logging.getLogger('participants_module')
    participants_logger.debug("Debug message from participants")
    participants_logger.info("Info message from participants")
    participants_logger.warning("Warning message from participants")
    participants_logger.error("Error message from participants")
    
    # Test cache chat logger
    cache_chat_logger = logging.getLogger('cache_chat_module')
    cache_chat_logger.debug("Debug message from cache chat")
    cache_chat_logger.info("Info message from cache chat")
    cache_chat_logger.warning("Warning message from cache chat")
    cache_chat_logger.error("Error message from cache chat")
    
    # Test cache hand raise logger
    cache_hand_raise_logger = logging.getLogger('cache_hand_raise_module')
    cache_hand_raise_logger.debug("Debug message from cache hand raise")
    cache_hand_raise_logger.info("Info message from cache hand raise")
    cache_hand_raise_logger.warning("Warning message from cache hand raise")
    cache_hand_raise_logger.error("Error message from cache hand raise")
    
    # Test recording service logger
    recording_service_logger = logging.getLogger('recording_service_module')
    recording_service_logger.debug("Debug message from recording service")
    recording_service_logger.info("Info message from recording service")
    recording_service_logger.warning("Warning message from recording service")
    recording_service_logger.error("Error message from recording service")
    
    # Test API loggers
    log_api_activity('meetings', 'test_endpoint', 'POST', 200, execution_time=0.5)
    log_api_activity('participants', 'test_endpoint', 'GET', 200, execution_time=0.3)
    log_api_activity('cache_chat', 'send_message', 'POST', 200, execution_time=0.2, file_size='5MB')
    log_api_activity('cache_hand_raise', 'raise_hand', 'POST', 200, execution_time=0.1, redis_status='connected')
    log_api_activity('recording_service', 'start_recording', 'POST', 200, 
                    execution_time=2.5, meeting_id='test123', frames_captured=1500, 
                    audio_samples=48000, recording_status='active')
    
    print("✅ Test completed - check log files!")

# ============================================
# HELPER FUNCTIONS FOR CACHE SYSTEMS
# ============================================

def setup_cache_system_loggers():
    """Helper function to setup cache system loggers if called separately"""
    
    # These are already setup in the main configure function,
    # but this can be used for testing or separate initialization
    
    cache_chat_logger = logging.getLogger('cache_chat')
    cache_hand_raise_logger = logging.getLogger('cache_hand_raise')
    
    # Set them to use the module loggers
    cache_chat_logger.addHandler(logging.getLogger('cache_chat_module').handlers[0])
    cache_hand_raise_logger.addHandler(logging.getLogger('cache_hand_raise_module').handlers[0])
    
    return True

def get_log_file_paths():
    """Get all log file paths for monitoring"""
    return {
        'meetings_module': 'logs/meetings_module.log',
        'participants_module': 'logs/participants_module.log',
        'cache_chat_module': 'logs/cache_chat_module.log',
        'cache_hand_raise_module': 'logs/cache_hand_raise_module.log',
        'recording_service_module': 'logs/recording_service_module.log',
        'meetings_api': 'meetings_debug.log',
        'participants_api': 'participants_debug.log',
        'cache_chat_api': 'cache_chat_debug.log',
        'cache_hand_raise_api': 'cache_hand_raise_debug.log',
        'recording_service_api': 'recording_service_debug.log'
    }

def clear_all_logs():
    """Clear all log files (for testing/debugging)"""
    log_files = get_log_file_paths()
    
    for log_type, log_path in log_files.items():
        try:
            if os.path.exists(log_path):
                with open(log_path, 'w') as f:
                    f.write('')  # Clear the file
                print(f"✅ Cleared {log_type} log: {log_path}")
        except Exception as e:
            print(f"❌ Failed to clear {log_type} log: {e}")

def monitor_log_sizes():
    """Monitor log file sizes"""
    log_files = get_log_file_paths()
    
    print("\n📊 Log File Sizes:")
    print("-" * 50)
    
    for log_type, log_path in log_files.items():
        try:
            if os.path.exists(log_path):
                size = os.path.getsize(log_path)
                size_mb = size / (1024 * 1024)
                print(f"{log_type:25}: {size_mb:6.2f} MB - {log_path}")
            else:
                print(f"{log_type:25}: Not found - {log_path}")
        except Exception as e:
            print(f"{log_type:25}: Error - {e}")

# ============================================
# AUTO-INITIALIZE
# ============================================

if __name__ == "__main__":
    configure_enhanced_logging()
    test_logging()
    print("\n" + "="*60)
    monitor_log_sizes()
else:
    # Auto-configure when imported
    configure_enhanced_logging()