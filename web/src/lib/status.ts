import type { BadgeTone } from '@/components/ui/primitives';

/** Consistent status → badge tone mapping used across both portals. */

export function attendanceTone(status: string): BadgeTone {
  switch (status) {
    case 'Verified':
    case 'Present':
      return 'ok';
    case 'Pending Review':
    case 'Verification Failed':
    case 'Absent':
      return 'warn';
    case 'Excused':
    case 'On Leave':
    case 'Holiday':
      return 'info';
    case 'Rejected':
      return 'bad';
    default:
      return 'neutral';
  }
}

export function lateTone(status: string): BadgeTone {
  switch (status) {
    case 'Not Late':
      return 'ok';
    case 'Late':
      return 'bad';
    case 'Pending Review':
      return 'warn';
    case 'Excused':
      return 'info';
    default:
      return 'neutral';
  }
}

export function taskTone(status: string): BadgeTone {
  switch (status) {
    case 'Complete':
      return 'ok';
    case 'In Progress':
      return 'brand';
    case 'Pending':
      return 'warn';
    case 'Yet to Start':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function priorityTone(priority: string): BadgeTone {
  switch (priority) {
    case 'High':
      return 'bad';
    case 'Medium':
      return 'warn';
    case 'Low':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function approvalTone(status: string): BadgeTone {
  switch (status) {
    case 'Approved':
    case 'Active':
      return 'ok';
    case 'Pending':
      return 'warn';
    case 'Declined':
    case 'Suspended':
      return 'bad';
    default:
      return 'neutral';
  }
}

export function publishTone(status: string): BadgeTone {
  switch (status) {
    case 'Published':
      return 'ok';
    case 'Scheduled':
      return 'info';
    case 'Draft':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Accent colour for a shift code, mirroring the shared shift registry. */
export function shiftAccent(code: string): string {
  const map: Record<string, string> = {
    MORNING: '#6366f1',
    EVENING_E1: '#8b5cf6',
    LATE_EVENING: '#06b6d4',
    OFF: '#94a3b8',
  };
  return map[code] ?? '#94a3b8';
}
