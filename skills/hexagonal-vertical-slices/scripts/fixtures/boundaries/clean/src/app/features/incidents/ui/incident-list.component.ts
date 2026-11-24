import { ListIncidentsUseCase } from '@features/incidents/application/list-incidents.use-case';
import { INCIDENTS_PORT } from '@features/incidents/infrastructure/composition/incidents.tokens';

export const deps = [INCIDENTS_PORT, ListIncidentsUseCase];
