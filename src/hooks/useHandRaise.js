// src/hooks/useHandRaise.js - Hand Raise Hook (FIXED VERSION)
import { useState, useEffect, useCallback, useRef } from 'react';
import { handRaiseService } from '../services/handRaiseAPI';

export const useHandRaise = (meetingId, currentUser, isHost = false, livekitRoom = null) => {
  const [raisedHands, setRaisedHands] = useState([]);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [handRaiseStats, setHandRaiseStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const pollIntervalRef = useRef(null);
  const initializedRef = useRef(false);
  const cleanupPerformedRef = useRef(false);

  // Load current raised hands - DEFINED FIRST
  const loadRaisedHands = useCallback(async () => {
    if (!meetingId) return;
    
    try {
      console.log('📋 Loading raised hands for meeting:', meetingId);
      const response = await handRaiseService.getRaisedHands(meetingId);
      
      if (response.success) {
        console.log('✅ Raised hands loaded:', response.raised_hands?.length || 0, 'hands');
        setRaisedHands(response.raised_hands || []);
      } else {
        console.log('⚠️ Meeting not active or no hands raised:', response.note);
        setRaisedHands([]);
      }
    } catch (error) {
      console.error('❌ Failed to load raised hands:', error);
      // Don't throw error - meeting might not be initialized yet
      setRaisedHands([]);
    }
  }, [meetingId]);

  // Initialize hand raise system when meeting starts - NOW DEFINED AFTER loadRaisedHands
  const initializeHandRaise = useCallback(async () => {
    if (!meetingId || !currentUser || initializedRef.current) return;
    
    try {
      console.log('🚀 Initializing hand raise system...');
      setIsLoading(true);
      
      // Start the hand raise system for this meeting FIRST
      console.log('🚀 Starting hand raise system for meeting:', meetingId);
      const startResult = await handRaiseService.startMeetingHandRaise(meetingId);
      console.log('✅ Hand raise system started:', startResult);
      
      // Wait a moment for the backend to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Sync current state for this user
      console.log('🔄 Syncing hand raise state...');
      await handRaiseService.syncHandRaiseState(meetingId, currentUser.id);
      
      // Check if current user already has hand raised
      console.log('❓ Checking current hand status...');
      const handStatus = await handRaiseService.checkHandStatus(meetingId, currentUser.id);
      setIsHandRaised(handStatus.hand_raised || false);
      console.log('🖐️ Current hand status:', handStatus.hand_raised);
      
      // Load current raised hands
      console.log('📋 Loading current raised hands...');
      await loadRaisedHands();
      
      initializedRef.current = true;
      console.log('✅ Hand raise system fully initialized');
    } catch (error) {
      console.error('❌ Failed to initialize hand raise:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [meetingId, currentUser, loadRaisedHands]);

  // Start polling for hand raise updates
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current || !initializedRef.current) return;
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        console.log('🔄 Polling for hand raise updates...');
        await loadRaisedHands();
        
        // Also check our own hand status
        if (currentUser) {
          const handStatus = await handRaiseService.checkHandStatus(meetingId, currentUser.id);
          setIsHandRaised(handStatus.hand_raised || false);
        }
      } catch (error) {
        console.error('❌ Polling error:', error);
        // If polling fails consistently, the meeting might have ended
        if (error.response?.status === 404) {
          console.log('🔚 Meeting appears to have ended, stopping polling');
          stopPolling();
        }
      }
    }, 3000); // Poll every 3 seconds
    
    console.log('🔄 Started hand raise polling');
  }, [meetingId, currentUser, loadRaisedHands]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
      console.log('⏹️ Stopped hand raise polling');
    }
  }, []);

  // Toggle hand raise for current user
  const toggleHandRaise = useCallback(async () => {
    if (!meetingId || !currentUser || isLoading) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const action = isHandRaised ? 'lower' : 'raise';
      const response = await handRaiseService.toggleHand(
        meetingId,
        currentUser.id,
        currentUser.full_name || currentUser.name || 'User',
        `user_${currentUser.id}`,
        action
      );
      
      if (response.success) {
        setIsHandRaised(!isHandRaised);
        
        // Broadcast via LiveKit if available
        if (livekitRoom && response.send_via_livekit && response.data) {
          try {
            const dataToSend = JSON.stringify({
              type: 'hand_raise_update',
              ...response.data
            });
            
            console.log('📡 Broadcasting hand raise data:', dataToSend);
            
            livekitRoom.localParticipant.publishData(
              dataToSend,
              'reliable'
            );
            console.log('📡 Hand raise broadcasted via LiveKit');
          } catch (broadcastError) {
            console.warn('⚠️ Failed to broadcast via LiveKit:', broadcastError);
          }
        }
        
        // Immediately refresh the list
        await loadRaisedHands();
      }
    } catch (error) {
      console.error('❌ Failed to toggle hand raise:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [meetingId, currentUser, isHandRaised, isLoading, livekitRoom, loadRaisedHands]);

  // Host acknowledges a hand
  const acknowledgeHand = useCallback(async (participantUserId, action = 'acknowledge') => {
    if (!meetingId || !currentUser || !isHost || isLoading) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const participant = raisedHands.find(hand => hand.user_id === participantUserId);
      const participantName = participant?.user?.full_name || 'Participant';
      
      const response = await handRaiseService.acknowledgeHand(
        meetingId,
        currentUser.id,
        participantUserId,
        participantName,
        action
      );
      
      if (response.success) {
        // Broadcast via LiveKit if available
        if (livekitRoom && response.send_via_livekit && response.data) {
          try {
            const dataToSend = JSON.stringify({
              type: 'hand_acknowledgment',
              ...response.data
            });
            
            console.log('📡 Broadcasting acknowledgment data:', dataToSend);
            
            livekitRoom.localParticipant.publishData(
              dataToSend,
              'reliable'
            );
            console.log('📡 Hand acknowledgment broadcasted via LiveKit');
          } catch (broadcastError) {
            console.warn('⚠️ Failed to broadcast acknowledgment via LiveKit:', broadcastError);
          }
        }
        
        // Immediately refresh the list
        await loadRaisedHands();
      }
    } catch (error) {
      console.error('❌ Failed to acknowledge hand:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [meetingId, currentUser, isHost, isLoading, raisedHands, livekitRoom, loadRaisedHands]);

  // Host clears all hands
  const clearAllHands = useCallback(async () => {
    if (!meetingId || !currentUser || !isHost || isLoading) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await handRaiseService.clearAllHands(meetingId, currentUser.id);
      
      if (response.success) {
        // Broadcast via LiveKit if available
        if (livekitRoom && response.send_via_livekit && response.data) {
          try {
            const dataToSend = JSON.stringify({
              type: 'clear_all_hands',
              ...response.data
            });
            
            console.log('📡 Broadcasting clear all data:', dataToSend);
            
            livekitRoom.localParticipant.publishData(
              dataToSend,
              'reliable'
            );
            console.log('📡 Clear all hands broadcasted via LiveKit');
          } catch (broadcastError) {
            console.warn('⚠️ Failed to broadcast clear all via LiveKit:', broadcastError);
          }
        }
        
        // Clear local state
        setRaisedHands([]);
        setIsHandRaised(false);
      }
    } catch (error) {
      console.error('❌ Failed to clear all hands:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [meetingId, currentUser, isHost, isLoading, livekitRoom]);

  // Handle LiveKit data messages - FIXED VERSION
  const handleLivekitDataMessage = useCallback((data, participant, kind, topic) => {
    try {
      // Convert data to string if it's not already
      let dataString;
      
      if (data instanceof Uint8Array) {
        dataString = new TextDecoder('utf-8').decode(data);
      } else if (data instanceof ArrayBuffer) {
        dataString = new TextDecoder('utf-8').decode(new Uint8Array(data));
      } else if (typeof data === 'string') {
        dataString = data;
      } else {
        // Try to convert to string as fallback
        dataString = String(data);
      }
      
      console.log('📡 Raw LiveKit data received:', dataString);
      console.log('📡 Data type:', typeof data);
      console.log('📡 Data constructor:', data?.constructor?.name);
      
      // Check if it looks like JSON before parsing
      const trimmedData = dataString.trim();
      if (!trimmedData || (!trimmedData.startsWith('{') && !trimmedData.startsWith('['))) {
        console.log('📡 Ignoring non-JSON data:', trimmedData);
        return;
      }
      
      // Additional validation - check for basic JSON structure
      if (trimmedData.length < 2) {
        console.log('📡 Data too short to be valid JSON:', trimmedData);
        return;
      }
      
      const message = JSON.parse(trimmedData);
      
      // Only process hand raise related messages
      if (message.type === 'hand_raise_update' || 
          message.type === 'hand_acknowledgment' || 
          message.type === 'clear_all_hands' ||
          message.type === 'hand_state_sync') {
        
        console.log('📡 Received hand raise update via LiveKit:', message);
        
        // Refresh the hands list
        loadRaisedHands();
        
        // Update own hand status if relevant
        if (message.user_id === currentUser?.id) {
          if (message.type === 'hand_raise_update') {
            setIsHandRaised(message.action === 'raise');
          } else if (message.type === 'clear_all_hands') {
            setIsHandRaised(false);
          }
        }
      } else {
        console.log('📡 Ignoring non-hand-raise message type:', message.type);
      }
    } catch (error) {
      console.error('❌ Failed to parse LiveKit hand raise message:', error);
      console.error('❌ Raw data that failed to parse:', data);
      console.error('❌ Data type that failed:', typeof data);
      
      // Log the first few characters to help debug
      if (data) {
        try {
          const preview = String(data).substring(0, 50);
          console.error('❌ Data preview (first 50 chars):', preview);
        } catch (previewError) {
          console.error('❌ Could not even convert to string for preview:', previewError);
        }
      }
    }
  }, [loadRaisedHands, currentUser]);

  // Cleanup when meeting ends
  const cleanup = useCallback(async () => {
    if (cleanupPerformedRef.current) return;
    
    console.log('🧹 Cleaning up hand raise system...');
    
    stopPolling();
    
    // End the hand raise system for this meeting
    if (meetingId) {
      try {
        await handRaiseService.endMeetingHandRaise(meetingId);
        console.log('✅ Hand raise system cleanup completed');
      } catch (error) {
        console.warn('⚠️ Hand raise cleanup failed:', error);
      }
    }
    
    // Reset state
    setRaisedHands([]);
    setIsHandRaised(false);
    setHandRaiseStats(null);
    setError(null);
    initializedRef.current = false;
    cleanupPerformedRef.current = true;
  }, [meetingId, stopPolling]);

  // Get statistics
  const getStats = useCallback(async () => {
    if (!meetingId) return;
    
    try {
      const response = await handRaiseService.getHandRaiseStats(meetingId);
      if (response.success) {
        setHandRaiseStats(response.stats);
      }
    } catch (error) {
      console.error('❌ Failed to get hand raise stats:', error);
    }
  }, [meetingId]);

  // Initialize when component mounts
  useEffect(() => {
    if (meetingId && currentUser && !initializedRef.current) {
      console.log('🚀 Hand raise hook: Starting initialization...');
      initializeHandRaise().then(() => {
        console.log('✅ Hand raise initialization complete, starting polling...');
        startPolling();
      }).catch((error) => {
        console.error('❌ Hand raise initialization failed:', error);
        setError(`Initialization failed: ${error.message}`);
      });
    }
    
    return () => {
      stopPolling();
    };
  }, [meetingId, currentUser, initializeHandRaise, startPolling, stopPolling]);

  // Setup LiveKit listener - IMPROVED
  useEffect(() => {
    if (livekitRoom) {
      console.log('📡 Setting up LiveKit data listener');
      
      // Use the correct event name and handler signature
      const dataReceivedHandler = (payload, participant, kind, topic) => {
        console.log('📡 LiveKit dataReceived event fired');
        console.log('📡 Payload type:', typeof payload);
        console.log('📡 Participant:', participant?.identity);
        console.log('📡 Kind:', kind);
        console.log('📡 Topic:', topic);
        
        handleLivekitDataMessage(payload, participant, kind, topic);
      };
      
      livekitRoom.on('dataReceived', dataReceivedHandler);
      
      return () => {
        console.log('📡 Removing LiveKit data listener');
        livekitRoom.off('dataReceived', dataReceivedHandler);
      };
    }
  }, [livekitRoom, handleLivekitDataMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    // State
    raisedHands,
    isHandRaised,
    handRaiseStats,
    isLoading,
    error,
    
    // Actions
    toggleHandRaise,
    acknowledgeHand,
    clearAllHands,
    loadRaisedHands,
    getStats,
    cleanup,
    
    // Utilities
    pendingHandsCount: raisedHands.filter(hand => hand.status === 'waiting').length,
    totalHandsCount: raisedHands.length,
    isInitialized: initializedRef.current
  };
};