import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';
import { Strategy as DiscordStrategy } from 'passport-discord';
import path from 'path';
import { fileURLToPath } from 'url';

import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let supabaseClient: any = null;

async function forceRecalculateEventWinner(supabase: any, eventId: string) {
  try {
    const { data: event } = await supabase
      .from('events')
      .select('id, is_active, description')
      .eq('id', eventId)
      .maybeSingle();

    if (!event) return;

    // Fetch verified submissions for this event or null event_id
    const { data: verifiedSubs } = await supabase
      .from('submissions')
      .select('user_id, points, calculated_score')
      .or(`event_id.eq.${eventId},event_id.is.null`)
      .eq('status', 'verified');

    const { data: uets } = await supabase
      .from('user_event_teams')
      .select('steamid, team')
      .eq('event_id', eventId);

    const uetMap = new Map<string, string>();
    (uets || []).forEach((u: any) => uetMap.set(u.steamid, u.team));

    const { data: profiles } = await supabase
      .from('profiles')
      .select('steamid, team');
    const profMap = new Map<string, string>();
    (profiles || []).forEach((p: any) => profMap.set(p.steamid, p.team));

    const teamPoints: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0 };
    (verifiedSubs || []).forEach((sub: any) => {
      if (sub.user_id === 'system_notification') return;
      let team: string | null = null;
      if (sub.user_id?.startsWith('team_pts_')) {
        team = sub.user_id.substring('team_pts_'.length);
      } else {
        team = uetMap.get(sub.user_id) || profMap.get(sub.user_id) || null;
      }
      const pts = Number(sub.points !== undefined && sub.points !== null ? sub.points : sub.calculated_score) || 0;
      if (team && teamPoints[team] !== undefined) {
        teamPoints[team] += pts;
      }
    });

    let maxPts = -1;
    let bestTeam: string | null = null;
    for (const t in teamPoints) {
      if (teamPoints[t] > maxPts && teamPoints[t] > 0) {
        maxPts = teamPoints[t];
        bestTeam = t;
      }
    }

    if (bestTeam) {
      const updatedDesc = event.description
        ? (event.description.includes('<!--WINNER:')
            ? event.description.replace(/<!--WINNER:.*?-->/, `<!--WINNER:${bestTeam}-->`)
            : `${event.description}\n<!--WINNER:${bestTeam}-->`)
        : `<!--WINNER:${bestTeam}-->`;

      await supabase
        .from('events')
        .update({ winner_team: bestTeam, description: updatedDesc })
        .eq('id', eventId);
      console.log(`[Backfill] Updated winner for event ${eventId} to ${bestTeam}`);
    }
  } catch (err) {
    console.error('[RecalculateWinner] Error:', err);
  }
}

async function backfillSubmissionEventIds(supabase: any) {
  if (!supabase) return;
  try {
    console.log('[Backfill] Checking if submissions need event_id backfilling...');
    const { data: events, error: eventsErr } = await supabase
      .from('events')
      .select('id, start_date, end_date, is_active')
      .order('start_date', { ascending: true });

    if (eventsErr || !events || events.length === 0) {
      console.log('[Backfill] No events found.');
      return;
    }

    const activeEvent = events.find((e: any) => e.is_active) || events[events.length - 1];

    const { data: nullSubs, error: subsErr } = await supabase
      .from('submissions')
      .select('id, created_at, user_id')
      .is('event_id', null);

    if (subsErr) {
      console.error('[Backfill] Error querying null event_id submissions:', subsErr);
      return;
    }

    if (nullSubs && nullSubs.length > 0) {
      console.log(`[Backfill] Found ${nullSubs.length} submissions with null event_id. Backfilling...`);
      for (const sub of nullSubs) {
        if (sub.user_id === 'system_notification') continue;
        let matchedEventId = activeEvent ? activeEvent.id : events[0].id;

        if (sub.created_at && events.length > 1) {
          const subDate = new Date(sub.created_at).getTime();
          for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            const start = new Date(ev.start_date).getTime();
            const end = ev.end_date ? new Date(ev.end_date).getTime() : Date.now();
            if (subDate >= start && subDate <= end) {
              matchedEventId = ev.id;
              break;
            }
          }
        }

        await supabase
          .from('submissions')
          .update({ event_id: matchedEventId })
          .eq('id', sub.id);
      }
      console.log('[Backfill] Successfully backfilled submission event_ids.');
    } else {
      console.log('[Backfill] All submissions already have an event_id.');
    }

    // Force recalculate event winners for all events to ensure screenshot/bingo points update winner_team
    for (const ev of events) {
      await forceRecalculateEventWinner(supabase, ev.id);
    }
  } catch (err) {
    console.error('[Backfill] Error in backfillSubmissionEventIds:', err);
  }
}

async function backfillEventTeams(supabase: any) {
  if (!supabase) return;
  try {
    console.log('[Backfill] Checking if user_event_teams needs backfilling...');

    // First do a quick check query to see if the table exists
    const { error: tableCheckErr } = await supabase
      .from('user_event_teams')
      .select('steamid, event_id')
      .limit(1);

    if (tableCheckErr) {
      if (String(tableCheckErr.message || '').includes('does not exist') || tableCheckErr.code === '42P01') {
        console.warn('⚠️ [Backfill Warning] Table "user_event_teams" does not exist in Supabase yet. Please execute the SQL creation script in your Supabase SQL Editor.');
        return;
      }
      console.error('[Backfill] Error during table presence check:', tableCheckErr);
      return;
    }

    // Fetch existing records from user_event_teams so we NEVER overwrite existing admin choices
    const { data: existingUets } = await supabase
      .from('user_event_teams')
      .select('steamid, event_id');

    const existingUetSet = new Set<string>();
    (existingUets || []).forEach((u: any) => {
      if (u.steamid && u.event_id) {
        existingUetSet.add(`${u.steamid}_${u.event_id}`);
      }
    });

    // 1. Fetch all submissions to map user_id -> event_id
    const { data: subs, error: subsError } = await supabase
      .from('submissions')
      .select('user_id, event_id');
      
    if (subsError) {
      console.error('[Backfill] Error fetching submissions:', subsError);
      return;
    }
    
    // 2. Fetch all profiles to get their current team as the initial default for missing entries
    const { data: profiles, error: profsError } = await supabase
      .from('profiles')
      .select('steamid, team');
      
    if (profsError) {
      console.error('[Backfill] Error fetching profiles:', profsError);
      return;
    }
    
    const profileTeamMap = new Map<string, string>();
    (profiles || []).forEach((p: any) => {
      if (p.steamid && p.team) {
        profileTeamMap.set(p.steamid, p.team);
      }
    });

    // 3. For each unique combination of user_id and event_id in submissions, ONLY insert if missing
    const uniqueUserEvents = new Set<string>();
    const toInsert: any[] = [];
    
    (subs || []).forEach((sub: any) => {
      if (!sub.user_id || !sub.event_id) return;
      if (sub.user_id.startsWith('team_pts_') || sub.user_id === 'system_notification') return;
      
      const key = `${sub.user_id}_${sub.event_id}`;
      // CRITICAL: NEVER overwrite existing user_event_teams set by admins
      if (!existingUetSet.has(key) && !uniqueUserEvents.has(key)) {
        uniqueUserEvents.add(key);
        const currentTeam = profileTeamMap.get(sub.user_id);
        if (currentTeam) {
          toInsert.push({
            steamid: sub.user_id,
            event_id: sub.event_id,
            team: currentTeam
          });
        }
      }
    });
    
    // 4. Also map current profiles to the active event if they don't have records yet
    const { data: activeEvent } = await supabase
      .from('events')
      .select('id')
      .eq('is_active', true)
      .maybeSingle();
      
    if (activeEvent) {
      (profiles || []).forEach((p: any) => {
        if (!p.steamid || !p.team) return;
        const key = `${p.steamid}_${activeEvent.id}`;
        if (!existingUetSet.has(key) && !uniqueUserEvents.has(key)) {
          uniqueUserEvents.add(key);
          toInsert.push({
            steamid: p.steamid,
            event_id: activeEvent.id,
            team: p.team
          });
        }
      });
    }

    if (toInsert.length > 0) {
      console.log(`[Backfill] Preparing to insert ${toInsert.length} missing user event-team relations...`);
      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const { error: upsertErr } = await supabase
          .from('user_event_teams')
          .upsert(chunk, { onConflict: 'steamid,event_id' });
          
        if (upsertErr) {
          console.error('[Backfill] Batch insert error:', upsertErr);
        }
      }
      console.log('[Backfill] Completed successfully.');
    } else {
      console.log('[Backfill] All user event teams up to date.');
    }
  } catch (err) {
    console.error('[Backfill] Unexpected error running backfill:', err);
  }
}

async function snapshotEventTeams(supabase: any, eventId: string) {
  if (!supabase || !eventId) return;
  try {
    const { data: profiles } = await supabase.from('profiles').select('steamid, team');
    if (!profiles || profiles.length === 0) return;

    const { data: existingUets } = await supabase
      .from('user_event_teams')
      .select('steamid, team')
      .eq('event_id', eventId);

    const existingMap = new Map<string, string>();
    (existingUets || []).forEach((u: any) => {
      if (u.steamid) existingMap.set(u.steamid, u.team);
    });

    const rowsToUpsert: any[] = [];
    profiles.forEach((p: any) => {
      if (!p.steamid) return;
      const teamToSave = existingMap.get(p.steamid) || (p.team && p.team !== 'none' ? p.team : null);
      if (teamToSave && teamToSave !== 'none') {
        rowsToUpsert.push({
          steamid: String(p.steamid),
          event_id: String(eventId),
          team: teamToSave
        });
      }
    });

    if (rowsToUpsert.length > 0) {
      const { error } = await supabase
        .from('user_event_teams')
        .upsert(rowsToUpsert, { onConflict: 'steamid,event_id' });
      if (error) {
        console.warn(`[SnapshotEventTeams] Error saving event teams for ${eventId}:`, error.message);
      } else {
        console.log(`[SnapshotEventTeams] Successfully snapshotted ${rowsToUpsert.length} user event teams for event ${eventId}`);
      }
    }
  } catch (err) {
    console.error(`[SnapshotEventTeams] Exception for event ${eventId}:`, err);
  }
}

function getSupabase() {
  if (!supabaseClient) {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    
    if (!url || !key) {
      console.warn('Supabase credentials missing. Session persistence and profile sync will fail.');
      return null;
    }
    
    console.log('Initializing Supabase client with URL:', url.substring(0, 10) + '...');
    supabaseClient = createClient(url, key);

    // Run backfill asynchronously
    setTimeout(() => {
      backfillSubmissionEventIds(supabaseClient)
        .then(() => backfillEventTeams(supabaseClient))
        .catch(err => {
          console.error('[Backfill] Failed:', err);
        });
    }, 1000);
  }
  return supabaseClient;
}

import util from 'util';
import { execFile } from 'child_process';
const execFilePromise = util.promisify(execFile);

interface SubmissionNotesMeta {
  hasNoAchievements: boolean;
  level?: number;
  userNotes: string;
  adminName?: string;
  adminId?: string;
}

function parseNotesMeta(notes: string): SubmissionNotesMeta {
  if (notes && notes.startsWith('__META_START__')) {
    const endIdx = notes.indexOf('__META_END__');
    if (endIdx !== -1) {
      try {
        const jsonStr = notes.slice('__META_START__'.length, endIdx);
        const meta = JSON.parse(jsonStr);
        const userNotes = notes.slice(endIdx + '__META_END__'.length);
        return {
          hasNoAchievements: !!meta.hasNoAchievements,
          level: meta.level,
          userNotes,
          adminName: meta.adminName,
          adminId: meta.adminId
        };
      } catch (e) {
        // Fallback
      }
    }
  }
  return {
    hasNoAchievements: false,
    level: undefined,
    userNotes: notes || ''
  };
}

function serializeNotesMeta(
  hasNoAchievements: boolean, 
  level: number | undefined, 
  userNotes: string,
  adminName?: string,
  adminId?: string
): string {
  if (hasNoAchievements || adminName || adminId || level !== undefined) {
    return `__META_START__${JSON.stringify({ hasNoAchievements, level, adminName, adminId })}__META_END__${userNotes}`;
  }
  return userNotes;
}

function calculateNonAchievementPoints(level: number, hoursPlayed: number, hltbMain: number, hltbExtras: number, completionStatus: string): number {
  let basePoints = 20;
  if (hoursPlayed >= 50) {
    basePoints = 200;
  } else if (hoursPlayed >= 25) {
    basePoints = 100;
  } else if (hoursPlayed >= 15) {
    basePoints = 75;
  } else if (hoursPlayed >= 8) {
    basePoints = 40;
  } else {
    basePoints = 20;
  }

  if (level === 0) {
    return Math.round(basePoints * 0.1);
  } else if (level === 1) {
    return Math.round(basePoints * 0.4);
  } else { // Level 2
    const bonus = completionStatus === 'completed' ? 20 : 0;
    return basePoints + bonus;
  }
}

// Helper for Steam API calls with database caching
async function fetchSteamOwnedGames(steamId: string, supabase: any) {
  if (!supabase) return null;
  
  // 1. Check database cache first
  const cacheMinutes = 60; // Cache for 1 hour
  const { data: profile } = await supabase
    .from('profiles')
    .select('owned_games, steam_updated_at')
    .eq('steamid', steamId)
    .single();

  if (profile?.owned_games && profile?.steam_updated_at) {
    const updatedAt = new Date(profile.steam_updated_at).getTime();
    if (Date.now() - updatedAt < cacheMinutes * 60 * 1000) {
      console.log(`[Steam Cache] Using DB cache for ${steamId}`);
      return profile.owned_games;
    }
  }

  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) return profile?.owned_games || null;
  
  try {
    console.log(`[Steam API] Fetching owned games for ${steamId}`);
    const response = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json&include_appinfo=1&include_played_free_games=1`);
    const data: any = await response.json();
    const games = data.response?.games || [];
    
    // Update database cache
    if (games.length > 0) {
      await supabase.from('profiles').update({
        owned_games: games,
        steam_updated_at: new Date().toISOString()
      }).eq('steamid', steamId);
    }
    
    return games;
  } catch (err) {
    console.error('Steam Owned Games Fetch Failed:', err);
    return profile?.owned_games || null;
  }
}

async function fetchSteamAchievementCountForUser(steamId: string, appId: number | string) {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) return 0;
  
  try {
    console.log(`[Steam API] Fetching user achievements for App ID ${appId} and user ${steamId}`);
    const response = await fetch(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appId}&key=${apiKey}&steamid=${steamId}`);
    const data: any = await response.json();
    
    if (data.playerstats?.success) {
      const achievements = data.playerstats.achievements || [];
      return achievements.filter((a: any) => a.achieved === 1).length;
    }
    return 0;
  } catch (err) {
    console.error(`Failed to fetch user achievements for App ID ${appId}:`, err);
    return 0;
  }
}

