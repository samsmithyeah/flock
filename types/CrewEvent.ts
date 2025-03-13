// types/CrewEvent.ts

import { Timestamp } from 'firebase/firestore';

export type CrewEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD format
  description?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedBy?: string;
  unconfirmed?: boolean;
  location?: string;
};
