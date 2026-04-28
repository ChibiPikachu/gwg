import React from 'react';
import { LogOut, Moon, Sun } from 'lucide-react';
import { UserProfile, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';

interface TopBarProps {
  user: UserProfile | null;
  onLogout: () => void;
  onProfileClick: () => void;
}

export default function TopBar({ user, onLogout, onProfileClick }: TopBarProps) {
  const { theme } = useAuth();
  const colors = user ? TEAM_COLORS[user.team] : null;

  return (
    <div className="h-16 flex items-center justify-end px-8 gap-6">
      {user && (
        <div className="flex items-center gap-3 cursor-pointer group" onClick={onProfileClick}>
          <span className="text-sm opacity-70 group-hover:opacity-100 transition-opacity">Welcome {user.steamName}!</span>
          <div className={cn(
            "w-10 h-10 rounded-full border-2 p-0.5 transition-colors",
            colors ? `${colors.border.replace('/50', '')}/50 group-hover:${colors.border.replace('/50', '')}` : "border-white/20"
          )}>
            <img 
              src={user.steamAvatar || user.discordAvatar} 
              alt="Avatar" 
              className="w-full h-full rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
      
      {user && (
        <button 
          onClick={onLogout}
          className="p-2 text-white/50 hover:text-white transition-colors"
          title="Logout"
        >
          <LogOut size={20} />
        </button>
      )}

      <div className="flex items-center bg-black/30 rounded-full p-1 border border-white/5">
        <button className="w-8 h-8 flex items-center justify-center text-white/30">
          <Sun size={14} />
        </button>
        <button className={cn("w-8 h-8 flex items-center justify-center bg-[#1a1a1a] rounded-full", theme.text)}>
          <Moon size={14} />
        </button>
      </div>
    </div>
  );
}
