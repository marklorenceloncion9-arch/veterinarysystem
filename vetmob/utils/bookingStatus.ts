import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export type BookingStatusStyle = {
  badgeBg: string;
  badgeText: string;
  icon: string;
  label: string;
};

// Diri pilion ang kolor sa status sa booking.
export function getStatusStyle(status: string): BookingStatusStyle {
  switch (status) {
    case 'pending':
      return {
        badgeBg: 'bg-amber-100 dark:bg-amber-900/30',
        badgeText: 'text-amber-800 dark:text-amber-300',
        icon: '#d97706',
        label: 'Pending',
      };
    case 'approved':
      return {
        badgeBg: 'bg-blue-100 dark:bg-blue-900/30',
        badgeText: 'text-blue-800 dark:text-blue-300',
        icon: '#1F7A8C',
        label: 'Approved',
      };
    case 'processing':
      return {
        badgeBg: 'bg-purple-100 dark:bg-purple-900/30',
        badgeText: 'text-purple-800 dark:text-purple-300',
        icon: '#7c3aed',
        label: 'Processing',
      };
    case 'ongoing':
      return {
        badgeBg: 'bg-indigo-100 dark:bg-indigo-900/30',
        badgeText: 'text-indigo-800 dark:text-indigo-300',
        icon: '#4f46e5',
        label: 'Ongoing',
      };
    case 'completed':
      return {
        badgeBg: 'bg-emerald-100 dark:bg-emerald-900/30',
        badgeText: 'text-emerald-800 dark:text-emerald-300',
        icon: '#047857',
        label: 'Completed',
      };
    case 'cancelled':
      return {
        badgeBg: 'bg-red-100 dark:bg-red-900/30',
        badgeText: 'text-red-800 dark:text-red-300',
        icon: '#dc2626',
        label: 'Cancelled',
      };
    case 'rejected':
      return {
        badgeBg: 'bg-slate-100 dark:bg-slate-700',
        badgeText: 'text-slate-700 dark:text-slate-300',
        icon: '#64748b',
        label: 'Rejected',
      };
    default:
      return {
        badgeBg: 'bg-slate-100 dark:bg-slate-700',
        badgeText: 'text-slate-700 dark:text-slate-300',
        icon: '#64748b',
        label: status || 'Unknown',
      };
  }
}

// Diri pilion ang icon sa status sa booking.
export function getStatusIcon(status: string): keyof typeof MaterialIcons.glyphMap {
  switch (status) {
    case 'pending':
      return 'hourglass-empty';
    case 'approved':
      return 'check-circle';
    case 'processing':
      return 'autorenew';
    case 'ongoing':
      return 'schedule';
    case 'completed':
      return 'task-alt';
    case 'cancelled':
      return 'cancel';
    case 'rejected':
      return 'block';
    default:
      return 'help';
  }
}
