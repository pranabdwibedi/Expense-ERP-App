import { format, formatDistanceToNow } from 'date-fns';
import { Timestamp } from 'firebase/firestore';

export function toDate(date: any): Date {
  if (!date) return new Date();
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (date.seconds !== undefined) return new Timestamp(date.seconds, date.nanoseconds || 0).toDate();
  return new Date(date);
}

export function formatDate(date: any, formatStr: string = 'MMM dd, yyyy'): string {
  try {
    return format(toDate(date), formatStr);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid Date';
  }
}

export function formatRelative(date: any): string {
  try {
    return formatDistanceToNow(toDate(date), { addSuffix: true });
  } catch (error) {
    console.error('Error formatting relative date:', error);
    return 'recently';
  }
}
