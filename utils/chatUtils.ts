// Chat utilities for reusable chat functionality
// Extracted from crew-date-chat.tsx for use in DM chat refactor and other chat implementations

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { storage } from '@/storage'; // MMKV instance
import { User } from '@/types/User';
import { IMessage } from 'react-native-gifted-chat';

// ============================================================================
// CONSTANTS
// ============================================================================

export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
export const TYPING_TIMEOUT = 1000;
export const READ_UPDATE_DEBOUNCE = 1000;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface CachedData<T> {
  data: T;
  timestamp: number;
}

export interface CachedMemberData {
  members: User[];
  timestamp: number;
}

export interface CachedChatState {
  lastReadByUsers: Record<string, Date>;
  otherUsersTyping: Record<string, boolean>;
  timestamp: number;
}

export interface ExtendedMessage extends IMessage {
  poll?: {
    question: string;
    options: string[];
    votes: { [optionIndex: number]: string[] };
    totalVotes: number;
  };
}

export interface PerformanceMetrics {
  cacheHits: number;
  cacheMisses: number;
  loadTime: number;
  cacheHitRate: string;
}

// ============================================================================
// CACHE UTILITIES
// ============================================================================

/**
 * Generate a standardized cache key for chat-related data
 */
export const getCacheKey = (
  type: string,
  chatId: string,
  additionalKey?: string,
): string =>
  `chat_${type}_${chatId}${additionalKey ? `_${additionalKey}` : ''}`;

/**
 * Get cached data with TTL validation
 */
export const getCachedData = function <T>(key: string): T | null {
  try {
    const cached = storage.getString(key);
    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached);
    const isExpired = Date.now() - parsed.timestamp > CACHE_TTL;

    if (isExpired) {
      storage.delete(key); // Clean up expired cache
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to get cached data:', error);
    return null;
  }
};

/**
 * Set cached data with timestamp
 */
export const setCachedData = function <T>(key: string, data: T): void {
  try {
    const cacheData = { ...data, timestamp: Date.now() };
    storage.set(key, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('Failed to cache data:', error);
  }
};

/**
 * Clear specific cache entries
 */
export const clearCachedData = (key: string): void => {
  try {
    storage.delete(key);
  } catch (error) {
    console.warn('Failed to clear cached data:', error);
  }
};

/**
 * Clear all cache entries for a specific chat
 */
export const clearChatCache = (chatId: string): void => {
  const types = ['members', 'crew', 'state', 'messages'];
  types.forEach((type) => {
    clearCachedData(getCacheKey(type, chatId));
  });
};

// ============================================================================
// PERFORMANCE MONITORING HOOK
// ============================================================================

/**
 * Hook for monitoring chat performance metrics including cache hits and load times
 */
export const usePerformanceMonitoring = (chatId: string | null) => {
  const cacheHits = useRef(0);
  const cacheMisses = useRef(0);
  const loadStartTime = useRef<number>(Date.now());

  const recordCacheLoad = useCallback((isHit: boolean) => {
    if (isHit) {
      cacheHits.current++;
    } else {
      cacheMisses.current++;
    }
  }, []);

  const recordFullLoad = useCallback(() => {
    const loadTime = Date.now() - loadStartTime.current;
    const totalRequests = cacheHits.current + cacheMisses.current;
    const cacheHitRate =
      totalRequests > 0
        ? ((cacheHits.current / totalRequests) * 100).toFixed(1)
        : '0';

    if (__DEV__ && chatId) {
      console.log('🚀 Chat Load Performance:', {
        chatId,
        loadTime: `${loadTime}ms`,
        cacheHits: cacheHits.current,
        cacheMisses: cacheMisses.current,
        cacheHitRate: `${cacheHitRate}%`,
        timestamp: new Date().toISOString(),
      });
    }
  }, [chatId]);

  const getMetrics = useCallback((): PerformanceMetrics => {
    const totalRequests = cacheHits.current + cacheMisses.current;
    const cacheHitRate =
      totalRequests > 0
        ? ((cacheHits.current / totalRequests) * 100).toFixed(1)
        : '0';

    return {
      cacheHits: cacheHits.current,
      cacheMisses: cacheMisses.current,
      loadTime: Date.now() - loadStartTime.current,
      cacheHitRate: `${cacheHitRate}%`,
    };
  }, []);

  const resetMetrics = useCallback(() => {
    cacheHits.current = 0;
    cacheMisses.current = 0;
    loadStartTime.current = Date.now();
  }, []);

  return {
    recordCacheLoad,
    recordFullLoad,
    getMetrics,
    resetMetrics,
  };
};

// ============================================================================
// TYPING HANDLER HOOK
// ============================================================================

/**
 * Hook for handling typing status with debouncing and cleanup
 */
export const useTypingHandler = (
  updateTypingStatusImmediately: (isTyping: boolean) => Promise<void>,
) => {
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevTypingStateRef = useRef<boolean>(false);

  const debouncedStopTyping = useMemo(
    () =>
      debounce(() => {
        updateTypingStatusImmediately(false);
        prevTypingStateRef.current = false;
      }, 500),
    [updateTypingStatusImmediately],
  );

  const handleInputTextChanged = useCallback(
    (text: string) => {
      const isTyping = text.length > 0;

      // Clear any existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      // Only send updates when typing state changes to avoid unnecessary writes
      if (isTyping !== prevTypingStateRef.current) {
        if (isTyping) {
          updateTypingStatusImmediately(true);
          prevTypingStateRef.current = true;
        } else {
          debouncedStopTyping();
        }
      }

      // Set timeout to clear typing status after inactivity
      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          updateTypingStatusImmediately(false);
          prevTypingStateRef.current = false;
          typingTimeoutRef.current = null;
        }, TYPING_TIMEOUT);
      }
    },
    [updateTypingStatusImmediately, debouncedStopTyping],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedStopTyping.cancel();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [debouncedStopTyping]);

  return { handleInputTextChanged };
};

