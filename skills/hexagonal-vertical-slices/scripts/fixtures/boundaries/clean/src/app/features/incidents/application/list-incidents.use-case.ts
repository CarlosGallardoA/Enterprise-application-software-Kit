import type { IncidentsPort } from '@features/incidents/application/ports/incidents.port';
import type { IncidentStatus } from '@features/incidents/domain/incident.rule';
import { isOpen } from '@features/incidents/domain/incident.rule';

export class ListIncidentsUseCase {
  constructor(private readonly port: IncidentsPort) {}

  async execute(): Promise<IncidentStatus[]> {
    return (await this.port.list()).filter(isOpen);
  }
}
