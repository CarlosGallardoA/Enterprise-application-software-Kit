export type IncidentStatus = string;

export function isOpen(status: IncidentStatus): boolean {
  return status === 'open';
}
