/** Format RAM/disk for display. 0 = unlimited (panel parity). */
export function formatMemoryMb(mb: number | null | undefined): string {
  if (mb == null) return '—';
  if (mb <= 0) return 'Unlimited';
  if (mb >= 1024) return `${Math.round((mb / 1024) * 10) / 10} GB`;
  return `${mb} MB`;
}

export function formatDiskMb(mb: number | null | undefined): string {
  return formatMemoryMb(mb);
}

/** Format CPU percent. 0 = unlimited (panel parity). */
export function formatCpuPercent(cpu: number | null | undefined): string {
  if (cpu == null) return '—';
  if (cpu <= 0) return 'Unlimited';
  return `${cpu}%`;
}

/** Feature slots (backups/databases/allocations): 0 = disabled. */
export function formatFeatureLimit(limit: number | null | undefined, unit: string): string {
  if (limit == null) return '—';
  if (limit <= 0) return 'Disabled';
  return `${limit} ${unit}`;
}
