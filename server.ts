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

// ✅ FIX: no more localhost fallback
const APP_URL = process.env.APP_URL;
if (!APP_URL) {
  throw new Error("APP_URL is not set");
}

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

  app.set('trust proxy', 1);
  app.use(express.json());

  app.use(session({
    secret: process.env.SESSION_SECRET || 'gwg-tracker-secret',
    resave: true,
    saveUninitialized: true,
    name: 'gwg.sid',
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30,
      httpOnly: true,
    }
  }));

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

  const steamApiKey = process.env.STEAM_API_KEY;

  console.log('App URL Config:', APP_URL);
  console.log('Steam API Key Status:', steamApiKey ? 'Loaded' : 'MISSING' + ' (checked process.env.STEAM_API_KEY)');

  if (!steamApiKey) {
    console.warn('STEAM_API_KEY is missing. Steam login will not function correctly.');
  }

  // Steam Strategy
  passport.use(new SteamStrategy({
    returnURL: `${APP_URL}/auth/steam/return`,
    realm: APP_URL,
    apiKey: steamApiKey || 'DUMMY_KEY'
  }, (identifier: string, profile: any, done: (err: any, user?: any) => void) => {
    profile.identifier = identifier;
    profile.id = profile.id || identifier.split('/').pop();
    return done(null, profile);
  }));

  // Discord Strategy
  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID || 'dummy',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || 'dummy',
    callbackURL: `${APP_URL}/auth/discord/callback`,
    scope: ['identify']
  }, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
  }));

  // Steam login URL
  app.get('/api/auth/steam/url', (req, res) => {
    const returnTo = `${APP_URL}/auth/steam/return`;
    const realm = APP_URL;

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

  app.get('/auth/steam', passport.authenticate('steam'));

  app.get(['/auth/steam/return', '/auth/steam/return/'], (req, res, next) => {
    passport.authenticate('steam', (err: any, user: any) => {
      if (err) return res.redirect('/?error=' + encodeURIComponent(err.message || 'Auth Error'));
      if (!user) return res.redirect('/');

      (req as any).logIn(user, async (err: any) => {
        if (err) return res.redirect('/?error=LoginFailed');

        const supabase = getSupabase();
        if (supabase) {
          try {
            await supabase.from('profiles').upsert({
              steam_id: user.id,
              steam_name: user.displayName,
              steam_avatar: user.photos?.[2]?.value || user.photos?.[0]?.value,
              last_login: new Date().toISOString()
            }, { onConflict: 'steam_id' });
          } catch (e) {
            console.error(e);
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

  app.get('/auth/discord', passport.authenticate('discord'));

  app.get('/auth/discord/callback', (req, res, next) => {
    passport.authenticate('discord', async (err: any, user: any) => {
      if (err || !user) return res.redirect('/');
      res.send(`<html><body><script>
        window.opener.postMessage({ type: 'DISCORD_AUTH_SUCCESS', user: ${JSON.stringify(user)} }, '*');
        window.close();
      </script></body></html>`);
    })(req, res, next);
  });

  return { app, PORT };
}

import serverless from "serverless-http";

const { app } = await createServer();
export default serverless(app);