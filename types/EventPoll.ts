import { Timestamp } from 'firebase/firestore';

export type PollOptionResponse = 'yes' | 'no' | 'maybe' | null;

export interface EventPollOption {
  date: string; // YYYY-MM-DD format (represents startDate)
  responses: {
    [userId: string]: PollOptionResponse;
  };
}

export interface EventPoll {
  id: string;
  title: string;
  description?: string;
  location?: string;
  options: EventPollOption[];
  createdBy: string; // User ID
  createdAt: Timestamp;
  crewId: string;
  finalized: boolean;
  duration: number; // Number of days for the event (default: 1)
  selectedDate?: string; // The final selected start date if finalized
  selectedEndDate?: string; // The calculated end date if finalized
}

export interface UserPollResponse {
  userId: string;
  responses: {
    [dateString: string]: PollOptionResponse;
  };
}