// ============================================================================
// OPTIMISTIC MESSAGING HOOK
// ============================================================================

/**
 * Hook for managing optimistic messages and filtering out duplicates
 */
export const useOptimisticMessages = <T extends IMessage>(
  conversationMessages: any[],
  user: any,
  getDisplayName: (userId: string) => string,
  getAvatar: (userId: string) => string | undefined,
  isMessageReadByAll?: (messageTimestamp: Date) => boolean,
) => {
  const [optimisticMessages, setOptimisticMessages] = useState<T[]>([]);

  const giftedChatMessages: T[] = useMemo(() => {
    // Ensure conversationMessages is an array to prevent .map errors
    const safeConversationMessages = Array.isArray(conversationMessages)
      ? conversationMessages
      : [];

    // Debug log if conversationMessages is not an array
    if (!Array.isArray(conversationMessages) && __DEV__) {
      console.warn(
        '🚨 conversationMessages is not an array:',
        conversationMessages,
        'type:',
        typeof conversationMessages,
      );
    }

    const serverMessages = safeConversationMessages
      .map((message) => {
        const messageTime =
          message.createdAt instanceof Date
            ? message.createdAt
            : new Date(message.createdAt);

        const isReadByAllUsers =
          message.senderId === user?.uid && isMessageReadByAll
            ? isMessageReadByAll(messageTime)
            : false;

        return {
          _id: message.id,
          text: message.text,
          createdAt: messageTime,
          user: {
            _id: message.senderId,
            name:
              message.senderId === user?.uid
                ? user?.displayName || 'You'
                : getDisplayName(message.senderId),
            avatar:
              message.senderId === user?.uid
                ? user?.photoURL
                : getAvatar(message.senderId),
          },
          sent: true,
          received: isReadByAllUsers,
          image: message.imageUrl,
          // Include any additional properties like poll
          ...((message as any).poll && { poll: (message as any).poll }),
        } as T;
      })
      .reverse();

    // Filter out optimistic messages that have been confirmed by server
    const newOptimisticMessages = optimisticMessages.filter((optMsg) => {
      return !serverMessages.some(
        (serverMsg) =>
          serverMsg.text === optMsg.text &&
          Math.abs(
            new Date(serverMsg.createdAt).getTime() -
              new Date(optMsg.createdAt).getTime(),
          ) < 5000,
      );
    });

    // Update optimistic messages if they changed
    if (newOptimisticMessages.length !== optimisticMessages.length) {
      setOptimisticMessages(newOptimisticMessages);
    }

    return [...newOptimisticMessages, ...serverMessages];
  }, [
    conversationMessages,
    user?.uid,
    user?.displayName,
    user?.photoURL,
    optimisticMessages,
    getDisplayName,
    getAvatar,
    isMessageReadByAll,
  ]);

  return {
    giftedChatMessages,
    optimisticMessages,
    setOptimisticMessages,
  };
};

