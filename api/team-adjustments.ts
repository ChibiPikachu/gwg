import type { Request as VercelRequest, Response as VercelResponse } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { data: teamAdj } = await supabase
      .from('team_adjustments')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: subData } = await supabase
      .from('submissions')
      .select('*')
      .or('user_id.ilike.team_pts_%,game_name.ilike.%Bingo%,game_name.ilike.%Screenshot%,game_name.ilike.%Award%,platform.ilike.%Bingo%,platform.ilike.%Screenshot%')
      .order('created_at', { ascending: false });

    const combined = [...(Array.isArray(subData) ? subData : []), ...(Array.isArray(teamAdj) ? teamAdj : [])];
    const map = new Map();
    for (const item of combined) {
      if (item && item.id && !map.has(String(item.id))) {
        map.set(String(item.id), item);
      }
    }

    return res.status(200).json(Array.from(map.values()));
  } catch (err: any) {
    console.error('Error fetching team adjustments:', err);
    return res.status(200).json([]);
  }
}