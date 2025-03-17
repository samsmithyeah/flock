import moment from 'moment';

export const getFormattedDate = (
  date: string,
  format?: 'short' | 'medium' | 'long',
) => {
  if (date === moment().format('YYYY-MM-DD')) {
    return 'Today';
  } else if (date === moment().add(1, 'days').format('YYYY-MM-DD')) {
    return 'Tomorrow';
  } else {
    const getFormat = (format?: 'short' | 'medium' | 'long') => {
      switch (format) {
        case 'short':
          return 'MMM Do';
        case 'medium':
          return 'ddd, MMMM Do';
        case 'long':
          return 'dddd, MMMM Do';
        default:
          return 'dddd, MMMM Do';
      }
    };
    return moment(date).format(getFormat(format));
  }
};

export const getFormattedDay = (date: string) => {
  if (date === moment().format('YYYY-MM-DD')) {
    return 'Today';
  } else if (date === moment().add(1, 'days').format('YYYY-MM-DD')) {
    return 'Tomorrow';
  } else {
    return moment(date).format('dddd');
  }
};
