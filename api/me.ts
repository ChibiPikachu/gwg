import type { Request, Response } from 'express';
import { createClient } from "@supabase/supabase-js";

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

export default async function handler(req: Request, res: Response) {
  try {
    const rawId = (req.query.steam_id || req.query.steamId || req.query.userId || req.query.user_id || req.headers['x-user-id'] || req.headers['x-steam-id']) as string | undefined;

    if (!rawId) {
      return res.status(200).json(null);
    }

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
    );

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .or(buildProfileOrFilter(String(rawId).trim()))
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!profile) {
      return res.status(200).json(null);
    }

    // Candidate IDs
    const candidateKeys = Array.from(new Set([
      String(rawId).trim(),
      profile.steamid ? String(profile.steamid) : null,
      profile.discord_id ? String(profile.discord_id) : null,
      profile.discord_id ? `discord_${profile.discord_id}` : null,
      profile.id ? String(profile.id) : null
    ].filter(Boolean))) as string[];

    // 1. Fetch active event
    const { data: activeEvent } = await supabase
      .from('events')
      .select('id, title, is_active, start_date, end_date, description')
      .eq('is_active', true)
      .maybeSingle();

    // 2. Fetch all user event teams for history
    const { data: userEventTeams } = await supabase
      .from('user_event_teams')
      .select('event_id, team')
      .in('steamid', candidateKeys);

    const eventTeams: Record<string, string> = {};
    (userEventTeams || []).forEach((uet: any) => {
      if (uet.event_id && uet.team && uet.team !== 'none') {
        eventTeams[uet.event_id] = uet.team;
      }
    });

    let activeTeam = 'none';
    let activePoints = 0;
    let isSubmissionOpen = false;

    if (activeEvent) {
      const now = Date.now();
      const endTime = activeEvent.end_date ? new Date(activeEvent.end_date).getTime() : 0;
      const isCountdownEnded = endTime > 0 && now >= endTime;
      const isLockedByDesc = activeEvent.description && (
        activeEvent.description.includes('<!--STATUS:SUBMISSIONS_CLOSED-->') ||
        activeEvent.description.includes('<!--STATUS:COMPLETED-->') ||
        activeEvent.description.includes('<!--SUBMISSIONS:CLOSED-->')
      );
      isSubmissionOpen = !isCountdownEnded && !isLockedByDesc;

      // Active event team
      if (eventTeams[activeEvent.id]) {
        activeTeam = eventTeams[activeEvent.id];
      } else if (profile.team && profile.team !== 'none') {
        activeTeam = profile.team;
      }

      // Compute active event points strictly from verified submissions + adjustments for activeEvent.id
      const orFilter = candidateKeys.map(k => `user_id.eq.${k}`).join(',');
      const { data: eventSubs } = await supabase
        .from('submissions')
        .select('points, calculated_score, status, event_id')
        .or(orFilter)
        .eq('event_id', activeEvent.id)
        .or('status.eq.verified,status.eq.approved');

      (eventSubs || []).forEach((s: any) => {
        const pts = Number(s.points !== undefined && s.points !== null ? s.points : s.calculated_score) || 0;
        activePoints += pts;
      });

      const { data: eventAdjs } = await supabase
        .from('team_adjustments')
        .select('points, event_id')
        .or(orFilter)
        .eq('event_id', activeEvent.id);

      (eventAdjs || []).forEach((a: any) => {
        activePoints += Math.round(Number(a.points) || 0);
      });
    }

    return res.status(200).json({
      ...profile,
      team: activeTeam,
      points: activePoints,
      eventTeams,
      activeEventId: activeEvent?.id || null,
      isSubmissionOpen
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}