import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase';

export type NewCrewEvent = {
  title: string;
  startDate: string; // or Firestore.Timestamp
  endDate: string; // or Firestore.Timestamp
  description?: string;
};

export async function addEventToCrew(
  crewId: string,
  eventData: NewCrewEvent,
  userId: string,
) {
  const eventsRef = collection(db, 'crews', crewId, 'events');
  await addDoc(eventsRef, {
    ...eventData,
    createdBy: userId,
    createdAt: Timestamp.now(),
  });
}
