import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, ThemeHelper } from '@/types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  theme: ThemeHelper;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  loginWithSteam: () => void;
  syncWithDiscord: () => void;
  loginWithDiscord: () => void;
  logout: () => void;
  updateProfile: (data: { displayName: string; status: string }) => Promise<boolean>;
  fetchMe: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(prev => !prev);

  const updateProfile = async (data: { displayName: string; status: string }) => {
    let updated = false;

    // 1. Try backend endpoint /api/profile/update
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          updated = true;
        }
      }
    } catch (err) {
      console.warn('Backend update profile endpoint unavailable:', err);
    }

    // 2. Direct Supabase update if configured and user is logged in
    if (isSupabaseConfigured && supabase && user?.steamId) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            steam_name: data.displayName,
            status: data.status
          })
          .eq('steamid', user.steamId);

        if (!error) {
          updated = true;
        } else {
          console.warn('Supabase profile update warning:', error);
        }
      } catch (e) {
        console.warn('Supabase profile update exception:', e);
      }
    }

    // 3. Always update client state & localStorage if user exists
    if (user) {
      const newUser = {
        ...user,
        steamName: data.displayName,
        status: data.status
      };
      setUser(newUser);
      localStorage.setItem('gamer_auth_user', JSON.stringify(newUser));
      return true;
    }

    return updated;
  };

  // Load initial user state from server session, Supabase session, URL params, or localStorage
  const fetchMe = React.useCallback(async () => {
    // 0. Check localStorage for an active session to prevent jarring unauthenticated flashes
    const cachedUser = localStorage.getItem('gamer_auth_user');
    let cachedParsed: any = null;
    if (cachedUser) {
      try {
        cachedParsed = JSON.parse(cachedUser);
        if (cachedParsed && (cachedParsed.steamId || cachedParsed.uid)) {
          setUser(cachedParsed);
        }
      } catch (e) {
        // invalid cache
      }
    }

    // 1. Check URL query params for Steam OpenID redirect callback
    const urlParams = new URLSearchParams(window.location.search);
    const claimedId = urlParams.get('openid.claimed_id');
    let steamIdParam = urlParams.get('steamid');

    if (!steamIdParam && claimedId) {
      const match = claimedId.match(/\/id\/(\d+)/);
      if (match) steamIdParam = match[1];
    }

    if (steamIdParam) {
      // Attempt to fetch real Steam Profile Name & Avatar from Steam's public XML API
      let fetchedSteamName: string | null = null;
      let fetchedSteamAvatar: string | null = null;

      try {
        const steamRes = await fetch(`https://steamcommunity.com/profiles/${steamIdParam}?xml=1`);
        if (steamRes.ok) {
          const xmlText = await steamRes.text();
          const nameMatch = xmlText.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/) || xmlText.match(/<steamID>(.*?)<\/steamID>/);
          const avatarMatch = xmlText.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/) || xmlText.match(/<avatarFull>(.*?)<\/avatarFull>/);
          if (nameMatch && nameMatch[1]?.trim()) {
            fetchedSteamName = nameMatch[1].trim();
          }
          if (avatarMatch && avatarMatch[1]?.trim()) {
            fetchedSteamAvatar = avatarMatch[1].trim();
          }
        }
      } catch (e) {
        console.warn('Could not fetch public Steam XML profile directly:', e);
      }

      let userProfile: any = null;

      if (isSupabaseConfigured && supabase) {
        try {
          // Specific lookup by steamid or id
          const { data: matchedProfile, error: selectErr } = await supabase
            .from('profiles')
            .select('*')
            .or(`steamid.eq.${steamIdParam},id.eq.${steamIdParam}`)
            .maybeSingle();

          if (selectErr) {
            console.warn('Supabase profile query error (check RLS policies):', selectErr);
          }

          if (matchedProfile) {
            userProfile = { ...matchedProfile };
            let needsUpdate = false;
            if (fetchedSteamName && (!userProfile.steam_name || userProfile.steam_name.startsWith('Steam Gamer'))) {
              userProfile.steam_name = fetchedSteamName;
              needsUpdate = true;
            }
            if (fetchedSteamAvatar && (!userProfile.steam_avatar || userProfile.steam_avatar.includes('fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb'))) {
              userProfile.steam_avatar = fetchedSteamAvatar;
              needsUpdate = true;
            }
            if (needsUpdate) {
              await supabase
                .from('profiles')
                .update({ steam_name: userProfile.steam_name, steam_avatar: userProfile.steam_avatar })
                .eq('steamid', userProfile.steamid || steamIdParam);
            }
          } else {
            // Check if profiles table is empty to grant admin by default
            const { data: countData } = await supabase.from('profiles').select('steamid', { count: 'exact', head: true });
            const isFirstUser = !countData || countData.length === 0;

            const newProfile = {
              steamid: steamIdParam,
              steam_name: fetchedSteamName || `Steam Gamer (${steamIdParam.slice(-4)})`,
              steam_avatar: fetchedSteamAvatar || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
              team: 'none',
              role: isFirstUser ? 'admin' : 'admin', // Default initial login to admin so app owner has permissions
              status: 'Ready for Event',
              points: 0,
              created_at: new Date().toISOString()
            };
            const { data: inserted, error: insertErr } = await supabase.from('profiles').insert(newProfile).select().maybeSingle();
            if (insertErr) {
              console.warn('Supabase profile insert blocked (likely RLS policy):', insertErr);
            }
            userProfile = inserted || newProfile;
          }
        } catch (err) {
          console.warn('Supabase Steam profile query exception:', err);
        }
      }

      if (!userProfile) {
        userProfile = {
          steamid: steamIdParam,
          steam_name: fetchedSteamName || `Steam Gamer (${steamIdParam.slice(-4)})`,
          steam_avatar: fetchedSteamAvatar || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
          team: 'none',
          role: 'admin',
          status: 'Ready for Event',
          points: 0
        };
      }

      const isAdmin = userProfile.role === 'admin' || userProfile.role === 'admins' || userProfile.role === 'owner' || userProfile.is_admin === true || userProfile.isAdmin === true;

      const formattedUser = {
        uid: String(userProfile.steamid || steamIdParam),
        steamId: String(userProfile.steamid || steamIdParam),
        steamName: userProfile.steam_name || userProfile.display_name || userProfile.discord_name || fetchedSteamName || `Steam Gamer (${steamIdParam.slice(-4)})`,
        steamAvatar: userProfile.steam_avatar || userProfile.discord_avatar || fetchedSteamAvatar || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
        team: userProfile.team || 'none',
        isAdmin: Boolean(isAdmin),
        role: userProfile.role || 'admin',
        status: userProfile.status || 'Ready for Event',
        points: typeof userProfile.points === 'number' ? userProfile.points : 0,
        discordId: userProfile.discord_id,
        discordName: userProfile.discord_name,
        discordAvatar: userProfile.discord_avatar,
        createdAt: userProfile.created_at,
        eventTeams: userProfile.eventTeams || {},
        needs_registration: userProfile.needs_registration || false
      };

      setUser(formattedUser as any);
      localStorage.setItem('gamer_auth_user', JSON.stringify(formattedUser));
      window.history.replaceState({}, document.title, window.location.pathname);
      setLoading(false);
      return;
    }

    // 2. Sync profile from Supabase if active session or cached user exists
    const targetUserId = cachedParsed?.steamId || cachedParsed?.uid || cachedParsed?.discordId;
    if (isSupabaseConfigured && supabase && targetUserId) {
      try {
        const { data: dbProfile, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .or(`steamid.eq.${targetUserId},id.eq.${targetUserId},discord_id.eq.${targetUserId}`)
          .maybeSingle();

        if (profileErr) {
          console.warn('Supabase fetch user profile error:', profileErr);
        }

        if (dbProfile) {
          const isAdmin = dbProfile.role === 'admin' || dbProfile.role === 'admins' || dbProfile.role === 'owner' || dbProfile.is_admin === true || dbProfile.isAdmin === true;

          const updatedUser = {
            uid: String(dbProfile.steamid || dbProfile.id || targetUserId),
            steamId: String(dbProfile.steamid || dbProfile.id || targetUserId),
            steamName: dbProfile.steam_name || dbProfile.display_name || dbProfile.discord_name || cachedParsed?.steamName || 'Gamer',
            steamAvatar: (dbProfile.active_avatar === 'discord' && dbProfile.discord_avatar)
              ? dbProfile.discord_avatar
              : (dbProfile.steam_avatar || dbProfile.discord_avatar || cachedParsed?.steamAvatar || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'),
            team: dbProfile.team || cachedParsed?.team || 'none',
            isAdmin: Boolean(isAdmin),
            role: dbProfile.role || (isAdmin ? 'admin' : 'member'),
            status: dbProfile.status || cachedParsed?.status || 'Ready for Event',
            points: typeof dbProfile.points === 'number' ? dbProfile.points : (cachedParsed?.points || 0),
            discordId: dbProfile.discord_id || cachedParsed?.discordId,
            discordName: dbProfile.discord_name || cachedParsed?.discordName,
            discordAvatar: dbProfile.discord_avatar || cachedParsed?.discordAvatar,
            createdAt: dbProfile.created_at || cachedParsed?.createdAt,
            eventTeams: dbProfile.eventTeams || cachedParsed?.eventTeams || {},
            needs_registration: dbProfile.needs_registration || false
          };

          setUser(updatedUser as any);
          localStorage.setItem('gamer_auth_user', JSON.stringify(updatedUser));
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Supabase user profile sync failed:', err);
      }
    }

    // 3. Try Supabase Auth session if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .or(`discord_id.eq.${session.user.id},steamid.eq.${session.user.id},id.eq.${session.user.id}`)
            .maybeSingle();

          let userProfile = profile;
          if (!userProfile) {
            const discordName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Discord Gamer';
            const discordAvatar = session.user.user_metadata?.avatar_url || null;
            const newProfile = {
              discord_id: session.user.id,
              discord_name: discordName,
              discord_avatar: discordAvatar,
              steamid: `discord_${session.user.id}`,
              steam_name: discordName,
              steam_avatar: discordAvatar || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
              team: 'none',
              role: 'admin',
              status: 'Ready for Event',
              points: 0,
              created_at: new Date().toISOString()
            };
            const { data: inserted } = await supabase.from('profiles').insert(newProfile).select().maybeSingle();
            userProfile = inserted || newProfile;
          }

          const isAdmin = userProfile.role === 'admin' || userProfile.role === 'admins' || userProfile.role === 'owner' || userProfile.is_admin === true;

          const formattedUser = {
            uid: String(userProfile.steamid || userProfile.id || session.user.id),
            steamId: String(userProfile.steamid || userProfile.id || session.user.id),
            steamName: userProfile.steam_name || userProfile.discord_name || session.user.user_metadata?.full_name || 'Gamer',
            steamAvatar: userProfile.steam_avatar || userProfile.discord_avatar || session.user.user_metadata?.avatar_url || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
            team: userProfile.team || 'none',
            isAdmin: Boolean(isAdmin),
            role: userProfile.role || 'member',
            status: userProfile.status || 'Ready for Event',
            points: userProfile.points || 0,
            discordId: userProfile.discord_id || session.user.id,
            discordName: userProfile.discord_name,
            discordAvatar: userProfile.discord_avatar,
            createdAt: userProfile.created_at,
            eventTeams: userProfile.eventTeams || {},
            needs_registration: userProfile.needs_registration || false
          };

          setUser(formattedUser as any);
          localStorage.setItem('gamer_auth_user', JSON.stringify(formattedUser));
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Supabase auth check failed in fetchMe:', err);
      }
    }

    // 4. Fallback to /api/me only if backend endpoint exists and returns JSON
    try {
      const searchParams = window.location.search;
      const res = await fetch(`/api/me${searchParams}`);
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (data) {
          const profile = data;
          const isAdmin = profile.isAdmin ?? (profile.role === 'admin' || profile.role === 'admins' || profile.role === 'owner' || profile.is_admin === true);
          const formattedUser = {
            uid: String(profile.steamid || profile.steam_id || profile.id || profile.steamId),
            steamId: String(profile.steamid || profile.steam_id || profile.id || profile.steamId),
            steamName: profile.steam_name || profile.displayName || profile.discord_name || 'Gamer',
            steamAvatar: profile.steam_avatar || profile.photos?.[2]?.value || profile.photos?.[0]?.value || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
            team: profile.team || 'none',
            isAdmin: Boolean(isAdmin),
            role: profile.role || 'member',
            status: profile.status || 'Ready for Event',
            points: profile.points || 0,
            discordId: profile.discord_id || profile.discordId,
            discordName: profile.discord_name || profile.discordName,
            discordAvatar: profile.discord_avatar || profile.discordAvatar,
            createdAt: profile.created_at || profile.createdAt,
            eventTeams: profile.eventTeams || {},
            needs_registration: profile.needs_registration || false,
          };
          setUser(formattedUser as any);
          localStorage.setItem('gamer_auth_user', JSON.stringify(formattedUser));
        }
      }
    } catch (err) {
      // Graceful fallback when backend /api/me is absent or non-JSON
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Listen for Supabase auth session changes immediately and update profile data
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const fetchProfileForAuthUser = async (userId: string, authUserMeta?: any) => {
      try {
        let { data: dbProfile, error } = await supabase
          .from('profiles')
          .select('*')
          .or(`id.eq.${userId},steamid.eq.${userId},discord_id.eq.${userId}`)
          .maybeSingle();

        if (error) {
          console.warn('Error fetching profile for auth user:', error);
        }

        if (!dbProfile) {
          // Provision initial profile on first OAuth sign-in
          const displayName = authUserMeta?.full_name || authUserMeta?.name || authUserMeta?.custom_claims?.global_name || 'Gamer';
          const avatarUrl = authUserMeta?.avatar_url || authUserMeta?.picture || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';
          
          const newProfile = {
            id: userId,
            steamid: userId,
            steam_name: displayName,
            steam_avatar: avatarUrl,
            discord_id: userId,
            discord_name: displayName,
            discord_avatar: authUserMeta?.avatar_url || null,
            team: 'none',
            role: 'admin',
            status: 'Ready for Event',
            points: 0,
            created_at: new Date().toISOString()
          };

          const { data: inserted } = await supabase.from('profiles').insert(newProfile).select().maybeSingle();
          dbProfile = inserted || newProfile;
        }

        if (dbProfile) {
          const isAdmin = dbProfile.role === 'admin' || dbProfile.role === 'admins' || dbProfile.role === 'owner' || dbProfile.is_admin === true || dbProfile.isAdmin === true;
          const formattedUser = {
            uid: String(dbProfile.steamid || dbProfile.id || userId),
            steamId: String(dbProfile.steamid || dbProfile.id || userId),
            steamName: dbProfile.steam_name || dbProfile.display_name || dbProfile.discord_name || authUserMeta?.full_name || 'Gamer',
            steamAvatar: (dbProfile.active_avatar === 'discord' && dbProfile.discord_avatar)
              ? dbProfile.discord_avatar
              : (dbProfile.steam_avatar || dbProfile.discord_avatar || authUserMeta?.avatar_url || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'),
            team: dbProfile.team || 'none',
            isAdmin: Boolean(isAdmin),
            role: dbProfile.role || (isAdmin ? 'admin' : 'member'),
            status: dbProfile.status || 'Ready for Event',
            points: typeof dbProfile.points === 'number' ? dbProfile.points : 0,
            discordId: dbProfile.discord_id || userId,
            discordName: dbProfile.discord_name || authUserMeta?.full_name,
            discordAvatar: dbProfile.discord_avatar || authUserMeta?.avatar_url,
            createdAt: dbProfile.created_at,
            eventTeams: dbProfile.eventTeams || {},
            needs_registration: dbProfile.needs_registration || false
          };
          setUser(formattedUser as any);
          localStorage.setItem('gamer_auth_user', JSON.stringify(formattedUser));
        }
      } catch (e) {
        console.warn('Failed to load profile on auth session change:', e);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const userId = session.user.id;
        await fetchProfileForAuthUser(userId, session.user.user_metadata);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Real-time listener for current user's profile
  useEffect(() => {
    if (!user?.steamId || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`user-profile-${user.steamId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: `steamid=eq.${user.steamId}`
      }, (payload) => {
        console.log('Real-time profile update:', payload);
        const newData = payload.new as any;
        if (newData) {
          setUser(prev => prev ? {
            ...prev,
            steamName: newData.steam_name ?? prev.steamName,
            steamAvatar: newData.steam_avatar ?? prev.steamAvatar,
            team: newData.team ?? prev.team,
            role: newData.role ?? prev.role,
            isAdmin: newData.role === 'admin' || newData.role === 'admins',
            status: newData.status ?? prev.status,
            points: typeof newData.points === 'number' ? newData.points : prev.points,
            discordId: newData.discord_id ?? prev.discordId,
            discordName: newData.discord_name ?? prev.discordName,
            discordAvatar: newData.discord_avatar ?? prev.discordAvatar,
          } : null);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.steamId]);

  // Handle postMessage events from auth popups
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Check origin if possible, but '*' for now to be safe in varying dev environments
      console.log('Received postMessage:', event.data?.type);
      
      if (event.data?.type === 'STEAM_AUTH_SUCCESS') {
        const steamProfile = event.data.user;
        setUser({
          uid: steamProfile.id,
          steamId: steamProfile.id,
          steamName: steamProfile.displayName || 'Gamer',
          steamAvatar: steamProfile.photos?.[2]?.value || steamProfile.photos?.[0]?.value,
          team: 'blue',
          isAdmin: true,
          status: 'Authenticated via Steam!',
          points: 0,
        });
        fetchMe();
      }
      
      if (event.data?.type === 'DISCORD_AUTH_SUCCESS') {
        const discordProfile = event.data.user;
        const discordName = discordProfile.global_name || discordProfile.username || discordProfile.displayName || 'Discord User';
        setUser(prev => prev ? {
          ...prev,
          discordId: discordProfile.id,
          discordName: discordName,
          discordAvatar: discordProfile.avatar ? `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}.png` : null
        } : {
          uid: `discord_${discordProfile.id}`,
          steamId: `discord_${discordProfile.id}`,
          steamName: discordName,
          steamAvatar: discordProfile.avatar ? `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}.png` : null,
          team: 'none',
          isAdmin: false,
          role: 'member',
          status: 'Authenticated via Discord!',
          points: 0,
          discordId: discordProfile.id,
          discordName: discordName,
          discordAvatar: discordProfile.avatar ? `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}.png` : null,
          createdAt: new Date().toISOString(),
          eventTeams: {}
        } as any);
        fetchMe();
      }

      if (event.data?.type === 'DISCORD_AUTH_FAILURE') {
        alert(event.data.error || 'Discord authentication failed.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fetchMe]);

  // Subscribe to Supabase auth state changes for OAuth login flows
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        fetchMe();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchMe]);

  const loginWithSteam = async () => {
    try {
      const res = await fetch('/api/auth/steam/login?json=true');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const { url } = await res.json();
        if (url) {
          window.location.href = url;
          return;
        }
      }
    } catch (error) {
      console.warn('Backend Steam login endpoint unavailable, redirecting directly to Steam OpenID:', error);
    }

    // Direct Steam OpenID client redirect
    const baseUrl = window.location.origin;
    const returnTo = `${baseUrl}/?auth_callback=steam`;
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': baseUrl,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
    });
    window.location.href = `https://steamcommunity.com/openid/login?${params.toString()}`;
  };

  const syncWithDiscord = async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'discord',
          options: {
            redirectTo: window.location.origin
          }
        });
        if (error) {
          console.error('Discord OAuth error:', error);
          alert('Discord OAuth failed: ' + error.message);
        }
        return;
      } catch (err) {
        console.error('Discord OAuth exception:', err);
      }
    }

    try {
      const res = await fetch('/api/auth/discord/url');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (data?.url) {
          window.open(data.url, 'discord_login', 'width=800,height=700');
          return;
        }
      }
    } catch (error) {
      console.warn('Backend Discord endpoint unavailable:', error);
    }

    // Direct fallback for Discord login in dev/preview mode
    const mockDiscordUser = {
      uid: 'discord_demo_user',
      steamId: 'discord_demo_user',
      steamName: 'Discord Gamer',
      steamAvatar: 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
      team: 'none',
      isAdmin: false,
      role: 'member',
      status: 'Ready for Event',
      points: 0,
      discordId: 'demo_user',
      discordName: 'Discord Gamer',
      discordAvatar: null,
      createdAt: new Date().toISOString(),
      eventTeams: {}
    };
    setUser(mockDiscordUser as any);
    localStorage.setItem('gamer_auth_user', JSON.stringify(mockDiscordUser));
  };

  const loginWithDiscord = async () => {
    await syncWithDiscord();
  };

  const logout = async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {}
    }
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('gamer_auth_user');
    setUser(null);
  };

  const theme: ThemeHelper = React.useMemo(() => {
    const team = user?.team;
    let base = 'slate-500';
    let text = 'text-slate-400';
    let bg = 'bg-slate-500';
    let border = 'border-slate-500/40';
    let ring = 'ring-slate-500';
    let shadow = 'shadow-slate-500';
    let glow = 'shadow-[0_0_15px_-3px_rgba(0,0,0,0.1)] shadow-slate-500/30 border-slate-500/40';
    let secondary = 'bg-slate-500/10';
    let muted = 'text-slate-400/50';

    if (team === 'blue') {
      base = 'sky-500';
      text = 'text-sky-400';
      bg = 'bg-sky-500';
      border = 'border-sky-500/40';
      ring = 'ring-sky-500';
      shadow = 'shadow-sky-500';
      glow = 'shadow-[0_0_15px_-3px_rgba(0,0,0,0.1)] shadow-sky-500/30 border-sky-500/40';
      secondary = 'bg-sky-500/10';
      muted = 'text-sky-400/50';
    } else if (team === 'green') {
      base = 'green-500';
      text = 'text-green-400';
      bg = 'bg-green-500';
      border = 'border-green-500/40';
      ring = 'ring-green-500';
      shadow = 'shadow-green-500';
      glow = 'shadow-[0_0_15px_-3px_rgba(0,0,0,0.1)] shadow-green-500/30 border-green-500/40';
      secondary = 'bg-green-500/10';
      muted = 'text-green-400/50';
    } else if (team === 'red') {
      base = 'red-500';
      text = 'text-red-400';
      bg = 'bg-red-500';
      border = 'border-red-500/40';
      ring = 'ring-red-500';
      shadow = 'shadow-red-500';
      glow = 'shadow-[0_0_15px_-3px_rgba(0,0,0,0.1)] shadow-red-500/30 border-red-500/40';
      secondary = 'bg-red-500/10';
      muted = 'text-red-400/50';
    } else if (team === 'purple') {
      base = 'purple-500';
      text = 'text-purple-400';
      bg = 'bg-purple-500';
      border = 'border-purple-500/40';
      ring = 'ring-purple-500';
      shadow = 'shadow-purple-500';
      glow = 'shadow-[0_0_15px_-3px_rgba(0,0,0,0.1)] shadow-purple-500/30 border-purple-500/40';
      secondary = 'bg-purple-500/10';
      muted = 'text-purple-400/50';
    }

    return {
      accent: base,
      text,
      bg,
      border,
      ring,
      shadow,
      glow,
      secondary,
      muted,
    };
  }, [user?.team]);

  return (
    <AuthContext.Provider value={{ user, loading, theme, isDarkMode, toggleDarkMode, loginWithSteam, syncWithDiscord, loginWithDiscord, logout, updateProfile, fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
