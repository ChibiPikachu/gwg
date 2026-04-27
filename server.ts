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
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
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
          console.error('Supabase Session Get Error:', error);
          return callback(error);
        }
        if (!data) return callback(null, null);
        
        callback(null, data.data);
      } catch (err) {
        console.error('Supabase Session Get Exception:', err);
        callback(err);
      }
    }

    async set(sid: string, sessionData: any, callback: (err?: any) => void) {
      if (!this.supabase) return callback();
      try {
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
          console.error('Supabase Session Set Error:', error);
          if (error.code === '42P01') {
            console.error('CRITICAL: The "sessions" table does not exist in Supabase.');
          }
        }
        callback(error);
      } catch (err) {
        console.error('Supabase Session Set Exception:', err);
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

  // Steam Strategy
  const steamApiKey = process.env.STEAM_API_KEY;
  const envFilePath = path.join(process.cwd(), '.env');
  
  if (!steamApiKey) {
    console.warn(`
⚠️ STEAM_API_KEY is NOT defined in process.env.
- Current Working Directory: ${process.cwd()}
- Looking for .env at: ${envFilePath}
- NODE_ENV: ${process.env.NODE_ENV}
- Steam login will not function.
    `);
  }

  // Use a helper to get the base URL
  const getAppBaseUrl = (req?: any) => {
    if (process.env.APP_URL) return process.env.APP_URL;
    if (req) {
      let url = `${req.protocol}://${req.get('host')}`;
      if (url.includes('.run.app') || url.includes('.ais.')) {
        url = url.replace('http://', 'https://');
      }
      return url;
    }
    return 'http://localhost:3000';
  };

  passport.use(new SteamStrategy({
    returnURL: (process.env.APP_URL || 'http://localhost:3000') + '/auth/steam/return',
    realm: process.env.APP_URL || 'http://localhost:3000',
    apiKey: steamApiKey || 'DUMMY_KEY'
  }, (identifier: string, profile: any, done: (err: any, user?: any) => void) => {
    profile.identifier = identifier;
    profile.id = profile.id || identifier.split('/').pop(); // Ensure ID is present
    return done(null, profile);
  }));

  // Discord Strategy
  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID || 'dummy',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || 'dummy',
    callbackURL: `${process.env.APP_URL || 'http://localhost:3000'}/auth/discord/callback`,
    scope: ['identify']
  }, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
  }));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      uptime: process.uptime(),
      env: process.env.NODE_ENV,
      steamKeySet: !!process.env.STEAM_API_KEY
    });
  });

  // Auth Routes
  app.get('/api/auth/steam/url', (req, res) => {
    let appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    // Force HTTPS for production/preview urls
    if (appUrl.includes('.run.app') || appUrl.includes('.ais.')) {
      appUrl = appUrl.replace('http://', 'https://');
    }
    const returnTo = `${appUrl}/auth/steam/return`;
    const realm = appUrl;
    
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': realm,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
    });

    res.json({ url: `https://steamcommunity.com/openid/login?${params.toString()}` });
  });

  app.get('/api/auth/discord/url', (req, res) => {
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID || '',
      redirect_uri: `${appUrl}/auth/discord/callback`,
      response_type: 'code',
      scope: 'identify'
    });
    res.json({ url: `https://discord.com/api/oauth2/authorize?${params.toString()}` });
  });

  app.get('/auth/steam', passport.authenticate('steam'));
  
  app.get(['/auth/steam/return', '/auth/steam/return/'], (req, res, next) => {
    passport.authenticate('steam', (err: any, user: any) => {
      if (err) {
        console.error('Steam Auth Error:', err);
        // Redirect back with error
        return res.redirect('/?error=' + encodeURIComponent(err.message || 'Auth Error'));
      }
      if (!user) {
        return res.redirect('/');
      }
      (req as any).logIn(user, async (err: any) => {
        if (err) {
          console.error('Login Error:', err);
          return res.redirect('/?error=LoginFailed');
        }
        
        // Upsert user to Supabase
        const supabase = getSupabase();
        if (supabase) {
          try {
            const steamProfile = user;
            await supabase.from('profiles').upsert({
              steam_id: steamProfile.id,
              steam_name: steamProfile.displayName,
              steam_avatar: steamProfile.photos?.[2]?.value || steamProfile.photos?.[0]?.value,
              last_login: new Date().toISOString()
            }, { onConflict: 'steam_id' });
          } catch (dbErr) {
            console.error('Failed to sync Steam user to Supabase:', dbErr);
          }
        }

        // Save session explicitly before sending response
        if ((req as any).session) {
          (req as any).session.save((err: any) => {
            if (err) {
              console.error('Session Save Error:', err);
              return res.redirect('/?error=SessionSaveFailed');
            }
            sendSteamResponse(res, user);
          });
        } else {
          sendSteamResponse(res, user);
        }
      });
    })(req, res, next);
  });

  function sendSteamResponse(res: any, user: any) {
    res.redirect('/');
  }

  app.get('/auth/discord', passport.authenticate('discord'));
  app.get('/auth/discord/callback', (req, res, next) => {
    passport.authenticate('discord', async (err: any, user: any) => {
      if (err || !user) return res.redirect('/');
      
      // If user is logged in via Steam, link Discord
      const currentUser = (req as any).user;
      const supabase = getSupabase();
      if (currentUser && currentUser.id && supabase) {
        try {
          await supabase.from('profiles').update({
            discord_id: user.id,
            discord_name: user.username,
            discord_avatar: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
          }).eq('steam_id', currentUser.id);
          
          // Update local session
          (req as any).user.discordId = user.id;
          (req as any).user.discordName = user.username;
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
    
    const steamId = user.id || user.steam_id || user.steamId;

    if (supabase && steamId) {
      try {
        const { error } = await supabase.from('profiles').update({
          steam_name: displayName,
          status: status,
          updated_at: new Date().toISOString()
        }).eq('steam_id', steamId);

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
      
      const steamId = user.id || user.steam_id || user.steamId;
      
      if (supabase && steamId) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('steam_id', steamId)
            .single();
            
          if (data && !error) {
            // Merge database data with session data for the frontend
            return res.json({
              ...user,
              ...data
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

