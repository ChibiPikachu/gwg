import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const parseEventNumber = (evt: any, fallbackIdx?: number): number => {
  if (!evt) return fallbackIdx !== undefined ? fallbackIdx + 1 : 1;
  if (evt.event_number !== undefined && evt.event_number !== null && !isNaN(Number(evt.event_number))) {
    return Number(evt.event_number);
  }
  if (evt.number !== undefined && evt.number !== null && !isNaN(Number(evt.number))) {
    return Number(evt.number);
  }
  const match = String(evt.title || evt.name || evt.description || '').match(/#\s*(\d+)/i) || 
                String(evt.title || evt.name || evt.description || '').match(/event\s*(\d+)/i);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return fallbackIdx !== undefined ? fallbackIdx + 1 : 1;
};
