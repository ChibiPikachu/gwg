import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Handle POST: Create a brand-new submission (No ID in URL expected)
  if (req.method === 'POST') {
    try {
      const body = req.body;
      const userId = req.headers['x-user-id'] || req.headers['x-steam-id'];

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: Missing user ID header' });
      }

      const { data, error } = await supabase
        .from('submissions')
        .insert([
          {
            user_id: userId,
            game_id: body.gameId,
            game_name: body.gameTitle,
            game_image: body.gameImage,
            achievements_during: body.achievements,
            hours_during: body.hours,
            achievements_before: body.achievementsBefore,
            hours_before: body.hoursBefore,
            multiplier: body.multiplier,
            completion_status: body.completionStatus,
            beaten_previous: body.beatenPrevious,
            platform: body.platform,
            points: body.calculatedScore,
            notes: body.notes,
            steam_appid: body.steam_appid,
            status: 'pending'
          }
        ])
        .select();

      if (error) throw error;

      return res.status(201).json(data[0]);
    } catch (error: any) {
      console.error('Error creating submission:', error);
      return res.status(500).json({ error: error.message || 'Failed to create submission' });
    }
  }

  // 2. Handle GET: Fetch submissions
  if (req.method === 'GET') {
    try {
      const userId = req.headers['x-user-id'] || req.headers['x-steam-id'];
      
      let query = supabase.from('submissions').select('*').order('created_at', { ascending: false });
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return res.status(200).json(data);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to fetch submissions' });
    }
  }

  // 3. For PUT/DELETE requests hitting this route directly, check for an ID
  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}