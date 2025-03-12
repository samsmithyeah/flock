import { Timestamp } from 'firebase/firestore';

export type PollOptionResponse = 'yes' | 'no' | 'maybe' | null;

export interface EventPollOption {
  date: string; // YYYY-MM-DD format
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
  selectedDate?: string; // The final selected date if finalized
}

export interface UserPollResponse {
  userId: string;
  responses: {
    [dateString: string]: PollOptionResponse;
  };
}
