# Context Utilities Refactor Guide

This guide explains how to refactor chat contexts using the extracted utilities from `/utils/chatContextUtils.ts`.

## Overview

The `chatContextUtils.ts` file provides comprehensive utilities for:

- **Batch user fetching** with intelligent caching and deduplication
- **Unread count management** with standardized error handling
- **Message processing** with sender resolution
- **Pagination management** for loading earlier messages
- **Real-time listener management** with cleanup
- **Cache management** with TTL and validation

## Key Classes and Functions

### 1. UserBatchFetcher Class

Handles efficient user fetching with caching, deduplication, and retry logic.

```typescript
const userFetcher = new UserBatchFetcher(usersCache, setUsersCache);

// Batch fetch multiple users
const users = await userFetcher.fetchUserDetailsBatch(
  new Set(['uid1', 'uid2']),
);

// Single user with retry
const user = await userFetcher.fetchUserDetailsWithRetry('uid1');
```

### 2. Unread Count Management

```typescript
// Fetch unread count for a single chat
const unreadCount = await fetchUnreadCount(
  chatId,
  userId,
  'crew_date_chats', // or 'direct_messages'
  { fallbackValue: 0 },
);

// Compute total across all chats
const totalUnread = await computeTotalUnread(
  chats,
  userId,
  activeChats,
  'crew_date_chats',
);
```

### 3. Message Processing

```typescript
// Process single message
const message = await processMessage(docSnap, userFetcher);

// Process multiple messages in batch
const messages = await processMessagesBatch(docs, userFetcher);
```

### 4. Pagination Management

```typescript
const result = await loadEarlierMessages(
  chatId,
  'crew_date_chats',
  paginationInfo[chatId],
  setPaginationInfo,
  { messagesPerLoad: 20, logPrefix: '[CrewChat]' },
);
```

### 5. Real-time Listeners

```typescript
const listenerManager = new MessageListenerManager();

// Create listener
const unsubscribe = createMessageListener(
  chatId,
  userId,
  'crew_date_chats',
  userFetcher,
  setMessages,
  setPaginationInfo,
  { enableCaching: true, cachePrefix: 'crew_messages' },
);

listenerManager.addListener(chatId, unsubscribe);
```

## Refactoring CrewDateChatContext

### Before (Existing Pattern)

```typescript
// Old user fetching with separate caching logic
const fetchUserDetailsBatch = useCallback(
  async (uids: Set<string>) => {
    // 50+ lines of deduplication, caching, retry logic
  },
  [usersCache, setUsersCache],
);

// Old unread count fetching
const fetchUnreadCount = useCallback(
  async (chatId: string) => {
    // 30+ lines of error handling and count logic
  },
  [user?.uid],
);

// Old message processing
const processMessage = useCallback(
  async (docSnap) => {
    // Message processing with individual user fetching
  },
  [fetchUserDetailsWithRetry],
);
```

### After (Using Context Utils)

```typescript
import {
  UserBatchFetcher,
  fetchUnreadCount,
  computeTotalUnread,
  processMessagesBatch,
  createMessageListener,
  MessageListenerManager,
} from '@/utils/chatContextUtils';

export const CrewDateChatProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, activeChats } = useUser();
  const { usersCache, setUsersCache } = useCrews();

  // Initialize utilities
  const userFetcher = useMemo(
    () => new UserBatchFetcher(usersCache, setUsersCache),
    [usersCache, setUsersCache],
  );

  const listenerManager = useMemo(() => new MessageListenerManager(), []);

  // Simplified unread count fetching
  const fetchChatUnreadCount = useCallback(
    (chatId: string) =>
      fetchUnreadCount(chatId, user?.uid || '', 'crew_date_chats'),
    [user?.uid],
  );

  const computeChatTotalUnread = useCallback(async () => {
    if (!user?.uid) {
      setTotalUnread(0);
      return;
    }

    const total = await computeTotalUnread(
      chats,
      user.uid,
      activeChats,
      'crew_date_chats',
    );
    setTotalUnread(total);
  }, [user?.uid, chats, activeChats]);

  // Simplified message listener
  const listenToMessages = useCallback(
    (chatId: string) => {
      if (listenerManager.hasListener(chatId)) {
        return () => listenerManager.removeListener(chatId);
      }

      const unsubscribe = createMessageListener(
        chatId,
        user?.uid || '',
        'crew_date_chats',
        userFetcher,
        setMessages,
        setMessagePaginationInfo,
        { enableCaching: true, cachePrefix: 'crew_messages' },
      );

      listenerManager.addListener(chatId, unsubscribe);
      return () => listenerManager.removeListener(chatId);
    },
    [user?.uid, userFetcher, listenerManager],
  );

  // Simplified pagination
  const loadEarlierMessages = useCallback(
    async (chatId: string) => {
      const result = await loadEarlierMessages(
        chatId,
        'crew_date_chats',
        messagePaginationInfo[chatId],
        setMessagePaginationInfo,
        { messagesPerLoad: 20, logPrefix: '[CrewChat]' },
      );
      return result.success;
    },
    [messagePaginationInfo],
  );

  // ... rest of context implementation
};
```