// ============================================================================
// CACHED STATE HOOK
// ============================================================================

/**
 * Hook for managing cached chat state with MMKV for instant loading
 */
export const useCachedChatState = (
  chatId: string | null,
  recordCacheLoad: (isHit: boolean) => void,
) => {
  // Initialize with cached data for instant loading
  const [cachedMembers, setCachedMembers] = useState<User[]>(() => {
    if (!chatId) return [];
    const cached = getCachedData<CachedMemberData>(
      getCacheKey('members', chatId),
    );
    const hasCache = Boolean(cached?.members && cached.members.length > 0);
    recordCacheLoad(hasCache);
    return cached?.members || [];
  });

  const [cachedTypingState, setCachedTypingState] = useState<
    Record<string, boolean>
  >(() => {
    if (!chatId) return {};
    const cached = getCachedData<CachedChatState>(getCacheKey('state', chatId));
    const hasCache = Boolean(cached?.otherUsersTyping);
    recordCacheLoad(hasCache);
    return cached?.otherUsersTyping || {};
  });

  const [cachedReadState, setCachedReadState] = useState<Record<string, Date>>(
    () => {
      if (!chatId) return {};
      const cached = getCachedData<CachedChatState>(
        getCacheKey('state', chatId),
      );
      const hasCache = Boolean(cached?.lastReadByUsers);
      recordCacheLoad(hasCache);
      return cached?.lastReadByUsers || {};
    },
  );

  // Cache members when they change
  useEffect(() => {
    if (chatId && cachedMembers.length > 0) {
      setCachedData(getCacheKey('members', chatId), { members: cachedMembers });
    }
  }, [chatId, cachedMembers]);

  // Cache chat state when it changes
  useEffect(() => {
    if (chatId) {
      setCachedData(getCacheKey('state', chatId), {
        lastReadByUsers: cachedReadState,
        otherUsersTyping: cachedTypingState,
      });
    }
  }, [chatId, cachedReadState, cachedTypingState]);

  return {
    cachedMembers,
    setCachedMembers,
    cachedTypingState,
    setCachedTypingState,
    cachedReadState,
    setCachedReadState,
  };
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate and ensure messages array format
 */
export const ensureMessagesArray = (messages: any, chatId?: string): any[] => {
  if (Array.isArray(messages)) {
    return messages;
  }

  // Handle legacy cache format where messages might be wrapped in an object
  if (
    messages &&
    typeof messages === 'object' &&
    'messages' in messages &&
    Array.isArray((messages as any).messages)
  ) {
    if (__DEV__) {
      console.warn('🔧 Converting legacy cache format for chatId:', chatId);
    }
    return (messages as any).messages;
  }

  // If it's an unexpected format, log warning and return empty array
  if (__DEV__ && messages) {
    console.warn(
      '🔧 Messages received as object instead of array:',
      messages,
      'for chatId:',
      chatId,
      '- returning empty array',
    );
  }

  return [];
};

/**
 * Create an optimistic message for immediate UI feedback
 */
export const createOptimisticMessage = (
  text: string,
  user: any,
  image?: string,
): IMessage => {
  return {
    _id: `optimistic_${Date.now()}_${Math.random()}`,
    text,
    createdAt: new Date(),
    user: {
      _id: user.uid,
      name: user.displayName || 'You',
      avatar: user.photoURL,
    },
    sent: false,
    received: false,
    pending: true,
    ...(image && { image }),
  };
};

/**
 * Clean up any legacy cache entries that might be causing conflicts
 */
export const cleanupLegacyCache = (chatId: string): void => {
  if (!chatId) return;

  try {
    // Clean up potential legacy cache keys
    const legacyKeys = [
      `messages_${chatId}`,
      `component_messages_${chatId}`,
      `crew_chat_${chatId}`,
    ];

    legacyKeys.forEach((key) => {
      if (storage.contains(key)) {
        storage.delete(key);
        if (__DEV__) {
          console.log('🧹 Cleaned up legacy cache key:', key);
        }
      }
    });
  } catch (error) {
    console.warn('Failed to cleanup legacy cache:', error);
  }
};
