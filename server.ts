import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';
import { Strategy as DiscordStrategy } from 'passport-discord';
import path from 'path';
import { fileURLToPath } from 'url';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
// Lazy-load howlongtobeat to prevent startup crashes if module is missing or incompatible in some environments

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let supabaseClient: any = null;
function getSupabase() {
  if (!supabaseClient) {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    
    if (!url || !key) {
      console.warn('Supabase credentials missing. Session persistence and profile sync will fail.');
      return null;
    }
    
    console.log('Initializing Supabase client with URL:', url.substring(0, 10) + '...');
    supabaseClient = createSupabaseClient(url, key);
  }
  return supabaseClient;
}

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
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      isCloud, 
      hasSupabase: !!process.env.SUPABASE_URL,
      hasSteam: !!process.env.STEAM_API_KEY,
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
    scope: ['identify']
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
            // This part extracts the correct ID from Steam's response
            const steamId = String(user.id || user._json?.steamid);
            console.log('--- SYNC START ---');
            console.log('Syncing Steam ID:', steamId);

            const { data, error: syncError } = await supabase.from('profiles').upsert({
              steamid: steamId,
              steam_name: user.displayName || user.personaname || 'Steam User',
              steam_avatar: user.photos?.[2]?.value || user.photos?.[0]?.value || user._json?.avatarfull || null,
              last_login: new Date().toISOString()
            }, { onConflict: 'steamid' }).select(); // .select() lets us see the result
            
            if (syncError) {
              console.error('❌ Supabase Sync Error:', syncError.message);
              console.error('Error Details:', syncError.details);
            } else {
              console.log('✅ Supabase Sync Success! Data in DB:', data);
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
      scope: 'identify'
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
      if (err || !user) return res.redirect('/');
      
      // If user is logged in via Steam, link Discord
      const currentUser = (req as any).user;
      const supabase = getSupabase();
      if (currentUser && (currentUser.id || currentUser.steam_id) && supabase) {
        try {
          const discordName = user.global_name || user.username || user.displayName || 'Discord User';
          await supabase.from('profiles').update({
            discord_id: user.id,
            discord_name: discordName,
            discord_avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null
          }).eq('steamid', currentUser.id || currentUser.steam_id || currentUser.steamid);
          
          Object.assign((req as any).user, {
            discord_id: user.id,
            discord_name: discordName,
            discord_avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null
          });
        } catch (dbErr) {
          console.error('Failed to link Discord to Supabase:', dbErr);
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

  // HLTB Service & Cache (Lazy-loaded for resilience)
  let hltbService: any = null;
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const hltb = require('howlongtobeat');
    const ServiceClass = hltb.HowLongToBeatService || hltb.default?.HowLongToBeatService;
    if (typeof ServiceClass === 'function') {
      hltbService = new ServiceClass();
      console.log('[HLTB] Service successfully initialized via require().');
    }
  } catch (err) {
    console.error('[HLTB] Error loading howlongtobeat module via require:', err);
    // Fallback to dynamic import if require fails
    try {
      const hltbModule = await import('howlongtobeat');
      const ServiceClass = hltbModule.HowLongToBeatService || hltbModule.default?.HowLongToBeatService || hltbModule.default;
      if (typeof ServiceClass === 'function') {
        hltbService = new ServiceClass();
        console.log('[HLTB] Service successfully initialized via import().');
      }
    } catch (importErr) {
      console.error('[HLTB] Error loading howlongtobeat module via import:', importErr);
    }
  }

  // Fallback mock if loading failed or module missing
  if (!hltbService) {
    console.warn('[HLTB] Service could not be initialized, using fallback mock.');
    hltbService = {
      search: async () => {
        console.warn('[HLTB] search() called but service is not available');
        return [];
      }
    };
  }

  const hltbCache = new Map<string, any>();

  // Advanced title cleaner and edition stripper logic
  const cleanGameTitle = (title: string): string => {
    return title
      .replace(/ - (Standard|Digital|Deluxe|Ultimate|Complete|Legacy|Definitive|Enhanced|Remastered|Remake|Gold|Platinum|GOTY|Game of the Year|Special|Premium|Collector's) Edition/gi, '')
      .replace(/[:®™]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  app.get('/api/admin/hltb/:title', async (req, res) => {
    const { title } = req.params;
    const cleanedTitle = cleanGameTitle(title);
    
    if (hltbCache.has(cleanedTitle)) {
      return res.json(hltbCache.get(cleanedTitle));
    }

    try {
      const results = await hltbService.search(cleanedTitle);
      if (results && results.length > 0) {
        // Find the best match - prioritize exact match after cleaning
        const bestMatch = results.find(r => r.name.toLowerCase() === cleanedTitle.toLowerCase()) || results[0];
        const data = {
          main: bestMatch.gameplayMain,
          mainExtra: bestMatch.gameplayMainExtra,
          completionist: bestMatch.gameplayCompletionist,
          id: bestMatch.id,
          name: bestMatch.name
        };
        hltbCache.set(cleanedTitle, data);
        return res.json(data);
      }
      res.json({ error: 'Not found' });
    } catch (err) {
      console.error('HLTB search failed:', err);
      res.status(500).json({ error: 'HLTB fetch failed' });
    }
  });

  app.post('/api/admin/hltb-batch', async (req, res) => {
    const { titles } = req.body;
    if (!Array.isArray(titles)) return res.status(400).json({ error: 'Invalid input' });

    const results: Record<string, any> = {};
    const toFetch = titles.filter(t => !hltbCache.has(cleanGameTitle(t)));

    // Fetch in small batches to avoid rate limits
    for (let i = 0; i < toFetch.length; i += 3) {
      const batch = toFetch.slice(i, i + 3);
      await Promise.all(batch.map(async (title) => {
        try {
          const cleanedTitle = cleanGameTitle(title);
          const searchResults = await hltbService.search(cleanedTitle);
          if (searchResults && searchResults.length > 0) {
            const bestMatch = searchResults.find(r => r.name.toLowerCase() === cleanedTitle.toLowerCase()) || searchResults[0];
            const data = {
              main: bestMatch.gameplayMain,
              mainExtra: bestMatch.gameplayMainExtra,
              completionist: bestMatch.gameplayCompletionist,
              id: bestMatch.id,
              name: bestMatch.name
            };
            hltbCache.set(cleanedTitle, data);
            results[title] = data;
          }
        } catch (e) {
          console.warn(`HLTB fetch failed for ${title}`, e);
        }
      }));
    }

    // Include cached ones
    titles.forEach(title => {
      const cleaned = cleanGameTitle(title);
      if (hltbCache.has(cleaned)) {
        results[title] = hltbCache.get(cleaned);
      }
    });

    res.json(results);
  });

  app.get('/api/me', async (req, res) => {
    if ((req as any).isAuthenticated && (req as any).isAuthenticated()) {
      const user = (req as any).user;
      const supabase = getSupabase();
      
      const steamId = user.id || user.steamid || user.steam_id || user.steamId;
      
      if (supabase && steamId) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('steamid', steamId)
            .single();
            
          if (data && !error) {
            // Merge database data with session data for the frontend
            return res.json({
              ...user,
              ...data,
              isAdmin: data.role === 'admin' || data.role === 'admins' // Ensure isAdmin is correctly set based on role
            });
          }
        } catch (err) {
          console.error('Error fetching profile from Supabase:', err);
        }
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

  // Admin APIs
  const adminOnly = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const currentUser = (req as any).user;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    const steamId = String(currentUser.id || currentUser.steamid || currentUser.steam_id);
    const { data: profile } = await supabase.from('profiles').select('role').eq('steamid', steamId).single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'admins')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };

  app.use('/api/admin', adminOnly);

  app.get('/api/admin/users', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    const { data: users, error } = await supabase
      .from('profiles')
      .select('*')
      .order('last_login', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(users);
  });

  // Helper to sync points
  async function syncUserPoints(supabase: any, steamid: string) {
    try {
      console.log(`[Sync] Starting sync for user ${steamid}`);
      // We want to sum ALL verified submissions for the user's total points profile
      const { data: verifiedSubmissions, error: subError } = await supabase
        .from('submissions')
        .select('points, id, status, user_id')
        .eq('user_id', steamid)
        .eq('status', 'verified');

      if (subError) {
        console.error(`[Sync] Error fetching submissions for ${steamid}:`, subError);
        throw subError;
      }

      console.log(`[Sync] Found ${verifiedSubmissions?.length || 0} verified submissions for ${steamid}`);
      
      let totalPoints = 0;
      for (const sub of (verifiedSubmissions || [])) {
        totalPoints += Math.round(Number(sub.points || 0));
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

  app.get('/api/leaderboard/users', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    // Publicly return profiles assigned to a team
    const { data: users, error } = await supabase
      .from('profiles')
      .select('steamid, steam_name, steam_avatar, discord_name, discord_avatar, team, status, points, role')
      .not('team', 'is', null)
      .neq('team', 'none')
      .order('points', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    
    res.json(users);
  });

  app.get('/api/users/:steamid', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    const { steamid } = req.params;
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('steamid, steam_name, steam_avatar, discord_name, discord_avatar, discord_id, team, status, points, role')
      .eq('steamid', steamid)
      .single();

    if (error) return res.status(404).json({ error: 'User not found' });
    
    // Transform to frontend format
    const transformedUser = {
      uid: profile.steamid,
      steamId: profile.steamid,
      steamName: profile.steam_name,
      steamAvatar: profile.steam_avatar,
      discordName: profile.discord_name,
      discordAvatar: profile.discord_avatar,
      discordId: profile.discord_id,
      team: profile.team,
      status: profile.status,
      points: profile.points,
      role: profile.role,
      isAdmin: profile.role === 'admin' || profile.role === 'admins'
    };
    
    res.json(transformedUser);
  });

  app.post('/api/admin/update-user-team', async (req, res) => {
    const { targetSteamId, team } = req.body;
    console.log('[Admin] Update Team Start:', { targetSteamId, team });
    
    const supabase = getSupabase();
    if (!supabase) {
      console.error('[Admin] Database unavailable');
      return res.status(500).json({ error: 'Database unavailable' });
    }

    try {
      // If team is 'none', we store it as null. 
      // If the DB constraint fails, it might expect a specific string instead.
      const dbTeam = team === 'none' ? null : team;
      
      console.log('[Admin] Attempting update:', { targetSteamId, dbTeam });

      const { error, data: updateData } = await supabase
        .from('profiles')
        .update({ team: dbTeam })
        .eq('steamid', String(targetSteamId))
        .select();

      if (error) {
        console.error('[Admin] Update error:', error.message, error.details, error.hint);
        return res.status(500).json({ 
          error: error.message, 
          details: error.details,
          hint: error.hint 
        });
      }
      
      console.log('[Admin] Successfully updated team for:', targetSteamId, 'Result:', updateData);
      res.json({ success: true, updated: updateData });
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
    const steamId = String(currentUser.id || currentUser.steamid || currentUser.steam_id);
    
    const supabase = getSupabase();
    if (!supabase) return res.json([]);

    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('user_id', steamId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
      res.status(500).json({ error: 'Failed to fetch submissions' });
    }
  });

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
      notes,
      steamAppId,
      hltbId
    } = req.body;

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      // Server-side point calculation
      let serverMultiplier = 1.0;
      const numHours = parseFloat(hours) || 0;
      if (numHours >= 25) serverMultiplier = 4.0;
      else if (numHours >= 15) serverMultiplier = 3.0;
      else if (numHours >= 8) serverMultiplier = 2.0;

      let serverPoints = Math.round((parseInt(achievements) || 0) * serverMultiplier);
      
      // Completion Bonus: +20 for 'completed'
      if (completionStatus === 'completed') {
        serverPoints += 20;
      }

      // Find active event
      const { data: activeEvent, error: eventError } = await supabase.from('events').select('id').eq('is_active', true).maybeSingle();
      if (eventError) console.error('Error fetching active event:', eventError);

      // 1. Check for duplicate submission (same user, game, and event)
      if (activeEvent) {
        const { data: existingSub } = await supabase
          .from('submissions')
          .select('id, status, completion_status')
          .eq('user_id', steamId)
          .eq('game_id', String(gameId))
          .eq('event_id', activeEvent.id)
          .neq('status', 'rejected') 
          .maybeSingle();

        if (existingSub) {
          // Exception: If the existing submission is 'verified' AND 'unfinished', allow a NEW submission.
          // Otherwise, block duplicates.
          if (!(existingSub.status === 'verified' && existingSub.completion_status === 'unfinished')) {
            return res.status(400).json({ error: 'You have already submitted progress for this game in the current event.' });
          }
        }
      }

      const submissionData = {
        user_id: steamId,
        user_name: currentUser.displayName || currentUser.steam_name,
        user_avatar: currentUser.steam_avatar || (currentUser.photos?.[0]?.value),
        game_id: String(gameId),
        game_name: gameTitle || game_title || "Unknown Game", 
        game_image: gameImage,
        achievements_during: achievements || 0,
        hours_during: hours || 0,
        achievements_before: achievementsBefore || 0,
        hours_before: hoursBefore || 0,
        multiplier: serverMultiplier,
        calculated_score: serverPoints,
        completion_status: completionStatus || 'beaten',
        steam_appid: steamAppId || null,
        hltb_id: hltbId || null,
        points: serverPoints, 
        notes: notes || '',
        status: 'pending',
        event_id: activeEvent?.id || null,
        created_at: new Date().toISOString()
      };

      console.log('Attempting submission insert:', submissionData);

      const { data, error } = await supabase
        .from('submissions')
        .insert(submissionData)
        .select()
        .single();

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
      notes 
    } = req.body;

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      // 1. Verify ownership and status
      const { data: sub, error: fetchError } = await supabase
        .from('submissions')
        .select('*')
        .eq('id', id)
        .eq('user_id', steamId)
        .single();

      if (fetchError || !sub) {
        return res.status(404).json({ error: 'Submission not found or unauthorized' });
      }

      if (sub.status !== 'pending') {
        return res.status(400).json({ error: 'Cannot edit a submission that has already been reviewed' });
      }

      // 2. Recalculate points
      let serverMultiplier = 1.0;
      const numHours = parseFloat(hours) || 0;
      if (numHours >= 25) serverMultiplier = 4.0;
      else if (numHours >= 15) serverMultiplier = 3.0;
      else if (numHours >= 8) serverMultiplier = 2.0;

      let serverPoints = Math.round((parseInt(achievements) || 0) * serverMultiplier);
      if (completionStatus === 'completed') {
        serverPoints += 20;
      }

      const { data, error } = await supabase
        .from('submissions')
        .update({
          achievements_during: achievements || 0,
          hours_during: hours || 0,
          achievements_before: achievementsBefore || 0,
          hours_before: hoursBefore || 0,
          multiplier: serverMultiplier,
          calculated_score: serverPoints,
          completion_status: completionStatus || sub.completion_status || 'beaten',
          points: serverPoints,
          notes: notes || '',
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
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
      const { data, error } = await supabase
        .from('submissions')
        .select('*, profiles!submissions_user_id_fkey(team)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Flatten the profile team into the submission object for easier use
      const flattenedData = data.map(sub => ({
        ...sub,
        userTeam: (sub as any).profiles?.team || 'none'
      }));

      res.json(flattenedData);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch' });
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
        calculated_score: status === 'verified' ? points : 0
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

      // 1. Get the submission to find out who submitted it (for point sync)
      const { data: sub, error: fetchError } = await supabase.from('submissions').select('user_id').eq('id', id).single();
      
      if (fetchError || !sub) {
        return res.status(404).json({ error: 'Submission not found' });
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

  app.post('/api/admin/recalculate-all', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {

      // 1. Fetch all verified submissions
      const { data: subs, error: fetchError } = await supabase.from('submissions').select('*').eq('status', 'verified');
      if (fetchError) throw fetchError;

      console.log(`[Admin] Recalculating points for ${subs.length} submissions...`);

      for (const sub of subs) {
        // Redetermine multiplier based on CORRECTED math (1x, 2x, 3x, 4x)
        let multiplier = 1.0;
        const hours = Number(sub.hours_during || 0);
        if (hours >= 25) multiplier = 4.0;
        else if (hours >= 15) multiplier = 3.0;
        else if (hours >= 8) multiplier = 2.0;
        else multiplier = 1.0;

        const correctPoints = Math.round(Number(sub.achievements_during || 0) * multiplier);
        
        console.log(`[Admin] Recalculating sub ${sub.id}: user=${sub.user_name}, achievements=${sub.achievements_during}, hours=${sub.hours_during} -> multiplier=${multiplier}, points=${correctPoints}`);

        // Update the submission with corrected fields
        await supabase.from('submissions').update({ 
          points: correctPoints,
          multiplier: multiplier,
          calculated_score: correctPoints 
        }).eq('id', sub.id);
      }

      // 2. Fetch all users who have verified submissions to sync their profile points
      const { data: usersToSync } = await supabase.from('submissions').select('user_id').eq('status', 'verified');
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
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      console.error('Failed to fetch events:', err);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });

  app.post('/api/admin/events', async (req, res) => {
    const { title, description, startDate, endDate, isActive } = req.body;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      const { data, error } = await supabase
        .from('events')
        .insert({
          title,
          description,
          start_date: startDate,
          end_date: endDate,
          is_active: isActive || false,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err) {
      console.error('Failed to create event:', err);
      res.status(500).json({ error: 'Failed to create event' });
    }
  });

  app.put('/api/admin/events/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description, startDate, endDate, isActive } = req.body;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    try {
      const { data, error } = await supabase
        .from('events')
        .update({
          title,
          description,
          start_date: startDate,
          end_date: endDate,
          is_active: isActive
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err) {
      console.error('Failed to update event:', err);
      res.status(500).json({ error: 'Failed to update event' });
    }
  });

  app.get('/api/games/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.json([]);

    try {
      const token = await getIGDBToken();
      const response = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': process.env.IGDB_CLIENT_ID!,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain'
        },
        body: `search "${query}"; fields name, cover.url, summary, external_games.category, external_games.uid, websites.url, websites.category; limit 5;`
      });

      const data: any = await response.json();
      
      if (!Array.isArray(data)) {
        return res.json([]);
      }

      // Transform IGDB format
      const results = data.map((game: any) => {
        // Steam ID can be in external_games (category 1) or websites (category 13)
        let steamId = game.external_games?.find((eg: any) => eg.category === 1)?.uid;
        if (!steamId) {
          const steamWebsite = game.websites?.find((w: any) => w.category === 13 || w.url.includes('store.steampowered.com/app/'));
          if (steamWebsite) {
            const match = steamWebsite.url.match(/\/app\/(\d+)/);
            if (match) steamId = match[1];
          }
        }

        // HLTB ID extraction: Check external_games (cat 14) or website URL
        let hltbId = game.external_games?.find((eg: any) => eg.category === 14)?.uid;
        if (!hltbId) {
          const hltbUrl = game.websites?.find((w: any) => w.url.includes('howlongtobeat.com'))?.url;
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
            steam_appid: steamId,
            hltb_id: hltbId
          };
        });

      res.json(results);
    } catch (err) {
      console.error('IGDB Error:', err);
      res.status(500).json({ error: 'Search failed' });
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

