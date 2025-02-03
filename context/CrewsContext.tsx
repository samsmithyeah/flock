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
  dateCounts: { [key: string]: number };
  dateMatches: { [key: string]: number };
  dateMatchingCrews: { [key: string]: string[] };
  dateEvents: { [key: string]: number };
  dateEventCrews: { [key: string]: string[] };
  usersCache: { [key: string]: User };
  setStatusForCrew: (
    crewId: string,
    selectedDate: string,
    status: boolean,
  ) => Promise<void>;
  toggleStatusForCrew: (
    crewId: string,
    date: string,
    toggleTo: boolean,
  ) => Promise<void>;
  toggleStatusForDateAllCrews: (
    date: string,
    toggleTo: boolean,
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
}

const CrewsContext = createContext<CrewsContextProps | undefined>(undefined);

export const CrewsProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user } = useUser();

  const [crewIds, setCrewIds] = useState<string[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [dateCounts, setDateCounts] = useState<{ [key: string]: number }>({});
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
      // Avoid multiple subscriptions for the same uid.
      if (userSubscriptionsRef.current[uid]) return;
      const userDocRef = doc(db, 'users', uid);
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
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
      });
      userSubscriptionsRef.current[uid] = unsubscribe;
    },
    [setUsersCache],
  );

  const subscribeToUsers = useCallback(
    (uids: string[]) => {
      uids.forEach((uid) => {
        subscribeToUser(uid);
      });
    },
    [subscribeToUser],
  );

  useEffect(() => {
    // Cleanup all user subscriptions when the provider unmounts.
    return () => {
      Object.values(userSubscriptionsRef.current).forEach((unsubscribe) =>
        unsubscribe(),
      );
      userSubscriptionsRef.current = {};
    };
  }, []);

  // --- END USER SUBSCRIPTION LOGIC ---

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

  const fetchUpStatuses = async (fetchedCrewIds: string[]) => {
    setLoadingStatuses(true);
    const counts: { [key: string]: number } = {};
    weekDates.forEach((date) => {
      counts[date] = 0;
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
          if (statusData.upForGoingOutTonight === true) {
            const date = statusSnap.ref.parent.parent?.id;
            if (date && counts[date] !== undefined) {
              counts[date] += 1;
            }
          }
        }
      });
      setDateCounts(counts);
    } catch (error) {
      console.error('Error fetching up statuses:', error);
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
    } catch (error) {
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
    setLoadingEvents(true);
    const newMap: { [crewId: string]: { [day: string]: number } } = {};
    try {
      for (const crewId of fetchedCrewIds) {
        const eventsRef = collection(db, 'crews', crewId, 'events');
        const crewQuery = query(eventsRef, orderBy('startDate'));
        const snapshot = await getDocs(crewQuery);
        const crewDayCount: { [day: string]: number } = {};
        weekDates.forEach((day) => (crewDayCount[day] = 0));
        snapshot.docs.forEach((docSnap) => {
          const evt = docSnap.data() as any;
          const start = moment(evt.startDate, 'YYYY-MM-DD');
          const end = moment(evt.endDate, 'YYYY-MM-DD');
          weekDates.forEach((day) => {
            const d = moment(day, 'YYYY-MM-DD');
            if (d.isBetween(start, end, 'day', '[]')) {
              crewDayCount[day] += 1;
            }
          });
        });
        newMap[crewId] = crewDayCount;
      }
      setCrewEventsMap(newMap);
      recalcAllEvents(newMap);
    } catch (error) {
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
    const crewDayCount: { [day: string]: number } = {};
    weekDates.forEach((day) => (crewDayCount[day] = 0));
    snapshotDocs.forEach((docSnap) => {
      const evt = docSnap.data();
      const start = moment(evt.startDate, 'YYYY-MM-DD');
      const end = moment(evt.endDate, 'YYYY-MM-DD');
      for (const day of weekDates) {
        const d = moment(day, 'YYYY-MM-DD');
        if (d.isBetween(start, end, 'day', '[]')) {
          crewDayCount[day] += 1;
        }
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
    status: boolean,
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
        await updateDoc(userStatusRef, {
          upForGoingOutTonight: status,
          timestamp: Timestamp.fromDate(new Date()),
        });
      } else {
        await setDoc(userStatusRef, {
          date: selectedDate,
          upForGoingOutTonight: status,
          timestamp: Timestamp.fromDate(new Date()),
        });
      }
    } catch (error) {
      console.error('Error setting status explicitly:', error);
      throw error;
    }
  };

  const toggleStatusForCrew = async (
    crewId: string,
    selectedDate: string,
    toggleTo: boolean,
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
        const currentStatus = statusSnap.data().upForGoingOutTonight || false;
        await updateDoc(userStatusRef, {
          upForGoingOutTonight: !currentStatus,
          timestamp: Timestamp.fromDate(new Date()),
        });
      } else {
        await setDoc(userStatusRef, {
          date: selectedDate,
          upForGoingOutTonight: true,
          timestamp: Timestamp.fromDate(new Date()),
        });
      }
      setDateCounts((prev) => ({
        ...prev,
        [selectedDate]: toggleTo
          ? prev[selectedDate] + 1
          : Math.max(prev[selectedDate] - 1, 0),
      }));
      setDateMatchingCrews((prev) => {
        const updated = { ...prev };
        if (toggleTo) {
          if (!updated[selectedDate]) updated[selectedDate] = [];
          if (!updated[selectedDate].includes(crewId))
            updated[selectedDate].push(crewId);
        } else {
          if (updated[selectedDate]) {
            const index = updated[selectedDate].indexOf(crewId);
            if (index !== -1) updated[selectedDate].splice(index, 1);
          }
        }
        return updated;
      });
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

  const toggleStatusForDateAllCrews = async (
    date: string,
    toggleTo: boolean,
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
      const newStatus = toggleTo;
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
      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: `You have been marked as ${
          newStatus ? 'up' : 'not up'
        } for it on ${moment(selectedDateStr).format('MMMM Do, YYYY')}.`,
      });
      setDateCounts((prev) => ({
        ...prev,
        [selectedDateStr]: newStatus ? crewIds.length : 0,
      }));
      setDateMatchingCrews((prev) => ({
        ...prev,
        [selectedDateStr]: newStatus ? [...crewIds] : [],
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
        const crewRef = doc(db, 'crews', crewId);
        const unsubCrewDoc = onSnapshot(crewRef, (docSnap) => {
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
        });
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
          const unsubStatuses = onSnapshot(userStatusesRef, () => {
            setMatchesNeedsRefresh(true);
          });
          unsubscribeList.push(unsubStatuses);
        });
        const eventsRef = collection(db, 'crews', crewId, 'events');
        const unsubEvents = onSnapshot(
          query(eventsRef, orderBy('startDate')),
          (snapshot) => {
            recalcCrewEvents(crewId, snapshot.docs);
          },
          (error) => {
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
          await fetchUpStatuses(fetchedCrewIds);
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
  }, [user?.uid, weekDates, subscribeToUsers]);

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
        toggleStatusForCrew,
        toggleStatusForDateAllCrews,
        setUsersCache,
        loadingCrews,
        loadingStatuses,
        loadingMatches,
        loadingEvents,
        fetchCrew,
        fetchUserDetails,
        subscribeToUser,
        subscribeToUsers,
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
