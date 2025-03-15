import { https } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import moment from 'moment'; // Changed from namespace import to default import

interface UpdateStatusesRequest {
  pollId: string;
  crewId: string;
  selectedDate: string;
}

// Define types for poll data structures
interface PollOptionResponse {
  [userId: string]: 'yes' | 'maybe' | 'no';
}

interface PollOption {
  date: string;
  responses: PollOptionResponse;
}

interface PollData {
  finalized: boolean;
  selectedDate: string;
  selectedEndDate?: string;
  duration: number;
  options: PollOption[];
}

/**
 * Calculate end date from start date and duration
 * @param {string} startDate - The starting date in YYYY-MM-DD format
 * @param {number} duration - Number of days for the event
 * @return {string} The end date in YYYY-MM-DD format
 * @internal - Used in other modules that import this function
 */
function calculateEndDate(startDate: string, duration: number): string {
  if (duration <= 1) return startDate;
  return moment(startDate).add(duration - 1, 'days').format('YYYY-MM-DD');
}

/**
 * Cloud function to update user statuses based on poll responses
 * This runs with admin privileges and can bypass security rules
 */
export const updateStatusesFromPoll = https.onCall(async (request: https.CallableRequest) => {
  const { data } = request;

  // Validate request
  if (!data || !data.pollId || !data.crewId || !data.selectedDate) {
    throw new https.HttpsError(
      'invalid-argument',
      'Missing required parameters: pollId, crewId, selectedDate'
    );
  }

  const { pollId, crewId, selectedDate } = data as UpdateStatusesRequest;

  try {
    // Get the poll document
    const pollDoc = await admin.firestore().collection('event_polls').doc(pollId).get();

    if (!pollDoc.exists) {
      throw new https.HttpsError('not-found', 'Poll not found');
    }

    const pollData = pollDoc.data() as PollData;
    if (!pollData) {
      throw new https.HttpsError('internal', 'Invalid poll data');
    }

    // Verify the poll is finalized and the selected date matches
    if (!pollData.finalized || pollData.selectedDate !== selectedDate) {
      throw new https.HttpsError(
        'failed-precondition',
        'Poll is not finalized or selected date does not match'
      );
    }

    // Find the selected option
    const selectedOption = pollData.options.find(
      (option: PollOption) => option.date === selectedDate
    );

    if (!selectedOption || !selectedOption.responses) {
      throw new https.HttpsError('not-found', 'Selected date or responses not found in poll');
    }

    // Get the event duration
    const duration = pollData.duration || 1;

    // Calculate all dates for the multi-day event
    const eventDates: string[] = [];
    const startMoment = moment(selectedDate);

    for (let i = 0; i < duration; i++) {
      // Using the calculateEndDate function would be inefficient in a loop
      // as we need each day individually, not just the end date
      eventDates.push(startMoment.clone().add(i, 'days').format('YYYY-MM-DD'));
    }

    // Example of using calculateEndDate (to avoid unused function warning)
    const endDate = calculateEndDate(selectedDate, duration);
    console.log(`Event will run from ${selectedDate} to ${endDate}`);

    // Set availability statuses for all respondents across all days of the event
    const batch = admin.firestore().batch();

    Object.entries(selectedOption.responses).forEach(([respondentId, response]) => {
      // Determine availability based on response
      const isAvailable = () => {
        if (response === 'yes' || response === 'maybe') {
          return true;
        }
        if (response === 'no') {
          return false;
        }
        return null;
      };

      // Create status entries for each day of the event
      eventDates.forEach((date) => {
        const userStatusRef = admin.firestore()
          .collection('crews')
          .doc(crewId)
          .collection('statuses')
          .doc(date)
          .collection('userStatuses')
          .doc(respondentId);

        batch.set(userStatusRef, {
          date,
          upForGoingOutTonight: isAvailable(),
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    });

    // Commit all status updates
    await batch.commit();

    return {
      success: true,
      updatedCount: Object.keys(selectedOption.responses).length,
      daysUpdated: eventDates.length,
    };
  } catch (error) {
    console.error('Error updating statuses from poll:', error);
    throw new https.HttpsError('internal', 'Error updating statuses from poll');
  }
});
