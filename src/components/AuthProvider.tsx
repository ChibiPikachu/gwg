import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, Team } from '@/types';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  loginWithSteam: () => void;
  syncWithDiscord: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load initial user state from server session
  useEffect(() => {
    const searchParams = window.location.search;
    console.log('Fetching auth status with params:', searchParams);
    fetch(`/api/me${searchParams}`)
      .then(res => res.json())
      .then(data => {
        console.log('Auth data received:', data);
        if (data) {
          const steamProfile = data;
          setUser({
            uid: steamProfile.id || steamProfile.steamId,
            steamId: steamProfile.id || steamProfile.steamId,
            steamName: steamProfile.displayName || 'Gamer',
            steamAvatar: steamProfile.photos?.[2]?.value || steamProfile.photos?.[0]?.value || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
            team: steamProfile.team || 'blue',
            isAdmin: steamProfile.isAdmin ?? true,
            status: steamProfile.status || 'Ready for Event #3',
            points: steamProfile.points || 0,
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

    
    if (!res.ok) {
      throw new Error(`HTTP error: ${res.status}`);
    }

    const data = await res.json();

    if (!data.url) {
      throw new Error('No URL returned from API');
    }

    window.location.href = data.url;

  } catch (error) {
    console.error('Steam login failed:', error);

    alert('Steam login is currently unavailable. Check console.');
  }
};

  const syncWithDiscord = async () => {
    try {
      const res = await fetch('/api/auth/discord/url');
      const { url } = await res.json();
      window.location.href = url;
    } catch (error) {
      console.error('Failed to get Discord auth URL:', error);
      window.location.href = '/auth/discord';
    }
  };

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithSteam, syncWithDiscord, logout }}>
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
