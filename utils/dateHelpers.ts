import moment from 'moment';

export const getFormattedDate = (date: string, short?: boolean) => {
  if (date === moment().format('YYYY-MM-DD')) {
    return 'Today';
  } else if (date === moment().add(1, 'days').format('YYYY-MM-DD')) {
    return 'Tomorrow';
  } else {
    return moment(date).format(short ? 'MMM Do' : 'dddd, MMMM Do');
  }
};
