export interface Crew {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  iconUrl?: string;
  activity: string;
  alwaysShowStatuses?: boolean; // Allow members to see statuses even if they haven't set their own
}
