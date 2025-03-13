import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { EventPoll, PollOptionResponse } from '@/types/EventPoll';

/**
 * Create a new event poll in a crew
 */
export const createEventPoll = async (
  crewId: string,
  userId: string,
  pollData: {
    title: string;
    description?: string;
    location?: string;
    dates: string[];
  },
) => {
  try {
    const pollRef = collection(db, 'event_polls');

    const newPoll = {
      title: pollData.title,
      description: pollData.description || '',
      location: pollData.location || '',
      options: pollData.dates.map((date) => ({
        date,
        responses: {},
      })),
      createdBy: userId,
      createdAt: serverTimestamp(),
      crewId,
      finalized: false,
    };

    const docRef = await addDoc(pollRef, newPoll);
    return { id: docRef.id, ...newPoll };
  } catch (error) {
    console.error('Error creating event poll:', error);
    throw error;
  }
};

/**
 * Get all polls for a crew
 */
export const getCrewPolls = async (crewId: string) => {
  try {
    const pollsRef = collection(db, 'event_polls');
    const q = query(pollsRef, where('crewId', '==', crewId));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as EventPoll[];
  } catch (error) {
    console.error('Error fetching crew polls:', error);
    throw error;
  }
};

/**
 * Get a single poll by ID
 */
export const getPollById = async (
  pollId: string,
): Promise<EventPoll | null> => {
  try {
    const pollRef = doc(db, 'event_polls', pollId);
    const pollDoc = await getDoc(pollRef);

    if (!pollDoc.exists()) {
      return null;
    }

    return {
      id: pollDoc.id,
      ...pollDoc.data(),
    } as EventPoll;
  } catch (error) {
    console.error('Error fetching poll:', error);
    throw error;
  }
};

/**
 * Record a user's response to a poll option
 */
export const respondToPollOption = async (
  pollId: string,
  userId: string,
  responses: { [dateString: string]: PollOptionResponse },
) => {
  try {
    const pollRef = doc(db, 'event_polls', pollId);
    const pollDoc = await getDoc(pollRef);

    if (!pollDoc.exists()) {
      throw new Error('Poll not found');
    }

    const pollData = pollDoc.data() as Omit<EventPoll, 'id'>;
    const updatedOptions = [...pollData.options];

    // Update the responses for each date
    Object.entries(responses).forEach(([dateString, response]) => {
      const optionIndex = updatedOptions.findIndex(
        (opt) => opt.date === dateString,
      );
      if (optionIndex !== -1) {
        updatedOptions[optionIndex] = {
          ...updatedOptions[optionIndex],
          responses: {
            ...updatedOptions[optionIndex].responses,
            [userId]: response,
          },
        };
      }
    });

    await updateDoc(pollRef, {
      options: updatedOptions,
    });

    return {
      id: pollId,
      ...pollData,
      options: updatedOptions,
    };
  } catch (error) {
    console.error('Error responding to poll:', error);
    throw error;
  }
};

/**
 * Finalize a poll by selecting a date
 */
export const finalizePoll = async (pollId: string, selectedDate: string) => {
  try {
    const pollRef = doc(db, 'event_polls', pollId);

    await updateDoc(pollRef, {
      finalized: true,
      selectedDate,
    });

    return { success: true };
  } catch (error) {
    console.error('Error finalizing poll:', error);
    throw error;
  }
};

/**
 * Convert a poll result into a full event
 */
export const createEventFromPoll = async (
  crewId: string,
  pollId: string,
  userId: string,
) => {
  try {
    // Get the poll data
    const poll = await getPollById(pollId);
    if (!poll || !poll.finalized || !poll.selectedDate) {
      throw new Error('Poll is not finalized or missing selected date');
    }

    // Create the event
    const eventRef = collection(db, 'crews', crewId, 'events');
    const eventData = {
      title: poll.title,
      date: poll.selectedDate, // Use single date field
      location: poll.location || '',
      description: poll.description || '',
      createdBy: userId,
      createdAt: Timestamp.now(),
      unconfirmed: false,
    };

    const docRef = await addDoc(eventRef, eventData);

    // Get user responses for the selected date
    // Since we've checked poll.selectedDate is not null above, we can safely use it
    const selectedDate = poll.selectedDate; // This is definitely a string now
    const selectedOption = poll.options.find(
      (option) => option.date === selectedDate,
    );
    if (selectedOption && selectedOption.responses) {
      // Set availability statuses based on poll responses
      const batch = writeBatch(db);

      Object.entries(selectedOption.responses).forEach(
        ([respondentId, response]) => {
          // "yes" and "maybe" responses should be marked as available
          // "no" responses should be marked as unavailable
          // Any other responses are ignored
          const isAvailable = () => {
            if (response === 'yes' || response === 'maybe') {
              return true;
            }
            if (response === 'no') {
              return false;
            }
            return null;
          };

          const userStatusRef = doc(
            db,
            'crews',
            crewId,
            'statuses',
            selectedDate,
            'userStatuses',
            respondentId,
          );

          batch.set(userStatusRef, {
            date: selectedDate,
            upForGoingOutTonight: isAvailable(),
            timestamp: Timestamp.now(),
          });
        },
      );

      // Commit all status updates
      await batch.commit();
    }

    return {
      id: docRef.id,
      ...eventData,
    };
  } catch (error) {
    console.error('Error creating event from poll:', error);
    throw error;
  }
};

/**
 * Determine which date has the most "yes" responses
 */
export const findBestDate = (poll: EventPoll): string | null => {
  if (!poll.options.length) return null;

  const dateScores = poll.options.map((option) => {
    const responses = option.responses || {};

    // Count responses
    let yesCount = 0;
    let maybeCount = 0;
    let noCount = 0;

    Object.values(responses).forEach((response) => {
      if (response === 'yes') yesCount++;
      else if (response === 'maybe') maybeCount++;
      else if (response === 'no') noCount++;
    });

    // Calculate score: yes = 1 point, maybe = 0.5 points
    const score = yesCount + maybeCount * 0.5;

    return {
      date: option.date,
      score,
      yesCount,
      maybeCount,
      noCount,
    };
  });

  // Sort by score (highest first)
  dateScores.sort((a, b) => b.score - a.score);

  // Return the date with the highest score
  return dateScores[0].date;
};
