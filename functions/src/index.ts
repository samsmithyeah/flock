import * as admin from 'firebase-admin';
import { notifyCrewMembersOnCrewDeletion } from './notifications/notifyCrewMembersOnCrewDeletion';
import { notifyCrewMembersOnNewJoin } from './notifications/notifyCrewMembersOnNewJoin';
import { notifyCrewOnStatusChange } from './notifications/notifyCrewOnStatusChange';
import { notifyUserOnCrewInvitation } from './notifications/notifyUserOnCrewInvitation';
import { notifyCrewMembersOnMemberLeave } from './notifications/notifyCrewMembersOnMemberLeave';
import { notifyCrewOnThreeUp } from './notifications/notifyCrewOnThreeUp';
import { deleteCrew } from './utils/deleteCrew';
import { notifyUserOnNewDMMessage } from './notifications/notifyUserOnNewDMMessage';
import { notifyUsersOnNewGroupMessage } from './notifications/notifyUsersOnNewGroupMessage';
import { pokeCrew } from './notifications/pokeCrew';
import { sendCode, verifyCode } from './utils/phoneVerification';
import { deleteAccount } from './utils/deleteAccount';
import { notifyCrewMembersOnEventWrite } from './notifications/notifyCrewMembersOnEventWrite';

export {
  notifyCrewMembersOnEventWrite,
  notifyCrewMembersOnCrewDeletion,
  notifyCrewMembersOnNewJoin,
  notifyCrewMembersOnMemberLeave,
  notifyCrewOnStatusChange,
  notifyUserOnCrewInvitation,
  notifyCrewOnThreeUp,
  deleteCrew,
  notifyUserOnNewDMMessage,
  notifyUsersOnNewGroupMessage,
  pokeCrew,
  sendCode,
  verifyCode,
  deleteAccount,
};

// Initialize Firebase Admin SDK
admin.initializeApp();
