import { HttpClient } from '@angular/common/http';
import type { IncidentsPort } from '@features/incidents/application/ports/incidents.port';

export class HttpIncidentsAdapter implements IncidentsPort {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<string[]> {
    return Promise.resolve([]);
  }
}
