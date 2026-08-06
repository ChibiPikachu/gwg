import type { VercelRequest } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

export interface AuthUser {
  id: string;
  role: string;
  steamid?: string;
}

export async function getUserFromRequest(req: VercelRequest): Promise<AuthUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    // Query profile details for role validation
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, steamid')
      .eq('id', user.id)
      .single();

    return {
      id: user.id,
      role: profile?.role || 'user',
      steamid: profile?.steamid
    };
  } catch {
    return null;
  }
}

export async function requireAdmin(req: VercelRequest): Promise<AuthUser> {
  const user = await getUserFromRequest(req);
  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized: Admin rights required');
  }
  return user;
}