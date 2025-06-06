// context/CrewsContext.tsx

import React, {
  createContext,
  useState,
  useEffect,
  ReactNode,
  useContext,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  Timestamp,
  writeBatch,
  onSnapshot,
  Unsubscribe,
  setDoc,
  updateDoc,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import moment from 'moment';
import Toast from 'react-native-toast-message';
import { Crew } from '@/types/Crew';
import { User } from '@/types/User';

interface CrewsContextProps {
  crewIds: string[];
  setCrewIds: React.Dispatch<React.SetStateAction<string[]>>;
  crews: Crew[];
  setCrews: React.Dispatch<React.SetStateAction<Crew[]>>;
  dateCounts: { [key: string]: { available: number; unavailable: number } };
  dateMatches: { [key: string]: number };
  dateMatchingCrews: { [key: string]: string[] };
  dateEvents: { [key: string]: number };
  dateEventCrews: { [key: string]: string[] };
  usersCache: { [key: string]: User };
  setStatusForCrew: (
    crewId: string,
    selectedDate: string,
    status: boolean | null,
  ) => Promise<void>;
  setStatusForDateAllCrews: (
    date: string,
    toggleTo: boolean | null,
  ) => Promise<void>;
  setUsersCache: React.Dispatch<React.SetStateAction<{ [key: string]: User }>>;
  loadingCrews: boolean;
  loadingStatuses: boolean;
  loadingMatches: boolean;
  loadingEvents: boolean;
  fetchCrew: (crewId: string) => Promise<Crew | null>;
  fetchUserDetails: (uid: string) => Promise<User>;
  subscribeToUser: (uid: string) => void;
  subscribeToUsers: (uids: string[]) => void;
  defaultActivity: string;
}

const CrewsContext = createContext<CrewsContextProps | undefined>(undefined);

export const CrewsProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user } = useUser();

  const [crewIds, setCrewIds] = useState<string[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [dateCounts, setDateCounts] = useState<{
    [key: string]: { available: number; unavailable: number };
  }>({});
  const [dateMatches, setDateMatches] = useState<{ [key: string]: number }>({});
  const [dateMatchingCrews, setDateMatchingCrews] = useState<{
    [key: string]: string[];
  }>({});

  const [dateEvents, setDateEvents] = useState<{ [key: string]: number }>({});
  const [dateEventCrews, setDateEventCrews] = useState<{
    [key: string]: string[];
  }>({});

  const [usersCache, setUsersCache] = useState<{ [key: string]: User }>({});

  const [loadingCrews, setLoadingCrews] = useState<boolean>(true);
  const [loadingStatuses, setLoadingStatuses] = useState<boolean>(true);
  const [loadingMatches, setLoadingMatches] = useState<boolean>(true);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(true);

  const [matchesNeedsRefresh, setMatchesNeedsRefresh] = useState(false);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [crewEventsMap, setCrewEventsMap] = useState<{
    [crewId: string]: { [date: string]: number };
  }>({});

  const memoizedCrews = useMemo(() => crews, [crews]);
  const memoizedUsersCache = useMemo(() => usersCache, [usersCache]);

  // We always use the next 7 days in this context
  const weekDates = useMemo(() => {
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      dates.push(moment().add(i, 'days').format('YYYY-MM-DD'));
    }
    return dates;
  }, []);

  // --- USER SUBSCRIPTION LOGIC ---
  // Ref to track user subscriptions
  const userSubscriptionsRef = useRef<{ [uid: string]: () => void }>({});

  const subscribeToUser = useCallback(
    (uid: string) => {
      if (!user) return;
      if (userSubscriptionsRef.current[uid]) return;
      const userDocRef = doc(db, 'users', uid);
      const unsubscribe = onSnapshot(
        userDocRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            const updatedUser: User = {
              uid: docSnap.id,
              displayName: userData.displayName || 'Unnamed User',
              email: userData.email || '',
              photoURL: userData.photoURL || '',
              isOnline: userData.isOnline || false,
              lastSeen: userData.lastSeen || null,
            };
            setUsersCache((prev) => ({ ...prev, [uid]: updatedUser }));
          }
        },
        (error) => {
          if (error.code === 'permission-denied') return;
          console.error('Error in user snapshot:', error);
        },
      );
      userSubscriptionsRef.current[uid] = unsubscribe;
    },
    [user, setUsersCache],
  );

  // Make sure new crews are subscribed to
  const crewListenersRef = useRef<{ [crewId: string]: () => void }>({});

  useEffect(() => {
    crewIds.forEach((crewId) => {
      if (!crewListenersRef.current[crewId]) {
        const crewRef = doc(db, 'crews', crewId);
        const unsubCrew = onSnapshot(
          crewRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const updatedCrew = {
                id: docSnap.id,
                ...(docSnap.data() as Omit<Crew, 'id'>),
              } as Crew;
              setCrews((prevCrews) => {
                const idx = prevCrews.findIndex((c) => c.id === updatedCrew.id);
                if (idx !== -1) {
                  const newCrews = [...prevCrews];
                  newCrews[idx] = updatedCrew;
                  return newCrews;
                }
                return [...prevCrews, updatedCrew];
              });
            } else {
              setCrews((prev) => prev.filter((c) => c.id !== crewId));
              setCrewIds((prev) => prev.filter((id) => id !== crewId));
            }
          },
          (error) => {
            if (error.code === 'permission-denied') return;
            console.error('Error in crew snapshot for crewId', crewId, error);
          },
        );
        crewListenersRef.current[crewId] = unsubCrew;
      }
    });
  }, [crewIds]);

  const subscribeToUsers = useCallback(
    async (uids: string[]) => {
      if (!Array.isArray(uids)) {
        throw new Error('uids must be an array');
      }
      await Promise.all(
        uids.map(async (uid) => {
          if (typeof uid !== 'string') {
            console.warn('Invalid uid type, expected string:', uid);
            return;
          }
          try {
            await subscribeToUser(uid);
          } catch (err) {
            console.error(`Error subscribing to user ${uid}:`, err);
          }
        }),
      );
    },
    [subscribeToUser],
  );

  useEffect(() => {
    // Cleanup all subscriptions when the component unmounts.
    return () => {
      Object.values(userSubscriptionsRef.current).forEach((unsubscribe) =>
        unsubscribe(),
      );
      userSubscriptionsRef.current = {};
    };
  }, []);

  // Helper to rebuild "dateEvents" & "dateEventCrews"
  const recalcAllEvents = (allCrewEvents: {
    [crewId: string]: { [day: string]: number };
  }) => {
    const tempDateEvents: { [day: string]: number } = {};
    const tempDateEventCrews: { [day: string]: string[] } = {};
    weekDates.forEach((day) => {
      tempDateEvents[day] = 0;
      tempDateEventCrews[day] = [];
    });
    for (const [cid, distribution] of Object.entries(allCrewEvents)) {
      for (const [day, eventCount] of Object.entries(distribution)) {
        if (eventCount > 0) {
          tempDateEvents[day] += eventCount;
          if (!tempDateEventCrews[day].includes(cid)) {
            tempDateEventCrews[day].push(cid);
          }
        }
      }
    }
    setDateEvents(tempDateEvents);
    setDateEventCrews(tempDateEventCrews);
  };

  const fetchCrew = async (crewId: string): Promise<Crew | null> => {
    const crewDoc = await getDoc(doc(db, 'crews', crewId));
    if (crewDoc.exists()) {
      const crew = {
        id: crewDoc.id,
        ...(crewDoc.data() as Omit<Crew, 'id'>),
      } as Crew;
      crews.push(crew);
      return crew;
    }
    return null;
  };

  const fetchUserCrews = async (uid: string): Promise<string[]> => {
    const crewsRef = collection(db, 'crews');
    const userCrewsQuery = query(
      crewsRef,
      where('memberIds', 'array-contains', uid),
    );
    const crewsSnapshot = await getDocs(userCrewsQuery);
    return crewsSnapshot.docs.map((docSnap) => docSnap.id);
  };

  const fetchCrewDetails = async (
    fetchedCrewIds: string[],
  ): Promise<Crew[]> => {
    const crewPromises = fetchedCrewIds.map(async (crewId) => {
      const crewDoc = await getDoc(doc(db, 'crews', crewId));
      if (crewDoc.exists()) {
        return {
          id: crewDoc.id,
          ...(crewDoc.data() as Omit<Crew, 'id'>),
        } as Crew;
      }
      return null;
    });
    const crewsResults = await Promise.all(crewPromises);
    return crewsResults.filter((c): c is Crew => c !== null);
  };

  const fetchUserDetails = useCallback(
    async (uid: string): Promise<User> => {
      const cachedUser = usersCache[uid];
      if (cachedUser) return cachedUser;
      try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const fetchedUser: User = {
            uid: userDoc.id,
            displayName: userData.displayName || 'Unnamed User',
            email: userData.email || '',
            photoURL: userData.photoURL || '',
          };
          setUsersCache((prev) => ({ ...prev, [uid]: fetchedUser }));
          return fetchedUser;
        } else {
          return {
            uid,
            displayName: 'Unknown User',
            email: 'unknown@example.com',
            photoURL: '',
          };
        }
      } catch (error) {
        console.error(`Error fetching user data for UID ${uid}:`, error);
        return {
          uid,
          displayName: 'Error Fetching User',
          email: 'error@example.com',
          photoURL: '',
        };
      }
    },
    [usersCache, setUsersCache],
  );

  const fetchStatuses = async (fetchedCrewIds: string[]) => {
    setLoadingStatuses(true);
    const counts: {
      [key: string]: { available: number; unavailable: number };
    } = {};
    weekDates.forEach((date) => {
      counts[date] = { available: 0, unavailable: 0 };
    });
    try {
      const statusDocRefs = fetchedCrewIds.flatMap((crewId) =>
        weekDates.map((date) =>
          doc(db, 'crews', crewId, 'statuses', date, 'userStatuses', user!.uid),
        ),
      );
      const statusSnapshots = await Promise.all(
        statusDocRefs.map((ref) => getDoc(ref)),
      );
      statusSnapshots.forEach((statusSnap) => {
        if (statusSnap.exists()) {
          const statusData = statusSnap.data();
          const date = statusSnap.ref.parent.parent?.id;
          if (date && counts[date] !== undefined) {
            if (statusData.upForGoingOutTonight === true) {
              counts[date].available += 1;
            } else if (statusData.upForGoingOutTonight === false) {
              counts[date].unavailable += 1;
            }
          }
        }
      });
      setDateCounts(counts);
    } catch (error) {
      console.error('Error fetching member statuses:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not fetch member statuses',
      });
    } finally {
      setLoadingStatuses(false);
    }
  };

  const fetchMatches = async (fetchedCrewIds: string[]) => {
    setLoadingMatches(true);
    try {
      const matches: { [key: string]: number } = {};
      const matchingCrews: { [key: string]: string[] } = {};
      weekDates.forEach((date) => {
        matches[date] = 0;
        matchingCrews[date] = [];
      });
      const allStatusPromises = fetchedCrewIds.flatMap((crewId) =>
        weekDates.map(async (date) => {
          const statusesRef = collection(
            db,
            'crews',
            crewId,
            'statuses',
            date,
            'userStatuses',
          );
          const statusesQuery = query(
            statusesRef,
            where('upForGoingOutTonight', '==', true),
          );
          const statusesSnapshot = await getDocs(statusesQuery);
          return { crewId, date, snapshot: statusesSnapshot };
        }),
      );
      const allStatusResults = await Promise.all(allStatusPromises);
      allStatusResults.forEach(({ crewId, date, snapshot }) => {
        const userStatus = snapshot.docs.find(
          (docSnap) => docSnap.id === user?.uid,
        );
        if (userStatus) {
          const otherMembersUp = snapshot.docs.some(
            (docSnap) => docSnap.id !== user?.uid,
          );
          if (otherMembersUp) {
            matches[date] += 1;
            matchingCrews[date].push(crewId);
          }
        }
      });
      setDateMatches(matches);
      setDateMatchingCrews(matchingCrews);
    } catch (error: any) {
      if (!user) return;
      if (error.code === 'permission-denied') return;
      console.error('Error fetching matches:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not fetch matching crews',
      });
    } finally {
      setLoadingMatches(false);
      setMatchesNeedsRefresh(false);
    }
  };

  const buildInitialCrewEventsMap = async (fetchedCrewIds: string[]) => {
    if (!user) return;
    setLoadingEvents(true);
    const newMap: { [crewId: string]: { [day: string]: number } } = {};
    try {
      for (const crewId of fetchedCrewIds) {
        const eventsRef = collection(db, 'crews', crewId, 'events');
        const crewQuery = query(eventsRef, orderBy('startDate', 'asc'));
        const snapshot = await getDocs(crewQuery);
        const crewDayCount: { [day: string]: number } = {};
        weekDates.forEach((day) => (crewDayCount[day] = 0));
        snapshot.docs.forEach((docSnap) => {
          const evt = docSnap.data() as any;

          // Handle both old format (startDate/endDate) and new format (date)
          if (evt.date) {
            // New format with single date
            if (weekDates.includes(evt.date)) {
              crewDayCount[evt.date] += 1;
            }
          } else if (evt.startDate && evt.endDate) {
            // Old format with date range
            const start = moment(evt.startDate, 'YYYY-MM-DD');
            const end = moment(evt.endDate, 'YYYY-MM-DD');
            weekDates.forEach((day) => {
              const d = moment(day, 'YYYY-MM-DD');
              if (d.isBetween(start, end, 'day', '[]')) {
                crewDayCount[day] += 1;
              }
            });
          }
        });
        newMap[crewId] = crewDayCount;
      }
      setCrewEventsMap(newMap);
      recalcAllEvents(newMap);
    } catch (error: any) {
      if (!user) return;
      if (error.code === 'permission-denied') return;
      console.error('Error building initial crew events map:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not fetch events.',
      });
    } finally {
      setLoadingEvents(false);
    }
  };

  const recalcCrewEvents = (crewId: string, snapshotDocs: any[]) => {
    if (!user) return;
    const crewDayCount: { [day: string]: number } = {};
    weekDates.forEach((day) => (crewDayCount[day] = 0));
    snapshotDocs.forEach((docSnap) => {
      const evt = docSnap.data();

      // Handle both old format (startDate/endDate) and new format (date)
      if (evt.date) {
        // New format with single date
        if (weekDates.includes(evt.date)) {
          crewDayCount[evt.date] += 1;
        }
      } else if (evt.startDate && evt.endDate) {
        // Old format with date range
        const start = moment(evt.startDate, 'YYYY-MM-DD');
        const end = moment(evt.endDate, 'YYYY-MM-DD');
        weekDates.forEach((day) => {
          const d = moment(day, 'YYYY-MM-DD');
          if (d.isBetween(start, end, 'day', '[]')) {
            crewDayCount[day] += 1;
          }
        });
      }
    });
    setCrewEventsMap((prevMap) => {
      const newMap = { ...prevMap, [crewId]: crewDayCount };
      recalcAllEvents(newMap);
      return newMap;
    });
  };

  const scheduleMatchesRefresh = () => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = setTimeout(() => {
      if (crewIds.length > 0) {
        fetchMatches(crewIds);
      } else {
        setMatchesNeedsRefresh(false);
      }
    }, 500);
  };

  useEffect(() => {
    if (matchesNeedsRefresh && crewIds.length > 0) {
      scheduleMatchesRefresh();
    }
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [matchesNeedsRefresh, crewIds]);

  const setStatusForCrew = async (
    crewId: string,
    selectedDate: string,
    status: boolean | null,
  ) => {
    try {
      if (!user?.uid) throw new Error('User not authenticated');
      const userStatusRef = doc(
        db,
        'crews',
        crewId,
        'statuses',
        selectedDate,
        'userStatuses',
        user.uid,
      );
      const statusSnap = await getDoc(userStatusRef);
      if (statusSnap.exists()) {
        console.log('Updating existing status:', status);
        await updateDoc(userStatusRef, {
          upForGoingOutTonight: status,
          timestamp: Timestamp.fromDate(new Date()),
        });
      } else {
        console.log('Setting new status:', status);
        await setDoc(userStatusRef, {
          date: selectedDate,
          upForGoingOutTonight: status,
          timestamp: Timestamp.fromDate(new Date()),
        });
      }

      // Update local state
      setDateCounts((prev) => {
        const currentCount = prev[selectedDate] || {
          available: 0,
          unavailable: 0,
        };
        const newCount = { ...currentCount };

        // Remove previous status if it exists
        if (statusSnap.exists()) {
          const oldStatus = statusSnap.data()?.upForGoingOutTonight;
          if (oldStatus === true) newCount.available--;
          if (oldStatus === false) newCount.unavailable--;
        }

        // Add new status
        if (status === true) newCount.available++;
        if (status === false) newCount.unavailable++;

        return {
          ...prev,
          [selectedDate]: newCount,
        };
      });

      // Trigger matches refresh
      setMatchesNeedsRefresh(true);
    } catch (error) {
      console.error('Error setting status explicitly:', error);
      throw error;
    }
  };

  const setStatusForDateAllCrews = async (
    date: string,
    toggleTo: boolean | null,
  ) => {
    if (!user?.uid) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'User not authenticated',
      });
      return;
    }
    try {
      if (crewIds.length === 0) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'You are not part of any crews',
        });
        return;
      }
      const selectedDateStr = date;
      const newStatus = toggleTo; // true, false, or null to clear
      const MAX_BATCH_SIZE = 10;
      const batches: string[][] = [];
      for (let i = 0; i < crewIds.length; i += MAX_BATCH_SIZE) {
        batches.push(crewIds.slice(i, i + MAX_BATCH_SIZE));
      }
      await Promise.all(
        batches.map(async (batchCrewIds) => {
          const batch = writeBatch(db);
          batchCrewIds.forEach((crewId) => {
            const userStatusRef = doc(
              db,
              'crews',
              crewId,
              'statuses',
              selectedDateStr,
              'userStatuses',
              user.uid,
            );
            batch.set(
              userStatusRef,
              {
                upForGoingOutTonight: newStatus,
                timestamp: Timestamp.fromDate(new Date()),
              },
              { merge: true },
            );
          });
          await batch.commit();
        }),
      );
      let statusText = '';
      if (newStatus === true) {
        statusText = 'available';
      } else if (newStatus === false) {
        statusText = 'unavailable';
      } else {
        statusText = 'cleared';
      }
      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: `Your status has been set to ${statusText} across all crews for ${moment(
          selectedDateStr,
        ).format('MMMM Do, YYYY')}.`,
      });
      // Update local UI state as needed.
      setDateCounts((prev) => ({
        ...prev,
        [selectedDateStr]:
          newStatus === true
            ? { available: crewIds.length, unavailable: 0 }
            : newStatus === false
              ? { available: 0, unavailable: crewIds.length }
              : { available: 0, unavailable: 0 },
      }));
      setDateMatchingCrews((prev) => ({
        ...prev,
        [selectedDateStr]: newStatus === true ? [...crewIds] : [],
      }));
      setMatchesNeedsRefresh(true);
    } catch (error) {
      console.error('Error toggling status:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not update your status',
      });
    }
  };

  useEffect(() => {
    if (!user?.uid) {
      setCrewIds([]);
      setCrews([]);
      setDateCounts({});
      setDateMatches({});
      setDateMatchingCrews({});
      setDateEvents({});
      setDateEventCrews({});
      setLoadingCrews(false);
      setLoadingStatuses(false);
      setLoadingMatches(false);
      setLoadingEvents(false);
      return;
    }

    let unsubscribeList: Unsubscribe[] = [];

    const setupCrewListeners = (fetchedCrewIds: string[]) => {
      fetchedCrewIds.forEach((crewId) => {
        if (!user) return;
        const crewRef = doc(db, 'crews', crewId);
        const unsubCrewDoc = onSnapshot(
          crewRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const updatedCrew = {
                id: docSnap.id,
                ...(docSnap.data() as Omit<Crew, 'id'>),
              } as Crew;
              setCrews((prevCrews) => {
                const idx = prevCrews.findIndex((c) => c.id === updatedCrew.id);
                if (idx !== -1) {
                  const updatedCrews = [...prevCrews];
                  updatedCrews[idx] = updatedCrew;
                  return updatedCrews;
                }
                return [...prevCrews, updatedCrew];
              });
            } else {
              setCrews((prev) => prev.filter((c) => c.id !== crewId));
              setCrewIds((prev) => prev.filter((id) => id !== crewId));
            }
          },
          (error) => {
            if (error.code === 'permission-denied') return;
            console.error('Error in crew snapshot for crewId', crewId, error);
          },
        );
        unsubscribeList.push(unsubCrewDoc);

        weekDates.forEach((date) => {
          const userStatusesRef = collection(
            db,
            'crews',
            crewId,
            'statuses',
            date,
            'userStatuses',
          );
          const unsubStatuses = onSnapshot(
            userStatusesRef,
            () => {
              setMatchesNeedsRefresh(true);
            },
            (error) => {
              if (error.code === 'permission-denied') return;
              console.error('Error in statuses snapshot:', error);
            },
          );
          unsubscribeList.push(unsubStatuses);
        });

        const eventsRef = collection(db, 'crews', crewId, 'events');
        const unsubEvents = onSnapshot(
          query(eventsRef, orderBy('startDate')),
          (snapshot) => {
            recalcCrewEvents(crewId, snapshot.docs);
          },
          (error) => {
            if (!user) return;
            if (error.code === 'permission-denied') return;
            console.error('Error in events snapshot:', error);
            Toast.show({
              type: 'error',
              text1: 'Error',
              text2: 'Could not fetch events in realtime.',
            });
          },
        );
        unsubscribeList.push(unsubEvents);
      });
    };

    const initialize = async () => {
      if (!user?.uid) {
        setLoadingCrews(false);
        setLoadingStatuses(false);
        setLoadingMatches(false);
        setLoadingEvents(false);
        return;
      }
      try {
        const fetchedCrewIds = await fetchUserCrews(user.uid);
        setCrewIds(fetchedCrewIds);
        setLoadingCrews(false);
        if (fetchedCrewIds.length > 0 && weekDates.length > 0) {
          const fetchedCrews = await fetchCrewDetails(fetchedCrewIds);
          setCrews(fetchedCrews);
          // Subscribe to all members from each crew (assuming each crew has a memberIds array)
          const allMemberIds = new Set<string>();
          fetchedCrews.forEach((crew) => {
            if (
              (crew as any).memberIds &&
              Array.isArray((crew as any).memberIds)
            ) {
              (crew as any).memberIds.forEach((uid: string) =>
                allMemberIds.add(uid),
              );
            }
          });
          subscribeToUsers(Array.from(allMemberIds));
          await fetchStatuses(fetchedCrewIds);
          await fetchMatches(fetchedCrewIds);
          await buildInitialCrewEventsMap(fetchedCrewIds);
          setupCrewListeners(fetchedCrewIds);
        } else {
          setCrews([]);
          setDateCounts({});
          setDateMatches({});
          setDateMatchingCrews({});
          setDateEvents({});
          setDateEventCrews({});
          setLoadingStatuses(false);
          setLoadingMatches(false);
          setLoadingEvents(false);
        }
      } catch (error) {
        console.error('Error initializing CrewsContext:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not initialize crews',
        });
        setLoadingCrews(false);
        setLoadingStatuses(false);
        setLoadingMatches(false);
        setLoadingEvents(false);
      }
    };

    initialize();

    return () => {
      unsubscribeList.forEach((unsub) => unsub());
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [user?.uid, weekDates]);

  return (
    <CrewsContext.Provider
      value={{
        crewIds,
        setCrewIds,
        crews: memoizedCrews,
        setCrews,
        dateCounts,
        dateMatches,
        dateMatchingCrews,
        dateEvents,
        dateEventCrews,
        usersCache: memoizedUsersCache,
        setStatusForCrew,
        setStatusForDateAllCrews,
        setUsersCache,
        loadingCrews,
        loadingStatuses,
        loadingMatches,
        loadingEvents,
        fetchCrew,
        fetchUserDetails,
        subscribeToUser,
        subscribeToUsers,
        defaultActivity: 'meeting up',
      }}
    >
      {children}
    </CrewsContext.Provider>
  );
};

export const useCrews = () => {
  const context = useContext(CrewsContext);
  if (!context) throw new Error('useCrews must be used within a CrewsProvider');
  return context;
};
