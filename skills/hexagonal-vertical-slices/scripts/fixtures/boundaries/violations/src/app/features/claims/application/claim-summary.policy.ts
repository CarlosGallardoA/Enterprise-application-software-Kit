import { claimRule } from '@features/claims/domain/claim.rule';
import { claimRule as again } from '@features/claims/domain/claim.rule';
import { claimRule as relative } from '../domain/claim.rule';

export const all = [claimRule, again, relative];
