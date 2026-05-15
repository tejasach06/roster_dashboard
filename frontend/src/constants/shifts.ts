export const SHIFT_CODES = {
  MS: { label: 'Morning Shift',   short: 'MS', time: '7:30 AM – 4:30 PM',  color: 'bg-amber-100 text-amber-800 border-amber-200',   cellBg: 'bg-amber-100 text-amber-800',   bar: 'bg-amber-400' },
  GS: { label: 'General Shift',   short: 'GS', time: '9:15 AM – 6:15 PM',  color: 'bg-sky-100 text-sky-800 border-sky-200',         cellBg: 'bg-sky-100 text-sky-800',       bar: 'bg-sky-400' },
  AS: { label: 'Afternoon Shift', short: 'AS', time: '1:30 PM – 10:30 PM', color: 'bg-orange-100 text-orange-800 border-orange-200', cellBg: 'bg-orange-100 text-orange-800', bar: 'bg-orange-400' },
  NS: { label: 'Night Shift',     short: 'NS', time: '10:30 PM – 7:30 AM', color: 'bg-violet-100 text-violet-800 border-violet-200', cellBg: 'bg-violet-100 text-violet-800', bar: 'bg-violet-400' },
  WO: { label: 'Week Off',        short: 'WO', time: '',                    color: 'bg-gray-100 text-gray-500 border-gray-200',       cellBg: 'bg-gray-100 text-gray-500',     bar: 'bg-gray-300' },
  EL: { label: 'Earned Leave',    short: 'EL', time: '',                    color: 'bg-yellow-100 text-yellow-700 border-yellow-200', cellBg: 'bg-yellow-100 text-yellow-700', bar: 'bg-yellow-300' },
} as const;

export type ShiftCode = keyof typeof SHIFT_CODES;
export const SHIFT_CODE_KEYS = Object.keys(SHIFT_CODES) as ShiftCode[];
