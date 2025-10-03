import { Candidate } from '@/types';

/**
 * MOCK DATA - Sample candidates for Phase 1 frontend development
 * In Phase 2, this will be replaced with real Supabase data
 */

// Helper to create dates relative to now
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

export const mockCandidates: Candidate[] = [
  {
    id: 'CAN001',
    role: 'Dental Nurse',
    postcode: 'CR0 1PB', // Croydon
    salary: '£15–£17',
    days: 'Mon-Wed',
    added_at: hoursAgo(24), // New marker (within 48h)
    phone: '07700 900001',
    notes: 'Experienced with orthodontics',
    experience: '5 years',
    travel_flexibility: 'Up to 30 minutes',
  },
  {
    id: 'CAN002',
    role: 'Dentist',
    postcode: 'BR1 1AA', // Bromley
    salary: '£50000',
    days: 'Mon-Fri',
    added_at: daysAgo(10),
    experience: '8 years',
    notes: 'Specialist in cosmetic dentistry',
  },
  {
    id: 'CAN003',
    role: 'dn', // Will be normalized to "Dental Nurse"
    postcode: 'SE13 5AB', // Lewisham
    salary: '£14',
    days: 'Part-time',
    added_at: hoursAgo(36), // New marker
    phone: '07700 900003',
  },
  {
    id: 'CAN004',
    role: 'Dental Receptionist',
    postcode: 'SW19 1AA', // Wimbledon
    salary: '£12–£14',
    days: 'Mon-Fri',
    added_at: daysAgo(5),
    experience: '3 years',
    notes: 'Excellent with SOE software',
  },
  {
    id: 'CAN005',
    role: 'Hygienist', // Will be normalized
    postcode: 'SE10 8EW', // Greenwich
    salary: '£30',
    days: 'Tue-Thu',
    added_at: daysAgo(15),
    experience: '6 years',
  },
  {
    id: 'CAN006',
    role: 'Treatment Coordinator',
    postcode: 'KT1 1AA', // Kingston
    salary: '£25–£28',
    days: 'Mon-Fri',
    added_at: daysAgo(3),
    notes: 'Sales-driven, excellent communicator',
    experience: '4 years',
  },
  {
    id: 'CAN007',
    role: 'pm', // Will be normalized to Practice Manager
    postcode: 'SM1 1AA', // Sutton
    salary: '£35000',
    days: 'Mon-Fri',
    added_at: daysAgo(7),
    experience: '10 years',
    phone: '07700 900007',
  },
  {
    id: 'CAN008',
    role: 'Trainee Dental Nurse',
    postcode: 'SW4 7AA', // Clapham
    salary: '£11',
    days: 'Mon-Fri',
    added_at: hoursAgo(12), // New marker
    notes: 'Eager to learn, starting qualification',
  },
  {
    id: 'CAN009',
    role: 'dt', // Will be normalized to Dentist
    postcode: 'SW2 1AA', // Brixton
    salary: '£45–£55',
    days: 'Mon-Thu',
    added_at: daysAgo(20),
    experience: '12 years',
    notes: 'Implant specialist',
  },
  {
    id: 'CAN010',
    role: 'Dental Nurse',
    postcode: 'E1 6AA', // Shoreditch
    salary: '£16',
    days: 'Flexible',
    added_at: daysAgo(2),
    phone: '07700 900010',
    experience: '7 years',
    travel_flexibility: 'Up to 45 minutes',
  },
  {
    id: 'CAN011',
    role: 'rcp', // Will be normalized to Dental Receptionist
    postcode: 'N1 0AA', // Islington
    salary: '£13',
    days: 'Mon-Fri',
    added_at: daysAgo(12),
    experience: '2 years',
  },
  {
    id: 'CAN012',
    role: 'Dental Hygienist',
    postcode: 'NW1 0AA', // Camden
    salary: '£28–£32',
    days: 'Mon-Wed',
    added_at: daysAgo(8),
    experience: '5 years',
    notes: 'Private practice experience',
  },
];
