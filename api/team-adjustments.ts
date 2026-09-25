import type { Request as VercelRequest, Response as VercelResponse } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

function isUuid(val: string): boolean {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

function buildProfileOrFilter(key: string): string {
  if (!key) return 'steamid.eq.none';
  const cleanDiscordId = key.startsWith('discord_') ? key.replace('discord_', '') : key;
  const prefixedDiscordId = `discord_${cleanDiscordId}`;
  if (isUuid(key)) {
    return `id.eq.${key},steamid.eq.${key},discord_id.eq.${key},discord_id.eq.${cleanDiscordId}`;
  }
  return `steamid.eq.${key},steamid.eq.${prefixedDiscordId},discord_id.eq.${key},discord_id.eq.${cleanDiscordId}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    const { team, points, reason, notes, userIds, userId, adjustmentType, adminName, adminId, event_id, eventId } = req.body || {};
    const numPoints = Number(points) || 0;
    const targetTeam = team || 'mixed';
    const targetUserIds = Array.isArray(userIds) ? userIds : (userId ? [userId] : []);
    const activeEventId = eventId || event_id || null;

    try {
      if (targetUserIds.length > 0) {
        const adjustmentsArray = targetUserIds.map((uid: string) => ({
          user_id: uid,
          game_name: adjustmentType === 'bingo' ? 'Bingo Points' : 'Screenshot Points',
          calculated_score: numPoints,
          platform: adjustmentType === 'bingo' ? 'Bingo Points' : 'Screenshot Points',
          points: numPoints,
          notes: notes || reason || 'Admin Adjustment',
          status: 'verified',
          verifier_id: adminId || 'admin',
          event_id: activeEventId,
          created_at: new Date().toISOString()
        }));

        const { data, error } = await supabase.from('submissions').insert(adjustmentsArray).select();
        if (error) throw error;

        for (const uid of targetUserIds) {
          try {
            const { data: userSubs } = await supabase
              .from('submissions')
              .select('points, calculated_score, game_name')
              .or(`user_id.eq.${uid},user_id.eq.discord_${uid}`)
              .eq('status', 'verified');

            let newTotal = 0;
            for (const s of (userSubs || [])) {
              if (s.game_name === 'Event Update') continue;
              const pts = Number(s.points !== undefined && s.points !== null ? s.points : s.calculated_score) || 0;
              newTotal += Math.round(pts);
            }

            await supabase
              .from('profiles')
              .update({ points: newTotal })
              .or(buildProfileOrFilter(uid));
          } catch (syncErr) {
            console.warn('Sync profiles points failed:', syncErr);
          }
        }
        return res.status(200).json(data);
      } else {
        const { data, error } = await supabase.from('submissions').insert([{
          user_id: `team_pts_${targetTeam}`,
          game_name: `Team ${targetTeam.toUpperCase()} Adjustment`,
          calculated_score: numPoints,
          platform: 'Team Adjustment',
          points: numPoints,
          notes: notes || reason || 'Admin Adjustment',
          status: 'verified',
          verifier_id: adminId || 'admin',
          event_id: activeEventId,
          created_at: new Date().toISOString()
        }]).select();

        if (error) throw error;
        return res.status(200).json(data);
      }
    } catch (err: any) {
      console.error('Error creating team adjustment:', err);
      return res.status(500).json({ error: err.message || 'Failed to create team adjustment' });
    }
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'POST']);
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
      .or('user_id.ilike.team_pts_%,game_name.eq.Screenshot Points,game_name.eq.Bingo Points,game_name.eq.Team Award,game_name.ilike.Screenshot Contest%,game_name.ilike.Bingo Contest%,platform.eq.Screenshot Points,platform.eq.Bingo Points,platform.eq.Screenshot Event,platform.eq.Bingo Event,platform.eq.System')
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