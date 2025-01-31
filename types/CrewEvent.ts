// types/CrewEvent.ts

import { Timestamp } from 'firebase/firestore';

export type CrewEvent = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  description?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedBy?: string;
  unconfirmed?: boolean;
  location?: string;
};
