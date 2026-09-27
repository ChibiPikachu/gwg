import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('Supabase URL or Anon Key is missing. Real-time database features will be disabled. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your settings.');
}

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
          return await fn();
        },
      }
    })
  : null as any;

export const isUuid = (val: string): boolean => {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
};

export const buildProfileOrFilter = (key: string): string => {
  if (!key) return 'steamid.eq.none';
  const cleanDiscordId = key.startsWith('discord_') ? key.replace('discord_', '') : key;
  const prefixedDiscordId = `discord_${cleanDiscordId}`;
  if (isUuid(key)) {
    return `id.eq.${key},steamid.eq.${key},discord_id.eq.${key},discord_id.eq.${cleanDiscordId}`;
  }
  return `steamid.eq.${key},steamid.eq.${prefixedDiscordId},discord_id.eq.${key},discord_id.eq.${cleanDiscordId}`;
};
