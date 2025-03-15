// utils/addEventToCrew.ts

import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebase';

/**
 * Add a new event to a crew
 */
export const addEventToCrew = async (
  crewId: string,
  eventData: {
    title: string;
    startDate: string;
    endDate: string;
    unconfirmed?: boolean;
    location?: string;
    description?: string;
  },
  userId: string,
) => {
  try {
    const eventRef = collection(db, 'crews', crewId, 'events');
    const newEvent = {
      title: eventData.title,
      startDate: eventData.startDate,
      endDate: eventData.endDate,
      location: eventData.location || '',
      description: eventData.description || '',
      createdBy: userId,
      createdAt: Timestamp.now(),
      unconfirmed:
        eventData.unconfirmed !== undefined ? eventData.unconfirmed : true,
    };

    const docRef = await addDoc(eventRef, newEvent);
    return { id: docRef.id, ...newEvent };
  } catch (error) {
    console.error('Error adding event to crew:', error);
    throw error;
  }
};

/**
 * Update an existing event in a crew
 */
export const updateEventInCrew = async (
  crewId: string,
  eventId: string,
  userId: string,
  eventData: {
    title?: string;
    startDate: string;
    endDate: string;
    unconfirmed?: boolean;
    location?: string;
    description?: string;
  },
) => {
  try {
    const eventRef = doc(db, 'crews', crewId, 'events', eventId);
    const updateData = {
      ...eventData,
      updatedBy: userId,
      updatedAt: Timestamp.now(),
    };

    await updateDoc(eventRef, updateData);
    return { success: true };
  } catch (error) {
    console.error('Error updating event in crew:', error);
    throw error;
  }
};

/**
 * Delete an event from a crew
 */
export const deleteEventFromCrew = async (crewId: string, eventId: string) => {
  try {
    const eventRef = doc(db, 'crews', crewId, 'events', eventId);
    await deleteDoc(eventRef);
    return { success: true };
  } catch (error) {
    console.error('Error deleting event from crew:', error);
    throw error;
  }
};
