import type { Request as VercelRequest, Response as VercelResponse } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { title, description, startDate, start_date, endDate, end_date, isActive, is_active, hideScores, hide_scores, winnerTeam, winner_team } = req.body || {};
      const finalStart = startDate || start_date || new Date().toISOString();
      const finalEnd = endDate || end_date || new Date().toISOString();
      const finalActive = isActive !== undefined ? isActive : (is_active !== undefined ? is_active : true);
      const finalHide = hideScores !== undefined ? hideScores : (hide_scores !== undefined ? hide_scores : false);
      const finalWinner = winnerTeam || winner_team || null;

      const { data, error } = await supabase
        .from('events')
        .insert([{
          title: title || 'New Event',
          description: description || '',
          start_date: finalStart,
          end_date: finalEnd,
          is_active: Boolean(finalActive),
          hide_scores: Boolean(finalHide),
          winner_team: finalWinner === 'auto' ? null : finalWinner
        }])
        .select()
        .single();

      if (error) throw error;

      if (finalActive && data?.id) {
        await supabase.from('events').update({ is_active: false }).neq('id', data.id);
      }

      return res.status(200).json(data);
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const rawId = req.query.id || req.body?.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id) {
        return res.status(400).json({ error: 'Missing event ID' });
      }

      const { title, description, startDate, start_date, endDate, end_date, isActive, is_active, hideScores, hide_scores, winnerTeam, winner_team } = req.body || {};
      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (startDate || start_date) updateData.start_date = startDate || start_date;
      if (endDate || end_date) updateData.end_date = endDate || end_date;
      if (isActive !== undefined || is_active !== undefined) updateData.is_active = Boolean(isActive !== undefined ? isActive : is_active);
      if (hideScores !== undefined || hide_scores !== undefined) updateData.hide_scores = Boolean(hideScores !== undefined ? hideScores : hide_scores);
      if (winnerTeam !== undefined || winner_team !== undefined) {
        const w = winnerTeam !== undefined ? winnerTeam : winner_team;
        updateData.winner_team = (w === 'auto' || !w) ? null : w;
      }

      const { data, error } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (updateData.is_active && id) {
        await supabase.from('events').update({ is_active: false }).neq('id', id);
      }

      return res.status(200).json(data || { success: true });
    }

    if (req.method === 'DELETE') {
      const rawId = req.query.id || req.body?.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id) return res.status(400).json({ error: 'Missing event ID' });

      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to process event request' });
  }
}