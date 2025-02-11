import moment from 'moment';

export const getFormattedDate = (date: string, short?: boolean) => {
  if (date === moment().format('YYYY-MM-DD')) {
    return 'today';
  } else if (date === moment().add(1, 'days').format('YYYY-MM-DD')) {
    return 'tomorrow';
  } else {
    return moment(date).format(short ? 'MMM Do' : 'dddd, MMMM Do');
  }
};

export const getDateDescription = (dateStr: string): string => {
  const today = new Date();
  const targetDate = new Date(`${dateStr}T00:00:00Z`);

  // Get today's date in UTC
  const currentUTC = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  );

  // Calculate difference in days
  const diffTime = targetDate.getTime() - currentUTC.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'today';
  } else if (diffDays === 1) {
    return 'tomorrow';
  } else if (diffDays >= 2 && diffDays <= 6) {
    // Get the day of the week, e.g., "Friday"
    const options: Intl.DateTimeFormatOptions = { weekday: 'long' };
    const dayOfWeek = targetDate.toLocaleDateString('en-GB', options);
    return `on ${dayOfWeek}`;
  } else {
    return `on ${dateStr}`;
  }
};
