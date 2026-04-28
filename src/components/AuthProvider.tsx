import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, ThemeHelper, Team } from '@/types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  theme: ThemeHelper;
  loginWithSteam: () => void;
  syncWithDiscord: () => void;
  logout: () => void;
  updateProfile: (data: { displayName: string; status: string }) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Load initial user state from server session
  const fetchMe = React.useCallback(() => {
    const searchParams = window.location.search;
    fetch(`/api/me${searchParams}`)
      .then(res => res.json())
      .then(data => {
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
            status: profile.status || 'Ready for Event #3',
            points: profile.points || 0,
            discordId: profile.discord_id || profile.discordId,
            discordName: profile.discord_name || profile.discordName,
            discordAvatar: profile.discord_avatar || profile.discordAvatar,
          } as any);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Auth fetch failed:', err);
        setLoading(false);
      });
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
      }
      
      if (event.data?.type === 'DISCORD_AUTH_SUCCESS') {
        const discordProfile = event.data.user;
        const discordName = discordProfile.global_name || discordProfile.username || discordProfile.displayName || 'Discord User';
        setUser(prev => prev ? {
          ...prev,
          discordId: discordProfile.id,
          discordName: discordName,
          discordAvatar: discordProfile.avatar ? `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}.png` : null
        } : null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loginWithSteam = async () => {
    try {
      const res = await fetch('/api/auth/steam/url');
      const { url } = await res.json();
      window.location.href = url;
    } catch (error) {
      console.error('Failed to get Steam auth URL:', error);
      // Fallback to old behavior if API fails for some reason
      window.location.href = '/auth/steam';
    }
  };

  const syncWithDiscord = async () => {
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

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    setUser(null);
  };

  const theme: ThemeHelper = React.useMemo(() => {
    const team = user?.team;
    const teamName = (team && team !== 'none') ? team : 'pink';
    const isCustom = teamName !== 'pink';
    const base = isCustom ? `${teamName}-accent` : 'pink-500';
    
    return {
      accent: base,
      text: `text-${base}`,
      bg: `bg-${base}`,
      border: `border-${base}`,
      ring: `ring-${base}`,
      shadow: `shadow-${base}`,
      glow: `shadow-lg shadow-${base}/50`,
      secondary: `bg-${base}/10`,
      muted: `text-${base}/50`,
    };
  }, [user?.team]);

  return (
    <AuthContext.Provider value={{ user, loading, theme, loginWithSteam, syncWithDiscord, logout, updateProfile }}>
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
