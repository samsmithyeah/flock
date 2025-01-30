// utils/addEventToCrew.ts

import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '@/firebase';

export type NewCrewEvent = {
  title: string;
  startDate: string;
  endDate: string;
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
    createdAt: serverTimestamp(),
  });
}

export async function updateEventInCrew(
  crewId: string,
  eventId: string,
  userId: string,
  updates: { title: string; startDate: string; endDate: string },
) {
  const eventRef = doc(db, 'crews', crewId, 'events', eventId);
  await updateDoc(eventRef, {
    ...updates,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

export async function deleteEventFromCrew(crewId: string, eventId: string) {
  await deleteDoc(doc(db, 'crews', crewId, 'events', eventId));
}
