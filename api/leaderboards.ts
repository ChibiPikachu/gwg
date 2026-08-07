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

  const id = (req.query.id || req.query.eventId) as string | undefined;

  try {
    let event: any = null;
    let eventId: string | undefined = id;

    if (id) {
      // Fetch specific event details
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();

      if (eventError || !eventData) {
        return res.status(404).json({ error: 'Event not found' });
      }
      event = eventData;
    } else {
      // Get current active event
      const { data: activeEvent } = await supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      event = activeEvent || null;
      eventId = activeEvent?.id;
    }

    // Fetch submissions for event
    let subQuery = supabase.from('submissions').select('*').or('status.eq.verified,status.eq.approved');
    if (eventId) {
      subQuery = subQuery.eq('event_id', eventId);
    }
    const { data: submissions, error: subError } = await subQuery;
    if (subError) throw subError;

    // Fetch team adjustments
    let adjQuery = supabase.from('team_adjustments').select('*');
    if (eventId) {
      adjQuery = adjQuery.eq('event_id', eventId);
    }
    const { data: adjustments } = await adjQuery;

    // Fetch profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('steamid, steam_name, steam_avatar, discord_name, discord_avatar, active_avatar, team, status, role');

    const profileMap = new Map((profiles || []).map(p => [p.steamid, p]));

    // Aggregate user scores
    const userScores: Record<string, number> = {};
    (submissions || []).forEach((sub: any) => {
      const steamId = sub.steamid || sub.user_id;
      if (steamId) {
        userScores[steamId] = (userScores[steamId] || 0) + (Number(sub.calculated_score || sub.score || sub.points) || 0);
      }
    });

    const topUsers = Object.entries(userScores)
      .map(([steamid, points]) => {
        const prof: any = profileMap.get(steamid) || {};
        return {
          steamid,
          steam_name: prof.steam_name || 'Unknown User',
          steam_avatar: (prof.active_avatar === 'discord' && prof.discord_avatar) ? prof.discord_avatar : (prof.steam_avatar || ''),
          discord_name: prof.discord_name || null,
          team: prof.team || 'none',
          status: prof.status || '',
          role: prof.role || 'user',
          points
        };
      })
      .sort((a, b) => b.points - a.points)
      .map((u, idx) => ({ ...u, rank: idx + 1 }));

    // Aggregate team totals
    const teamTotals: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0 };
    const teamMembersCount: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0 };

    topUsers.forEach(u => {
      if (u.team && teamTotals[u.team] !== undefined) {
        teamTotals[u.team] += u.points;
        teamMembersCount[u.team] += 1;
      }
    });

    (adjustments || []).forEach((adj: any) => {
      if (adj.user_id && adj.user_id.startsWith('team_pts_')) {
        const teamName = adj.user_id.replace('team_pts_', '');
        if (teamTotals[teamName] !== undefined) {
          teamTotals[teamName] += Number(adj.points || 0);
        }
      }
    });

    const standings = Object.keys(teamTotals)
      .map(team => ({
        team,
        points: teamTotals[team],
        members: teamMembersCount[team]
      }))
      .sort((a, b) => b.points - a.points)
      .map((s, idx) => ({ ...s, rank: idx + 1 }));

    return res.status(200).json({
      event,
      totalParticipants: topUsers.length,
      standings,
      topUsers,
      adjustments: adjustments || []
    });
  } catch (err: any) {
    console.error('Error fetching leaderboard:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
