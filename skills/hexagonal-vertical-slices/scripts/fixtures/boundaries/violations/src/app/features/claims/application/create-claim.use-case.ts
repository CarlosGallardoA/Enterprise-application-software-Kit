import { HttpClaimsAdapter } from '@features/claims/infrastructure/http/http-claims.adapter';
import { HttpClient } from '@angular/common/http';

export const deps = [HttpClaimsAdapter, HttpClient];
