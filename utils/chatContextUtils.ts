// utils/chatContextUtils.ts
// Reusable utilities extracted from chat contexts for DM and crew date chat refactoring

import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  orderBy,
  onSnapshot,
  getCountFromServer,
  limit,
  startAfter,
  DocumentData,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { User } from '@/types/User';
import { storage } from '@/storage';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface MessagePaginationInfo {
  hasMore: boolean;
  loading: boolean;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
}

export interface ProcessedMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: Date;
  senderName?: string;
  imageUrl?: string;
  poll?: any;
}

export interface UserFetchResult {
  user: User;
  fromCache: boolean;
}

export interface BatchUserFetchOptions {
  maxRetries?: number;
  retryDelay?: number;
  useEfficiencyThreshold?: number;
}

export interface UnreadCountOptions {
  includePermissionErrors?: boolean;
  fallbackValue?: number;
}

export interface MessageListenerOptions {
  messagesPerLoad?: number;
  enableCaching?: boolean;
  cachePrefix?: string;
}

export interface PaginationLoadOptions {
  messagesPerLoad?: number;
  logPrefix?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_MESSAGES_PER_LOAD = 20;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_DELAY = 1000;
export const EFFICIENCY_THRESHOLD = 10; // Use 'in' query for batches <= 10 users

// ============================================================================
// BATCH USER FETCHING WITH DEDUPLICATION
// ============================================================================

/**
 * Efficiently fetches user details in batches with caching and deduplication
 * Optimized for performance with proper retry logic and batch management
 */
export class UserBatchFetcher {
  private usersCache: { [uid: string]: User };
  private setUsersCache: (
    updater: (prev: { [uid: string]: User }) => { [uid: string]: User },
  ) => void;
  private pendingBatches = new Map<string, Promise<User[]>>();

  constructor(
    usersCache: { [uid: string]: User },
    setUsersCache: (
      updater: (prev: { [uid: string]: User }) => { [uid: string]: User },
    ) => void,
  ) {
    this.usersCache = usersCache;
    this.setUsersCache = setUsersCache;
  }

  /**
   * Batch fetch user details with intelligent caching and deduplication
   */
  async fetchUserDetailsBatch(
    uids: Set<string>,
    options: BatchUserFetchOptions = {},
  ): Promise<User[]> {
    const { useEfficiencyThreshold = EFFICIENCY_THRESHOLD } = options;

    const uncachedUids = [...uids].filter((uid) => !this.usersCache[uid]);

    if (uncachedUids.length === 0) {
      return [...uids].map((uid) => this.usersCache[uid]).filter(Boolean);
    }

    const batchKey = uncachedUids.sort().join(',');

    // Return existing batch promise if in progress
    if (this.pendingBatches.has(batchKey)) {
      const results = await this.pendingBatches.get(batchKey)!;
      return [...uids]
        .map(
          (uid) => this.usersCache[uid] || results.find((u) => u.uid === uid),
        )
        .filter(Boolean);
    }

    const batchPromise = this.executeBatchFetch(
      uncachedUids,
      useEfficiencyThreshold,
    );
    this.pendingBatches.set(batchKey, batchPromise);

    try {
      const results = await batchPromise;
      return [...uids]
        .map(
          (uid) => this.usersCache[uid] || results.find((u) => u.uid === uid),
        )
        .filter(Boolean);
    } finally {
      this.pendingBatches.delete(batchKey);
    }
  }

  private async executeBatchFetch(
    uncachedUids: string[],
    efficiencyThreshold: number,
  ): Promise<User[]> {
    try {
      let results: User[] = [];

      if (uncachedUids.length <= efficiencyThreshold) {
        // Use efficient 'in' query for small batches
        const userQuery = query(
          collection(db, 'users'),
          where('__name__', 'in', uncachedUids),
        );
        const userDocs = await getDocs(userQuery);

        results = userDocs.docs.map(
          (doc) =>
            ({
              uid: doc.id,
              displayName: doc.data().displayName || 'Unknown User',
              email: doc.data().email || '',
              photoURL: doc.data().photoURL,
              ...doc.data(),
            }) as User,
        );
      } else {
        // For larger batches, fetch all and filter
        const userDocs = await getDocs(collection(db, 'users'));
        results = userDocs.docs
          .filter((doc) => uncachedUids.includes(doc.id))
          .map(
            (doc) =>
              ({
                uid: doc.id,
                displayName: doc.data().displayName || 'Unknown User',
                email: doc.data().email || '',
                photoURL: doc.data().photoURL,
                ...doc.data(),
              }) as User,
          );
      }

      // Batch update cache
      const newUsers = Object.fromEntries(
        results.map((user) => [user.uid, user]),
      );
      this.setUsersCache((prev) => ({ ...prev, ...newUsers }));

      return results;
    } catch (error) {
      console.error('Batch user fetch failed:', error);
      throw error;
    }
  }

