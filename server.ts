import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';
import { Strategy as DiscordStrategy } from 'passport-discord';
import path from 'path';
import { fileURLToPath } from 'url';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

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
                  !!process.env.K_SERVICE; // Cloud Run detection

  // Custom Supabase Session Store
  class SupabaseStore extends session.Store {
    supabase: any;
    constructor() {
      super();
      this.supabase = getSupabase();
      console.log('SupabaseStore initialized. Client available:', !!this.supabase);
      if (this.supabase) {
        // Quick check for table access
        this.supabase.from('sessions').select('*', { count: 'exact', head: true }).limit(1)
          .then(({ error }: any) => {
            if (error) console.error('[SessionStore] Initial table check failed:', error.message);
            else console.log('[SessionStore] Initial table check successful.');
          });
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
    resave: true, // Set to true for debugging store updates
    saveUninitialized: false,
    name: 'gwg.sid',
    proxy: true,
    store: new SupabaseStore(),
    cookie: {
      secure: true, // Forces secure for cookies in modern browsers/iframes
      sameSite: 'none', // Critical for cross-origin/iframe contexts
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
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

  // Derive base URL for auth redirects
  const appBaseUrl = (process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')).replace(/\/$/, '');

  const getAppBaseUrl = (req: any) => {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    let url = `${protocol}://${host}`;
    // Force HTTPS for known cloud domains or if proto is https
    if (url.includes('.run.app') || url.includes('.ais.') || url.includes('.vercel.app') || protocol === 'https') {
      url = url.replace('http://', 'https://');
    }
    return url.replace(/\/$/, '');
  };

  // Auth Strategies
  const steamApiKey = process.env.STEAM_API_KEY;
  passport.use(new SteamStrategy({
    returnURL: `${appBaseUrl}/auth/steam/return`,
    realm: appBaseUrl,
    apiKey: steamApiKey || 'DUMMY_KEY'
  }, (identifier: string, profile: any, done: (err: any, user?: any) => void) => {
    profile.identifier = identifier;
    profile.id = profile.id || identifier.split('/').pop();
    return done(null, profile);
  }));

  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID || 'dummy',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || 'dummy',
    callbackURL: `${appBaseUrl}/auth/discord/callback`,
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
      console.log('[Auth] Steam login start. ReturnURL:', strategy._returnURL, 'Realm:', strategy._realm);
    }
    passport.authenticate('steam')(req, res, next);
  });

  app.get(['/auth/steam/return', '/auth/steam/return/'], (req, res, next) => {
    const appUrl = getAppBaseUrl(req);
    const strategy = (passport as any)._strategies.steam;
    if (strategy) {
      strategy._returnURL = `${appUrl}/auth/steam/return`;
      strategy._realm = appUrl;
      console.log('[Auth] Steam return. Verifying against ReturnURL:', strategy._returnURL);
    }

    passport.authenticate('steam', (err: any, user: any) => {
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
    const appUrl = getAppBaseUrl(req);
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID || '',
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
          await supabase.from('profiles').update({
            discord_id: user.id,
            discord_name: user.username,
            discord_avatar: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
          }).eq('steamid', currentUser.id || currentUser.steam_id || currentUser.steamid);
          
          Object.assign((req as any).user, {
            discord_id: user.id,
            discord_name: user.username,
            discord_avatar: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
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
              isAdmin: data.role === 'admin' // Ensure isAdmin is correctly set based on role
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
  app.get('/api/admin/users', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentUser = (req as any).user;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    // Verify admin role from database
    const steamId = currentUser.id || currentUser.steamid || currentUser.steam_id;
    const { data: profile } = await supabase.from('profiles').select('role').eq('steamid', steamId).single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'admins')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data: users, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(users);
  });

  app.get('/api/leaderboard/users', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

    // Publicly return limited profiles
    const { data: users, error } = await supabase
      .from('profiles')
      .select('steamid, steam_name, steam_avatar, team, status, points, role')
      .order('points', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(users);
  });

  app.post('/api/admin/update-user-team', async (req, res) => {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { targetSteamId, team } = req.body;
    console.log('[Admin] Update Team Start:', { targetSteamId, team });
    
    const currentUser = (req as any).user;
    const supabase = getSupabase();
    if (!supabase) {
      console.error('[Admin] Database unavailable');
      return res.status(500).json({ error: 'Database unavailable' });
    }

    // Verify admin role
    const steamId = String(currentUser.id || currentUser.steamid || currentUser.steam_id);
    console.log('[Admin] Verifying Steam ID:', steamId);
    
    try {
      // Diagnostic: Check what teams actually look like in the DB
      const { data: sampleUsers } = await supabase.from('profiles').select('team').limit(5);
      console.log('[Admin] Sample team values from DB:', sampleUsers?.map(u => u.team));

      const { data: profile, error: roleError } = await supabase.from('profiles').select('role').eq('steamid', steamId).single();

      if (roleError) {
        console.error('[Admin] Role verification error:', roleError.message);
        return res.status(403).json({ error: `Forbidden: ${roleError.message}` });
      }

      if (!profile || (profile.role !== 'admin' && profile.role !== 'admins')) {
        console.warn('[Admin] Insufficient permissions for:', steamId, 'Role:', profile?.role);
        return res.status(403).json({ error: 'Forbidden: Not an admin' });
      }

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

// Start the server
const { app, PORT } = await createServer();

if (process.env.VERCEL) {
  // Export for Vercel
  // No need for a custom handler here if we use the export below
} else {
  // For local and container environments
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

export default app;

