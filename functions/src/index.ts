import * as admin from 'firebase-admin';
import { notifyCrewMembersOnCrewDeletion } from './notifications/notifyCrewMembersOnCrewDeletion';
import { notifyCrewMembersOnNewJoin } from './notifications/notifyCrewMembersOnNewJoin';
import { notifyCrewOnStatusChange } from './notifications/notifyCrewOnStatusChange';
import { notifyUserOnCrewInvitation } from './notifications/notifyUserOnCrewInvitation';
import { notifyCrewMembersOnMemberLeave } from './notifications/notifyCrewMembersOnMemberLeave';
import { notifyCrewOnThreeUp } from './notifications/notifyCrewOnThreeUp';
import { notifyCrewMembersOnCrewActivityUpdate } from './notifications/notifyCrewMembersOnActivityUpdate';
import { notifyCrewMembersOnCrewPhotoUpdate } from './notifications/notifyCrewMembersOnCrewPhotoUpdate';
import { notifyCrewMembersOnCrewNameUpdate } from './notifications/notifyCrewMembersOnCrewNameUpdate';
import { deleteCrew } from './utils/deleteCrew';
import { notifyUserOnNewDMMessage } from './notifications/notifyUserOnNewDMMessage';
import { notifyUsersOnNewGroupMessage } from './notifications/notifyUsersOnNewGroupMessage';
import { pokeCrew } from './notifications/pokeCrew';
import { sendCode, verifyCode } from './utils/phoneVerification';
import { deleteAccount } from './utils/deleteAccount';
import { notifyCrewMembersOnEventWrite } from './notifications/notifyCrewMembersOnEventWrite';
import { notifyContactsOnNewUser } from './notifications/notifyContactsOnNewUser';
import { getMatchedUsersFromContacts } from './utils/getMatchesUsersFromContacts';
import { updatePhoneNumberHash } from './utils/updatePhoneNumberHash';
import { updateUserContacts } from './utils/updateUserContacts';
import { notifyCrewMembersOnPollCreation } from './notifications/notifyCrewMembersOnPollCreation';
import { notifyCrewMembersOnPollResponse } from './notifications/notifyCrewMembersOnPollResponse';
import { notifyCrewMembersOnPollFinalization } from './notifications/notifyCrewMembersOnPollFinalization';
import { notifyPollCreatorOnAllResponded } from './notifications/notifyPollCreatorOnAllResponded';
import { notifyCrewMembersOnPollDeletion } from './notifications/notifyCrewMembersOnPollDeletion';
import { updateStatusesFromPoll } from './utils/updateStatusesFromPoll';
import { notifyCrewMembersOnPollEdit } from './notifications/notifyCrewMembersOnPollEdit';
import { notifyNonRespondingPollMembers } from './notifications/notifyNonRespondingPollMembers';
import { notifyUsersAboutTodaysEvents } from './notifications/notifyUsersAboutTodaysEvents';
import { notifyUsersAboutTomorrowsEvents } from './notifications/notifyUsersAboutTomorrowsEvents';
import { processSignal, updateUserLocation } from './signals/sendSignal';
import { respondToSignal, getLocationSharing, modifySignalResponse } from './signals/signalResponse';
import { notifyCrewMembersOnNewMessage } from './notifications/notifyCrewMembersOnNewMessage';

export {
  notifyCrewMembersOnEventWrite,
  notifyCrewMembersOnCrewDeletion,
  notifyCrewMembersOnNewJoin,
  notifyCrewMembersOnMemberLeave,
  notifyCrewOnStatusChange,
  notifyUserOnCrewInvitation,
  notifyCrewOnThreeUp,
  notifyCrewMembersOnCrewActivityUpdate,
  notifyCrewMembersOnCrewPhotoUpdate,
  notifyCrewMembersOnCrewNameUpdate,
  deleteCrew,
  notifyUserOnNewDMMessage,
  notifyUsersOnNewGroupMessage,
  pokeCrew,
  sendCode,
  verifyCode,
  deleteAccount,
  notifyContactsOnNewUser,
  getMatchedUsersFromContacts,
  updatePhoneNumberHash,
  updateUserContacts,
  notifyCrewMembersOnPollCreation,
  notifyCrewMembersOnPollResponse,
  notifyCrewMembersOnPollFinalization,
  notifyPollCreatorOnAllResponded,
  notifyCrewMembersOnPollDeletion,
  updateStatusesFromPoll,
  notifyCrewMembersOnPollEdit,
  notifyNonRespondingPollMembers,
  notifyUsersAboutTodaysEvents,
  notifyUsersAboutTomorrowsEvents,
  processSignal,
  updateUserLocation,
  respondToSignal,
  getLocationSharing,
  modifySignalResponse,
  notifyCrewMembersOnNewMessage,
};

// Initialize Firebase Admin SDK
admin.initializeApp();
