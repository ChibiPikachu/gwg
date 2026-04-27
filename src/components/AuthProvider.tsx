import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, Team } from '@/types';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
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
  useEffect(() => {
    const searchParams = window.location.search;
    console.log('Fetching auth status with params:', searchParams);
    fetch(`/api/me${searchParams}`)
      .then(res => res.json())
      .then(data => {
        console.log('Auth data received:', data);
        if (data) {
          const profile = data;
          // Support both raw passport profile and Supabase profile structures
          setUser({
            uid: profile.steam_id || profile.id || profile.steamId,
            steamId: profile.steam_id || profile.id || profile.steamId,
            steamName: profile.steam_name || profile.displayName || 'Gamer',
            steamAvatar: profile.steam_avatar || profile.photos?.[2]?.value || profile.photos?.[0]?.value || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
            team: profile.team || 'blue',
            isAdmin: profile.is_admin ?? profile.isAdmin ?? true,
            status: profile.status || 'Ready for Event #3',
            points: profile.points || 0,
            discordId: profile.discord_id || profile.discordId,
            discordName: profile.discord_name || profile.discordName,
            discordAvatar: profile.discord_avatar || profile.discordAvatar,
          });
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Auth fetch failed:', err);
        setLoading(false);
      });
  }, []);

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
        setUser(prev => prev ? {
          ...prev,
          discordId: discordProfile.id,
          discordName: discordProfile.username,
          discordAvatar: `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}.png`
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
      window.open(url, 'steam_login', 'width=800,height=600');
    } catch (error) {
      console.error('Failed to get Steam auth URL:', error);
      // Fallback to old behavior if API fails for some reason
      window.open('/auth/steam', 'steam_login', 'width=800,height=600');
    }
  };

  const syncWithDiscord = async () => {
    try {
      const res = await fetch('/api/auth/discord/url');
      const { url } = await res.json();
      window.open(url, 'discord_login', 'width=800,height=700');
    } catch (error) {
      console.error('Failed to get Discord auth URL:', error);
      window.open('/auth/discord', 'discord_login', 'width=800,height=700');
    }
  };

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithSteam, syncWithDiscord, logout, updateProfile }}>
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


const fetchUser = async () => {
  const steamId = localStorage.getItem('steam_id');

  if (!steamId) {
    setLoading(false);
    return;
  }

  const res = await fetch(`/api/me?steam_id=${steamId}`);
  const data = await res.json();

  if (data) {
    setUser({
      uid: data.steam_id,
      steamId: data.steam_id,
      steamName: data.steam_name,
      steamAvatar: data.steam_avatar,
      team: data.team || 'blue',
      isAdmin: data.is_admin ?? true,
      status: data.status || '',
      points: data.points || 0
    });
  }

  setLoading(false);
};