## Refactoring DirectMessagesContext

### Key Changes for DM Context

```typescript
import {
  UserBatchFetcher,
  fetchUnreadCount,
  computeTotalUnread,
  createMessageListener,
  MessageListenerManager,
  loadEarlierMessages,
} from '@/utils/chatContextUtils';

export const DirectMessagesProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, activeChats } = useUser();
  const { usersCache, setUsersCache, fetchUserDetails } = useCrews();

  // Replace pendingUserFetches.current with UserBatchFetcher
  const userFetcher = useMemo(
    () => new UserBatchFetcher(usersCache, setUsersCache),
    [usersCache, setUsersCache],
  );

  const listenerManager = useMemo(() => new MessageListenerManager(), []);

  // Replace individual unread count logic
  const fetchDMUnreadCount = useCallback(
    (dmId: string) =>
      fetchUnreadCount(dmId, user?.uid || '', 'direct_messages'),
    [user?.uid],
  );

  const computeDMTotalUnread = useCallback(async () => {
    if (!user?.uid) {
      setTotalUnread(0);
      return;
    }

    const total = await computeTotalUnread(
      dms,
      user.uid,
      activeChats,
      'direct_messages',
    );
    setTotalUnread(total);
  }, [user?.uid, dms, activeChats]);

  // Replace complex listenToDMMessages
  const listenToDMMessages = useCallback(
    (dmId: string) => {
      if (listenerManager.hasListener(dmId)) {
        return () => listenerManager.removeListener(dmId);
      }

      const unsubscribe = createMessageListener(
        dmId,
        user?.uid || '',
        'direct_messages',
        userFetcher,
        setMessages,
        setMessagePaginationInfo,
        { enableCaching: true, cachePrefix: 'dm_messages' },
      );

      listenerManager.addListener(dmId, unsubscribe);
      return () => listenerManager.removeListener(dmId);
    },
    [user?.uid, userFetcher, listenerManager],
  );

  // Replace loadEarlierMessages implementation
  const loadEarlierDMMessages = useCallback(
    async (dmId: string) => {
      const result = await loadEarlierMessages(
        dmId,
        'direct_messages',
        messagePaginationInfo[dmId],
        setMessagePaginationInfo,
        { messagesPerLoad: 20, logPrefix: '[DMChat]' },
      );
      return result.success;
    },
    [messagePaginationInfo],
  );

  // ... rest of context implementation
};
```

## Performance Benefits

### 1. Reduced Code Duplication

- **Before**: ~400 lines of duplicate logic between contexts
- **After**: ~50 lines using shared utilities

### 2. Improved User Fetching

- **Deduplication**: Eliminates duplicate user fetches
- **Batch optimization**: Uses efficient queries based on batch size
- **Retry logic**: Handles failures gracefully
- **Cache management**: Reduces redundant network calls

### 3. Standardized Error Handling

- **Consistent patterns**: Same error handling across all chats
- **Permission errors**: Graceful handling of Firestore permission issues
- **Fallback values**: Safe defaults when operations fail

### 4. Enhanced Pagination

- **Standardized logic**: Consistent pagination behavior
- **Loading states**: Proper loading indicators
- **Error recovery**: Handles pagination failures

### 5. Memory Management

- **Listener cleanup**: Automatic cleanup of real-time listeners
- **Cache TTL**: Automatic cleanup of old cached data
- **Pending request management**: Prevents memory leaks

## Migration Steps

1. **Install the context utils**: Copy `chatContextUtils.ts` to your utils folder

2. **Update imports**: Import required utilities in your context files

3. **Replace user fetching**: Use `UserBatchFetcher` instead of custom logic

4. **Replace unread counts**: Use standardized unread count functions

5. **Replace message processing**: Use batch message processing

6. **Replace listeners**: Use `createMessageListener` and `MessageListenerManager`

7. **Replace pagination**: Use standardized `loadEarlierMessages`

8. **Test thoroughly**: Verify all functionality works as expected

9. **Clean up**: Remove old utility functions and optimize imports

## Next Steps

After implementing these utilities:

1. **Update DM chat component** to use the new context patterns
2. **Consider extracting more patterns** as they emerge
3. **Add performance monitoring** to track improvements
4. **Document any context-specific customizations** needed

This refactor provides a solid foundation for scalable chat functionality while maintaining type safety and performance optimizations.
