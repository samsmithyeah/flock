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
    [user],
  );

  const subscribeToUsers = useCallback(
    async (uids: string[]) => {
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
    [usersCache],
  );

  const setStatusForCrew = useCallback(
    async (crewId: string, selectedDate: string, status: boolean | null) => {
      if (!user?.uid) throw new Error('User not authenticated');

      try {
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

        // Update local state immediately for better UX
        setDateCounts((prev) => {
          const newDateCounts = { ...prev };
          const currentDate = newDateCounts[selectedDate];

          if (!currentDate) {
            newDateCounts[selectedDate] = {
              available: status === true ? 1 : 0,
              unavailable: status === false ? 1 : 0,
            };
          } else {
            // Determine the change needed based on current and new status
            let availableDiff = 0;
            let unavailableDiff = 0;

            if (status === true) {
              availableDiff = 1;
              // If this crew was previously marked unavailable, subtract from unavailable
              if (currentDate.unavailable > 0) {
                unavailableDiff = -1;
              }
            } else if (status === false) {
              unavailableDiff = 1;
              // If this crew was previously marked available, subtract from available
              if (currentDate.available > 0) {
                availableDiff = -1;
              }
            } else {
              // Setting to null - might remove from either count
              if (currentDate.available > 0) {
                availableDiff = -1;
              } else if (currentDate.unavailable > 0) {
                unavailableDiff = -1;
              }
            }

            newDateCounts[selectedDate] = {
              available: Math.max(0, currentDate.available + availableDiff),
              unavailable: Math.max(
                0,
                currentDate.unavailable + unavailableDiff,
              ),
            };
          }

          return newDateCounts;
        });
      } catch (error) {
        console.error('Error updating status for crew:', error);
        throw error;
      }
    },
    [user?.uid],
  );

  const setStatusForDateAllCrews = useCallback(
    async (date: string, toggleTo: boolean | null) => {
      if (!user?.uid || crewIds.length === 0) return;

      try {
        // Use individual setDoc operations instead of batch to avoid permissions issues
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

        // Update local state immediately for better UX
        setDateCounts((prev) => {
          const newDateCounts = { ...prev };
          const currentAvailable = newDateCounts[date]?.available || 0;
          const currentUnavailable = newDateCounts[date]?.unavailable || 0;

          // Calculate the difference based on what the previous status was and what it's being set to
          let availableDiff = 0;
          let unavailableDiff = 0;

          if (toggleTo === true) {
            // User is now available for all crews
            availableDiff = crewIds.length;
            // Remove from unavailable count if they were previously unavailable
            unavailableDiff = -Math.min(currentUnavailable, crewIds.length);
          } else if (toggleTo === false) {
            // User is now unavailable for all crews
            unavailableDiff = crewIds.length;
            // Remove from available count if they were previously available
            availableDiff = -Math.min(currentAvailable, crewIds.length);
          } else {
            // Setting to null - remove from both counts
            availableDiff = -Math.min(currentAvailable, crewIds.length);
            unavailableDiff = -Math.min(currentUnavailable, crewIds.length);
          }

          newDateCounts[date] = {
            available: Math.max(0, currentAvailable + availableDiff),
            unavailable: Math.max(0, currentUnavailable + unavailableDiff),
          };

          return newDateCounts;
        });

        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: 'Availability updated for all crews.',
        });
      } catch (error) {
        console.error('Error updating status for all crews:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Failed to update availability. Please try again.',
        });
      }
    },
    [user?.uid, crewIds],
  );

  useEffect(() => {
    if (!user?.uid) {
      setLoadingCrews(false);
      setLoadingStatuses(false);
      setLoadingMatches(false);
      setLoadingEvents(false);
      setCrews([]);
      setCrewIds([]);
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
    const unsubscribe = onSnapshot(crewsQuery, async (snapshot) => {
      const fetchedCrews = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as Crew,
      );
      const fetchedCrewIds = fetchedCrews.map((c) => c.id);

      setCrews(fetchedCrews);
      setCrewIds(fetchedCrewIds);
      setLoadingCrews(false);

      if (fetchedCrewIds.length > 0) {
        const allMemberIds = new Set<string>();
        fetchedCrews.forEach((crew) =>
          crew.memberIds.forEach((id) => allMemberIds.add(id)),
        );
        subscribeToUsers(Array.from(allMemberIds));

        // Batch fetch all data instead of setting up hundreds of listeners
        const newDateCounts: {
          [key: string]: { available: number; unavailable: number };
        } = {};
        const newDateMatches: { [key: string]: number } = {};
        const newDateMatchingCrews: { [key: string]: string[] } = {};
        const newDateEvents: { [key: string]: number } = {};
        const newDateEventCrews: { [key: string]: string[] } = {};

        weekDates.forEach((date) => {
          newDateCounts[date] = { available: 0, unavailable: 0 };
          newDateMatches[date] = 0;
          newDateMatchingCrews[date] = [];
          newDateEvents[date] = 0;
          newDateEventCrews[date] = [];
        });

        const statusPromises = fetchedCrewIds.flatMap((crewId) =>
          weekDates.map((date) =>
            getDocs(
              collection(db, 'crews', crewId, 'statuses', date, 'userStatuses'),
            ),
          ),
        );
        const eventPromises = fetchedCrewIds.map((crewId) =>
          getDocs(collection(db, 'crews', crewId, 'events')),
        );

        const [statusSnapshots, eventSnapshots] = await Promise.all([
          Promise.all(statusPromises),
          Promise.all(eventPromises),
        ]);

        // Process Statuses
        let statusIndex = 0;
        for (const crewId of fetchedCrewIds) {
          for (const date of weekDates) {
            const snapshot = statusSnapshots[statusIndex++];
            let userIsUp = false;
            let otherMembersUp = false;
            snapshot.forEach((doc) => {
              const data = doc.data();
              if (doc.id === user.uid) {
                if (data.upForGoingOutTonight === true) {
                  newDateCounts[date].available++;
                  userIsUp = true;
                } else if (data.upForGoingOutTonight === false) {
                  newDateCounts[date].unavailable++;
                }
              } else if (data.upForGoingOutTonight === true) {
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
        }

        // Process Events
        eventSnapshots.forEach((snapshot, index) => {
          const crewId = fetchedCrewIds[index];
          snapshot.forEach((doc) => {
            const event = doc.data();
            const start = moment(event.startDate, 'YYYY-MM-DD');
            const end = moment(event.endDate, 'YYYY-MM-DD');
            weekDates.forEach((day) => {
              if (
                moment(day, 'YYYY-MM-DD').isBetween(start, end, 'day', '[]')
              ) {
                newDateEvents[day]++;
                if (!newDateEventCrews[day].includes(crewId)) {
                  newDateEventCrews[day].push(crewId);
                }
              }
            });
          });
        });

        setDateCounts(newDateCounts);
        setDateMatches(newDateMatches);
        setDateMatchingCrews(newDateMatchingCrews);
        setDateEvents(newDateEvents);
        setDateEventCrews(newDateEventCrews);

        setLoadingStatuses(false);
        setLoadingMatches(false);
        setLoadingEvents(false);
      } else {
        setLoadingStatuses(false);
        setLoadingMatches(false);
        setLoadingEvents(false);
      }
    });

    return () => {
      unsubscribe();
      Object.values(userSubscriptionsRef.current).forEach((unsub) => unsub());
      userSubscriptionsRef.current = {};
    };
  }, [user?.uid, weekDates, subscribeToUsers]);

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
