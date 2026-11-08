/** Billing elevated roles that may enter the admin UI. */
export type BillingRole = 'admin' | 'staff' | 'client';

export function isFullAdmin(role: string | null | undefined): boolean {
  return role === 'admin';
}

export function isStaffOrAdmin(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

/** Staff may view admin + run light ops. Full admin retains money/secrets/destructive power. */
export type BillingStaffCapability =
  | 'admin.access'
  | 'tickets.manage'
  | 'services.suspend'
  | 'services.unsuspend'
  | 'invoices.cancel_unpaid'
  | 'logs.read'
  | 'settings.read'
  | 'catalog.write'
  | 'settings.write'
  | 'users.delete'
  | 'users.role'
  | 'users.password'
  | 'users.credits'
  | 'users.relink'
  | 'services.delete'
  | 'services.provision'
  | 'services.billing_jobs'
  | 'invoices.mark_paid'
  | 'invoices.delete'
  | 'coupons.write'
  | 'logs.delete'
  | 'panel.test';

const STAFF_ALLOWED = new Set<BillingStaffCapability>([
  'admin.access',
  'tickets.manage',
  'services.suspend',
  'invoices.cancel_unpaid',
  'logs.read',
  'settings.read',
]);

export function billingRoleCan(role: string | null | undefined, capability: BillingStaffCapability): boolean {
  if (isFullAdmin(role)) return true;
  if (role === 'staff') return STAFF_ALLOWED.has(capability);
  return false;
}
