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

  const { name, eventId, event_id } = req.query;
  const targetEventIdParam = (eventId || event_id) as string | undefined;

  try {
    // 1. Fetch active event or specified event
    let targetEvent: any = null;
    if (targetEventIdParam && targetEventIdParam !== 'all') {
      const { data: ev } = await supabase.from('events').select('id, is_active').eq('id', targetEventIdParam).maybeSingle();
      targetEvent = ev;
    } else {
      const { data: activeEv } = await supabase.from('events').select('id, is_active').eq('is_active', true).maybeSingle();
      targetEvent = activeEv;
    }

    const { data: profiles, error: profileError } = await supabase.from('profiles').select('*');
    if (profileError) throw profileError;

    // Fetch user_event_teams for target event
    const uetMap = new Map<string, string>();
    if (targetEvent?.id) {
      const { data: uets } = await supabase
        .from('user_event_teams')
        .select('steamid, team')
        .eq('event_id', targetEvent.id);
      (uets || []).forEach((u: any) => {
        if (u.steamid && u.team && u.team !== 'none') {
          uetMap.set(String(u.steamid).trim(), u.team);
        }
      });
    }

    // Fetch submissions strictly for target event
    let subQuery = supabase
      .from('submissions')
      .select('user_id, points, calculated_score, status, event_id')
      .or('status.eq.verified,status.eq.approved');

    if (targetEvent?.id) {
      subQuery = subQuery.eq('event_id', targetEvent.id);
    }

    const { data: submissions } = await subQuery;

    const memberPoints: Record<string, number> = {};
    (submissions || []).forEach((sub: any) => {
      const id = String(sub.user_id || '').trim();
      const cleanId = id.startsWith('discord_') ? id.replace('discord_', '') : id;
      const pts = Number(sub.points !== undefined && sub.points !== null ? sub.points : sub.calculated_score) || 0;
      if (id) {
        memberPoints[id] = (memberPoints[id] || 0) + pts;
        memberPoints[cleanId] = (memberPoints[cleanId] || 0) + pts;
      }
    });

    const isCurrentActive = Boolean(targetEvent?.is_active);

    const membersWithScores = (profiles || [])
      .map(p => {
        const primaryId = p.steamid || p.discord_id || p.id;
        const candidateKeys = [p.steamid, p.discord_id, p.discord_id ? `discord_${p.discord_id}` : null, p.id].filter(Boolean) as string[];
        let userTeam = 'none';
        for (const k of candidateKeys) {
          if (uetMap.get(k)) {
            userTeam = uetMap.get(k)!;
            break;
          }
        }
        if (userTeam === 'none' && isCurrentActive && p.team && p.team !== 'none') {
          userTeam = p.team;
        }

        let userPts = 0;
        for (const k of candidateKeys) {
          if (memberPoints[k]) userPts = Math.max(userPts, memberPoints[k]);
        }

        return {
          ...p,
          team: userTeam,
          points: userPts
        };
      })
      .filter(p => {
        if (!name || typeof name !== 'string' || name === 'all') return true;
        return p.team === name;
      });

    return res.status(200).json(membersWithScores);
  } catch (err: any) {
    console.error('Error fetching team data:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}