export interface User {
  uid: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  photoURL?: string;
  expoPushToken?: string;
  activeChats?: string[];
  badgeCount?: number;
  phoneNumber?: string;
  country?: string;
}
