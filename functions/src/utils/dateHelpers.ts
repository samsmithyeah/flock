import moment from 'moment';

export const getFormattedDate = (date: string) => {
  if (date === moment().format('YYYY-MM-DD')) {
    return 'Today';
  } else if (date === moment().add(1, 'days').format('YYYY-MM-DD')) {
    return 'Tomorrow';
  } else {
    return moment(date).format('dddd, MMMM Do');
  }
};