async function fetchSteamAchievementCount(appId: number | string) {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) return 0;
  
  try {
    console.log(`[Steam API] Fetching achievements for App ID ${appId}`);
    const response = await fetch(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appId}`);
    const data: any = await response.json();
    const achievements = data.game?.availableGameStats?.achievements || [];
    return achievements.length;
  } catch (err) {
    console.error(`Failed to fetch achievements for App ID ${appId}:`, err);
    return 0;
  }
}

const getAndSyncGameData = async (supabase: any, title: string, gameId: string, image: string, steamAppId?: number | string) => {
    // 1. Check if game already exists in our 'games' table
    const { data: existingGame } = await supabase
      .from('games')
      .select('*')
      .eq('id', String(gameId))
      .maybeSingle();

    // If game exists and has HLTB data (> 0) and total achievements (if steam), return existing ID
    if (existingGame && (existingGame.hltb_main > 0 || existingGame.hltb_main === -1)) {
        // If we have a steam app id now but didn't have total achievements before, we should update
        if (steamAppId && !existingGame.total_achievements) {
          // Continue to update
        } else {
          return existingGame.id;
        }
    }

    // 2. Fetch HLTB data (if game is new OR has 0 hours/null in DB)
    let hltb: any = null;
    try {
      console.log(`[Sync] Fetching HLTB for: ${title}`);
      hltb = await getHLTBData(title);
    } catch (e) {
      console.warn('HLTB fetch failed during sync:', e);
    }

    // 2.5 Fetch Total Achievements if Steam
    let totalAchievements = existingGame?.total_achievements || 0;
    if (steamAppId) {
      const steamTotal = await fetchSteamAchievementCount(steamAppId);
      if (steamTotal > 0) totalAchievements = steamTotal;
    }

    // 3. Upsert into the 'games' table
    const gameData: any = {
      id: String(gameId),
      title: title,
      image_url: image,
      hltb_main: hltb?.notFound ? -1 : (hltb?.hltb_main || existingGame?.hltb_main || 0),
      hltb_extras: hltb?.hltb_extras || existingGame?.hltb_extras || 0,
      hltb_completionist: hltb?.hltb_completionist || existingGame?.hltb_completionist || 0,
      total_achievements: totalAchievements,
      updated_at: new Date().toISOString()
    };

    if (steamAppId) {
      gameData.steam_appid = parseInt(String(steamAppId));
    }

    const { error: upsertError } = await supabase
      .from('games')
      .upsert(gameData, { onConflict: 'id' });

    if (upsertError) {
      console.error('Failed to sync game record:', upsertError);
    }

    return gameId;
};

import { getHLTBData } from './hltb.js';

const hltbCache = new Map<string, any>();

async function createServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.set('trust proxy', 1);
  app.use(express.json());
  
  const isCloud = process.env.NODE_ENV === 'production' || 
                  process.env.VERCEL === '1' || 
                  (process.env.APP_URL && process.env.APP_URL.includes('https')) ||
                  !!process.env.K_SERVICE;

  console.log('[Server] Starting initialization. Cloud Mode:', isCloud);

  // Health check for Vercel
  app.get('/api/health', async (req, res) => {
    let bridgeWorking = false;
    try {
      // Quick test with a known game
      const test = await getHLTBData('Undertale');
      bridgeWorking = !!test;
    } catch (e) {
      console.warn('HLTB Bridge status check failed:', e);
    }

    res.json({ 
      status: 'ok', 
      isCloud, 
      hasSupabase: !!process.env.SUPABASE_URL,
      hasSteam: !!process.env.STEAM_API_KEY,
      hltbBridge: bridgeWorking ? 'connected' : 'error/not_installed',
      timestamp: new Date().toISOString()
    });
  });

  // Custom Supabase Session Store
  class SupabaseStore extends session.Store {
    supabase: any;
    constructor() {
      super();
      this.supabase = getSupabase();
      console.log('SupabaseStore initialized. Client available:', !!this.supabase);
      if (this.supabase) {
        console.log('[SessionStore] Initialized.');
      }
    }

    async get(sid: string, callback: (err: any, session?: any) => void) {
      if (!this.supabase) return callback(null, null);
      try {
        const { data, error } = await this.supabase
          .from('sessions')
          .select('data')
          .eq('id', sid)
          .maybeSingle();

        if (error) {
          console.error('[SessionStore] Get Error for', sid, ':', error);
          return callback(error);
        }
        if (!data) {
          return callback(null, null);
        }
        
        callback(null, data.data);
      } catch (err) {
        console.error('[SessionStore] Get Exception:', err);
        callback(err);
      }
    }

    async set(sid: string, sessionData: any, callback: (err?: any) => void) {
      if (!this.supabase) return callback();
      try {
        console.log('[SessionStore] Setting session:', sid);
        // Calculate expiry
        const expires_at = sessionData.cookie?.expires 
          ? new Date(sessionData.cookie.expires).toISOString()
          : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

        const { error } = await this.supabase
          .from('sessions')
          .upsert({
            id: sid,
            data: sessionData,
            expires_at
          }, { onConflict: 'id' });

        if (error) {
          console.error('[SessionStore] Set Error for', sid, ':', error);
          if (error.code === '42P01') {
            console.error('CRITICAL: The "sessions" table does not exist in Supabase.');
          }
        }
        callback(error);
      } catch (err) {
        console.error('[SessionStore] Set Exception:', err);
        callback(err);
      }
    }

    async destroy(sid: string, callback: (err?: any) => void) {
      if (!this.supabase) return callback();
      try {
        const { error } = await this.supabase
          .from('sessions')
          .delete()
          .eq('id', sid);
        callback(error);
      } catch (err) {
        console.error('[SessionStore] Destroy Exception:', err);
        callback(err);
      }
    }
  }

  app.use(session({
    secret: process.env.SESSION_SECRET || 'gwg-tracker-secret',
    resave: false,
    saveUninitialized: false,
    name: 'gwg.sid',
    proxy: true,
    store: new SupabaseStore(),
    cookie: {
      secure: isCloud, 
      sameSite: 'none', 
      maxAge: 1000 * 60 * 60 * 24 * 30, 
      httpOnly: true,
    }
  }));

  // Debug middleware for sessions
  app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`${req.method} ${req.url} - Session ID: ${(req as any).sessionID} - User: ${!!(req as any).user}`);
    }
    next();
  });

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: any, done) => done(null, user));
  passport.deserializeUser((user: any, done) => done(null, user));

  const getAppBaseUrl = (req: any) => {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    let url = `${protocol}://${host}`;
    if (url.includes('.run.app') || url.includes('.ais.') || url.includes('.vercel.app') || protocol === 'https') {
      url = url.replace('http://', 'https://');
    }
    return url.replace(/\/$/, '');
  };

  const initialAppUrl = (process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')).replace(/\/$/, '');

  // Auth Strategies
  const steamApiKey = process.env.STEAM_API_KEY;
  passport.use(new SteamStrategy({
    returnURL: `${initialAppUrl}/auth/steam/return`,
    realm: initialAppUrl,
    apiKey: steamApiKey || 'DUMMY_KEY'
  }, (identifier: string, profile: any, done: (err: any, user?: any) => void) => {
    profile.identifier = identifier;
    profile.id = profile.id || identifier.split('/').pop();
    return done(null, profile);
  }));

  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID || 'dummy',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || 'dummy',
    callbackURL: `${initialAppUrl}/auth/discord/callback`,
    scope: ['identify', 'guilds']
  }, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
  }));

  // Auth Routes
  app.get('/api/auth/steam/url', (req, res) => {
    const appUrl = getAppBaseUrl(req);
    const returnTo = `${appUrl}/auth/steam/return`;
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': appUrl,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
    });
    res.json({ url: `https://steamcommunity.com/openid/login?${params.toString()}` });
  });

  app.get('/auth/steam', (req, res, next) => {
    const appUrl = getAppBaseUrl(req);
    const strategy = (passport as any)._strategies.steam;
    if (strategy) {
      strategy._returnURL = `${appUrl}/auth/steam/return`;
      strategy._realm = appUrl;
    }
    passport.authenticate('steam')(req, res, next);
  });

  app.get(['/auth/steam/return', '/auth/steam/return/'], (req, res, next) => {
    const appUrl = getAppBaseUrl(req);
    const strategy = (passport as any)._strategies.steam;
    if (strategy) {
      strategy._returnURL = `${appUrl}/auth/steam/return`;
      strategy._realm = appUrl;
    }

    const previousUser = (req as any).user;

    passport.authenticate('steam', { failureRedirect: '/?error=AuthFailed' }, (err: any, user: any) => {
      if (err) {
        console.error('Steam Auth Error:', err);
        return res.redirect('/?error=' + encodeURIComponent(err.message || 'Auth Error'));
      }
      if (!user) return res.redirect('/');
      
      (req as any).logIn(user, async (loginErr: any) => {
        if (loginErr) {
          console.error('❌ Login Error:', loginErr);
          return res.redirect('/?error=LoginFailed');
        }
        
        const supabase = getSupabase();
        if (supabase) {
          try {
            const steamId = String(user.id || user._json?.steamid);
            console.log('--- SYNC START ---');
            console.log('Syncing Steam ID:', steamId);

            // Check if we are linking Steam to an active Discord-only account
            if (previousUser && previousUser.id && String(previousUser.id).startsWith('discord_')) {
              console.log('Linking Steam ID to Discord-only account:', previousUser.id);
              
              // Verify that this steam ID is not already linked to another profile
              const { data: existingSteamProfile } = await supabase
                .from('profiles')
                .select('steamid')
                .eq('steamid', steamId)
                .maybeSingle();

              if (existingSteamProfile) {
                console.warn('❌ Linking failed: This Steam account is already linked to another profile.');
                return res.redirect('/?error=' + encodeURIComponent('This Steam account is already linked to another user.'));
              }

              // Update associated tables
              await supabase.from('submissions').update({ user_id: steamId }).eq('user_id', previousUser.id);
              await supabase.from('user_event_teams').update({ steamid: steamId }).eq('steamid', previousUser.id);

              // Update the actual profile's steamid and info
              const { error: syncError } = await supabase.from('profiles').update({
                steamid: steamId,
                steam_name: user.displayName || user.personaname || 'Steam User',
                steam_avatar: user.photos?.[2]?.value || user.photos?.[0]?.value || user._json?.avatarfull || null,
                last_login: new Date().toISOString()
              }).eq('steamid', previousUser.id);

              if (syncError) {
                console.error('❌ Supabase Link Update Error:', syncError.message);
              } else {
                console.log('✅ Supabase Link Update Success!');
              }
            } else {
              // Standard Steam sign-in/upsert
              const { data, error: syncError } = await supabase.from('profiles').upsert({
                steamid: steamId,
                steam_name: user.displayName || user.personaname || 'Steam User',
                steam_avatar: user.photos?.[2]?.value || user.photos?.[0]?.value || user._json?.avatarfull || null,
                last_login: new Date().toISOString()
              }, { onConflict: 'steamid' }).select();
              
              if (syncError) {
                console.error('❌ Supabase Sync Error:', syncError.message);
              } else {
                console.log('✅ Supabase Sync Success! Data in DB:', data);
              }
            }
            console.log('--- SYNC END ---');
          } catch (dbErr) {
            console.error('❌ Critical Database Exception:', dbErr);
          }
        }

        if ((req as any).session) {
          (req as any).session.save(() => res.redirect('/'));
        } else {
          res.redirect('/');
        }
      });
      
    })(req, res, next);
  });

  app.get('/api/auth/discord/url', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) {
      console.error('[Auth] Discord Sync Error: DISCORD_CLIENT_ID is missing from environment variables.');
      return res.status(500).json({ error: 'Discord Client ID not configured. Please set DISCORD_CLIENT_ID in the app settings.' });
    }
    
    const appUrl = getAppBaseUrl(req);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${appUrl}/auth/discord/callback`,
      response_type: 'code',
      scope: 'identify guilds'
    });
    res.json({ url: `https://discord.com/api/oauth2/authorize?${params.toString()}` });
  });

  app.get('/auth/discord', (req, res, next) => {
    const appUrl = getAppBaseUrl(req);
    const strategy = (passport as any)._strategies.discord;
    if (strategy) {
      strategy._callbackURL = `${appUrl}/auth/discord/callback`;
    }
    passport.authenticate('discord')(req, res, next);
  });

  app.get('/auth/discord/callback', (req, res, next) => {
    const appUrl = getAppBaseUrl(req);
    const strategy = (passport as any)._strategies.discord;
    if (strategy) {
      strategy._callbackURL = `${appUrl}/auth/discord/callback`;
    }
    passport.authenticate('discord', async (err: any, user: any) => {
      if (err || !user) {
        const errorMsg = err?.message || 'Discord authentication failed.';
        return res.send(`
          <html><body><script>
            window.opener.postMessage({ type: 'DISCORD_AUTH_FAILURE', error: ${JSON.stringify(errorMsg)} }, '*');
            window.close();
          </script></body></html>
        `);
      }

      // Read required server (guild) ID from env
      const requiredGuildId = process.env.DISCORD_GUILD_ID;
      if (requiredGuildId) {
        const guilds = user.guilds || [];
        const isMember = guilds.some((g: any) => String(g.id) === String(requiredGuildId));
        if (!isMember) {
          return res.send(`
            <html><body><script>
              window.opener.postMessage({ type: 'DISCORD_AUTH_FAILURE', error: 'You must be a member of our Discord server to log in.' }, '*');
              window.close();
            </script></body></html>
          `);
        }
      }

      const currentUser = (req as any).user;
      const supabase = getSupabase();
      
      const discordName = user.global_name || user.username || user.displayName || 'Discord User';
      const discordAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null;

      if (currentUser && supabase) {
        // SCENARIO A: Already authenticated via Steam, link Discord to existing profile
        try {
          const currentSteamId = currentUser.id || currentUser.steam_id || currentUser.steamid;
          await supabase.from('profiles').update({
            discord_id: user.id,
            discord_name: discordName,
            discord_avatar: discordAvatar
          }).eq('steamid', currentSteamId);

          Object.assign(currentUser, {
            discord_id: user.id,
            discord_name: discordName,
            discord_avatar: discordAvatar
          });
        } catch (dbErr) {
          console.error('Failed to link Discord to Supabase:', dbErr);
        }
      } else if (supabase) {
        // SCENARIO B: Log in with Discord primary account
        try {
          // Check if profile already exists with this discord_id
          const { data: existingProfile, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('discord_id', user.id)
            .maybeSingle();

          let sessionUser: any = null;

          if (existingProfile) {
            // Update last_login
            await supabase.from('profiles').update({
              last_login: new Date().toISOString()
            }).eq('steamid', existingProfile.steamid);
            
            sessionUser = {
              id: existingProfile.steamid,
              steamid: existingProfile.steamid,
              discord_id: user.id,
              provider: 'discord'
            };
          } else {
            // First time Discord login: flag for registration prompt on frontend, do not insert profile yet
            sessionUser = {
              id: `discord_${user.id}`,
              steamid: `discord_${user.id}`,
              discord_id: user.id,
              discord_name: discordName,
              discord_avatar: discordAvatar,
              provider: 'discord',
              needs_registration: true
            };
          }

          await new Promise<void>((resolve, reject) => {
            (req as any).logIn(sessionUser, (loginErr: any) => {
              if (loginErr) reject(loginErr);
              else resolve();
            });
          });
        } catch (dbErr) {
          console.error('Failed to log in Discord-only user:', dbErr);
          return res.send(`
            <html><body><script>
              window.opener.postMessage({ type: 'DISCORD_AUTH_FAILURE', error: 'Failed to establish local session.' }, '*');
              window.close();
            </script></body></html>
          `);
        }
      }

      res.send(`
        <html><body><script>
          window.opener.postMessage({ type: 'DISCORD_AUTH_SUCCESS', user: ${JSON.stringify(user)} }, '*');
          window.close();
        </script></body></html>
      `);
    })(req, res, next);
  });

  app.post('/api/auth/complete-registration', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { hasSteam, steamId } = req.body;
    const user = (req as any).user;
    const supabase = getSupabase();

    if (!user || user.provider !== 'discord' || !user.needs_registration) {
      return res.status(400).json({ error: 'This user does not require first-time Discord registration.' });
    }

    const discordId = user.discord_id;
    const discordName = user.discord_name;
    const discordAvatar = user.discord_avatar;

    if (!discordId) {
      return res.status(400).json({ error: 'No Discord association found in current session.' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Database connection is unavailable.' });
    }

    try {
      if (!hasSteam) {
        // Create new user (Discord-only)
        const fallbackId = `discord_${discordId}`;
        const newProfile = {
          steamid: fallbackId,
          steam_name: discordName,
          steam_avatar: discordAvatar,
          discord_id: discordId,
          discord_name: discordName,
          discord_avatar: discordAvatar,
          active_avatar: 'discord',
          team: 'none',
          role: 'member',
          status: 'Ready for Event #3',
          points: 0,
          last_login: new Date().toISOString(),
          created_at: new Date().toISOString()
        };

        const { error: insertErr } = await supabase.from('profiles').insert(newProfile);
        if (insertErr) {
          console.error('Failed to insert new Discord-only profile:', insertErr);
          return res.status(500).json({ error: 'Failed to create profile: ' + insertErr.message });
        }

        // Update session
        user.id = fallbackId;
        user.steamid = fallbackId;
        delete user.needs_registration;

        if ((req as any).session) {
          return (req as any).session.save((err: any) => {
            if (err) return res.status(500).json({ error: 'Failed to save session' });
            return res.json({ success: true, user });
          });
        }
        return res.json({ success: true, user });

      } else {
        // Yes, they have a Steam account
        if (!steamId || !/^\d{17}$/.test(steamId)) {
          return res.status(400).json({ error: 'Steam ID must be exactly 17 digits.' });
        }

        // Check if there's already an existing member with that id
        const { data: existingMember, error: queryErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('steamid', steamId)
          .maybeSingle();

        if (queryErr) {
          console.error('Failed to query existing member:', queryErr);
          return res.status(500).json({ error: 'Database query failed.' });
        }

        if (!existingMember) {
          // If there isn't, create a new user with that steam_id
          // Try to fetch real details from Steam API
          let steamName = discordName;
          let steamAvatar = discordAvatar;
          try {
            const apiKey = process.env.STEAM_API_KEY;
            if (apiKey && apiKey !== 'DUMMY_KEY') {
              const steamRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`);
              if (steamRes.ok) {
                const steamData = await steamRes.json();
                const player = steamData?.response?.players?.[0];
                if (player) {
                  steamName = player.personaname || player.realname || discordName;
                  steamAvatar = player.avatarfull || player.avatarmedium || player.avatar || discordAvatar;
                }
              }
            }
          } catch (err) {
            console.warn('Failed to fetch Steam profile summaries from API:', err);
          }

          const newProfile = {
            steamid: steamId,
            steam_name: steamName,
            steam_avatar: steamAvatar,
            discord_id: discordId,
            discord_name: discordName,
            discord_avatar: discordAvatar,
            active_avatar: 'discord',
            team: 'none',
            role: 'member',
            status: 'Ready for Event #3',
            points: 0,
            last_login: new Date().toISOString(),
            created_at: new Date().toISOString()
          };

          const { error: insertErr } = await supabase.from('profiles').insert(newProfile);
          if (insertErr) {
            console.error('Failed to insert new linked Steam profile:', insertErr);
            return res.status(500).json({ error: 'Failed to create profile: ' + insertErr.message });
          }

          // Update session
          user.id = steamId;
          user.steamid = steamId;
          delete user.needs_registration;

          if ((req as any).session) {
            return (req as any).session.save((err: any) => {
              if (err) return res.status(500).json({ error: 'Failed to save session' });
              return res.json({ success: true, user });
            });
          }
          return res.json({ success: true, user });

        } else {
          // If there is already an existing member with that id, sync their progress so they can either log in with steam or discord and see the same info.
          // Check if this Steam account is already linked to a different Discord account
          if (existingMember.discord_id && existingMember.discord_id !== discordId) {
            return res.status(400).json({ error: `This Steam account is already linked to another Discord account (${existingMember.discord_name || existingMember.discord_id}).` });
          }

          // Link this Discord account to the existing Steam account
          const { error: updateErr } = await supabase
            .from('profiles')
            .update({
              discord_id: discordId,
              discord_name: discordName,
              discord_avatar: discordAvatar,
              last_login: new Date().toISOString()
            })
            .eq('steamid', steamId);

          if (updateErr) {
            console.error('Failed to link existing Steam profile to Discord:', updateErr);
            return res.status(500).json({ error: 'Failed to link account.' });
          }

          // Update session
          user.id = steamId;
          user.steamid = steamId;
          delete user.needs_registration;

          if ((req as any).session) {
            return (req as any).session.save((err: any) => {
              if (err) return res.status(500).json({ error: 'Failed to save session' });
              return res.json({ success: true, user });
            });
          }
          return res.json({ success: true, user });
        }
      }
    } catch (err: any) {
      console.error('Complete registration error:', err);
      return res.status(500).json({ error: 'Internal server error: ' + (err.message || err) });
    }
  });

  app.post('/api/profile/update', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { displayName, status } = req.body;
    const user = (req as any).user;
    const supabase = getSupabase();
    
    const steamId = user.id || user.steamid || user.steam_id || user.steamId;

    if (supabase && steamId) {
      try {
        const { error } = await supabase.from('profiles').update({
          steam_name: displayName,
          status: status
        }).eq('steamid', steamId);

        if (error) throw error;
        
        // Update session user object mapping
        user.displayName = displayName;
        user.steam_name = displayName;
        user.status = status;
        
        if ((req as any).session) {
          return (req as any).session.save((err: any) => {
            if (err) {
              console.error('Profile Session Save Error:', err);
              return res.status(500).json({ error: 'Failed to update session' });
            }
            return res.json({ success: true, user });
          });
        }
        
        return res.json({ success: true, user });
      } catch (err) {
        console.error('Failed to update profile:', err);
        return res.status(500).json({ error: 'Failed to update profile' });
      }
    }
    
    // Fallback if no supabase (demo mode or misconfigured)
    user.displayName = displayName;
    user.status = status;
    res.json({ success: true, user });
  });

  app.post('/api/profile/avatar-preference', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { preference } = req.body;
    if (preference !== 'steam' && preference !== 'discord') {
      return res.status(400).json({ error: 'Invalid preference' });
    }

    const user = (req as any).user;
    const supabase = getSupabase();
    const userId = user.id || user.steamid || user.steam_id || user.steamId;

    if (supabase && userId) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ active_avatar: preference })
          .eq('steamid', userId);

        if (error) throw error;

        // Update working session
        user.active_avatar = preference;

        if ((req as any).session) {
          return (req as any).session.save((err: any) => {
            if (err) return res.status(500).json({ error: 'Failed to update session' });
            return res.json({ success: true, active_avatar: preference });
          });
        }
        return res.json({ success: true, active_avatar: preference });
      } catch (err) {
        console.error('Failed to update avatar preference:', err);
        return res.status(500).json({ error: 'Failed to update avatar preference' });
      }
    }
    res.status(400).json({ error: 'Profile not found' });
  });


  app.get('/api/hltb_bridge', async (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'Name required' });

    try {
      const pythonScript = path.join(process.cwd(), 'api', 'hltb_bridge.py');
      const cmds = ['python3', 'python'];
      let stdout = '';
      let lastError = null;

      for (const cmd of cmds) {
        try {
          const result = await execFilePromise(cmd, [pythonScript, String(name)]);
          stdout = result.stdout;
          lastError = null;
          break;
        } catch (err) { lastError = err; }
      }

      if (lastError && !stdout) throw lastError;

      const jsonMatch = stdout.match(/\{.*\}/s) || stdout.match(/null/);
      if (jsonMatch && jsonMatch[0] !== 'null') {
        const data = JSON.parse(jsonMatch[0]);
        return res.json(data);
      }
      res.json({ hltb_main: 0, hltb_extras: 0, hltb_completionist: 0, notFound: true });
    } catch (err) {
      console.error('[Bridge Error]:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/hltb/:title', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { title } = req.params;
    if (hltbCache.has(title)) {
      return res.json(hltbCache.get(title));
    }

    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data: cachedGame } = await supabase
          .from('games')
          .select('hltb_main, hltb_extras, hltb_completionist')
          .eq('title', title)
          .maybeSingle();

        if (cachedGame && cachedGame.hltb_main > 0) {
           const transformed = {
             hltb_main: cachedGame.hltb_main,
             hltb_extras: cachedGame.hltb_extras,
             hltb_completionist: cachedGame.hltb_completionist
           };
           hltbCache.set(title, transformed);
           return res.json(transformed);
        }
      } catch (err) {
        console.warn('Supabase HLTB cache check failed:', err);
      }
    }

    try {
      const data = await getHLTBData(title);
      if (data) {
        hltbCache.set(title, data);
        
        // Save to Supabase for persistence
        const supabase = getSupabase();
        if (supabase) {
          supabase.from('games').upsert({
            title: title,
            hltb_main: data.hltb_main || 0,
            hltb_extras: data.hltb_extras || 0,
            hltb_completionist: data.hltb_completionist || 0,
            updated_at: new Date().toISOString()
          }, { onConflict: 'title' }).then(({error}: any) => {
             if (error) console.error('[Supabase Cache Save] Error:', error);
          });
        }
        
        return res.json(data);
      }
      const notFoundData = { hltb_main: 0, hltb_extras: 0, hltb_completionist: 0, notFound: true };
      hltbCache.set(title, notFoundData);
      res.json(notFoundData);
    } catch (err) {
      console.error('HLTB search failed:', err);
      res.status(500).json({ error: true });
    }
  });

  app.post('/api/hltb-batch', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { titles } = req.body;
    if (!Array.isArray(titles)) return res.status(400).json({ error: 'Invalid input' });

    const results: Record<string, any> = {};
    const toFetch = titles.filter(t => !hltbCache.has(t));

    const supabase = getSupabase();
    if (supabase && toFetch.length > 0) {
      try {
        const { data: cachedGames } = await supabase
          .from('games')
          .select('title, hltb_main, hltb_extras, hltb_completionist')
          .in('title', toFetch);

        if (cachedGames) {
          cachedGames.forEach((g: any) => {
            const transformed = {
              hltb_main: g.hltb_main,
              hltb_extras: g.hltb_extras,
              hltb_completionist: g.hltb_completionist
            };
            hltbCache.set(g.title, transformed);
          });
        }
      } catch (err) {
        console.warn('Supabase HLTB batch cache check failed:', err);
      }
    }

    const stillToFetch = titles.filter(t => !hltbCache.has(t));

    // Fetch in small batches to avoid rate limits/spamming
    for (let i = 0; i < stillToFetch.length; i += 3) {
      const batch = stillToFetch.slice(i, i + 3);
      await Promise.all(batch.map(async (title) => {
        try {
          const data = await getHLTBData(title);
          if (data) {
            hltbCache.set(title, data);
            results[title] = data;

            // Save to Supabase for persistence
            const supabase = getSupabase();
            if (supabase) {
              supabase.from('games').upsert({
                title: title,
                hltb_main: data.hltb_main || 0,
                hltb_extras: data.hltb_extras || 0,
                hltb_completionist: data.hltb_completionist || 0,
                updated_at: new Date().toISOString()
              }, { onConflict: 'title' }).then(({error}: any) => {
                 if (error) console.error('[Supabase Batch Cache Save] Error:', error);
              });
            }
          } else {
            const notFoundData = { hltb_main: 0, hltb_extras: 0, hltb_completionist: 0, notFound: true };
            hltbCache.set(title, notFoundData);
            results[title] = notFoundData;
          }
        } catch (e) {
          console.warn(`HLTB fetch failed for ${title}`, e);
        }
      }));
    }

    // Include cached ones
    titles.forEach(title => {
      if (hltbCache.has(title)) {
        results[title] = hltbCache.get(title);
      }
    });

    res.json(results);
  });

  app.get('/api/me', async (req, res) => {
    if ((req as any).isAuthenticated && (req as any).isAuthenticated()) {
      const user = (req as any).user;
      const supabase = getSupabase();
      
      let profileData = null;
      let error = null;

      if (supabase) {
        const queryId = user.id || user.steamid || user.steam_id || user.steamId;
        
        try {
          // 1. Try to fetch by steamid
          if (queryId) {
            const { data, error: err1 } = await supabase
              .from('profiles')
              .select('*')
              .eq('steamid', queryId)
              .maybeSingle();
            
            if (data && !err1) {
              profileData = data;
            } else {
              error = err1;
            }
          }

          // 2. Try to fetch by discord_id if not found yet (handles Discord-only logins)
          const discordId = user.discord_id || (user.provider === 'discord' ? user.id : null);
          if (!profileData && discordId) {
            const { data, error: err2 } = await supabase
              .from('profiles')
              .select('*')
              .eq('discord_id', discordId)
              .maybeSingle();
            
            if (data && !err2) {
              profileData = data;
              error = null;
            }
          }
        } catch (err) {
          console.error('Error in /api/me fetching from Supabase:', err);
        }
      }

      if (profileData) {
        let eventTeams: Record<string, string> = {};
        const steamIdForUET = profileData.steamid;
        try {
          const { data: eventTeamsData } = await supabase
            .from('user_event_teams')
            .select('event_id, team')
            .eq('steamid', steamIdForUET);

          (eventTeamsData || []).forEach((row: any) => {
            eventTeams[row.event_id] = row.team;
          });

          // Auto-lock into active event if not present yet and active event exists
          const { data: activeEvent } = await supabase
            .from('events')
            .select('id')
            .eq('is_active', true)
            .maybeSingle();

          if (activeEvent && profileData.team && !eventTeams[activeEvent.id]) {
            await supabase
              .from('user_event_teams')
              .upsert({
                steamid: steamIdForUET,
                event_id: activeEvent.id,
                team: profileData.team
              }, { onConflict: 'steamid,event_id' });
            eventTeams[activeEvent.id] = profileData.team;
          }
        } catch (uetError) {
          console.warn('[Session Me] Could not fetch/update user_event_teams:', uetError);
        }

        // Apply active avatar choice
        let finalAvatar = profileData.steam_avatar;
        if (profileData.active_avatar === 'discord' && profileData.discord_avatar) {
          finalAvatar = profileData.discord_avatar;
        }

        // Merge database data with session data for the frontend
        return res.json({
          ...user,
          ...profileData,
          steam_avatar: finalAvatar, // Overwrite as evaluated above so existing components show preferred avatar flawlessly!
          isAdmin: profileData.role === 'admin' || profileData.role === 'admins',
          eventTeams: eventTeams
        });
      }
      
      return res.json(user);
    }
    // Check if demo query param is set (useful for quick testing)
    if (req.query.demo === 'true') {
      const demoUser = {
        id: '76561198117650232',
        displayName: 'Demo User',
        photos: [{ value: 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg' }],
        team: 'blue',
        isAdmin: true,
        points: 420,
        status: 'Exploring the platform!'
      };
      // Use passport's logIn to establish session
      return (req as any).logIn(demoUser, (err: any) => {
        if (err) return res.json(null);
        if ((req as any).session) {
          (req as any).session.save(() => res.json(demoUser));
        } else {
          res.json(demoUser);
        }
      });
    }
    res.json(null);
  });

  // IGDB Game Search
  app.get('/api/games/search', async (req, res) => {
    const { query, igdbId, steamAppId } = req.query;
    if (!query && !igdbId && !steamAppId) return res.json([]);

    try {
      if (steamAppId) {
        const appIdStr = String(steamAppId).trim();
        const localSupabase = getSupabase();
        if (localSupabase && appIdStr) {
          try {
            const { data: matchedGame } = await localSupabase
              .from('games')
              .select('*')
              .eq('steam_appid', parseInt(appIdStr))
              .maybeSingle();

            if (matchedGame) {
              console.log(`[Steam AppID Search] Found exact local DB game with steam_appid: ${appIdStr}`);
              return res.json([{
                id: matchedGame.id,
                title: matchedGame.title,
                image: matchedGame.image_url || 'https://via.placeholder.com/264x352?text=No+Cover',
                summary: matchedGame.summary || "Existing game in system.",
                steam_appid: matchedGame.steam_appid
              }]);
            }
          } catch (dbErr) {
            console.error('[Steam AppID Search] Failed to check steam_appid match in local DB:', dbErr);
          }
        }

        // Fetch from Steam API
        console.log(`[Steam AppID Search Web] Querying Steam API for App ID: ${appIdStr}`);
        const steamRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appIdStr}`);
        const steamData: any = await steamRes.json();
        
        if (steamData[appIdStr] && steamData[appIdStr].success) {
          const game = steamData[appIdStr].data;
          return res.json([{
            id: appIdStr,
            title: game.name,
            image: game.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appIdStr}/header.jpg`,
            summary: game.short_description || '',
            steam_appid: parseInt(appIdStr)
          }]);
        } else {
          // Fallback for delisted/F2P games via API Key Schema
          try {
            const apiKey = process.env.STEAM_API_KEY;
            if (apiKey) {
              const schemaRes = await fetch(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appIdStr}`);
              const schemaData: any = await schemaRes.json();
              if (schemaData.game && schemaData.game.gameName) {
                return res.json([{
                  id: appIdStr,
                  title: schemaData.game.gameName,
                  image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appIdStr}/header.jpg`,
                  summary: "Delisted, Age-Restricted, or Free-to-Play game (No public Store Page available).",
                  steam_appid: parseInt(appIdStr)
                }]);
              }
            }
          } catch (err) {
            console.error(`[Steam AppID Search Web] Schema fallback failed:`, err);
          }
        }
        return res.json([]);
      }

      if (igdbId) {
        const idStr = String(igdbId).trim();
        const localSupabase = getSupabase();
        if (localSupabase && idStr) {
          try {
            const { data: matchedGame } = await localSupabase
              .from('games')
              .select('*')
              .eq('id', idStr)
              .maybeSingle();

            if (matchedGame) {
              console.log(`[IGDB ID Search] Found exact local DB game with ID: ${idStr}`);
              return res.json([{
                id: matchedGame.id,
                title: matchedGame.title,
                image: matchedGame.image_url || 'https://via.placeholder.com/264x352?text=No+Cover',
                summary: matchedGame.summary || "Existing game in system.",
                steam_appid: matchedGame.steam_appid
              }]);
            }
          } catch (dbErr) {
            console.error('[IGDB ID Search] Failed to check IGDB ID match in local DB:', dbErr);
          }
        }

        // Fetch from IGDB by explicit ID if not found in local DB!
        try {
          console.log(`[IGDB ID Search Web] Querying IGDB by ID: ${idStr}`);
          const token = await getIGDBToken();
          const response = await fetch('https://api.igdb.com/v4/games', {
            method: 'POST',
            headers: {
              'Client-ID': process.env.IGDB_CLIENT_ID!,
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'text/plain'
            },
            body: `where id = ${idStr}; fields name, cover.url, summary, category, version_parent, external_games.category, external_games.uid, websites.url, websites.category;`
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error('[IGDB ID Search Web] API Error:', response.status, errText);
            if (response.status === 401) {
              igdbToken = null;
            }
            return res.status(response.status).json({ error: 'IGDB API rejected request', details: errText });
          }

          const data: any = await response.json();
          if (!Array.isArray(data) || data.length === 0) {
            return res.json([]);
          }

          const results = data.map((game: any) => {
            let steamId = game.external_games?.find((eg: any) => eg.category === 1)?.uid;
            if (!steamId) {
              const steamWebsite = game.websites?.find((w: any) => w.category === 13 || w.url?.includes('store.steampowered.com/app/'));
              if (steamWebsite) {
                const match = steamWebsite.url.match(/\/app\/(\d+)/);
                if (match) steamId = match[1];
              }
            }

            return {
              id: game.id,
              title: game.name,
              image: game.cover?.url ? `https:${game.cover.url.replace('t_thumb', 't_cover_big')}` : 'https://via.placeholder.com/264x352?text=No+Cover',
              summary: game.summary,
              steam_appid: steamId
            };
          });

          return res.json(results);
        } catch (err) {
          console.error('[IGDB ID Search Web] Crash:', err);
          return res.status(500).json({ error: 'Search by ID crashed', details: String(err) });
        }
      }

      const queryStr = String(query).trim();

      // Check if the query is an IGDB ID (or game ID string) matching a game in our local database first
      const localSupabase = getSupabase();
      if (localSupabase && queryStr) {
        try {
          const { data: matchedGame } = await localSupabase
            .from('games')
            .select('*')
            .eq('id', queryStr)
            .maybeSingle();

          if (matchedGame) {
            console.log(`[IGDB ID Search] Found exact local DB game with ID: ${queryStr}`);
            return res.json([{
              id: matchedGame.id,
              title: matchedGame.title,
              image: matchedGame.image_url || 'https://via.placeholder.com/264x352?text=No+Cover',
              summary: matchedGame.summary || "Existing game in system.",
              steam_appid: matchedGame.steam_appid
            }]);
          }
        } catch (dbErr) {
          console.error('[IGDB ID Search] Failed to check IGDB ID match in local DB:', dbErr);
        }
      }

      const isSteamAppId = /^\d+$/.test(queryStr) && queryStr.length < 10; // App IDs are usually < 10 digits

      if (isSteamAppId) {
        console.log(`[Steam Search] Querying for App ID: ${queryStr}`);
        const steamRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${queryStr}`);
        const steamData = await steamRes.json();
        
        if (steamData[queryStr] && steamData[queryStr].success) {
          const game = steamData[queryStr].data;
          return res.json([{
            id: queryStr, 
            title: game.name,
            image: game.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${queryStr}/header.jpg`,
            summary: game.short_description,
            steam_appid: parseInt(queryStr)
          }]);
        } else {
          // FALLBACK FOR DELISTED / F2P GAMES
          console.log(`[Steam Search] Store API failed for ${queryStr}. Trying Schema fallback...`);
          try {
            const apiKey = process.env.STEAM_API_KEY;
            const schemaRes = await fetch(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${queryStr}`);
            const schemaData = await schemaRes.json();
            
            if (schemaData.game && schemaData.game.gameName) {
              return res.json([{
                id: queryStr,
                title: schemaData.game.gameName,
                // The Steam CDN often keeps images for delisted games alive indefinitely
                image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${queryStr}/header.jpg`,
                summary: "Delisted, Age-Restricted, or Free-to-Play game (No public Store Page available).",
                steam_appid: parseInt(queryStr)
              }]);
            }
          } catch (err) {
             console.log(`[Steam Search] Schema fallback also failed for ${queryStr}.`);
          }
        }
      }

      // Check for exact match in local DB 'games' first
      let exactLocalResults: any[] = [];
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { data: exactMatches } = await supabase
            .from('games')
            .select('*')
            .ilike('title', queryStr);
            
          if (exactMatches && exactMatches.length > 0) {
            exactLocalResults = exactMatches.map((g: any) => ({
              id: g.id,
              title: g.title,
              image: g.image_url || 'https://via.placeholder.com/264x352?text=No+Cover',
              summary: g.summary || "Existing game in system.",
              steam_appid: g.steam_appid
            }));
          }
        } catch (dbErr) {
          console.error('[Search] Failed to check exact match in local DB:', dbErr);
        }
      }

      console.log(`[IGDB Search] Querying for: ${queryStr}`);
      const token = await getIGDBToken();
      
      // Escape for IGDB query
      const safeQuery = queryStr.replace(/"/g, '\\"');
      
      const response = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': process.env.IGDB_CLIENT_ID!,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain'
        },
        // Simplified query to ensure reliability with limit 25
        body: `search "${safeQuery}"; fields name, cover.url, summary, category, version_parent, external_games.category, external_games.uid, websites.url, websites.category; limit 25;`
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[IGDB Search] API Error:', response.status, errText);
        
        if (response.status === 401) {
          igdbToken = null; 
        }
        
        return res.status(response.status).json({ error: 'IGDB API rejected request', details: errText });
      }

      const data: any = await response.json();
      console.log(`[IGDB Search] Success - results: ${Array.isArray(data) ? data.length : 'not array'}`);
      
      if (!Array.isArray(data)) {
        return res.json([]);
      }

      // Filter DLCs and other categories if version_parent is present or category is 1 (DLC)
      const filteredData = data.filter((game: any) => {
        if (data.length > 1 && game.category === 1) return false;
        return true;
      });

      const results = filteredData.map((game: any) => {
        let steamId = game.external_games?.find((eg: any) => eg.category === 1)?.uid;
        if (!steamId) {
          const steamWebsite = game.websites?.find((w: any) => w.category === 13 || w.url?.includes('store.steampowered.com/app/'));
          if (steamWebsite) {
            const match = steamWebsite.url.match(/\/app\/(\d+)/);
            if (match) steamId = match[1];
          }
        }

        let hltbId = game.external_games?.find((eg: any) => eg.category === 14)?.uid;
        if (!hltbId) {
          const hltbUrl = game.websites?.find((w: any) => w.url?.includes('howlongtobeat.com'))?.url;
          if (hltbUrl) {
            const match = hltbUrl.match(/(?:\/game\/|id=)(\d+)/);
            if (match) hltbId = match[1];
            else hltbId = hltbUrl.split('/').pop()?.split('-')[0];
          }
        }

        return {
          id: game.id,
          title: game.name,
          image: game.cover?.url ? `https:${game.cover.url.replace('t_thumb', 't_cover_big')}` : 'https://via.placeholder.com/264x352?text=No+Cover',
          summary: game.summary,
          steam_appid: steamId
        };
      });

      // Merge local exact matches and IGDB search results
      const finalResults = [...exactLocalResults];
      for (const item of results) {
        if (!finalResults.some(fr => String(fr.id) === String(item.id))) {
          finalResults.push(item);
        }
      }

      // Sort so exact text matches always rise to the very top (case-insensitive)
      const queryLower = queryStr.toLowerCase().trim();
      finalResults.sort((a, b) => {
        const aExact = a.title.toLowerCase().trim() === queryLower;
        const bExact = b.title.toLowerCase().trim() === queryLower;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
      });

      res.json(finalResults);
    } catch (err) {
      console.error('[IGDB Search] Crash:', err);
      res.status(500).json({ error: 'Search crashed', details: String(err) });
    }
  });

  app.get('/api/games/:id', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    const { data, error } = await supabase
      .from('games')
      .select('*, submissions(count)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) {
       console.error('[API] Game fetch error:', error);
       return res.status(500).json({ error: `Database error: ${error.message}`, details: error.details });
    }
    if (!data) return res.status(404).json({ error: 'Game not found' });
    res.json(data);
  });

  // Admin APIs
  const adminOnly = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      console.log('[Admin Auth] Denied: Not authenticated');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const currentUser = (req as any).user;
    
    // Quick check if already marked as admin in session
    if (currentUser.isAdmin || currentUser.role === 'admin' || currentUser.role === 'admins') {
      console.log(`[Admin Auth] Granted via Session: User ${currentUser.displayName}`);
      return next();
    }

    const supabase = getSupabase();
    if (!supabase) {
      console.error('[Admin Auth] Error: Supabase unavailable');
      return res.status(500).json({ error: 'Database unavailable' });
    }

    const userId = String(currentUser.id || currentUser.steam_id || currentUser.steamid);
    
    // Check by both steamid and discord_id as fallback
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .or(`steamid.eq.${userId},discord_id.eq.${userId}`)
      .maybeSingle();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'admins')) {
      console.log(`[Admin Auth] Denied: User ${userId} (${currentUser.displayName}) has role "${profile?.role || 'none'}"`);
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    console.log(`[Admin Auth] Granted via DB: User ${userId} (${currentUser.displayName})`);
    next();
  };

  app.use('/api/admin', adminOnly);

  app.get('/api/admin/users', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      const { data: users, error } = await supabase
        .from('profiles')
        .select('*')
        .order('last_login', { ascending: false, nullsFirst: false });

      if (error) {
        console.error('[Admin Users] Error fetching profiles:', error);
        return res.status(500).json({ error: error.message });
      }

      // Fetch all user event teams to attach to user objects
      let eventTeamsMap: Record<string, Record<string, string>> = {};
      try {
        const { data: allEventTeams } = await supabase
          .from('user_event_teams')
          .select('steamid, event_id, team');
        
        (allEventTeams || []).forEach((row: any) => {
          if (row.steamid) {
            const key = String(row.steamid);
            if (!eventTeamsMap[key]) {
              eventTeamsMap[key] = {};
            }
            eventTeamsMap[key][row.event_id] = row.team;
          }
        });
      } catch (err) {
        console.warn('[Admin Users] Failed to load user_event_teams:', err);
      }

      const transformedUsers = (users || []).map((u: any) => {
        const effectiveId = String(u.steamid || u.discord_id || u.id || '');
        return {
          ...u,
          steamid: effectiveId,
          steam_name: u.steam_name || u.steamName || u.discord_name || u.discordName || 'User',
          steam_avatar: (u.active_avatar === 'discord' && u.discord_avatar) ? u.discord_avatar : (u.steam_avatar || u.discord_avatar || ''),
          team: u.team || 'none',
          eventTeams: eventTeamsMap[effectiveId] || (u.steamid ? eventTeamsMap[u.steamid] : {}) || {}
        };
      });

      res.json(transformedUsers);
    } catch (err) {
      console.error('[Admin Users] Exception:', err);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Helper to ensure an event's winner team is calculated and permanently saved to the event record
  async function ensureEventWinnerSaved(supabase: any, eventId: string) {
    try {
      const { data: event } = await supabase
        .from('events')
        .select('id, is_active, winner_team, description')
        .eq('id', eventId)
        .maybeSingle();

      if (!event) return null;

      let winnerTeam: string | null = event.winner_team || null;
      if (!winnerTeam && event.description) {
        const match = event.description.match(/<!--WINNER:(.*?)-->/);
        if (match && match[1]) {
          winnerTeam = match[1];
        }
      }

      if (!winnerTeam) {
        // Calculate winner team from verified submissions
        const { data: verifiedSubs } = await supabase
          .from('submissions')
          .select('user_id, points')
          .eq('event_id', eventId)
          .eq('status', 'verified');

        const { data: uets } = await supabase
          .from('user_event_teams')
          .select('steamid, team')
          .eq('event_id', eventId);

        const uetMap = new Map<string, string>();
        (uets || []).forEach((u: any) => uetMap.set(u.steamid, u.team));

        const { data: profiles } = await supabase
          .from('profiles')
          .select('steamid, team');
        const profMap = new Map<string, string>();
        (profiles || []).forEach((p: any) => profMap.set(p.steamid, p.team));

        const teamPoints: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0 };
        (verifiedSubs || []).forEach((sub: any) => {
          if (sub.user_id === 'system_notification') return;
          let team: string | null = null;
          if (sub.user_id.startsWith('team_pts_')) {
            team = sub.user_id.substring('team_pts_'.length);
          } else {
            team = uetMap.get(sub.user_id) || profMap.get(sub.user_id) || null;
          }
          if (team && teamPoints[team] !== undefined) {
            teamPoints[team] += Number(sub.points || 0);
          }
        });

        let maxPts = -1;
        let bestTeam: string | null = null;
        for (const t in teamPoints) {
          if (teamPoints[t] > maxPts && teamPoints[t] > 0) {
            maxPts = teamPoints[t];
            bestTeam = t;
          }
        }
        winnerTeam = bestTeam;

        if (winnerTeam) {
          const updatedDesc = event.description
            ? (event.description.includes('<!--WINNER:')
                ? event.description.replace(/<!--WINNER:.*?-->/, `<!--WINNER:${winnerTeam}-->`)
                : `${event.description}\n<!--WINNER:${winnerTeam}-->`)
            : `<!--WINNER:${winnerTeam}-->`;

          await supabase
            .from('events')
            .update({ winner_team: winnerTeam, description: updatedDesc })
            .eq('id', eventId);
        }
      }
      return winnerTeam;
    } catch (err) {
      console.error('Failed to ensure event winner saved:', err);
      return null;
    }
  }

  // Helper to calculate and permanently snapshot event scores into event metadata
  async function ensureEventScoresSaved(supabase: any, eventId: string) {
    if (!supabase || !eventId) return;
    try {
      const { data: event } = await supabase
        .from('events')
        .select('id, is_active, winner_team, description')
        .eq('id', eventId)
        .maybeSingle();

      if (!event) return;

      // 1. Fetch current verified submissions for this event
      const { data: verifiedSubs } = await supabase
        .from('submissions')
        .select('id, user_id, points, calculated_score')
        .eq('event_id', eventId)
        .eq('status', 'verified');

      // 2. Fetch user_event_teams & profiles
      const { data: uets } = await supabase
        .from('user_event_teams')
        .select('steamid, team')
        .eq('event_id', eventId);

      const uetMap = new Map<string, string>();
      (uets || []).forEach((u: any) => {
        if (u.steamid && u.team) uetMap.set(u.steamid, u.team);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('steamid, team');
      const profMap = new Map<string, string>();
      (profiles || []).forEach((p: any) => {
        if (p.steamid && p.team) profMap.set(p.steamid, p.team);
      });

      // Parse existing saved scores if present so we NEVER lose previously saved member/team scores
      let existingSaved: any = null;
      if (event.description && event.description.includes('<!--EVENT_SCORES:')) {
        try {
          const match = event.description.match(/<!--EVENT_SCORES:(.*?)-->/s);
          if (match && match[1]) {
            existingSaved = JSON.parse(match[1]);
          }
        } catch (e) {
          console.warn('Failed to parse existing EVENT_SCORES tag:', e);
        }
      }

      const userScores: Record<string, number> = { ...(existingSaved?.userScores || {}) };
      const teamAdjustments: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0, ...(existingSaved?.teamAdjustments || {}) };
      const teamMembers: Record<string, Set<string>> = { blue: new Set(), green: new Set(), purple: new Set(), red: new Set() };
      
      // Seed existing member teams
      if (existingSaved?.userTeams) {
        for (const [sid, t] of Object.entries(existingSaved.userTeams)) {
          if (typeof t === 'string' && teamMembers[t]) {
            teamMembers[t].add(sid);
          }
        }
      }

      (uets || []).forEach((u: any) => {
        if (u.team && teamMembers[u.team]) {
          teamMembers[u.team].add(u.steamid);
        }
      });

      // Calculate points from live verified submissions
      const liveUserScores: Record<string, number> = {};
      (verifiedSubs || []).forEach((sub: any) => {
        if (sub.user_id === 'system_notification') return;
        const pts = Number(sub.points !== undefined && sub.points !== null ? sub.points : sub.calculated_score) || 0;

        if (sub.user_id?.startsWith('team_pts_')) {
          const team = sub.user_id.substring('team_pts_'.length);
          if (teamAdjustments[team] !== undefined) {
            teamAdjustments[team] += pts;
          }
          return;
        }

        const sid = String(sub.user_id);
        liveUserScores[sid] = (liveUserScores[sid] || 0) + pts;
        const team = uetMap.get(sid) || profMap.get(sid);
        if (team && teamMembers[team]) {
          teamMembers[team].add(sid);
        }
      });

      // Merge live user scores (max of existing saved and live)
      const userTeams: Record<string, string> = { ...(existingSaved?.userTeams || {}) };
      for (const [sid, pts] of Object.entries(liveUserScores)) {
        userScores[sid] = Math.max(userScores[sid] || 0, pts);
        const team = uetMap.get(sid) || profMap.get(sid) || userTeams[sid] || 'none';
        if (team !== 'none') userTeams[sid] = team;
      }

      // Also ensure any users from uets are mapped into userTeams
      (uets || []).forEach((u: any) => {
        if (u.steamid && u.team && u.team !== 'none') {
          userTeams[u.steamid] = u.team;
        }
      });

      // Calculate team totals
      const teamTotals: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0 };
      ['blue', 'green', 'purple', 'red'].forEach((t) => {
        let sum = 0;
        teamMembers[t].forEach((sid) => {
          sum += (userScores[sid] || 0);
        });
        teamTotals[t] = Math.max(existingSaved?.teamTotals?.[t] || 0, sum + (teamAdjustments[t] || 0));
      });

      // Determine winner team if not set
      let winnerTeam = event.winner_team || null;
      if (!winnerTeam) {
        let maxPts = -1;
        for (const t in teamTotals) {
          if (teamTotals[t] > maxPts && teamTotals[t] > 0) {
            maxPts = teamTotals[t];
            winnerTeam = t;
          }
        }
      }

      const newSnapshot = {
        teamTotals,
        userScores,
        userTeams,
        teamAdjustments
      };

      const snapshotStr = `<!--EVENT_SCORES:${JSON.stringify(newSnapshot)}-->`;
      let updatedDesc = event.description || '';
      if (updatedDesc.includes('<!--EVENT_SCORES:')) {
        updatedDesc = updatedDesc.replace(/<!--EVENT_SCORES:.*?-->/s, snapshotStr);
      } else {
        updatedDesc = updatedDesc ? `${updatedDesc}\n${snapshotStr}` : snapshotStr;
      }

      if (winnerTeam) {
        const winnerStr = `<!--WINNER:${winnerTeam}-->`;
        if (updatedDesc.includes('<!--WINNER:')) {
          updatedDesc = updatedDesc.replace(/<!--WINNER:.*?-->/, winnerStr);
        } else {
          updatedDesc = `${updatedDesc}\n${winnerStr}`;
        }
      }

      await supabase
        .from('events')
        .update({
          winner_team: winnerTeam || event.winner_team,
          description: updatedDesc
        })
        .eq('id', eventId);

      console.log(`[EnsureEventScoresSaved] Successfully saved score snapshot for event ${eventId}`);
    } catch (err) {
      console.error(`[EnsureEventScoresSaved] Error saving scores for event ${eventId}:`, err);
    }
  }

  // Helper to sync points
  async function syncUserPoints(supabase: any, steamid: string) {
    try {
      console.log(`[Sync] Starting sync for user ${steamid}`);
      
      let { data: activeEvent, error: eventError } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();

      if (eventError) {
        console.error(`[Sync] Error fetching active event during sync for ${steamid}:`, eventError);
      }

      if (!activeEvent) {
        const { data: recentEvent } = await supabase
          .from('events')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        activeEvent = recentEvent;
      }

      let totalPoints = 0;

      if (activeEvent) {
        // Sum all verified submissions (games, screenshot points, bingo points, etc.) for active event or null event_id
        const { data: verifiedSubmissions, error: subError } = await supabase
          .from('submissions')
          .select('points, calculated_score, id, status, user_id, event_id, game_name')
          .eq('user_id', steamid)
          .eq('status', 'verified')
          .or(`event_id.eq.${activeEvent.id},event_id.is.null`);

        if (subError) {
          console.error(`[Sync] Error fetching submissions for ${steamid}:`, subError);
          throw subError;
        }

        console.log(`[Sync] Found ${verifiedSubmissions?.length || 0} verified submissions in event ${activeEvent.id} for ${steamid}`);
        
        for (const sub of (verifiedSubmissions || [])) {
          if (sub.game_name === 'Event Update') continue; // Skip system notification row
          const pts = Number(sub.points !== undefined && sub.points !== null ? sub.points : sub.calculated_score) || 0;
          totalPoints += Math.round(pts);
        }
      } else {
        const { data: allVerified } = await supabase
          .from('submissions')
          .select('points, calculated_score, game_name')
          .eq('user_id', steamid)
          .eq('status', 'verified');

        for (const sub of (allVerified || [])) {
          if (sub.game_name === 'Event Update') continue;
          const pts = Number(sub.points !== undefined && sub.points !== null ? sub.points : sub.calculated_score) || 0;
          totalPoints += Math.round(pts);
        }
      }

      console.log(`[Sync] Calculated totalPoints: ${totalPoints} for user ${steamid}`);

      const { data: updateResult, error: profileError } = await supabase
        .from('profiles')
        .update({ points: totalPoints })
        .eq('steamid', steamid)
        .select();

      if (profileError) {
        console.error(`[Sync] Error updating profile for ${steamid}:`, profileError);
      } else {
        console.log(`[Sync] Successfully updated profile for ${steamid}. New data:`, updateResult?.[0]);
      }
        
      return totalPoints;
    } catch (err) {
      console.error('Failed to sync points for user:', steamid, err);
      return null;
    }
  }

  async function resyncAllUsersPoints(supabase: any) {
    try {
      const { data: users } = await supabase
        .from('profiles')
        .select('steamid')
        .neq('steamid', 'system_notification');

      if (users && users.length > 0) {
        for (const u of users) {
          const effectiveId = String(u.steamid || '');
          if (effectiveId) {
            await syncUserPoints(supabase, effectiveId);
          }
        }
      }
    } catch (err) {
      console.error('Failed to resync all users points:', err);
    }
  }

  app.get('/api/leaderboard/users', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      let { data: activeEvent } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();

      if (!activeEvent) {
        const { data: recentEvent } = await supabase
          .from('events')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        activeEvent = recentEvent;
      }

      // Fetch all verified submissions for active event
      let subQuery = supabase
        .from('submissions')
        .select('user_id, points, calculated_score, game_name')
        .eq('status', 'verified');

      if (activeEvent) {
        subQuery = subQuery.or(`event_id.eq.${activeEvent.id},event_id.is.null`);
      }

      const { data: verifiedSubs } = await subQuery;

      const userPointsMap: Record<string, number> = {};
      (verifiedSubs || []).forEach((sub: any) => {
        if (!sub.user_id || sub.user_id === 'system_notification' || sub.user_id.startsWith('team_pts_')) return;
        if (sub.game_name === 'Event Update') return;
        const pts = Math.round(Number(sub.points !== undefined && sub.points !== null ? sub.points : sub.calculated_score) || 0);
        userPointsMap[sub.user_id] = (userPointsMap[sub.user_id] || 0) + pts;
      });

      // Publicly return profiles assigned to a team
      const { data: users, error } = await supabase
        .from('profiles')
        .select('steamid, steam_name, steam_avatar, discord_id, discord_name, discord_avatar, active_avatar, team, status, points, role')
        .not('team', 'is', null)
        .neq('team', 'none');

      if (error) return res.status(500).json({ error: error.message });

      const transformedUsers = (users || []).map((u: any) => {
        let finalAvatar = u.steam_avatar;
        if (u.active_avatar === 'discord' && u.discord_avatar) {
          finalAvatar = u.discord_avatar;
        }
        const calcPoints = userPointsMap[u.steamid] !== undefined ? userPointsMap[u.steamid] : (u.points || 0);
        return {
          ...u,
          points: calcPoints,
          steam_avatar: finalAvatar
        };
      });

      transformedUsers.sort((a, b) => b.points - a.points);
      
      res.json(transformedUsers);
    } catch (err: any) {
      console.error('Failed to fetch leaderboard users:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/leaderboard/games', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      const { eventId } = req.query;
      let targetEventId = eventId;

      if (!targetEventId) {
        // Get active event if no eventId provided
        const { data: event } = await supabase
          .from('events')
          .select('id')
          .eq('is_active', true)
          .maybeSingle();

        if (!event) return res.json([]);
        targetEventId = event.id;
      }

      // 2. Get all submissions for this event
      const { data: submissions, error } = await supabase
        .from('submissions')
        .select('game_id, game_name, game_image, steam_appid, user_id')
        .eq('event_id', targetEventId);

      if (error) throw error;
      if (!submissions || submissions.length === 0) return res.json([]);

      // 3. Fetch user profiles for these submissions
      const userIds = Array.from(new Set(submissions.map((s: any) => s.user_id)));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('steamid, steam_name, steam_avatar')
        .in('steamid', userIds);

      const profileMap: Record<string, any> = {};
      (profiles || []).forEach(p => { profileMap[p.steamid] = p; });

      // 4. Group by game
      const gamesMap = new Map();
      submissions.forEach((s: any) => {
        const key = s.game_id;
        if (!gamesMap.has(key)) {
          gamesMap.set(key, {
            game_id: s.game_id,
            game_name: s.game_name,
            game_image: s.game_image,
            steam_appid: s.steam_appid,
            users: []
          });
        }
        const game = gamesMap.get(key);
        const profile = profileMap[s.user_id];
        if (profile && !game.users.find((u: any) => u.steamid === profile.steamid)) {
          game.users.push(profile);
        }
      });

      res.json(Array.from(gamesMap.values()));
    } catch (err) {
      console.error('Failed to fetch games leaderboard:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/leaderboard/event/:eventId', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    const { eventId } = req.params;

    try {
      // 1. Fetch event metadata
      let { data: event, error: eventErr } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .maybeSingle();

      if (eventErr || !event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      // 1.5 Parse saved score snapshot if available
      let savedScores: any = null;
      if (event.description && event.description.includes('<!--EVENT_SCORES:')) {
        try {
          const match = event.description.match(/<!--EVENT_SCORES:(.*?)-->/s);
          if (match && match[1]) {
            savedScores = JSON.parse(match[1]);
          }
        } catch (e) {
          console.warn('Failed to parse saved EVENT_SCORES:', e);
        }
      }

      // If event is not active and missing snapshot, generate & save snapshot now
      if (!event.is_active && !savedScores) {
        await ensureEventScoresSaved(supabase, eventId);
        const { data: reFetchedEv } = await supabase.from('events').select('description').eq('id', eventId).maybeSingle();
        if (reFetchedEv?.description && reFetchedEv.description.includes('<!--EVENT_SCORES:')) {
          try {
            const match = reFetchedEv.description.match(/<!--EVENT_SCORES:(.*?)-->/s);
            if (match && match[1]) savedScores = JSON.parse(match[1]);
          } catch (e) {}
        }
      }

      // 2. Fetch all verified submissions for this event (including null event_id fallback if active)
      const { data: activeEvent } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();

      const isCurrentOrActive = activeEvent ? activeEvent.id === eventId : event.is_active;

      let subQuery = supabase
        .from('submissions')
        .select('*')
        .eq('status', 'verified');

      if (isCurrentOrActive) {
        subQuery = subQuery.or(`event_id.eq.${eventId},event_id.is.null`);
      } else {
        subQuery = subQuery.eq('event_id', eventId);
      }

      const { data: eventSubs, error: subErr } = await subQuery;
      if (subErr) throw subErr;

      // 3. Fetch user_event_teams for this event
      const { data: uets } = await supabase
        .from('user_event_teams')
        .select('steamid, team')
        .eq('event_id', eventId);

      const uetMap = new Map<string, string>();
      (uets || []).forEach((u: any) => {
        if (u.steamid) uetMap.set(u.steamid, u.team);
      });

      // 4. Fetch profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('steamid, steam_name, steam_avatar, discord_name, discord_avatar, active_avatar, team, status, role');

      const profileMap = new Map<string, any>();
      (profiles || []).forEach((p: any) => {
        if (p.steamid) profileMap.set(p.steamid, p);
      });

      // 5. Calculate user event points & team adjustments
      const userEventPoints: Record<string, number> = {};
      const teamAdjustments: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0, ...(savedScores?.teamAdjustments || {}) };
      const adjustmentLogs: any[] = [];

      (eventSubs || []).forEach((sub: any) => {
        if (sub.user_id === 'system_notification') return;

        const pts = Number(sub.points !== undefined && sub.points !== null ? sub.points : sub.calculated_score) || 0;

        if (sub.user_id?.startsWith('team_pts_')) {
          const team = sub.user_id.substring('team_pts_'.length);
          if (teamAdjustments[team] !== undefined) {
            teamAdjustments[team] += pts;
          }
          adjustmentLogs.push({
            id: sub.id,
            user_id: sub.user_id,
            notes: sub.notes || 'Bonus points awarded',
            points: pts,
            created_at: sub.created_at
          });
          return;
        }

        const steamid = String(sub.user_id);
        userEventPoints[steamid] = (userEventPoints[steamid] || 0) + pts;
      });

      // Combine with savedScores if present
      if (savedScores?.userScores) {
        for (const [sid, savedPts] of Object.entries(savedScores.userScores)) {
          userEventPoints[sid] = Math.max(userEventPoints[sid] || 0, Number(savedPts) || 0);
        }
      }

      // 6. Determine user teams for this event
      const teamMembers: Record<string, Set<string>> = { blue: new Set(), green: new Set(), purple: new Set(), red: new Set() };
      
      if (savedScores?.userTeams) {
        for (const [sid, t] of Object.entries(savedScores.userTeams)) {
          if (typeof t === 'string' && teamMembers[t]) {
            teamMembers[t].add(sid);
          }
        }
      }

      (uets || []).forEach((u: any) => {
        if (u.team && teamMembers[u.team]) {
          teamMembers[u.team].add(u.steamid);
        }
      });

      Object.keys(userEventPoints).forEach((steamid) => {
        const team = uetMap.get(steamid) || savedScores?.userTeams?.[steamid] || profileMap.get(steamid)?.team;
        if (team && teamMembers[team]) {
          teamMembers[team].add(steamid);
        }
      });

      // 7. Build User Standings
      const usersList: any[] = [];
      const allUserIdsInEvent = new Set([
        ...Object.keys(userEventPoints),
        ...(uets || []).map((u: any) => u.steamid),
        ...Object.keys(savedScores?.userTeams || {}),
        ...Object.keys(savedScores?.userScores || {})
      ]);

      allUserIdsInEvent.forEach((steamid) => {
        const prof = profileMap.get(steamid);
        const userTeam = uetMap.get(steamid) || savedScores?.userTeams?.[steamid] || prof?.team || 'none';
        const points = userEventPoints[steamid] || 0;
        let finalAvatar = prof?.steam_avatar || '';
        if (prof?.active_avatar === 'discord' && prof?.discord_avatar) {
          finalAvatar = prof.discord_avatar;
        }

        if (prof || points > 0) {
          usersList.push({
            steamid,
            steam_name: prof?.steam_name || 'User',
            steam_avatar: finalAvatar,
            discord_name: prof?.discord_name || null,
            team: userTeam,
            status: prof?.status || '',
            role: prof?.role || 'user',
            points: points
          });
        }
      });

      usersList.sort((a, b) => b.points - a.points);

      // All users ranked by points
      const allUsers = usersList.map((u, idx) => ({
        ...u,
        rank: idx + 1
      }));

      // 8. Calculate Team Standings
      const teamStandings = ['blue', 'purple', 'green', 'red'].map((t) => {
        let userPointsSum = 0;
        teamMembers[t].forEach((sid) => {
          userPointsSum += (userEventPoints[sid] || 0);
        });
        const liveTotal = userPointsSum + (teamAdjustments[t] || 0);
        const totalTeamPoints = Math.max(liveTotal, Number(savedScores?.teamTotals?.[t]) || 0);
        return {
          team: t,
          points: totalTeamPoints,
          members: teamMembers[t].size,
          rank: 1
        };
      });

      teamStandings.sort((a, b) => b.points - a.points);
      teamStandings.forEach((s, idx) => { s.rank = idx + 1; });

      res.json({
        event: {
          id: event.id,
          title: event.title,
          is_active: event.is_active,
          winner_team: event.winner_team,
          start_date: event.start_date,
          end_date: event.end_date,
          description: event.description
        },
        standings: teamStandings,
        topUsers: allUsers,
        totalParticipants: usersList.length,
        adjustments: adjustmentLogs
      });
    } catch (err: any) {
      console.error('Failed to fetch event leaderboard:', err);
      res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  });

  app.get('/api/users/:steamid', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    const { steamid } = req.params;
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('steamid, steam_name, steam_avatar, discord_name, discord_avatar, discord_id, active_avatar, team, status, points, role, created_at')
      .eq('steamid', steamid)
      .single();

    if (error) return res.status(404).json({ error: 'User not found' });

    let eventTeams: Record<string, string> = {};
    try {
      const { data: eventTeamsData } = await supabase
        .from('user_event_teams')
        .select('event_id, team')
        .eq('steamid', steamid);

      (eventTeamsData || []).forEach((row: any) => {
        eventTeams[row.event_id] = row.team;
      });
    } catch (uetError) {
      console.warn('[Get User] Could not fetch user_event_teams:', uetError);
    }

    // Determine final avatar output based on choice
    let finalAvatar = profile.steam_avatar;
    if (profile.active_avatar === 'discord' && profile.discord_avatar) {
      finalAvatar = profile.discord_avatar;
    }
    
    // Transform to frontend format
    const transformedUser = {
      uid: profile.steamid,
      steamId: profile.steamid,
      steamName: profile.steam_name,
      steamAvatar: finalAvatar, // Respect preference
      discordName: profile.discord_name,
      discordAvatar: profile.discord_avatar,
      discordId: profile.discord_id,
      active_avatar: profile.active_avatar || 'steam',
      team: profile.team,
      status: profile.status,
      points: profile.points,
      role: profile.role,
      isAdmin: profile.role === 'admin' || profile.role === 'admins',
      createdAt: profile.created_at,
      eventTeams: eventTeams
    };
    
    res.json(transformedUser);
  });

  app.post('/api/admin/update-user-team', async (req, res) => {
    const { targetSteamId, targetSteamIds, team, eventId } = req.body;
    const ids: string[] = Array.isArray(targetSteamIds) && targetSteamIds.length > 0
      ? targetSteamIds.map(String)
      : (targetSteamId ? [String(targetSteamId)] : []);

    console.log('[Admin] Update Team Start:', { ids, team, eventId });
    
    const supabase = getSupabase();
    if (!supabase) {
      console.error('[Admin] Database unavailable');
      return res.status(500).json({ error: 'Database unavailable' });
    }

    if (ids.length === 0) {
      return res.status(400).json({ error: 'No user ID provided' });
    }

    try {
      // If team is 'none', we store it as null in DB
      const dbTeam = team === 'none' ? null : team;
      
      // Get the current active event
      const { data: activeEvent } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();

      const isActiveEvent = eventId ? (activeEvent?.id === eventId) : true;
      const targetEventId = eventId || activeEvent?.id;

      let updateData = null;
      if (isActiveEvent) {
        // If updating active event, update profiles.team for all specified users
        console.log('[Admin] Updating active event team on profiles:', { ids, dbTeam });
        const { error: profileError, data: profData } = await supabase
          .from('profiles')
          .update({ team: dbTeam })
          .in('steamid', ids)
          .select();

        if (profileError) {
          console.error('[Admin] Update profile error:', profileError.message);
          return res.status(500).json({ 
            error: profileError.message, 
            details: profileError.details,
            hint: profileError.hint 
          });
        }
        updateData = profData;
      }

      // Record / update user team assignment in user_event_teams for the event
      if (targetEventId) {
        try {
          if (team === 'none') {
            const { error: delErr } = await supabase
              .from('user_event_teams')
              .delete()
              .in('steamid', ids)
              .eq('event_id', targetEventId);
            
            if (delErr) {
              console.warn('[Admin] Failed to delete user_event_teams batch:', delErr);
            } else {
              console.log(`[Admin] Successfully cleared event-team association for ${ids.length} users in event ${targetEventId}`);
            }
          } else {
            const uetRows = ids.map(id => ({
              steamid: id,
              event_id: targetEventId,
              team: dbTeam
            }));

            const { error: upsertErr } = await supabase
              .from('user_event_teams')
              .upsert(uetRows, { onConflict: 'steamid,event_id' });

            if (upsertErr) {
              console.error('[Admin] Error upserting user_event_teams:', upsertErr);
              return res.status(500).json({ error: 'Failed to record user event team', details: upsertErr.message });
            }
            console.log(`[Admin] Successfully recorded team ${dbTeam} for event ${targetEventId} for ${ids.length} users in user_event_teams`);
          }
        } catch (ueErr) {
          console.error('[Admin] Error updating user_event_teams:', ueErr);
        }
      }
      
      console.log(`[Admin] Successfully updated team for ${ids.length} user(s). Result:`, updateData);
      res.json({ success: true, count: ids.length, updated: updateData });
    } catch (err) {
      console.error('[Admin] Internal Exception:', err);
      res.status(500).json({ error: 'Internal server error', details: String(err) });
    }
  });

  app.post('/api/logout', (req, res) => {
    (req as any).logout(() => res.json({ success: true }));
  });

  app.get('/api/submissions', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentUser = (req as any).user;
    const { userId: targetUserId } = req.query;
    
    // Default to current user if no userId provided
    const steamId = targetUserId ? String(targetUserId) : String(currentUser.id || currentUser.steamid || currentUser.steam_id);
    
    const supabase = getSupabase();
    if (!supabase) return res.json([]);

    try {
      let query = supabase.from('submissions').select('*');
      if (targetUserId) {
        query = query.eq('user_id', steamId);
      } else {
        query = query.or(`user_id.eq.${steamId},user_id.eq.system_notification`);
      }
      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
      res.status(500).json({ error: 'Failed to fetch submissions' });
    }
  });

  // --- ADD THIS HELPER FUNCTION ---
  async function translateIgdbToSteam(igdbId: string | number) {
    try {
      const token = await getIGDBToken();
      const response = await fetch('https://api.igdb.com/v4/external_games', {
        method: 'POST',
        headers: {
          'Client-ID': process.env.IGDB_CLIENT_ID!,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain'
        },
        // Category 1 = Steam
        body: `fields uid; where game = ${igdbId} & category = 1; limit 1;`
      });

      if (!response.ok) return null;
      
      const data: any = await response.json();
      if (Array.isArray(data) && data.length > 0 && data[0].uid) {
        console.log(`[IGDB Translation] Translated IGDB ID ${igdbId} to Steam ID ${data[0].uid}`);
        return parseInt(data[0].uid);
      }
      return null;
    } catch (err) {
      console.error('[IGDB Translation] Failed to translate ID:', err);
      return null;
    }
  }

  // --- REPLACE YOUR EXISTING /api/submissions POST ROUTE WITH THIS ---
  app.post('/api/submissions', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentUser = (req as any).user;
    const steamId = String(currentUser.id || currentUser.steamid || currentUser.steam_id);
    const { 
      gameId, 
      gameTitle,
      game_title,
      gameImage, 
      achievements, 
      hours, 
      achievementsBefore,
      hoursBefore,
      completionStatus,
      beatenPrevious,
      beaten_previous,
      notes,
      platform,
      steamAppId,
      steam_appid, // <-- Added the correct frontend variable name
      hltbId
    } = req.body;

    const finalBeatenPrevious = beatenPrevious || beaten_previous || 'no';

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      // ---> THE MAGIC HAPPENS HERE <---
      // Check for either naming convention. If we ALREADY have a Steam ID, use it immediately!
      let finalSteamAppId = steam_appid || steamAppId; 
      
      // ONLY translate if the finalSteamAppId is still empty
      if (!finalSteamAppId && gameId) {
         finalSteamAppId = await translateIgdbToSteam(gameId);
      }

      // Sync the game to the games table first (using our translated or directly grabbed finalSteamAppId)
      const internalGameId = await getAndSyncGameData(supabase, gameTitle || game_title, gameId, gameImage, finalSteamAppId);
      // Server-side point calculation
      let serverMultiplier = 1.0;
      const numHours = parseFloat(hours) || 0;
      const hoursBeforeNum = parseFloat(hoursBefore) || 0;
      const adjustedPlayHours = Math.max(0, numHours - hoursBeforeNum);
      // New Math Logic: Short (1x), Medium (2x), Long (3x), Very Long (4x)
      if (adjustedPlayHours < 8) serverMultiplier = 1.0;
      else if (adjustedPlayHours < 15) serverMultiplier = 2.0;
      else if (adjustedPlayHours < 25) serverMultiplier = 3.0;
      else serverMultiplier = 4.0;

      let serverPoints = Math.round((parseInt(achievements) || 0) * serverMultiplier);
      
      const effectiveStatus = (completionStatus === 'beaten' && finalBeatenPrevious === 'yes') ? 'unfinished' : (completionStatus || 'unfinished');

      // Completion Bonus: +30 for 'completed', +15 for 'beaten' in games with achievements
      if (effectiveStatus === 'completed') {
        serverPoints += 30;
      } else if (effectiveStatus === 'beaten') {
        serverPoints += 15;
      }

      // Check if this is a game with no achievements
      const meta = parseNotesMeta(notes || '');
      if (meta.hasNoAchievements) {
        const { data: syncedGame } = await supabase.from('games').select('hltb_main, hltb_extras').eq('id', internalGameId).maybeSingle();
        const gameHltbMain = syncedGame?.hltb_main || 0;
        const gameHltbExtras = syncedGame?.hltb_extras || 0;
        const levelVal = meta.level !== undefined ? meta.level : 2;
        const hoursBeforeNum = parseFloat(hoursBefore) || 0;
        const finalPlayTime = Math.max(0, numHours - hoursBeforeNum);
        serverPoints = calculateNonAchievementPoints(levelVal, finalPlayTime, gameHltbMain, gameHltbExtras, effectiveStatus);
      }

      // Find active event
      const { data: activeEvent, error: eventError } = await supabase.from('events').select('id').eq('is_active', true).maybeSingle();
      if (eventError) console.error('Error fetching active event:', eventError);

      // 1. Check for duplicate submission (same user, game, and event)
      let existingSubId: string | null = null;
      if (activeEvent) {
        const { data: existingSub } = await supabase
          .from('submissions')
          .select('id')
          .eq('user_id', steamId)
          .eq('game_id', internalGameId)
          .eq('event_id', activeEvent.id)
          .maybeSingle();

        if (existingSub) {
          existingSubId = existingSub.id;
        }
      }

      // Get the latest profile details to make sure they are saved on submission
      let { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('steamid', steamId)
        .maybeSingle();

      if (!userProfile) {
        const { data: altProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('discord_id', steamId.replace('discord_', ''))
          .maybeSingle();
        if (altProfile) userProfile = altProfile;
      }

      let displayAvatar = null;
      let displayName = null;
      if (userProfile) {
        if (userProfile.active_avatar === 'discord' && userProfile.discord_avatar) {
          displayAvatar = userProfile.discord_avatar;
        } else {
          displayAvatar = userProfile.steam_avatar || userProfile.discord_avatar;
        }
        displayName = userProfile.steam_name || userProfile.discord_name;
      }

      // Fallbacks to session info if profile query somehow failed or is empty
      if (!displayName) {
        displayName = currentUser.displayName || currentUser.steam_name || currentUser.discord_name || 'Member';
      }
      if (!displayAvatar) {
        displayAvatar = currentUser.steam_avatar || currentUser.discord_avatar || (currentUser.photos?.[0]?.value) || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
      }

      const submissionData: any = {
        user_id: steamId,
        user_name: displayName,
        user_avatar: displayAvatar,
        game_id: internalGameId,
        game_name: gameTitle || game_title || "Unknown Game", 
        game_image: gameImage,
        achievements_during: achievements || 0,
        hours_during: hours || 0,
        achievements_before: achievementsBefore || 0,
        hours_before: hoursBefore || 0,
        multiplier: serverMultiplier,
        calculated_score: serverPoints,
        completion_status: completionStatus || 'beaten',
        beaten_previous: finalBeatenPrevious,
        platform: platform || 'Others',
        steam_appid: finalSteamAppId || null, // Saved to DB here!
        points: serverPoints, 
        notes: notes || '',
        status: 'pending',
        event_id: activeEvent?.id || null,
        created_at: new Date().toISOString()
      };

      if (existingSubId) {
        submissionData.rejection_reason = null;
        submissionData.verifier_id = null;
      }

      let data, error;
      if (existingSubId) {
        console.log(`[Submission] Existing submission found (${existingSubId}). Overwriting/updating instead of duplicating.`);
        const updateRes = await supabase
          .from('submissions')
          .update(submissionData)
          .eq('id', existingSubId)
          .select()
          .single();
        data = updateRes.data;
        error = updateRes.error;
      } else {
        console.log('Attempting submission insert:', submissionData);
        const insertRes = await supabase
          .from('submissions')
          .insert(submissionData)
          .select()
          .single();
        data = insertRes.data;
        error = insertRes.error;
      }

      if (error) {
        console.error('Supabase submission insert error:', error);
        return res.status(500).json({ error: error.message, details: error.details, hint: error.hint });
      }
      
      // Sync points to ensure profile is up to date (this might just set them to current verified total)
      await syncUserPoints(supabase, steamId);

      res.json(data);
    } catch (err) {
      console.error('Failed to create submission exception:', err);
      res.status(500).json({ error: 'Failed to create submission', details: String(err) });
    }
  });

  app.put('/api/submissions/:id', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const currentUser = (req as any).user;
    const steamId = String(currentUser.id || currentUser.steamid || currentUser.steam_id);
    const { 
      achievements, 
      hours, 
      achievementsBefore,
      hoursBefore,
      completionStatus,
      beatenPrevious,
      beaten_previous,
      notes 
    } = req.body;

    const finalBeatenPrevious = beatenPrevious || beaten_previous || 'no';

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      // 1. Verify ownership
      const { data: sub, error: fetchError } = await supabase
        .from('submissions')
        .select('*')
        .eq('id', id)
        .eq('user_id', steamId)
        .single();

      if (fetchError || !sub) {
        return res.status(404).json({ error: 'Submission not found or unauthorized' });
      }

      // 2. Recalculate points
      let serverMultiplier = 1.0;
      const numHours = parseFloat(hours) || 0;
      const hoursBeforeNum = parseFloat(hoursBefore) || 0;
      const adjustedPlayHours = Math.max(0, numHours - hoursBeforeNum);
      // Match multiplier logic: <8=1x, <15=2x, <25=3x, >=25=4x
      if (adjustedPlayHours < 8) serverMultiplier = 1.0;
      else if (adjustedPlayHours < 15) serverMultiplier = 2.0;
      else if (adjustedPlayHours < 25) serverMultiplier = 3.0;
      else serverMultiplier = 4.0;

      let serverPoints = Math.round((parseInt(achievements) || 0) * serverMultiplier);
      
      const effectiveStatus = (completionStatus === 'beaten' && finalBeatenPrevious === 'yes') ? 'unfinished' : (completionStatus || 'unfinished');

      if (effectiveStatus === 'completed') {
        serverPoints += 30;
      } else if (effectiveStatus === 'beaten') {
        serverPoints += 15;
      }

      // Check if this is a game with no achievements
      const meta = parseNotesMeta(notes || '');
      if (meta.hasNoAchievements) {
        const { data: syncedGame } = await supabase.from('games').select('hltb_main, hltb_extras').eq('id', sub.game_id).maybeSingle();
        const gameHltbMain = syncedGame?.hltb_main || 0;
        const gameHltbExtras = syncedGame?.hltb_extras || 0;
        const levelVal = meta.level !== undefined ? meta.level : 2;
        const hoursBeforeNum = parseFloat(hoursBefore) || 0;
        const finalPlayTime = Math.max(0, numHours - hoursBeforeNum);
        serverPoints = calculateNonAchievementPoints(levelVal, finalPlayTime, gameHltbMain, gameHltbExtras, effectiveStatus);
      }

      // Get the latest profile details to make sure they are saved on update/revision too
      let { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('steamid', steamId)
        .maybeSingle();

      if (!userProfile) {
        const { data: altProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('discord_id', steamId.replace('discord_', ''))
          .maybeSingle();
        if (altProfile) userProfile = altProfile;
      }

      let displayAvatar = userProfile?.steam_avatar || userProfile?.discord_avatar || currentUser.steam_avatar || currentUser.discord_avatar || sub.user_avatar || '';
      if (userProfile?.active_avatar === 'discord' && userProfile?.discord_avatar) {
        displayAvatar = userProfile.discord_avatar;
      }

      let displayName = userProfile?.steam_name || userProfile?.discord_name || currentUser.displayName || currentUser.steam_name || currentUser.discord_name || sub.user_name || 'Member';

      const { data, error } = await supabase
        .from('submissions')
        .update({
          user_name: displayName || sub.user_name || 'Unknown User',
          user_avatar: displayAvatar || sub.user_avatar || '',
          achievements_during: achievements || 0,
          hours_during: hours || 0,
          achievements_before: achievementsBefore || 0,
          hours_before: hoursBefore || 0,
          multiplier: serverMultiplier,
          calculated_score: serverPoints,
          completion_status: completionStatus || sub.completion_status || 'beaten',
          beaten_previous: finalBeatenPrevious,
          points: serverPoints,
          notes: notes || '',
          status: 'pending', // Reset to pending for admin re-review
          rejection_reason: null // Clear old rejection
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Sync points since status has reset to pending
      await syncUserPoints(supabase, steamId);

      res.json(data);
    } catch (err) {
      console.error('Failed to update submission:', err);
      res.status(500).json({ error: 'Failed to update submission' });
    }
  });

  app.delete('/api/submissions/:id', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const currentUser = (req as any).user;
    const steamId = String(currentUser.id || currentUser.steamid || currentUser.steam_id);
    
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      // Verify ownership
      const { data: sub, error: fetchError } = await supabase
        .from('submissions')
        .select('*')
        .eq('id', id)
        .eq('user_id', steamId)
        .single();

      if (fetchError || !sub) {
        return res.status(404).json({ error: 'Submission not found or unauthorized' });
      }

      if (sub.event_id) {
        await ensureEventWinnerSaved(supabase, sub.event_id);
        await ensureEventScoresSaved(supabase, sub.event_id);
      }

      const { error } = await supabase
        .from('submissions')
        .delete()
        .eq('id', id)
        .eq('user_id', steamId);

      if (error) throw error;
      
      // Sync points in case it was a verified submission (unlikely for user delete but safe)
      await syncUserPoints(supabase, steamId);

      res.json({ success: true });
    } catch (err) {
      console.error('Failed to delete submission:', err);
      res.status(500).json({ error: 'Failed to delete submission' });
    }
  });

  app.get('/api/admin/submissions', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      console.log('[Admin] Fetching all submissions enriched with teams...');
      
      // Fetch submissions
      const { data: submissions, error: subError } = await supabase
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (subError) {
        console.error('[Admin] submissions fetch error:', subError);
        return res.status(500).json({ error: subError.message });
      }

      if (!submissions || submissions.length === 0) {
        console.log('[Admin] No submissions found.');
        return res.json([]);
      }

      // Separately fetch profiles and games metadata
      const userIds = Array.from(new Set(submissions.map((s: any) => s.user_id)));
      const gameIds = Array.from(new Set(submissions.map((s: any) => s.game_id)));
      
      const [profileRes, gamesRes] = await Promise.all([
        supabase.from('profiles').select('steamid, discord_id, team, steam_name, steam_avatar, discord_name, discord_avatar, active_avatar'),
        supabase.from('games').select('id, total_achievements, hltb_main, hltb_extras, hltb_completionist').in('id', gameIds)
      ]);

      const allProfiles = profileRes.data || [];
      const profileMap: Record<string, any> = {};
      allProfiles.forEach((p: any) => {
        if (p.steamid) profileMap[String(p.steamid)] = p;
        if (p.discord_id) profileMap[String(p.discord_id)] = p;
      });

      const totalAchMap: Record<string, number> = {};
      const hltbMainMap: Record<string, number> = {};
      const hltbExtrasMap: Record<string, number> = {};
      const hltbCompMap: Record<string, number> = {};
      (gamesRes.data || []).forEach((g: any) => {
        totalAchMap[g.id] = g.total_achievements || 0;
        hltbMainMap[g.id] = g.hltb_main || 0;
        hltbExtrasMap[g.id] = g.hltb_extras || 0;
        hltbCompMap[g.id] = g.hltb_completionist || 0;
      });

      const enriched = submissions.map((s: any) => {
        const uId = String(s.user_id || '');
        const p = profileMap[uId] || allProfiles.find((prof: any) => 
          String(prof.steamid) === uId || 
          String(prof.discord_id) === uId || 
          (uId.startsWith('discord_') && String(prof.discord_id) === uId.replace('discord_', ''))
        );
        
        let finalName = p?.steam_name || p?.discord_name || s.user_name;
        if (!finalName || finalName === 'Unknown User' || finalName === 'Steam User') {
          finalName = `Member (${uId.length > 8 ? uId.slice(-6) : uId})`;
        }

        let finalAvatar = '';
        if (p) {
          if (p.active_avatar === 'discord' && p.discord_avatar) {
            finalAvatar = p.discord_avatar;
          } else {
            finalAvatar = p.steam_avatar || p.discord_avatar || '';
          }
        }
        if (!finalAvatar) {
          finalAvatar = s.user_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
        }

        return {
          ...s,
          user_name: finalName,
          user_avatar: finalAvatar,
          userTeam: p?.team || 'none',
          totalAchievements: totalAchMap[s.game_id] || 0,
          hltb_main: hltbMainMap[s.game_id] || 0,
          hltb_extras: hltbExtrasMap[s.game_id] || 0,
          hltb_completionist: hltbCompMap[s.game_id] || 0
        };
      });

      console.log(`[Admin] Successfully returning ${enriched.length} submissions.`);
      res.json(enriched);
    } catch (err) {
      console.error('[Admin] Internal error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/verify-submission', async (req, res) => {
    const { submissionId, status, points, rejectionReason } = req.body;
    const currentUser = (req as any).user;
    const steamId = String(currentUser.id || currentUser.steamid || currentUser.steam_id);
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {

      // Start a "transaction" via sequence of calls (Supabase JS doesn't have true transactions easily for this)
      // 1. Get the submission to find out who submitted it
      const { data: sub, error: subError } = await supabase.from('submissions').select('*').eq('id', submissionId).single();
      if (subError || !sub) return res.status(404).json({ error: 'Submission not found' });

      // 2. Update submission status and optionally details
      const { error: updateSubError } = await supabase.from('submissions').update({
        status,
        points: status === 'verified' ? points : 0,
        rejection_reason: status === 'rejected' ? rejectionReason : null,
        verifier_id: steamId,
        // Optional modifiers
        hours_during: req.body.hours !== undefined ? req.body.hours : sub.hours_during,
        achievements_during: req.body.achievements !== undefined ? req.body.achievements : sub.achievements_during,
        multiplier: req.body.multiplier !== undefined ? req.body.multiplier : sub.multiplier,
        calculated_score: status === 'verified' ? points : 0,
        notes: req.body.notes !== undefined ? req.body.notes : sub.notes
      }).eq('id', submissionId);

      if (updateSubError) throw updateSubError;

      // 3. Always sync user points after a verification update
      const newTotal = await syncUserPoints(supabase, sub.user_id);

      res.json({ success: true, pointsAwarded: points, newTotal });
    } catch (err) {
      console.error('Refine failed:', err);
      res.status(500).json({ error: 'Failed to update submission' });
    }
  });

  app.delete('/api/admin/submissions/:id', async (req, res) => {
    const { id } = req.params;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {

      // 1. Get the submission to find out who submitted it (for point sync) and event_id
      const { data: sub, error: fetchError } = await supabase.from('submissions').select('user_id, event_id').eq('id', id).single();
      
      if (fetchError || !sub) {
        return res.status(404).json({ error: 'Submission not found' });
      }

      if (sub.event_id) {
        await ensureEventWinnerSaved(supabase, sub.event_id);
        await ensureEventScoresSaved(supabase, sub.event_id);
      }

      // 2. Delete the submission
      const { error: deleteError } = await supabase.from('submissions').delete().eq('id', id);
      if (deleteError) throw deleteError;

      // 3. Sync user points after deletion
      const newTotal = await syncUserPoints(supabase, sub.user_id);

      res.json({ success: true, newTotal });
    } catch (err) {
      console.error('Delete failed:', err);
      res.status(500).json({ error: 'Failed to delete submission' });
    }
  });

  // Mass Accept Submissions
  app.post('/api/admin/submissions/mass-accept', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    const currentUser = (req as any).user;
    const adminSteamId = String(currentUser?.id || currentUser?.steamid || currentUser?.steam_id || 'admin');
    const { submissionIds, eventId } = req.body;

    try {
      let query = supabase.from('submissions').select('*').eq('status', 'pending');
      if (Array.isArray(submissionIds) && submissionIds.length > 0) {
        query = query.in('id', submissionIds);
      } else if (eventId) {
        query = query.eq('event_id', eventId);
      }

      const { data: pendingSubs, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;

      if (!pendingSubs || pendingSubs.length === 0) {
        return res.json({ success: true, count: 0, message: 'No pending submissions found to accept.' });
      }

      const idsToAccept = pendingSubs.map((s: any) => s.id);
      const userIdsToSync = Array.from(new Set(pendingSubs.map((s: any) => s.user_id)));

      // Update all pending submissions to verified
      for (const sub of pendingSubs) {
        const pointsAwarded = Number(sub.calculated_score || sub.points || 0);
        await supabase.from('submissions').update({
          status: 'verified',
          points: pointsAwarded,
          rejection_reason: null,
          verifier_id: adminSteamId
        }).eq('id', sub.id);
      }

      // Re-sync user points for all affected users
      for (const uid of userIdsToSync) {
        if (uid) await syncUserPoints(supabase, uid as string);
      }

      console.log(`[Admin] Mass accepted ${idsToAccept.length} submissions for ${userIdsToSync.length} users.`);
      res.json({ success: true, count: idsToAccept.length, affectedUsers: userIdsToSync.length });
    } catch (err) {
      console.error('Mass accept failed:', err);
      res.status(500).json({ error: 'Failed to mass accept submissions', details: String(err) });
    }
  });

  // Delete Submissions in Batch (by submission IDs or by event ID)
  app.post('/api/admin/submissions/delete-batch', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    const { submissionIds, eventId } = req.body;

    try {
      let query = supabase.from('submissions').select('id, user_id, event_id');
      if (Array.isArray(submissionIds) && submissionIds.length > 0) {
        query = query.in('id', submissionIds);
      } else if (eventId) {
        query = query.eq('event_id', eventId);
      } else {
        return res.status(400).json({ error: 'Must provide submissionIds array or eventId' });
      }

      const { data: targetSubs, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;

      if (!targetSubs || targetSubs.length === 0) {
        return res.json({ success: true, count: 0, message: 'No matching submissions found to delete.' });
      }

      // Lock in / preserve event winner badge info AND score totals BEFORE deleting any submissions!
      const affectedEventIds = Array.from(new Set(targetSubs.map((s: any) => s.event_id).filter(Boolean)));
      if (eventId && !affectedEventIds.includes(eventId)) {
        affectedEventIds.push(eventId);
      }
      for (const eid of affectedEventIds) {
        await ensureEventWinnerSaved(supabase, eid as string);
        await ensureEventScoresSaved(supabase, eid as string);
      }

      const idsToDelete = targetSubs.map((s: any) => s.id);
      const userIdsToSync = Array.from(new Set(targetSubs.map((s: any) => s.user_id)));

      // Perform deletion
      if (Array.isArray(submissionIds) && submissionIds.length > 0) {
        const { error: delErr } = await supabase.from('submissions').delete().in('id', idsToDelete);
        if (delErr) throw delErr;
      } else if (eventId) {
        const { error: delErr } = await supabase.from('submissions').delete().eq('event_id', eventId);
        if (delErr) throw delErr;
      }

      // Sync user points for affected users (points floor is preserved)
      for (const uid of userIdsToSync) {
        if (uid) await syncUserPoints(supabase, uid as string);
      }

      console.log(`[Admin] Batch deleted ${idsToDelete.length} submissions.`);
      res.json({ success: true, count: idsToDelete.length, affectedUsers: userIdsToSync.length });
    } catch (err) {
      console.error('Batch delete failed:', err);
      res.status(500).json({ error: 'Failed to batch delete submissions', details: String(err) });
    }
  });

  // Export Submissions as CSV
  app.get('/api/admin/submissions/export-csv', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      const { eventId, status } = req.query;

      // Ensure historical team relations are initialized
      await backfillEventTeams(supabase);

      let subQuery = supabase.from('submissions').select('*').order('created_at', { ascending: false });
      if (eventId) subQuery = subQuery.eq('event_id', String(eventId));
      if (status && status !== 'all') subQuery = subQuery.eq('status', String(status));

      const [submissionsRes, profilesRes, eventsRes, userEventTeamsRes] = await Promise.all([
        subQuery,
        supabase.from('profiles').select('steamid, team, steam_name, discord_name'),
        supabase.from('events').select('id, title'),
        supabase.from('user_event_teams').select('steamid, event_id, team')
      ]);

      if (submissionsRes.error) throw submissionsRes.error;

      const submissions = submissionsRes.data || [];
      const profileMap: Record<string, any> = {};
      (profilesRes.data || []).forEach((p: any) => { profileMap[p.steamid] = p; });

      const eventMap: Record<string, string> = {};
      (eventsRes.data || []).forEach((e: any) => { eventMap[e.id] = e.title; });

      const uetMap = new Map<string, string>();
      (userEventTeamsRes?.data || []).forEach((uet: any) => {
        if (uet.steamid && uet.event_id && uet.team) {
          uetMap.set(`${uet.steamid}_${uet.event_id}`, uet.team);
        }
      });

      const headers = [
        'Submission ID',
        'Date',
        'User Name',
        'User ID',
        'Team',
        'Game Title',
        'Steam App ID',
        'Achievements During',
        'Hours During',
        'Hours Before',
        'Completion Status',
        'Points Awarded',
        'Multiplier',
        'Status',
        'Event Title',
        'Event ID',
        'Notes',
        'Verifier ID'
      ];

      const escapeCSV = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const rows = submissions.map((s: any) => {
        const p = profileMap[s.user_id];
        const userName = p?.steam_name || p?.discord_name || s.user_name || 'Unknown User';
        
        let team = 'none';
        if (s.user_id?.startsWith('team_pts_')) {
          team = s.user_id.replace('team_pts_', '');
        } else if (s.user_id && s.event_id && uetMap.has(`${s.user_id}_${s.event_id}`)) {
          team = uetMap.get(`${s.user_id}_${s.event_id}`) || 'none';
        } else if (p?.team) {
          team = p.team;
        }

        const eventTitle = eventMap[s.event_id] || 'Unknown/Default Event';

        return [
          escapeCSV(s.id),
          escapeCSV(new Date(s.created_at).toISOString()),
          escapeCSV(userName),
          escapeCSV(s.user_id),
          escapeCSV(team),
          escapeCSV(s.game_name),
          escapeCSV(s.steam_appid || ''),
          escapeCSV(s.achievements_during || 0),
          escapeCSV(s.hours_during || 0),
          escapeCSV(s.hours_before || 0),
          escapeCSV(s.completion_status || 'unfinished'),
          escapeCSV(s.points || 0),
          escapeCSV(s.multiplier || 1.0),
          escapeCSV(s.status),
          escapeCSV(eventTitle),
          escapeCSV(s.event_id || ''),
          escapeCSV(s.notes || ''),
          escapeCSV(s.verifier_id || '')
        ].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      const filename = `submissions_export_${new Date().toISOString().slice(0, 10)}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csvContent);
    } catch (err) {
      console.error('Export CSV failed:', err);
      res.status(500).json({ error: 'Failed to export CSV', details: String(err) });
    }
  });

  app.post('/api/admin/recalculate-all', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      // Find active event
      const { data: activeEvent, error: eventError } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();

      if (eventError) {
        console.error('Error fetching active event:', eventError);
      }

      if (!activeEvent) {
        return res.json({ success: true, count: 0, usersSynced: 0, message: 'No active event found. Past events are preserved.' });
      }

      // 1. Fetch verified submissions for the current active event
      const { data: subs, error: fetchError } = await supabase
        .from('submissions')
        .select('*')
        .eq('status', 'verified')
        .eq('event_id', activeEvent.id);
      if (fetchError) throw fetchError;

      console.log(`[Admin] Recalculating points for ${subs.length} submissions in active event ${activeEvent.id}...`);

      const gameIds = Array.from(new Set(subs.map((s: any) => s.game_id)));
      const { data: games } = await supabase.from('games').select('id, hltb_main, hltb_extras').in('id', gameIds);
      const gameMap: Record<string, any> = {};
      (games || []).forEach((g: any) => {
        gameMap[g.id] = g;
      });

      for (const sub of subs) {
        // Skip manual point adjustments so manual awards/deductions are preserved exactly
        if (
          sub.game_name === 'Screenshot Points' ||
          sub.game_name === 'Bingo Points' ||
          sub.game_name === 'Team Award' ||
          sub.platform === 'System' ||
          sub.platform === 'Screenshot Points' ||
          sub.platform === 'Bingo Points' ||
          sub.user_id?.startsWith('team_pts_')
        ) {
          continue;
        }

        // Redetermine multiplier based on CORRECTED math (1x, 2x, 3x, 4x)
        let multiplier = 1.0;
        const hours = Number(sub.hours_during || 0);
        const hoursBeforeNum = Number(sub.hours_before || 0);
        const adjustedPlayHours = Math.max(0, hours - hoursBeforeNum);
        if (adjustedPlayHours < 8) multiplier = 1.0;
        else if (adjustedPlayHours < 15) multiplier = 2.0;
        else if (adjustedPlayHours < 25) multiplier = 3.0;
        else multiplier = 4.0;

        let correctPoints = Math.round(Number(sub.achievements_during || 0) * multiplier);
        const subBeatenPrevious = sub.beaten_previous || 'no';
        const effectiveRecalcStatus = (sub.completion_status === 'beaten' && subBeatenPrevious === 'yes') 
          ? 'unfinished' 
          : (sub.completion_status || 'unfinished');

        if (effectiveRecalcStatus === 'completed') {
          correctPoints += 30;
        } else if (effectiveRecalcStatus === 'beaten') {
          correctPoints += 15;
        }
        
        const meta = parseNotesMeta(sub.notes || '');
        if (meta.hasNoAchievements) {
          const gameMeta = gameMap[sub.game_id] || { hltb_main: 0, hltb_extras: 0 };
          const levelVal = meta.level !== undefined ? meta.level : 2;
          const hoursBeforeNum = Number(sub.hours_before || 0);
          const finalPlayTime = Math.max(0, hours - hoursBeforeNum);
          correctPoints = calculateNonAchievementPoints(levelVal, finalPlayTime, gameMeta.hltb_main, gameMeta.hltb_extras, effectiveRecalcStatus);
        }
        
        console.log(`[Admin] Recalculating sub ${sub.id}: user=${sub.user_name}, hours=${hours}, achievements=${sub.achievements_during} -> multiplier=${multiplier}, points=${correctPoints}`);

        // Update the submission with corrected fields
        await supabase.from('submissions').update({ 
          points: correctPoints,
          multiplier: multiplier,
          calculated_score: correctPoints 
        }).eq('id', sub.id);
      }

      // 2. Fetch unique user IDs for the current active event's verified submissions to sync their points
      const { data: usersToSync } = await supabase
        .from('submissions')
        .select('user_id')
        .eq('status', 'verified')
        .eq('event_id', activeEvent.id);
      const uniqueUserIds = [...new Set(usersToSync?.map((s: any) => s.user_id) || [])];

      for (const uid of uniqueUserIds) {
        await syncUserPoints(supabase, uid as string);
      }

      res.json({ success: true, count: subs.length, usersSynced: uniqueUserIds.length });
    } catch (err) {
      console.error('Recalculate failed:', err);
      res.status(500).json({ error: 'Failed' });
    }
  });

  // Admin Backfill Route
  app.post('/api/admin/backfill-hltb', async (req: express.Request, res: express.Response) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase unavailable' });

    try {
      // 1. Get unique game IDs from SUBMISSIONS first (as requested: "only read the games that have been submitted")
      const { data: submittedGames, error: subError } = await supabase
        .from('submissions')
        .select('game_id');
      
      if (subError) throw subError;
      
      const gameIds = [...new Set(submittedGames.map((s: any) => s.game_id))];
      
      if (gameIds.length === 0) {
        return res.json({ message: 'No games submitted yet.', count: 0, updated: 0, remaining: 0, totalRemaining: 0 });
      }

      // 2. Find games from that list that are missing HLTB data (hltb_main is 0 or null)
      // We exclude -1 because that means "tried and failed"
      const { data: gamesToBackfill, error: fetchError, count } = await supabase
        .from('games')
        .select('*', { count: 'exact' })
        .in('id', gameIds)
        .or('hltb_main.eq.0,hltb_main.is.null')
        .order('updated_at', { ascending: true });

      if (fetchError) throw fetchError;
      if (!gamesToBackfill || gamesToBackfill.length === 0) {
        return res.json({ message: 'All submitted games already have HLTB data', count: 0, updated: 0, remaining: 0, totalRemaining: 0 });
      }

      console.log(`[Admin] Backfilling HLTB for batch. Games identified for backfill: ${count}`);
      
      const batchSize = 5; // Reduced batch size for stability
      const batch = gamesToBackfill.slice(0, batchSize);
      let processedCount = 0;
      let updatedCount = 0;

      for (const game of batch) {
        try {
          processedCount++;
          const data = await getHLTBData(game.title);
          
          const updateData: any = {
            updated_at: new Date().toISOString()
          };

          if (data && !data.notFound) {
            updateData.hltb_main = data.hltb_main || 0;
            updateData.hltb_extras = data.hltb_extras || 0;
            updateData.hltb_completionist = data.hltb_completionist || 0;
            hltbCache.set(game.title, data);
            updatedCount++;
          } else {
             // Mark as checked (-1) so we don't try again during syncs or backfills
             updateData.hltb_main = -1; 
          }

          await supabase.from('games').update(updateData).eq('id', game.id);
          // Small delay to be polite to HLTB/Bridge
          await new Promise(resolve => setTimeout(resolve, 800));
        } catch (err) {
          console.error(`[HLTB Backfill] Error for ${game.title}:`, err);
        }
      }

      res.json({ 
        message: `Processed ${processedCount} games.`,
        updated: updatedCount,
        processedCount: processedCount,
        remaining: Math.max(0, (count || 0) - processedCount),
        totalRemaining: (count || 0) - processedCount
      });
    } catch (err) {
      console.error('HLTB Backfill failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/repair-submissions', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      // Find submissions missing either IDs
      const { data: subs, error: fetchError } = await supabase
        .from('submissions')
        .select('id, game_name, game_id')
        .or('steam_appid.is.null');

      if (fetchError) throw fetchError;
      if (!subs || subs.length === 0) return res.json({ success: true, updatedCount: 0 });

      console.log(`[Admin] Repairing ${subs.length} submissions with missing IDs...`);
      let updatedCount = 0;

      // Small batches to respect IGDB rate limits
      for (let i = 0; i < subs.length; i++) {
        const sub = subs[i];
        try {
          const token = await getIGDBToken();
          const response = await fetch('https://api.igdb.com/v4/games', {
            method: 'POST',
            headers: {
              'Client-ID': process.env.IGDB_CLIENT_ID!,
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'text/plain'
            },
            body: `search "${sub.game_name}"; fields name, external_games.category, external_games.uid, websites.url, websites.category; limit 5;`
          });

          const data: any = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            // Find best match or use first
            const bestMatch = data.find((g: any) => g.name.toLowerCase() === sub.game_name.toLowerCase()) || data[0];
            
            let steamId = bestMatch.external_games?.find((eg: any) => eg.category === 1)?.uid;
            if (!steamId) {
              const steamWebsite = bestMatch.websites?.find((w: any) => w.category === 13 || w.url.includes('store.steampowered.com/app/'));
              if (steamWebsite) {
                const match = steamWebsite.url.match(/\/app\/(\d+)/);
                if (match) steamId = match[1];
              }
            }

            let hltbId = bestMatch.external_games?.find((eg: any) => eg.category === 14)?.uid;
            if (!hltbId) {
              const hltbUrl = bestMatch.websites?.find((w: any) => w.url.includes('howlongtobeat.com'))?.url;
              if (hltbUrl) {
                const match = hltbUrl.match(/(?:\/game\/|id=)(\d+)/);
                if (match) hltbId = match[1];
                else hltbId = hltbUrl.split('/').pop()?.split('-')[0];
              }
            }

            if (steamId) {
              await supabase.from('submissions').update({
                steam_appid: steamId || null
              }).eq('id', sub.id);
              updatedCount++;
            }
          }
          // Slight delay to be nice to IGDB
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (e) {
          console.warn(`[Admin] Repair failed for sub ${sub.id} (${sub.game_name}):`, e);
        }
      }

      res.json({ success: true, updatedCount });
    } catch (err) {
      console.error('[Admin] Global repair error:', err);
      res.status(500).json({ error: 'Repair failed' });
    }
  });

  app.delete('/api/admin/users/:steamId', async (req, res) => {
    const { steamId } = req.params;
    const currentUser = (req as any).user;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      const adminSteamId = String(currentUser.id || currentUser.steamid || currentUser.steam_id);

      // Prevent self-deletion via this admin endpoint for safety
      if (adminSteamId === steamId) {
        return res.status(400).json({ error: 'Cannot delete your own admin account' });
      }

      console.log(`[Admin] Deleting user data for: ${steamId}`);

      // 1. Delete user submissions
      const { error: deleteSubsError } = await supabase
        .from('submissions')
        .delete()
        .eq('user_id', steamId);
      
      if (deleteSubsError) console.warn('Warning: Failed to delete some submissions during kick:', deleteSubsError);

      // 2. Delete the user profile
      const { error: deleteProfileError } = await supabase
        .from('profiles')
        .delete()
        .eq('steamid', steamId);

      if (deleteProfileError) throw deleteProfileError;

      res.json({ success: true });
    } catch (err) {
      console.error('Kick member failed:', err);
      res.status(500).json({ error: 'Failed to kick member' });
    }
  });

  app.post('/api/admin/update-user-role', async (req, res) => {
    const { targetSteamId, role } = req.body;
    const currentUser = (req as any).user;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      const adminSteamId = currentUser.id || currentUser.steamid || currentUser.steam_id;

      // Prevent self-role changing to avoid locking oneself out
      if (adminSteamId === targetSteamId) {
        return res.status(400).json({ error: 'Cannot change your own role' });
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({ role: role || 'member' })
        .eq('steamid', targetSteamId)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err) {
      console.error('Update role failed:', err);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  });

  let igdbToken: { access_token: string, expires_at: number } | null = null;

  async function getIGDBToken() {
    const clientID = process.env.IGDB_CLIENT_ID;
    const clientSecret = process.env.IGDB_CLIENT_SECRET;

    if (!clientID || !clientSecret) {
      throw new Error('IGDB credentials missing');
    }

    if (igdbToken && Date.now() < igdbToken.expires_at) {
      return igdbToken.access_token;
    }

    const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientID}&client_secret=${clientSecret}&grant_type=client_credentials`, {
      method: 'POST'
    });

    const data: any = await response.json();
    if (!data.access_token) throw new Error('Failed to get IGDB token');

    igdbToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in * 1000) - 60000 // 1 min buffer
    };

    return igdbToken.access_token;
  }

  // Event APIs
  app.get('/api/events', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.json([]);

    try {
      const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .order('start_date', { ascending: true }); // Gather oldest to newest to allocate 1-based Event #s

      if (error) throw error;
      if (!events || events.length === 0) return res.json([]);

      // Gather user profile team allocations
      const { data: profiles } = await supabase.from('profiles').select('steamid, team');
      const profileTeamMap = new Map<string, string>();
      (profiles || []).forEach((p: any) => {
        if (p.steamid) profileTeamMap.set(p.steamid, p.team || 'none');
      });

      // Gather historical event team allocations
      let userEventTeamMap = new Map<string, string>();
      try {
        const { data: userEventTeams } = await supabase
          .from('user_event_teams')
          .select('steamid, event_id, team');
        (userEventTeams || []).forEach((uet: any) => {
          userEventTeamMap.set(`${uet.steamid}_${uet.event_id}`, uet.team);
        });
      } catch (uetErr) {
        console.warn('⚠️ user_event_teams table check failed inside /api/events endpoint, falling back to current profile teams.');
      }

      // Gather verified submissions & adjustments
      const { data: verifiedSubs } = await supabase
        .from('submissions')
        .select('event_id, user_id, points, calculated_score')
        .eq('status', 'verified');

      const subsByEvent = new Map<string, any[]>();
      (verifiedSubs || []).forEach((sub: any) => {
        if (sub.event_id) {
          if (!subsByEvent.has(sub.event_id)) {
            subsByEvent.set(sub.event_id, []);
          }
          subsByEvent.get(sub.event_id)!.push(sub);
        }
      });

      const eventsWithWinners = events.map((event: any, index: number) => {
        const eventNum = index + 1;
        let winnerTeam: string | null = event.winner_team || null;

        if (!winnerTeam && event.description) {
          const match = event.description.match(/<!--WINNER:(.*?)-->/);
          if (match && match[1]) {
            winnerTeam = match[1];
          }
        }

        if (!event.is_active && !winnerTeam) {
          const teamPoints: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0 };
          const eventSubs = subsByEvent.get(event.id) || [];

          eventSubs.forEach((sub: any) => {
            if (sub.user_id === 'system_notification') return;

            let team: string | null = null;
            if (sub.user_id.startsWith('team_pts_')) {
              team = sub.user_id.substring('team_pts_'.length);
            } else {
              team = userEventTeamMap.get(`${sub.user_id}_${event.id}`) || profileTeamMap.get(sub.user_id) || null;
            }

            if (team && teamPoints[team] !== undefined) {
              const pts = Number(sub.points !== undefined && sub.points !== null ? sub.points : sub.calculated_score) || 0;
              teamPoints[team] += pts;
            }
          });

          // Find team with highest total points for this event
          let maxPoints = -1;
          let bestTeam: string | null = null;
          for (const team in teamPoints) {
            if (teamPoints[team] > maxPoints && teamPoints[team] > 0) {
              maxPoints = teamPoints[team];
              bestTeam = team;
            }
          }
          winnerTeam = bestTeam;

          if (winnerTeam) {
            const updatedDesc = event.description
              ? (event.description.includes('<!--WINNER:')
                  ? event.description.replace(/<!--WINNER:.*?-->/, `<!--WINNER:${winnerTeam}-->`)
                  : `${event.description}\n<!--WINNER:${winnerTeam}-->`)
              : `<!--WINNER:${winnerTeam}-->`;

            supabase
              .from('events')
              .update({ winner_team: winnerTeam, description: updatedDesc })
              .eq('id', event.id)
              .then(() => {});
          }
        }

        const votingMatch = event.description?.match(/<!--VOTING:(.*?)-->/);
        const votingTimestamp = votingMatch && votingMatch[1] ? Math.floor(new Date(votingMatch[1]).getTime() / 1000) : null;

        return {
          ...event,
          event_number: eventNum,
          winner_team: winnerTeam,
          start_timestamp: Math.floor(new Date(event.start_date).getTime() / 1000),
          end_timestamp: Math.floor(new Date(event.end_date).getTime() / 1000),
          voting_timestamp: votingTimestamp
        };
      });

      // Maintain latest events first descending order for UI
      eventsWithWinners.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

      res.json(eventsWithWinners);
    } catch (err) {
      console.error('Failed to fetch events:', err);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });

  app.post('/api/admin/events', async (req, res) => {
    const { title, description, startDate, endDate, isActive, hideScores, winnerTeam } = req.body;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      let finalDesc = (description || '').replace(/<!--WINNER:.*?-->/g, '').trim();
      if (winnerTeam && winnerTeam !== 'auto' && winnerTeam !== 'none') {
        finalDesc = `${finalDesc}\n<!--WINNER:${winnerTeam}-->`.trim();
      }

      const insertData: any = {
        title,
        description: finalDesc,
        start_date: startDate,
        end_date: endDate,
        is_active: isActive || false,
        hide_scores: hideScores || false,
        created_at: new Date().toISOString()
      };
      if (winnerTeam && winnerTeam !== 'auto' && winnerTeam !== 'none') {
        insertData.winner_team = winnerTeam;
      }

      const { data, error } = await supabase
        .from('events')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      if (isActive) {
        // Deactivate all OTHER events
        await supabase
          .from('events')
          .update({ is_active: false })
          .neq('id', data.id);
      }

      // Re-sync all users' points from verified submissions
      await resyncAllUsersPoints(supabase);

      res.json(data);
    } catch (err) {
      console.error('Failed to create event:', err);
      res.status(500).json({ error: 'Failed to create event' });
    }
  });

  app.put('/api/admin/events/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description, startDate, endDate, isActive, hideScores, winnerTeam } = req.body;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      let finalDesc = (description || '').replace(/<!--WINNER:.*?-->/g, '').trim();
      if (winnerTeam && winnerTeam !== 'auto' && winnerTeam !== 'none') {
        finalDesc = `${finalDesc}\n<!--WINNER:${winnerTeam}-->`.trim();
      }

      const updateData: any = {
        title,
        description: finalDesc,
        start_date: startDate,
        end_date: endDate,
        is_active: isActive,
        hide_scores: hideScores || false
      };

      if (winnerTeam !== undefined) {
        if (winnerTeam === 'auto' || winnerTeam === 'none' || !winnerTeam) {
          updateData.winner_team = null;
        } else {
          updateData.winner_team = winnerTeam;
        }
      }

      const { data, error } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (isActive) {
        // Deactivate all OTHER events
        await supabase
          .from('events')
          .update({ is_active: false })
          .neq('id', id);
      }

      // Re-sync all users' points from verified submissions
      await resyncAllUsersPoints(supabase);

      res.json(data);
    } catch (err) {
      console.error('Failed to update event:', err);
      res.status(500).json({ error: 'Failed to update event' });
    }
  });

  app.post('/api/admin/close-event', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { id } = req.body;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      // Snapshot all current member team allocations in user_event_teams for this event before closing
      await snapshotEventTeams(supabase, id);

      // Ensure winner team & event scores are permanently locked in before closing event
      await ensureEventWinnerSaved(supabase, id);
      await ensureEventScoresSaved(supabase, id);

      // 1. Mark event as inactive
      const { data: updatedEvent, error: eventError } = await supabase
        .from('events')
        .update({ is_active: false })
        .eq('id', id)
        .select()
        .single();

      if (eventError) throw eventError;

      // 1.5. Sync all users' points
      await resyncAllUsersPoints(supabase);

      // 2. Ensure general system_notification profile exists to satisfy FK constraint if present
      const { error: systemProfileError } = await supabase.from('profiles').upsert({
        steamid: 'system_notification',
        steam_name: 'System',
        team: null,
        points: 0,
        role: 'member'
      }, { onConflict: 'steamid' });

      if (systemProfileError) {
        console.error('Failed to upsert system_notification profile:', systemProfileError);
        throw systemProfileError;
      }

      // 3. Fetch default game id as fallback if needed for constraint
      const { data: game } = await supabase.from('games').select('id').limit(1).maybeSingle();
      const defaultGameId = game?.id || null;

      // 4. Insert system notification into submissions for all to pull
      const notificationMessage = "The event is now over! Thank you to everyone who participated and congratulations to the winning team! Stay tuned for the next event announcement.";
      const notificationData = {
        user_id: 'system_notification',
        user_name: 'Girls Who Game',
        user_avatar: 'https://64.media.tumblr.com/4cc7b39b35387b1cf8814cb69b4317de/9e872b03ce8fba32-13/s128x128u_c1/fa8978589ebd3c0d46250356d6a63ad428a76b80.png',
        game_id: defaultGameId,
        game_name: 'Event Update',
        game_image: 'https://64.media.tumblr.com/4cc7b39b35387b1cf8814cb69b4317de/9e872b03ce8fba32-13/s128x128u_c1/fa8978589ebd3c0d46250356d6a63ad428a76b80.png',
        achievements_during: 0,
        hours_during: 0,
        achievements_before: 0,
        hours_before: 0,
        multiplier: 1.0,
        calculated_score: 0,
        completion_status: 'completed',
        platform: 'System',
        points: 0,
        notes: notificationMessage,
        status: 'verified',
        event_id: id,
        created_at: new Date().toISOString()
      };

      const { error: subError } = await supabase
        .from('submissions')
        .insert(notificationData);

      if (subError) throw subError;

      res.json({ success: true, event: updatedEvent });
    } catch (err: any) {
      console.error('Failed to close event:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/activity-log', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.json([]);
    try {
      const { data: allAdjustments, error } = await supabase
        .from('submissions')
        .select('*')
        .or('user_id.like.team_pts_%,game_name.eq.Screenshot Points,game_name.eq.Bingo Points,game_name.eq.Team Award,platform.eq.Screenshot Points,platform.eq.Bingo Points')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Collect verifier IDs and user IDs to fetch profile info
      const profileIds = new Set<string>();
      (allAdjustments || []).forEach((sub: any) => {
        if (sub.verifier_id) profileIds.add(String(sub.verifier_id));
        if (sub.user_id && !sub.user_id.startsWith('team_pts_')) profileIds.add(String(sub.user_id));
        const meta = parseNotesMeta(sub.notes || '');
        if (meta.adminId) profileIds.add(String(meta.adminId));
      });

      const profileIdArr = Array.from(profileIds);
      let profileMap: Record<string, any> = {};
      if (profileIdArr.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('steamid, steam_name, steam_avatar, discord_name, discord_avatar, active_avatar, team, role')
          .in('steamid', profileIdArr);

        (profiles || []).forEach((p: any) => {
          let avatar = p.steam_avatar || 'https://cdn-icons-png.flaticon.com/512/1471/1471391.png';
          if (p.active_avatar === 'discord' && p.discord_avatar) {
            avatar = p.discord_avatar;
          }
          profileMap[p.steamid] = {
            name: p.steam_name || p.discord_name || 'User',
            avatar,
            team: p.team,
            role: p.role
          };
        });
      }

      const activityLog = (allAdjustments || []).map((sub: any) => {
        const meta = parseNotesMeta(sub.notes || '');
        let adminName = meta.adminName || null;
        let adminId = meta.adminId || sub.verifier_id || null;
        let adminAvatar = 'https://cdn-icons-png.flaticon.com/512/1471/1471391.png';

        if (adminId && profileMap[adminId]) {
          if (!adminName) adminName = profileMap[adminId].name;
          adminAvatar = profileMap[adminId].avatar;
        }

        if (!adminName) {
          adminName = 'Administrator';
        }

        const userProfile = profileMap[sub.user_id];
        return {
          id: sub.id,
          user_id: sub.user_id,
          user_name: sub.user_name || (userProfile?.name) || 'Team Adjustment',
          user_avatar: sub.user_avatar || (userProfile?.avatar) || 'https://cdn-icons-png.flaticon.com/512/1471/1471391.png',
          user_team: userProfile?.team || (sub.user_id.startsWith('team_pts_') ? sub.user_id.replace('team_pts_', '') : 'none'),
          game_name: sub.game_name,
          platform: sub.platform,
          points: Number(sub.points !== undefined && sub.points !== null ? sub.points : sub.calculated_score) || 0,
          notes: meta.userNotes,
          raw_notes: sub.notes,
          created_at: sub.created_at,
          event_id: sub.event_id,
          admin_name: adminName,
          admin_id: adminId,
          admin_avatar: adminAvatar
        };
      });

      res.json(activityLog);
    } catch (err: any) {
      console.error('Failed to fetch activity log:', err);
      res.status(500).json({ error: 'Failed to fetch activity log' });
    }
  });

  app.get('/api/team-adjustments', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.json([]);
    try {
      let { data: activeEvent } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();

      if (!activeEvent) {
        const { data: recentEvent } = await supabase
          .from('events')
          .select('id')
          .order('start_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        activeEvent = recentEvent;
      }

      let query = supabase
        .from('submissions')
        .select('*')
        .or('user_id.like.team_pts_%,game_name.eq.Screenshot Points,game_name.eq.Bingo Points');

      if (activeEvent) {
        query = query.or(`event_id.eq.${activeEvent.id},event_id.is.null`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      console.error('Failed to fetch team adjustments:', err);
      res.json([]);
    }
  });

  app.post('/api/admin/team-adjustments', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentAdmin = (req as any).user;
    const adminName = currentAdmin ? (currentAdmin.steamName || currentAdmin.steam_name || currentAdmin.displayName || currentAdmin.discord_name || currentAdmin.username || 'Admin') : 'Admin';
    const adminId = currentAdmin ? String(currentAdmin.steamid || currentAdmin.steamId || currentAdmin.id || 'admin') : 'admin';

    const { team, points, notes, userId, userIds, adjustmentType, eventId, event_id } = req.body;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      // Detect active event dynamically or use explicitly provided eventId
      let activeEventId = eventId || event_id || null;
      if (!activeEventId) {
        const { data: activeEvent } = await supabase.from('events').select('id').eq('is_active', true).maybeSingle();
        activeEventId = activeEvent?.id || null;
      }

      const targetUserIds = Array.isArray(userIds) ? userIds : (userId ? [userId] : []);
      const formattedNotes = serializeNotesMeta(false, undefined, notes || '', adminName, adminId);

      if (targetUserIds.length > 0) {
        // Fetch all user profiles for these userIds
        const { data: userProfiles, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .in('steamid', targetUserIds);

        if (profileErr || !userProfiles || userProfiles.length === 0) {
          return res.status(404).json({ error: 'No user profiles found for the selected members' });
        }

        const { data: game } = await supabase.from('games').select('id').limit(1).maybeSingle();
        const defaultGameId = game?.id || null;

        const adjType = adjustmentType === 'bingo' ? 'Bingo Points' : 'Screenshot Points';
        const imgUrl = adjustmentType === 'bingo' 
          ? 'https://cdn-icons-png.flaticon.com/512/5815/5815809.png' 
          : 'https://i.ibb.co/gZPKx2qh/gwg-extra-points.png';

        const numPoints = Math.round(Number(points) || 0);

        const adjustmentsArray = userProfiles.map(userProfile => ({
          user_id: userProfile.steamid,
          user_name: userProfile.steam_name,
          user_avatar: userProfile.steam_avatar || 'https://cdn-icons-png.flaticon.com/512/1471/1471391.png',
          game_id: defaultGameId,
          game_name: adjType,
          game_image: imgUrl,
          achievements_during: 0,
          hours_during: 0,
          achievements_before: 0,
          hours_before: 0,
          multiplier: 1.0,
          calculated_score: numPoints,
          completion_status: 'unfinished',
          platform: adjType,
          points: numPoints,
          notes: formattedNotes,
          status: 'verified',
          verifier_id: adminId,
          event_id: activeEventId,
          created_at: new Date().toISOString()
        }));

        const { data, error } = await supabase
          .from('submissions')
          .insert(adjustmentsArray)
          .select();

        if (error) throw error;

        // Sync points for all targeted users
        for (const uid of targetUserIds) {
          await syncUserPoints(supabase, uid);
        }

        res.json(data);
      } else {
        const dummySteamId = `team_pts_${team}`;
        const { error: teamProfileError } = await supabase.from('profiles').upsert({
          steamid: dummySteamId,
          steam_name: `Team ${team.toUpperCase()} Adjustments`,
          team: null,
          points: 0
        }, { onConflict: 'steamid' });

        if (teamProfileError) {
          console.error('Failed to upsert team profile:', teamProfileError);
          throw teamProfileError;
        }

        const { data: game } = await supabase.from('games').select('id').limit(1).maybeSingle();
        const defaultGameId = game?.id || null;

        const numPoints = Math.round(Number(points) || 0);

        const adjustmentData = {
          user_id: dummySteamId,
          user_name: `Team ${team.toUpperCase()}`,
          user_avatar: 'https://cdn-icons-png.flaticon.com/512/1471/1471391.png',
          game_id: defaultGameId,
          game_name: 'Team Award',
          game_image: 'https://cdn-icons-png.flaticon.com/512/1471/1471391.png',
          achievements_during: 0,
          hours_during: 0,
          achievements_before: 0,
          hours_before: 0,
          multiplier: 1.0,
          calculated_score: numPoints,
          completion_status: 'unfinished',
          platform: 'System',
          points: numPoints,
          notes: formattedNotes,
          status: 'verified',
          verifier_id: adminId,
          event_id: activeEventId,
          created_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('submissions')
          .insert(adjustmentData)
          .select()
          .single();

        if (error) throw error;

        await syncUserPoints(supabase, dummySteamId);

        res.json(data);
      }
    } catch (err: any) {
      console.error('Failed to add team points:', err);
      res.status(500).json({ error: err.message });
    }
  });


  // Keep existing steam proxy but maybe rename or update if needed
  app.get('/api/steam/game/:appId', async (req, res) => {
    const { appId } = req.params;
    try {
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}`);
      const data: any = await response.json();
      
      if (data[appId]?.success) {
        const details = data[appId].data;
        res.json({
          id: appId,
          title: details.name,
          image: details.header_image,
        });
      } else {
        res.status(404).json({ error: 'Game not found' });
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch steam data' });
    }
  });

  app.get('/api/steam/check-ownership/:appId', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { appId } = req.params;
    const currentUser = (req as any).user;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    let steamId = String(currentUser.id || currentUser.steamid || currentUser.steam_id || currentUser.steamId);

    // Resilient steamId lookup if not in session
    if (!steamId || steamId.length < 5 || steamId === 'undefined' || steamId === 'null') {
       const discId = currentUser.discord_id || currentUser.id;
       if (discId) {
          const { data: profile } = await supabase.from('profiles').select('steamid').eq('discord_id', discId).maybeSingle();
          if (profile?.steamid) {
            steamId = profile.steamid;
          }
       }
    }

    if (!steamId || steamId.length < 5 || steamId === 'undefined') {
      return res.status(400).json({ error: 'Steam ID not found. Please ensure you have linked your Steam account.' });
    }

    try {
      const games = await fetchSteamOwnedGames(steamId, supabase);
      if (!games) return res.status(500).json({ error: 'Could not fetch Steam library' });

      const game = games.find((g: any) => String(g.appid) === String(appId));
      if (game) {
        const achievements = await fetchSteamAchievementCountForUser(steamId, appId);
        return res.json({ 
          owned: true, 
          playtime_forever: game.playtime_forever,
          playtime_2weeks: game.playtime_2weeks || 0,
          name: game.name,
          achievements: achievements
        });
      }

      res.json({ owned: false });
    } catch (err) {
      console.error('Steam ownership check failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/steam/check-ownership-by-name', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const currentUser = (req as any).user;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    let steamId = String(currentUser.id || currentUser.steamid || currentUser.steam_id || currentUser.steamId);

    // Resilient steamId lookup if not in session
    if (!steamId || steamId.length < 5 || steamId === 'undefined' || steamId === 'null') {
       const discId = currentUser.discord_id || currentUser.id;
       if (discId) {
          const { data: profile } = await supabase.from('profiles').select('steamid').eq('discord_id', discId).maybeSingle();
          if (profile?.steamid) {
            steamId = profile.steamid;
          }
       }
    }

    if (!steamId || steamId.length < 5 || steamId === 'undefined') {
      return res.status(400).json({ error: 'Steam ID not found. Please ensure you have linked your Steam account.' });
    }

    try {
      const games = await fetchSteamOwnedGames(steamId, supabase);
      if (!games) return res.status(500).json({ error: 'Could not fetch Steam library' });

      const normalize = (str: string) => str.toLowerCase().replace(/[®™©]/g, '').replace(/[^a-z0-9]/g, '');
      const searchName = normalize(name as string);

      // 1. Try exact normalized match
      let game = games.find((g: any) => normalize(g.name) === searchName);
      
      // 2. Try prefix match if not found
      if (!game) {
        game = games.find((g: any) => {
          const gn = normalize(g.name);
          return gn.startsWith(searchName) || searchName.startsWith(gn);
        });
      }

      // 3. Try fuzzy/contains match if still not found
      if (!game) {
        game = games.find((g: any) => {
          const gn = normalize(g.name);
          return gn.includes(searchName) || searchName.includes(gn);
        });
      }

      if (game) {
        const achievements = await fetchSteamAchievementCountForUser(steamId, game.appid);
        return res.json({ 
          owned: true, 
          appId: game.appid,
          playtime_forever: game.playtime_forever,
          name: game.name,
          achievements: achievements
        });
      }

      res.json({ owned: false });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });




  // Removed duplicate leaderboard route


  // Vite middleware
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // On Vercel or in production, serve from dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      // In a serverless environment, we might need to be careful with paths
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return { app, PORT };
}

// Initialize the server setup promise
let serverApp: any = null;
const serverSetupPromise = createServer();

// For non-Vercel environments (like local and container/Cloud Run environments)
if (!process.env.VERCEL) {
  serverSetupPromise.then(({ app, PORT }) => {
    serverApp = app;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running at http://0.0.0.0:${PORT}`);
    });
  }).catch(err => {
    console.error('Failed to start local server:', err);
  });
}

// Export a handler for Vercel
export default async (req: any, res: any) => {
  try {
    if (!serverApp) {
      const { app } = await serverSetupPromise;
      serverApp = app;
    }
    return serverApp(req, res);
  } catch (err) {
    console.error('Vercel handler initialization failed:', err);
    res.status(500).send('Internal Server Error: Server failed to initialize.');
  }
};

