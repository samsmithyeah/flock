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
  orderBy,
  doc,
  getDoc,
  onSnapshot,
  Unsubscribe,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import moment from 'moment';
import Toast from 'react-native-toast-message';
import { Crew } from '@/types/Crew';
import { User } from '@/types/User';
import { CrewEvent } from '@/types/CrewEvent'; // Added for eventDataRef

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

  const userSubscriptionsRef = useRef<{ [uid: string]: Unsubscribe }>({});
  const statusListenersRef = useRef<{ [key: string]: Unsubscribe }>({});
  const eventListenersRef = useRef<{ [key: string]: Unsubscribe }>({});

  // Refs for aggregated data
  const statusDataRef = useRef<{
    [date: string]: { [crewId: string]: { [userId: string]: boolean | null } };
  }>({});
  const eventDataRef = useRef<{ [crewId: string]: CrewEvent[] }>({});

  const weekDates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        moment().add(i, 'days').format('YYYY-MM-DD'),
      ),
    [],
  );

  const subscribeToUser = useCallback(
    (uid: string) => {
      if (!user || userSubscriptionsRef.current[uid]) return;
      const userDocRef = doc(db, 'users', uid);
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          setUsersCache((prev) => ({
            ...prev,
            [uid]: { uid: docSnap.id, ...userData } as User,
          }));
        }
      });
      userSubscriptionsRef.current[uid] = unsubscribe;
    },
    [user], // user?.uid not needed as the !user check handles it
  );

  const subscribeToUsers = useCallback(
    (uids: string[]) => {
      // Removed async as subscribeToUser is not async
      uids.forEach((uid) => subscribeToUser(uid));
    },
    [subscribeToUser],
  );

  const fetchCrew = async (crewId: string): Promise<Crew | null> => {
    const crewDoc = await getDoc(doc(db, 'crews', crewId));
    if (crewDoc.exists()) {
      return { id: crewDoc.id, ...crewDoc.data() } as Crew;
    }
    return null;
  };

  const fetchUserDetails = useCallback(
    async (uid: string): Promise<User> => {
      if (usersCache[uid]) return usersCache[uid];
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const userData = { uid: userDoc.id, ...userDoc.data() } as User;
        setUsersCache((prev) => ({ ...prev, [uid]: userData }));
        return userData;
      }
      return { uid, displayName: 'Unknown User', email: '' };
    },
    [usersCache], // Removed setUsersCache as it's stable
  );

  const setStatusForCrew = useCallback(
    async (crewId: string, selectedDate: string, status: boolean | null) => {
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
      await setDoc(
        userStatusRef,
        {
          date: selectedDate,
          upForGoingOutTonight: status,
          timestamp: serverTimestamp(),
        },
        { merge: true },
      );
    },
    [user?.uid],
  );

  const setStatusForDateAllCrews = useCallback(
    async (date: string, toggleTo: boolean | null) => {
      if (!user?.uid || crewIds.length === 0) return;
      const promises = crewIds.map((crewId) => {
        const userStatusRef = doc(
          db,
          'crews',
          crewId,
          'statuses',
          date,
          'userStatuses',
          user.uid,
        );
        return setDoc(
          userStatusRef,
          {
            date: date,
            upForGoingOutTonight: toggleTo,
            timestamp: serverTimestamp(),
          },
          { merge: true },
        );
      });
      await Promise.all(promises);
      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Availability updated for all crews.',
      });
    },
    [user?.uid, crewIds],
  );

  const processStatusData = useCallback(
    (activeCrewIds: string[]) => {
      const newDateCounts: {
        [key: string]: { available: number; unavailable: number };
      } = {};
      const newDateMatches: { [key: string]: number } = {};
      const newDateMatchingCrews: { [key: string]: string[] } = {};

      weekDates.forEach((date) => {
        newDateCounts[date] = { available: 0, unavailable: 0 };
        newDateMatches[date] = 0;
        newDateMatchingCrews[date] = [];

        for (const crewId of activeCrewIds) {
          const crewStatuses = statusDataRef.current[date]?.[crewId] || {};
          let userIsUp = false;
          let otherMembersUp = false;

          Object.entries(crewStatuses).forEach(([userId, status]) => {
            if (userId === user?.uid) {
              if (status === true) {
                newDateCounts[date].available++;
                userIsUp = true;
              } else if (status === false) {
                newDateCounts[date].unavailable++;
              }
            } else if (status === true) {
              otherMembersUp = true;
            }
          });

          if (userIsUp && otherMembersUp) {
            newDateMatches[date]++;
            if (!newDateMatchingCrews[date].includes(crewId)) {
              newDateMatchingCrews[date].push(crewId);
            }
          }
        }
      });

      setDateCounts(newDateCounts);
      setDateMatches(newDateMatches);
      setDateMatchingCrews(newDateMatchingCrews);
    },
    [user?.uid, weekDates],
  );

  const setupStatusListeners = useCallback(
    (activeCrewIds: string[]) => {
      const currentStatusData = statusDataRef.current;

      // Clean up listeners for crews that are no longer active
      Object.keys(statusListenersRef.current).forEach((key) => {
        const [crewIdFromKey] = key.split('_');
        if (!activeCrewIds.includes(crewIdFromKey)) {
          statusListenersRef.current[key]();
          delete statusListenersRef.current[key];
          // Also remove data for this crew from statusDataRef
          weekDates.forEach((date) => {
            if (currentStatusData[date]) {
              delete currentStatusData[date][crewIdFromKey];
            }
          });
        }
      });

      // Initialize/ensure paths in statusDataRef for new active crews
      weekDates.forEach((date) => {
        currentStatusData[date] = currentStatusData[date] || {};
        activeCrewIds.forEach((crewId) => {
          currentStatusData[date][crewId] =
            currentStatusData[date][crewId] || {};
        });
      });

      activeCrewIds.forEach((crewId) => {
        weekDates.forEach((date) => {
          const key = `${crewId}_${date}`;
          if (statusListenersRef.current[key]) return; // Listener already exists

          const statusQuery = collection(
            db,
            'crews',
            crewId,
            'statuses',
            date,
            'userStatuses',
          );
          const unsubscribe = onSnapshot(
            statusQuery,
            (snapshot) => {
              currentStatusData[date][crewId] = {}; // Reset for this specific crew/date
              snapshot.forEach((doc) => {
                const data = doc.data();
                currentStatusData[date][crewId][doc.id] =
                  data.upForGoingOutTonight !== undefined
                    ? data.upForGoingOutTonight
                    : null;
              });
              processStatusData(activeCrewIds); // Pass activeCrewIds
            },
            (error) => {
              if (error.code !== 'permission-denied') {
                console.error(`Error listening to statuses for ${key}:`, error);
              }
            },
          );
          statusListenersRef.current[key] = unsubscribe;
        });
      });
      // Initial process with potentially empty data to ensure correct loading state
      processStatusData(activeCrewIds);
      setLoadingStatuses(false);
      setLoadingMatches(false);
    },
    [weekDates, processStatusData], // processStatusData is stable
  );

  const processEventData = useCallback(
    (activeCrewIds: string[]) => {
      const currentEventData = eventDataRef.current;
      const newDateEvents: { [key: string]: number } = {};
      const newDateEventCrews: { [key: string]: string[] } = {};

      weekDates.forEach((date) => {
        newDateEvents[date] = 0;
        newDateEventCrews[date] = [];
      });

      activeCrewIds.forEach((crewId) => {
        const events = currentEventData[crewId] || [];
        events.forEach((event) => {
          const start = moment(event.startDate, 'YYYY-MM-DD');
          const end = moment(event.endDate, 'YYYY-MM-DD');
          weekDates.forEach((day) => {
            if (moment(day, 'YYYY-MM-DD').isBetween(start, end, 'day', '[]')) {
              newDateEvents[day]++;
              if (!newDateEventCrews[day].includes(crewId)) {
                newDateEventCrews[day].push(crewId);
              }
            }
          });
        });
      });

      setDateEvents(newDateEvents);
      setDateEventCrews(newDateEventCrews);
    },
    [weekDates],
  );

  const setupEventListeners = useCallback(
    (activeCrewIds: string[]) => {
      const currentEventData = eventDataRef.current;

      Object.keys(eventListenersRef.current).forEach((key) => {
        if (!activeCrewIds.includes(key)) {
          eventListenersRef.current[key]();
          delete eventListenersRef.current[key];
          delete currentEventData[key];
        }
      });

      activeCrewIds.forEach((crewId) => {
        currentEventData[crewId] = currentEventData[crewId] || [];
        if (eventListenersRef.current[crewId]) return;

        const eventsQuery = query(
          collection(db, 'crews', crewId, 'events'),
          orderBy('startDate'),
        );
        const unsubscribe = onSnapshot(
          eventsQuery,
          (snapshot) => {
            currentEventData[crewId] = snapshot.docs.map(
              (doc) =>
                ({
                  id: doc.id,
                  ...doc.data(),
                }) as CrewEvent,
            );
            processEventData(activeCrewIds); // Pass activeCrewIds
          },
          (error) => {
            if (error.code !== 'permission-denied') {
              console.error(
                `Error listening to events for crew ${crewId}:`,
                error,
              );
            }
          },
        );
        eventListenersRef.current[crewId] = unsubscribe;
      });
      processEventData(activeCrewIds);
      setLoadingEvents(false);
    },
    [processEventData], // processEventData is stable
  );

  useEffect(() => {
    if (!user?.uid) {
      setLoadingCrews(false);
      setLoadingStatuses(false);
      setLoadingMatches(false);
      setLoadingEvents(false);
      setCrews([]);
      setCrewIds([]);
      Object.values(userSubscriptionsRef.current).forEach((unsub) => unsub());
      userSubscriptionsRef.current = {};
      Object.values(statusListenersRef.current).forEach((unsub) => unsub());
      statusListenersRef.current = {};
      Object.values(eventListenersRef.current).forEach((unsub) => unsub());
      eventListenersRef.current = {};
      return;
    }

    setLoadingCrews(true);
    setLoadingStatuses(true);
    setLoadingMatches(true);
    setLoadingEvents(true);

    const crewsQuery = query(
      collection(db, 'crews'),
      where('memberIds', 'array-contains', user.uid),
    );

    const unsubscribeCrews = onSnapshot(
      crewsQuery,
      (snapshot) => {
        const fetchedCrews = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Crew,
        );
        const fetchedCrewIds = fetchedCrews.map((c) => c.id);

        // Only update state if there's an actual change to avoid re-renders
        setCrews((prevCrews) => {
          if (JSON.stringify(prevCrews) !== JSON.stringify(fetchedCrews)) {
            return fetchedCrews;
          }
          return prevCrews;
        });
        setCrewIds((prevIds) => {
          if (JSON.stringify(prevIds) !== JSON.stringify(fetchedCrewIds)) {
            return fetchedCrewIds;
          }
          return prevIds;
        });

        setLoadingCrews(false);

        if (fetchedCrewIds.length > 0) {
          const allMemberIds = new Set<string>();
          fetchedCrews.forEach((crew) =>
            crew.memberIds.forEach((id) => allMemberIds.add(id)),
          );
          subscribeToUsers(Array.from(allMemberIds));
          setupStatusListeners(fetchedCrewIds);
          setupEventListeners(fetchedCrewIds);
        } else {
          setLoadingStatuses(false);
          setLoadingMatches(false);
          setLoadingEvents(false);
          setDateCounts({});
          setDateMatches({});
          setDateMatchingCrews({});
          setDateEvents({});
          setDateEventCrews({});
          // Clean up status/event listeners if no crews
          Object.values(statusListenersRef.current).forEach((unsub) => unsub());
          statusListenersRef.current = {};
          Object.values(eventListenersRef.current).forEach((unsub) => unsub());
          eventListenersRef.current = {};
        }
      },
      (error) => {
        if (error.code !== 'permission-denied') {
          console.error('Error listening to crews:', error);
        }
        setLoadingCrews(false);
        setLoadingStatuses(false);
        setLoadingMatches(false);
        setLoadingEvents(false);
      },
    );

    return () => {
      unsubscribeCrews();
      // Full cleanup when this effect is torn down (e.g., user logs out)
      Object.values(userSubscriptionsRef.current).forEach((unsub) => unsub());
      userSubscriptionsRef.current = {};
      Object.values(statusListenersRef.current).forEach((unsub) => unsub());
      statusListenersRef.current = {};
      Object.values(eventListenersRef.current).forEach((unsub) => unsub());
      eventListenersRef.current = {};
    };
  }, [user?.uid, subscribeToUsers, setupStatusListeners, setupEventListeners]); // Dependencies are stable

  return (
    <CrewsContext.Provider
      value={{
        crewIds,
        setCrewIds,
        crews,
        setCrews,
        dateCounts,
        dateMatches,
        dateMatchingCrews,
        dateEvents,
        dateEventCrews,
        usersCache,
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
