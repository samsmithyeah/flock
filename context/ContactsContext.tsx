// src/context/ContactsContext.tsx

import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
  useRef,
} from 'react';
import { Contact } from '@/types/Contacts';
import {
  getAllContacts,
  requestContactsPermission,
  sanitizePhoneNumber,
} from '@/utils/contactsUtils';
import { CountryCode } from 'libphonenumber-js';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { User } from '@/types/User';
import { useUser } from '@/context/UserContext';

interface ContactsContextValue {
  contacts: Contact[];
  matchedUsersFromContacts: User[];
  matchedUsersFromCrews: User[];
  allContacts: User[]; // Combined list
  loading: boolean;
  error: string | null;
  refreshContacts: () => Promise<void>;
}

const ContactsContext = createContext<ContactsContextValue | undefined>(
  undefined,
);

export const ContactsProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [matchedUsersFromContacts, setMatchedUsersFromContacts] = useState<
    User[]
  >([]);
  const [matchedUsersFromCrews, setMatchedUsersFromCrews] = useState<User[]>(
    [],
  );
  const [allContacts, setAllContacts] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState<CountryCode>('GB');
  const { user } = useUser();
  const userSubscriptionsRef = useRef<{ [uid: string]: () => void }>({});

  useEffect(() => {
    // Subscribe to changes for any contacts that aren’t already subscribed.
    allContacts.forEach(
      (contact) => {
        if (!user) return;
        if (!userSubscriptionsRef.current[contact.uid]) {
          const unsubscribe = onSnapshot(
            doc(db, 'users', contact.uid),
            (docSnap) => {
              if (docSnap.exists()) {
                const data = docSnap.data();
                setAllContacts((prevContacts) =>
                  prevContacts.map((c) =>
                    c.uid === contact.uid
                      ? { ...c, isOnline: data.isOnline }
                      : c,
                  ),
                );
              }
            },
            (error: any) => {
              if (error.code === 'permission-denied') return;
              console.error(
                'Error in contacts snapshot for uid',
                contact.uid,
                ':',
                error,
              );
            },
          );
          userSubscriptionsRef.current[contact.uid] = unsubscribe;
        }
      },
      (error: any) => {
        if (error.code === 'permission-denied') return;
        console.error('Error in contacts snapshot:', error);
      },
    );

    // Cleanup subscriptions for contacts that are no longer in the list.
    const currentUids = new Set(allContacts.map((c) => c.uid));
    Object.keys(userSubscriptionsRef.current).forEach((uid) => {
      if (!currentUids.has(uid)) {
        userSubscriptionsRef.current[uid]();
        delete userSubscriptionsRef.current[uid];
      }
    });
  }, [allContacts]);

  useEffect(() => {
    // When the ContactsContext unmounts, clean up all subscriptions.
    return () => {
      Object.values(userSubscriptionsRef.current).forEach((unsubscribe) =>
        unsubscribe(),
      );
      userSubscriptionsRef.current = {};
    };
  }, []);

  useEffect(() => {
    setCountry((user?.country ?? 'GB') as CountryCode);
  }, [user]);

  const loadContacts = async () => {
    console.log('🔄 Starting to load contacts...');
    try {
      setLoading(true);
      setError(null);

      // Fetch phone contacts
      const hasPermission = await requestContactsPermission();
      if (!hasPermission) {
        console.warn('🚫 Permission to access contacts was denied.');
        setError('Permission to access contacts was denied.');
        setLoading(false);
        return;
      }
      console.log('✅ Contacts permission granted.');

      const deviceContacts = await getAllContacts();
      console.log(`📇 Fetched ${deviceContacts.length} device contacts.`);

      // Normalize and format phone contacts
      const formattedContacts: Contact[] = deviceContacts
        .map((contact) => {
          if (!contact.id) {
            console.log(
              `⚠️ Contact without ID skipped: ${JSON.stringify(contact)}`,
            );
            return null;
          }

          // Ensure phoneNumbers is defined and contains valid numbers
          const sanitizedPhoneNumbers =
            contact.phoneNumbers
              ?.map((pn) => pn.number)
              .filter(
                (number): number is string =>
                  typeof number === 'string' && number.trim() !== '',
              )
              .map((number) => sanitizePhoneNumber(number, country))
              .filter((number) => number !== '') || [];

          if (sanitizedPhoneNumbers.length === 0) {
            console.log(
              `⚠️ Contact "${contact.name || 'Unnamed Contact'}" skipped due to no valid phone numbers.`,
            );
            return null; // Skip contacts without valid phone numbers
          }

          return {
            id: contact.id,
            name: contact.name || 'Unnamed Contact',
            phoneNumbers: sanitizedPhoneNumbers,
          };
        })
        .filter(
          (contact): contact is Contact =>
            contact !== null && contact.phoneNumbers.length > 0,
        );

      console.log(
        `✅ Formatted contacts: ${formattedContacts.length} contacts with valid phone numbers.`,
      );
      setContacts(formattedContacts);

      // Extract unique phone numbers
      const allPhoneNumbers = formattedContacts.flatMap(
        (contact) => contact.phoneNumbers,
      );
      const uniquePhoneNumbers = Array.from(new Set(allPhoneNumbers));
      console.log(
        `📞 Extracted ${uniquePhoneNumbers.length} unique phone numbers.`,
      );

      // Fetch matched users from phone contacts
      let matchedFromContacts: User[] = [];
      if (uniquePhoneNumbers.length > 0) {
        console.log('🔍 Fetching matched users from phone contacts...');
        matchedFromContacts = await fetchMatchedUsers(uniquePhoneNumbers);
        console.log(
          `✅ Matched ${matchedFromContacts.length} users from phone contacts.`,
        );
      } else {
        console.log('ℹ️ No unique phone numbers to match from contacts.');
      }
      setMatchedUsersFromContacts(matchedFromContacts);

      // Fetch matched users from crews
      let matchedFromCrews: User[] = [];
      if (user) {
        matchedFromCrews = await fetchCrewMembers(user.uid);
        console.log(`✅ Matched ${matchedFromCrews.length} users from crews.`);
      }
      setMatchedUsersFromCrews(matchedFromCrews);

      // Combine both lists, avoiding duplicates
      const combinedMap = new Map<string, User>();

      matchedFromContacts.forEach((user) => {
        combinedMap.set(user.uid, user);
      });

      matchedFromCrews.forEach((user) => {
        combinedMap.set(user.uid, user);
      });

      // Exclude the current user from the combined list
      const combinedList = Array.from(combinedMap.values()).filter(
        (u) => u.uid !== user?.uid,
      );
      console.log(
        `📋 Combined contacts count (excluding current user): ${combinedList.length}`,
      );

      // Order the combined list by displayName
      combinedList.sort((a, b) =>
        a.displayName.localeCompare(b.displayName, 'en', {
          sensitivity: 'base',
        }),
      );

      setAllContacts(combinedList);
    } catch (err) {
      console.error('❌ Error loading contacts:', err);
      setError('Failed to load contacts.');
    } finally {
      setLoading(false);
      console.log('🔄 Finished loading contacts.');
    }
  };

  const fetchMatchedUsers = async (phoneNumbers: string[]): Promise<User[]> => {
    console.log(
      `🔄 Starting fetchMatchedUsers with ${phoneNumbers.length} phone numbers.`,
    );
    const usersRef = collection(db, 'users');
    const batchSize = 10; // Firestore 'in' queries allow max 10 elements
    const batches = [];

    for (let i = 0; i < phoneNumbers.length; i += batchSize) {
      const batch = phoneNumbers.slice(i, i + batchSize);
      batches.push(batch);
    }

    console.log(`🔢 Divided phone numbers into ${batches.length} batches.`);

    const matched: User[] = [];

    const queryPromises = batches.map(async (batch, index) => {
      console.log(`📄 Processing batch ${index + 1}/${batches.length}:`, batch);
      const q = query(usersRef, where('phoneNumber', 'in', batch));
      try {
        const querySnapshot = await getDocs(q);
        console.log(
          `✅ Batch ${index + 1}: Found ${querySnapshot.docs.length} matched users.`,
        );
        for (const docSnap of querySnapshot.docs) {
          const data = docSnap.data();
          matched.push({
            uid: docSnap.id,
            displayName: data.displayName,
            phoneNumber: data.phoneNumber,
            photoURL: data.photoURL || undefined,
            email: data.email,
          });
        }
      } catch (error) {
        console.error(`❌ Error in batch ${index + 1}:`, error);
      }
    });

    await Promise.all(queryPromises);
    console.log(`🔍 Total matched users from contacts: ${matched.length}`);

    // Filter out the current user from the matched users
    const filteredMatched = matched.filter(
      (matchedUser) => matchedUser.uid !== user?.uid,
    );
    console.log(
      `🚫 Excluded current user. Matched users count after exclusion: ${filteredMatched.length}`,
    );

    return filteredMatched;
  };

  const fetchCrewMembers = async (currentUserId: string): Promise<User[]> => {
    console.log(`🔄 Starting fetchCrewMembers for user ID: ${currentUserId}`);
    try {
      // Fetch all crews the user is part of
      const crewsRef = collection(db, 'crews');
      const userCrewsQuery = query(
        crewsRef,
        where('memberIds', 'array-contains', currentUserId),
      );
      const crewsSnapshot = await getDocs(userCrewsQuery);

      console.log(
        `📄 Found ${crewsSnapshot.size} crews for user ID: ${currentUserId}`,
      );

      if (crewsSnapshot.empty) {
        console.log('ℹ️ User is not part of any crews.');
        return [];
      }

      // Collect all unique member IDs from all crews
      const memberIdsSet = new Set<string>();

      crewsSnapshot.forEach((crewDoc) => {
        const crewData = crewDoc.data();
        const memberIds: string[] = crewData.memberIds || [];
        memberIds.forEach((id) => memberIdsSet.add(id));
      });

      // Remove the current user's ID
      memberIdsSet.delete(currentUserId);

      const potentialMemberIds = Array.from(memberIdsSet);
      console.log(
        `🔢 Potential crew member IDs count: ${potentialMemberIds.length}`,
      );

      if (potentialMemberIds.length === 0) {
        console.log('ℹ️ No other members found in the crews.');
        return [];
      }

      // Fetch user profiles
      const usersRef = collection(db, 'users');
      const userDocsPromises = potentialMemberIds.map((memberId) =>
        getDoc(doc(usersRef, memberId)),
      );

      const userDocs = await Promise.all(userDocsPromises);
      console.log(`📄 Fetched ${userDocs.length} user documents from crews.`);

      const fetchedMembers: User[] = userDocs
        .filter((docSnap) => docSnap.exists())
        .map((docSnap) => ({
          uid: docSnap.id,
          ...(docSnap.data() as Omit<User, 'uid'>),
        }));

      console.log(`✅ Fetched ${fetchedMembers.length} valid crew members.`);

      return fetchedMembers;
    } catch (error) {
      console.error('❌ Error fetching crew members:', error);
      return [];
    }
  };

  useEffect(() => {
    if (user) {
      console.log('🔁 useEffect triggered: Calling loadContacts.');
      loadContacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const refreshContacts = async () => {
    console.log('🔄 Refreshing contacts...');
    await loadContacts();
  };

  return (
    <ContactsContext.Provider
      value={{
        contacts,
        matchedUsersFromContacts,
        matchedUsersFromCrews,
        allContacts,
        loading,
        error,
        refreshContacts,
      }}
    >
      {children}
    </ContactsContext.Provider>
  );
};

// Custom hook for consuming the context
export const useContacts = () => {
  const context = useContext(ContactsContext);
  if (!context) {
    throw new Error('useContacts must be used within a ContactsProvider');
  }
  return context;
};