  /**
   * Single user fetch with retry logic
   */
  async fetchUserDetailsWithRetry(
    uid: string,
    retries = 0,
    options: BatchUserFetchOptions = {},
  ): Promise<User> {
    const {
      maxRetries = DEFAULT_MAX_RETRIES,
      retryDelay = DEFAULT_RETRY_DELAY,
    } = options;

    try {
      const results = await this.fetchUserDetailsBatch(new Set([uid]), options);
      const user = results.find((u) => u.uid === uid);

      if (!user) throw new Error(`User ${uid} not found`);
      return user;
    } catch (error) {
      if (retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return this.fetchUserDetailsWithRetry(uid, retries + 1, options);
      }

      console.warn(`Failed to fetch user ${uid} after ${maxRetries} retries`);
      return {
        uid,
        displayName: 'Unknown User',
        photoURL: undefined,
        email: '',
      };
    }
  }

  /**
   * Clear pending batches (useful for cleanup)
   */
  clearPendingBatches(): void {
    this.pendingBatches.clear();
  }
}

// ============================================================================
// UNREAD COUNT MANAGEMENT
// ============================================================================

/**
 * Standardized unread count fetching with error handling
 */
export async function fetchUnreadCount(
  chatId: string,
  userId: string,
  collectionPath: string,
  options: UnreadCountOptions = {},
): Promise<number> {
  const { includePermissionErrors = false, fallbackValue = 0 } = options;

  if (!userId) return fallbackValue;

  try {
    const chatRef = doc(db, collectionPath, chatId);
    const chatDoc = await getDoc(chatRef);

    if (!chatDoc.exists()) return fallbackValue;

    const chatData = chatDoc.data();
    const lastRead = chatData?.lastRead?.[userId];

    if (!lastRead) return fallbackValue;

    const messagesRef = collection(db, collectionPath, chatId, 'messages');
    const unreadQuery = query(messagesRef, where('createdAt', '>', lastRead));

    const countSnapshot = await getCountFromServer(unreadQuery);
    return countSnapshot.data().count;
  } catch (error: any) {
    if (error.code === 'permission-denied' && !includePermissionErrors) {
      return fallbackValue;
    }
    if (error.code === 'unavailable') {
      return fallbackValue;
    }
    console.error(`Error fetching unread count for ${chatId}:`, error);
    return fallbackValue;
  }
}

/**
 * Compute total unread across multiple chats with active chat filtering
 */
export async function computeTotalUnread<T extends { id: string }>(
  chats: T[],
  userId: string,
  activeChats: Set<string>,
  collectionPath: string,
  options: UnreadCountOptions = {},
): Promise<number> {
  if (!userId || chats.length === 0) return 0;

  try {
    const unreadPromises = chats
      .filter((chat) => !activeChats.has(chat.id))
      .map((chat) =>
        fetchUnreadCount(chat.id, userId, collectionPath, options),
      );

    const unreadCounts = await Promise.all(unreadPromises);
    return unreadCounts.reduce((acc, count) => acc + count, 0);
  } catch (error) {
    console.error('Error computing total unread messages:', error);
    return 0;
  }
}

// ============================================================================
// MESSAGE PROCESSING
// ============================================================================

/**
 * Process a Firestore message document into a standardized message format
 */
export async function processMessage(
  docSnap: QueryDocumentSnapshot<DocumentData>,
  userFetcher: UserBatchFetcher,
): Promise<ProcessedMessage> {
  const msgData = docSnap.data();
  const senderId: string = msgData.senderId;
  const sender = await userFetcher.fetchUserDetailsWithRetry(senderId);

  return {
    id: docSnap.id,
    senderId,
    text: msgData.text || '',
    createdAt: msgData.createdAt?.toDate() || new Date(),
    senderName: sender.displayName,
    imageUrl: msgData.imageUrl,
    poll: msgData.poll,
  };
}

/**
 * Process multiple messages in batch with sender resolution
 */
export async function processMessagesBatch(
  docs: QueryDocumentSnapshot<DocumentData>[],
  userFetcher: UserBatchFetcher,
): Promise<ProcessedMessage[]> {
  // Extract all unique sender IDs for batch fetching
  const senderIds = new Set(docs.map((doc) => doc.data().senderId));

  // Batch fetch all required users
  await userFetcher.fetchUserDetailsBatch(senderIds);

  // Process all messages (users are now cached)
  return Promise.all(docs.map((doc) => processMessage(doc, userFetcher)));
}

// ============================================================================
// PAGINATION MANAGEMENT
// ============================================================================

/**
 * Load earlier messages with standardized pagination logic
 */
export async function loadEarlierMessages(
  chatId: string,
  collectionPath: string,
  paginationInfo: MessagePaginationInfo | undefined,
  setPaginationInfo: (
    updater: (prev: { [key: string]: MessagePaginationInfo }) => {
      [key: string]: MessagePaginationInfo;
    },
  ) => void,
  options: PaginationLoadOptions = {},
): Promise<{
  success: boolean;
  messages: ProcessedMessage[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
}> {
  const { messagesPerLoad = DEFAULT_MESSAGES_PER_LOAD, logPrefix = '[Chat]' } =
    options;

  console.log(
    `${logPrefix} loadEarlierMessages called for ${chatId}: hasMore=${paginationInfo?.hasMore}, loading=${paginationInfo?.loading}`,
  );

  // Guard against invalid states
  if (!paginationInfo?.hasMore || paginationInfo?.loading) {
    console.log(
      `${logPrefix} Can't load earlier messages:`,
      !paginationInfo?.hasMore ? 'No more messages' : 'Already loading',
    );
    return { success: false, messages: [], lastDoc: null };
  }

  // Set loading state
  setPaginationInfo((prev) => ({
    ...prev,
    [chatId]: {
      ...prev[chatId],
      loading: true,
    },
  }));

  try {
    const lastDoc = paginationInfo.lastDoc;

    if (!lastDoc) {
      console.log(`${logPrefix} No lastDoc available for pagination`);
      setPaginationInfo((prev) => ({
        ...prev,
        [chatId]: {
          ...prev[chatId],
          loading: false,
          hasMore: false,
        },
      }));
      return { success: false, messages: [], lastDoc: null };
    }

    const messagesRef = collection(db, collectionPath, chatId, 'messages');
    const earlierQuery = query(
      messagesRef,
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(messagesPerLoad),
    );

    const querySnapshot = await getDocs(earlierQuery);
    const hasMoreMessages = querySnapshot.docs.length >= messagesPerLoad;
    const newLastDoc =
      querySnapshot.docs.length > 0
        ? querySnapshot.docs[querySnapshot.docs.length - 1]
        : null;

    // Update pagination info
    setPaginationInfo((prev) => ({
      ...prev,
      [chatId]: {
        ...prev[chatId],
        loading: false,
        hasMore: hasMoreMessages,
        lastDoc: newLastDoc,
      },
    }));

    return {
      success: true,
      messages: [], // Messages will be processed by caller with their specific logic
      lastDoc: newLastDoc,
    };
  } catch (error) {
    console.error(`${logPrefix} Error loading earlier messages:`, error);
    setPaginationInfo((prev) => ({
      ...prev,
      [chatId]: {
        ...prev[chatId],
        loading: false,
      },
    }));
    return { success: false, messages: [], lastDoc: null };
  }
}

// ============================================================================
// REAL-TIME LISTENER MANAGEMENT
// ============================================================================

/**
 * Create a standardized message listener with caching and pagination
 */
export function createMessageListener(
  chatId: string,
  userId: string,
  collectionPath: string,
  userFetcher: UserBatchFetcher,
  setMessages: (
    updater: (prev: { [key: string]: ProcessedMessage[] }) => {
      [key: string]: ProcessedMessage[];
    },
  ) => void,
  setPaginationInfo: (
    updater: (prev: { [key: string]: MessagePaginationInfo }) => {
      [key: string]: MessagePaginationInfo;
    },
  ) => void,
  options: MessageListenerOptions = {},
): () => void {
  const {
    messagesPerLoad = DEFAULT_MESSAGES_PER_LOAD,
    enableCaching = true,
    cachePrefix = 'messages',
  } = options;

  if (!userId) return () => {};

  // Initialize pagination info
  setPaginationInfo((prev) => {
    if (prev[chatId]) return prev;
    return {
      ...prev,
      [chatId]: {
        hasMore: true,
        loading: false,
        lastDoc: null,
      },
    };
  });

  const messagesRef = collection(db, collectionPath, chatId, 'messages');
  const msgQuery = query(
    messagesRef,
    orderBy('createdAt', 'desc'),
    limit(messagesPerLoad),
  );

  // Load cached messages if available
  if (enableCaching) {
    const cachedMessages = storage.getString(`${cachePrefix}_${chatId}`);
    if (cachedMessages) {
      try {
        const parsedMessages: ProcessedMessage[] = JSON.parse(
          cachedMessages,
          (key, value) =>
            key === 'createdAt' && typeof value === 'string'
              ? new Date(value)
              : value,
        );
        setMessages((prev) => ({ ...prev, [chatId]: parsedMessages }));
      } catch (error) {
        console.error('Error parsing cached messages:', error);
      }
    }
  }

  const unsubscribe = onSnapshot(
    msgQuery,
    async (querySnapshot) => {
      if (!userId) return;

      try {
        const lastVisible =
          querySnapshot.docs.length > 0
            ? querySnapshot.docs[querySnapshot.docs.length - 1]
            : null;
        const hasMore = querySnapshot.docs.length >= messagesPerLoad;

        // Update pagination info
        setPaginationInfo((prev) => ({
          ...prev,
          [chatId]: {
            hasMore,
            lastDoc: lastVisible,
            loading: false,
          },
        }));

        // Process messages using batch processing
        const fetchedMessages = await processMessagesBatch(
          querySnapshot.docs,
          userFetcher,
        );
        const chronologicalMessages = [...fetchedMessages].reverse();

        // Update messages state with deduplication
        setMessages((prev) => {
          const existingMessages = [...(prev[chatId] || [])];
          const existingMessageIds = new Set(
            existingMessages.map((msg) => msg.id),
          );

          const newMessages = chronologicalMessages.filter(
            (msg) => !existingMessageIds.has(msg.id),
          );

          const mergedMessages = [...existingMessages, ...newMessages];
          mergedMessages.sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          );

          return { ...prev, [chatId]: mergedMessages };
        });

        // Cache messages if enabled
        if (enableCaching && chronologicalMessages.length > 0) {
          const messagesToCache = chronologicalMessages.map((msg) => ({
            ...msg,
            createdAt: msg.createdAt.toISOString(),
          }));
          storage.set(
            `${cachePrefix}_${chatId}`,
            JSON.stringify(messagesToCache),
          );
        }
      } catch (error) {
        console.error('Error processing messages snapshot:', error);
      }
    },
    (error) => {
      if (error.code !== 'permission-denied') {
        console.error('Error listening to messages:', error);
      }
    },
  );

  return unsubscribe;
}

/**
 * Manage multiple message listeners with automatic cleanup
 */
export class MessageListenerManager {
  private listeners: { [chatId: string]: () => void } = {};

