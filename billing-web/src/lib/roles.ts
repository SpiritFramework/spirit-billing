export type BillingRole = 'admin' | 'staff' | 'client';

export function isFullAdmin(role: string | null | undefined): boolean {
  return role === 'admin';
}

export function isStaffOrAdmin(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

export function roleLabel(role: string | null | undefined): string {
  if (role === 'admin') return 'Administrator';
  if (role === 'staff') return 'Staff';
  return 'Client';
}
