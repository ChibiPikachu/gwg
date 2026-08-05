import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, ThemeHelper, Team } from '@/types';
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
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setUser(prev => prev ? {
            ...prev,
            steamName: data.displayName,
            status: data.status
          } : null);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('Update profile error:', err);
      return false;
    }
  };

  // Load initial user state from server session or Supabase session
  const fetchMe = React.useCallback(async () => {
    // 1. Try Supabase session first if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .or(`discord_id.eq.${session.user.id},steamid.eq.${session.user.id}`)
            .maybeSingle();

          if (profile) {
            setUser({
              uid: profile.steamid || profile.id || session.user.id,
              steamId: profile.steamid || profile.id || session.user.id,
              steamName: profile.steam_name || profile.discord_name || session.user.user_metadata?.full_name || 'Gamer',
              steamAvatar: profile.steam_avatar || profile.discord_avatar || session.user.user_metadata?.avatar_url || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
              team: profile.team || 'none',
              isAdmin: profile.role === 'admin' || profile.role === 'admins',
              role: profile.role || 'member',
              status: profile.status || 'Ready for Event',
              points: profile.points || 0,
              discordId: profile.discord_id,
              discordName: profile.discord_name,
              discordAvatar: profile.discord_avatar,
              createdAt: profile.created_at,
              eventTeams: profile.eventTeams || {},
              needs_registration: profile.needs_registration || false,
            } as any);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Supabase auth check failed in fetchMe:', err);
      }
    }

    // 2. Check URL query params if returning from Steam/Discord redirect
    const urlParams = new URLSearchParams(window.location.search);
    const steamIdParam = urlParams.get('steamid');
    if (steamIdParam && isSupabaseConfigured && supabase) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('steamid', steamIdParam)
          .maybeSingle();

        if (profile) {
          setUser({
            uid: profile.steamid,
            steamId: profile.steamid,
            steamName: profile.steam_name || 'Gamer',
            steamAvatar: profile.steam_avatar || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
            team: profile.team || 'none',
            isAdmin: profile.role === 'admin' || profile.role === 'admins',
            role: profile.role || 'member',
            status: profile.status || 'Ready for Event',
            points: profile.points || 0,
            discordId: profile.discord_id,
            discordName: profile.discord_name,
            discordAvatar: profile.discord_avatar,
            createdAt: profile.created_at,
            eventTeams: profile.eventTeams || {},
            needs_registration: profile.needs_registration || false,
          } as any);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Steam param profile lookup failed:', err);
      }
    }

    // 3. Fallback to /api/me only if backend endpoint exists and returns JSON
    try {
      const searchParams = window.location.search;
      const res = await fetch(`/api/me${searchParams}`);
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (data) {
          const profile = data;
          setUser({
            uid: profile.steamid || profile.steam_id || profile.id || profile.steamId,
            steamId: profile.steamid || profile.steam_id || profile.id || profile.steamId,
            steamName: profile.steam_name || profile.displayName || 'Gamer',
            steamAvatar: profile.steam_avatar || profile.photos?.[2]?.value || profile.photos?.[0]?.value || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
            team: profile.team || 'none',
            isAdmin: profile.isAdmin ?? (profile.role === 'admin' || profile.role === 'admins'),
            role: profile.role || 'member',
            status: profile.status || 'Ready for Event',
            points: profile.points || 0,
            discordId: profile.discord_id || profile.discordId,
            discordName: profile.discord_name || profile.discordName,
            discordAvatar: profile.discord_avatar || profile.discordAvatar,
            createdAt: profile.created_at || profile.createdAt,
            eventTeams: profile.eventTeams || {},
            needs_registration: profile.needs_registration || false,
          } as any);
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
      if (res.ok) {
        const { url } = await res.json();
        if (url) {
          window.location.href = url;
          return;
        }
      }
      window.location.href = '/api/auth/steam/login';
    } catch (error) {
      console.error('Failed to initiate Steam login:', error);
      window.location.href = '/api/auth/steam/login';
    }
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
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to initialize Discord sync.');
        return;
      }
      if (data.url) {
        window.open(data.url, 'discord_login', 'width=800,height=700');
      }
    } catch (error) {
      console.error('Failed to get Discord auth URL:', error);
      alert('Internal error initializing Discord sync.');
    }
  };

  const loginWithDiscord = async () => {
    await syncWithDiscord();
  };

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' });
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
