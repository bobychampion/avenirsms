import { School } from '../types';

export const PLAN_PRICES: Record<School['subscriptionPlan'], { termly: number; yearly: number; label: string }> = {
  free:       { termly: 0,       yearly: 0,        label: 'Free' },
  starter:    { termly: 30000,   yearly: 90000,    label: 'Basic / Starter' },
  pro:        { termly: 60000,   yearly: 180000,   label: 'Professional' },
  enterprise: { termly: 100000,  yearly: 300000,   label: 'College / Enterprise' },
};
