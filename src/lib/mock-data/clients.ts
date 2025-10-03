import { Client } from '@/types';

/**
 * MOCK DATA - Sample clients (dental surgeries) for Phase 1 frontend development
 * In Phase 2, this will be replaced with real Supabase data
 */

const daysAgo = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const hoursAgo = (hours: number): Date => {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date;
};

export const mockClients: Client[] = [
  {
    id: 'CL001',
    surgery: 'Smile Dental Croydon',
    role: 'Dental Nurse',
    postcode: 'CR0 2AB',
    pay: '£15–£18',
    days: 'Mon-Fri',
    added_at: hoursAgo(30), // New marker
  },
  {
    id: 'CL002',
    surgery: 'Bromley Family Dentist',
    role: 'Dentist',
    postcode: 'BR2 9AA',
    pay: '£50000–£60000',
    days: 'Mon-Fri',
    added_at: daysAgo(4),
  },
  {
    id: 'CL003',
    surgery: 'Greenwich Dental Care',
    role: 'dn', // Will be normalized
    postcode: 'SE10 0AA',
    pay: '£16',
    days: 'Tue-Sat',
    added_at: hoursAgo(20), // New marker
  },
  {
    id: 'CL004',
    surgery: 'Kingston Orthodontics',
    role: 'Dental Receptionist',
    postcode: 'KT2 5AA',
    pay: '£13–£15',
    days: 'Mon-Fri',
    added_at: daysAgo(8),
  },
  {
    id: 'CL005',
    surgery: 'Wimbledon Smile Studio',
    role: 'Dental Hygienist',
    postcode: 'SW19 2BB',
    pay: '£30–£35',
    days: 'Mon-Thu',
    added_at: daysAgo(6),
  },
  {
    id: 'CL006',
    surgery: 'Sutton Dental Practice',
    role: 'Practice Manager',
    postcode: 'SM1 2AA',
    pay: '£35000',
    days: 'Mon-Fri',
    added_at: daysAgo(12),
  },
  {
    id: 'CL007',
    surgery: 'Clapham Dental Clinic',
    role: 'Trainee Dental Nurse',
    postcode: 'SW4 6AA',
    pay: '£11–£12',
    days: 'Mon-Fri',
    added_at: daysAgo(2),
  },
  {
    id: 'CL008',
    surgery: 'Islington Dental Hub',
    role: 'Treatment Coordinator',
    postcode: 'N1 1AA',
    pay: '£25–£30',
    days: 'Mon-Fri',
    added_at: daysAgo(14),
  },
  {
    id: 'CL009',
    surgery: 'Shoreditch Smiles',
    role: 'Dentist',
    postcode: 'E2 7AA',
    pay: '£55000',
    days: 'Mon-Thu',
    added_at: hoursAgo(40), // New marker
  },
  {
    id: 'CL010',
    surgery: 'Camden Dental Centre',
    role: 'Dental Nurse',
    postcode: 'NW1 8AA',
    pay: '£17',
    days: 'Mon-Fri',
    added_at: daysAgo(5),
  },
];
