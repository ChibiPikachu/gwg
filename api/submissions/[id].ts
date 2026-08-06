import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client using environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract the submission ID from the URL query parameters
  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Valid submission ID is required' });
  }

  // Handle PUT: Update an existing submission
  if (req.method === 'PUT') {
    try {
      const body = req.body;

      const { data, error } = await supabase
        .from('submissions')
        .update({
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
        })
        .eq('id', id)
        .select();

      if (error) throw error;

      return res.status(200).json(data[0]);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to update submission' });
    }
  }

  // Handle DELETE: Remove a submission by ID
  if (req.method === 'DELETE') {
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

  // Reject any other HTTP method
  return res.status(405).json({ error: 'Method not allowed' });
}