  addListener(chatId: string, unsubscribe: () => void): void {
    // Clean up existing listener if present
    if (this.listeners[chatId]) {
      this.listeners[chatId]();
    }
    this.listeners[chatId] = unsubscribe;
  }

  removeListener(chatId: string): void {
    if (this.listeners[chatId]) {
      this.listeners[chatId]();
      delete this.listeners[chatId];
    }
  }

  removeAllListeners(): void {
    Object.values(this.listeners).forEach((unsubscribe) => unsubscribe());
    this.listeners = {};
  }

  hasListener(chatId: string): boolean {
    return !!this.listeners[chatId];
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clean up old cached messages based on age
 */
export function cleanupOldCache(
  prefix: string,
  maxAgeMs: number = 24 * 60 * 60 * 1000,
): void {
  try {
    const allKeys = storage.getAllKeys();
    const now = Date.now();

    allKeys
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => {
        try {
          const data = storage.getString(key);
          if (data) {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const firstMessage = parsed[0];
              if (firstMessage.createdAt) {
                const messageAge =
                  now - new Date(firstMessage.createdAt).getTime();
                if (messageAge > maxAgeMs) {
                  storage.delete(key);
                }
              }
            }
          }
        } catch (error) {
          // If we can't parse it, it's probably corrupted, so delete it
          storage.delete(key);
        }
      });
  } catch (error) {
    console.error('Error cleaning up cache:', error);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a standardized chat ID from participant UIDs
 */
export function createChatId(participants: string[]): string {
  return participants.sort().join('_');
}

/**
 * Extract other participant UID from a chat ID
 */
export function getOtherParticipant(
  chatId: string,
  currentUserId: string,
): string | null {
  const participants = chatId.split('_');
  return participants.find((id) => id !== currentUserId) || null;
}

/**
 * Validate message content
 */
export function validateMessage(
  text: string,
  imageUrl?: string,
): { valid: boolean; error?: string } {
  if (!text?.trim() && !imageUrl) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  if (text && text.length > 1000) {
    return { valid: false, error: 'Message too long' };
  }
  return { valid: true };
}

/**
 * Format timestamp for display
 */
export function formatMessageTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  return date.toLocaleDateString();
}
