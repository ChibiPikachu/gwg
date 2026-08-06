import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract ID if provided in query or URL parameter
  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = rawId && rawId !== 'undefined' && rawId !== 'null' && rawId.trim() !== ''
    ? (!isNaN(Number(rawId)) ? Number(rawId) : rawId)
    : null;

  // 1. Handle POST: Create a brand-new submission
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const userId = req.headers['x-user-id'] || req.headers['x-steam-id'] || body.userId || body.user_id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: Missing user ID' });
      }

      const { data, error } = await supabase
        .from('submissions')
        .insert([
          {
            user_id: userId,
            game_id: body.gameId || body.game_id,
            game_name: body.gameTitle || body.game_name,
            game_image: body.gameImage || body.game_image,
            achievements_during: body.achievements || body.achievements_during,
            hours_during: body.hours || body.hours_during,
            achievements_before: body.achievementsBefore || body.achievements_before,
            hours_before: body.hoursBefore || body.hours_before,
            multiplier: body.multiplier,
            completion_status: body.completionStatus || body.completion_status,
            beaten_previous: body.beatenPrevious || body.beaten_previous,
            platform: body.platform,
            points: body.calculatedScore || body.points,
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

  // 2. Handle GET: Fetch single submission by ID or list submissions
  if (req.method === 'GET') {
    try {
      if (id !== null) {
        const { data, error } = await supabase
          .from('submissions')
          .select('*')
          .eq('id', id)
          .single();

        if (error || !data) {
          return res.status(404).json({ error: 'Submission not found' });
        }
        return res.status(200).json(data);
      }

      const userId = (req.query.userId || req.query.user_id || req.headers['x-user-id'] || req.headers['x-steam-id']) as string | undefined;

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

  // 3. Handle PUT: Update an existing submission by ID
  if (req.method === 'PUT') {
    if (id === null) {
      return res.status(400).json({ error: 'Valid submission ID is required for update' });
    }

    try {
      const body = req.body || {};

      const { data, error } = await supabase
        .from('submissions')
        .update({
          game_id: body.gameId || body.game_id,
          game_name: body.gameTitle || body.game_name,
          game_image: body.gameImage || body.game_image,
          achievements_during: body.achievements || body.achievements_during,
          hours_during: body.hours || body.hours_during,
          achievements_before: body.achievementsBefore || body.achievements_before,
          hours_before: body.hoursBefore || body.hours_before,
          multiplier: body.multiplier,
          completion_status: body.completionStatus || body.completion_status,
          beaten_previous: body.beatenPrevious || body.beaten_previous,
          platform: body.platform,
          points: body.calculatedScore || body.points,
          notes: body.notes,
          steam_appid: body.steam_appid,
        })
        .eq('id', id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Submission not found' });
      }

      return res.status(200).json(data[0]);
    } catch (error: any) {
      console.error('Supabase PUT Error:', error);
      return res.status(500).json({ error: error.message || 'Failed to update submission' });
    }
  }

  // 4. Handle DELETE: Delete submission by ID
  if (req.method === 'DELETE') {
    if (id === null) {
      return res.status(400).json({ error: 'Valid submission ID is required for deletion' });
    }

    try {
      const { error } = await supabase
        .from('submissions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({ success: true, message: 'Submission deleted' });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to delete submission' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
