import type { IncomingMessage, ServerResponse } from 'http';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

export default async function handler(req: IncomingMessage & { query?: Record<string, string | string[]> }, res: ServerResponse) {
  const response = res as any;

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return response.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const name = req.query?.name;

  try {
    let query = supabase.from('profiles').select('*');
    if (name && typeof name === 'string') {
      query = query.eq('team', name);
    }

    const { data: profiles, error: profileError } = await query;
    if (profileError) throw profileError;

    const { data: submissions } = await supabase.from('submissions').select('*').eq('status', 'approved');

    const memberPoints: Record<string, number> = {};
    (submissions || []).forEach((sub: any) => {
      const id = sub.steamid || sub.user_id;
      if (id) {
        memberPoints[id] = (memberPoints[id] || 0) + (Number(sub.calculated_score || sub.score || sub.points) || 0);
      }
    });

    const membersWithScores = (profiles || []).map(p => ({
      ...p,
      points: memberPoints[p.steamid] || 0
    }));

    return response.status(200).json(membersWithScores);
  } catch (err: any) {
    console.error('Error fetching team data:', err);
    return response.status(500).json({ error: err.message || 'Internal server error' });
  }
}