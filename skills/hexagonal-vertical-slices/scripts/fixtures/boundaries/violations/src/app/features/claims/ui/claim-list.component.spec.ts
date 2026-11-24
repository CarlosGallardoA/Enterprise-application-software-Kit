import { ListIncidentsUseCase } from '@features/incidents/application/list-incidents.use-case';
import { HttpClaimsAdapter } from '@features/claims/infrastructure/http/http-claims.adapter';

export const subject = [ListIncidentsUseCase, HttpClaimsAdapter];
