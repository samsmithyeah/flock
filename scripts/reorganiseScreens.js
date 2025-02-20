const fs = require('fs');
const path = require('path');

// Define mapping from source file paths (relative to project root)
// to destination paths (also relative to project root) using Expo Router conventions.
const mappings = [
  // Auth screens
  { src: 'screens/LoginScreen.tsx', dest: 'app/(auth)/login.tsx' },
  {
    src: 'screens/ForgotPasswordScreen.tsx',
    dest: 'app/(auth)/forgot-password.tsx',
  },
  { src: 'screens/SignUpScreen.tsx', dest: 'app/(auth)/sign-up.tsx' },
  {
    src: 'screens/PhoneVerificationScreen.tsx',
    dest: 'app/(auth)/phone-verification.tsx',
  },
  // Contacts screens
  { src: 'screens/ContactsScreen.tsx', dest: 'app/(main)/contacts/index.tsx' },
  {
    src: 'screens/OtherUserProfileScreen.tsx',
    dest: 'app/(main)/contacts/other-user-profile.tsx',
  },
  // Chats screens (shared DMChat)
  { src: 'screens/DMChatScreen.tsx', dest: 'app/(main)/chats/dm-chat.tsx' },
  { src: 'screens/ChatsListScreen.tsx', dest: 'app/(main)/chats/index.tsx' },
  // Crews screens
  { src: 'screens/CrewsListScreen.tsx', dest: 'app/(main)/crews/index.tsx' },
  { src: 'screens/CrewScreen.tsx', dest: 'app/(main)/crews/[crewId].tsx' },
  {
    src: 'screens/CrewSettingsScreen.tsx',
    dest: 'app/(main)/crews/crew-settings.tsx',
  },
  {
    src: 'screens/AddMembersScreen.tsx',
    dest: 'app/(main)/crews/add-members.tsx',
  },
  {
    src: 'screens/CrewDateChatScreen.tsx',
    dest: 'app/(main)/crews/crew-date-chat.tsx',
  },
  // Dashboard screens
  {
    src: 'screens/DashboardScreen.tsx',
    dest: 'app/(main)/dashboard/index.tsx',
  },
  {
    src: 'screens/MatchesListScreen.tsx',
    dest: 'app/(main)/dashboard/matches-list.tsx',
  },
  {
    src: 'screens/EventCrewsListScreen.tsx',
    dest: 'app/(main)/dashboard/event-crews-list.tsx',
  },
  // Profile screens
  {
    src: 'screens/UserProfileScreen.tsx',
    dest: 'app/(main)/profile/index.tsx',
  },
  {
    src: 'screens/EditUserProfileModal.tsx',
    dest: 'app/(main)/profile/edit.tsx',
  },
  // Invitations
  { src: 'screens/InvitationsScreen.tsx', dest: 'app/(main)/invitations.tsx' },
];

// Helper: ensure the destination directory exists.
function ensureDirExists(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

mappings.forEach(({ src, dest }) => {
  const srcPath = path.join(__dirname, '..', src);
  const destPath = path.join(__dirname, '..', dest);

  if (!fs.existsSync(srcPath)) {
    console.error(`Source file not found: ${srcPath}`);
    return;
  }

  ensureDirExists(destPath);

  fs.rename(srcPath, destPath, (err) => {
    if (err) {
      console.error(`Error moving ${srcPath} to ${destPath}:`, err);
    } else {
      console.log(`Moved ${src} -> ${dest}`);
    }
  });
});
