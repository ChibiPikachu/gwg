import type { VercelRequest, VercelResponse } from '@vercel/node';
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
    const { data, error } = await supabase
      .from('team_adjustments')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      return res.status(200).json(data);
    }

    // Fallback: Query submissions table for team adjustments
    const { data: subData } = await supabase
      .from('submissions')
      .select('*')
      .or('user_id.ilike.team_pts_%,game_name.ilike.%Points%,platform.ilike.%Adjustment%')
      .order('created_at', { ascending: false });

    return res.status(200).json(subData || []);
  } catch (err: any) {
    console.error('Error fetching team adjustments:', err);
    return res.status(200).json([]);
  }
}