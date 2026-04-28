import React from 'react';
import { LogOut, Moon, Sun, Bell, CheckCircle2, XCircle, Clock } from 'lucide-react';
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
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [showNotifications, setShowNotifications] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    
    // Fetch user's submissions to see status
    fetch('/api/submissions')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          // In a real app, we'd only show "new" notifications
          // For now, show non-pending ones as recent updates
          setNotifications(data.filter(s => s.status !== 'pending').slice(0, 5));
        }
      })
      .catch(err => console.error('Failed to fetch notifications:', err));
  }, [user]);

  return (
    <div className="h-16 flex items-center justify-end px-8 gap-6 relative">
      {user && (
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-white/50 hover:text-white transition-colors relative"
          >
            <Bell size={20} />
            {notifications.length > 0 && (
              <span className={cn("absolute top-1 right-1 w-2 h-2 rounded-full", theme.bg)} />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-4 w-80 bg-[#111111] border border-white/10 rounded-2xl shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                <span className="text-xs uppercase font-bold opacity-40 tracking-widest">Recent Activity</span>
                <button onClick={() => setShowNotifications(false)} className="text-[10px] opacity-40 hover:opacity-100">Close</button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center opacity-30 text-xs italic">No recent status changes</div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="p-4 border-b border-white/5 hover:bg-white/5 transition-colors group">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                          <img src={n.game_image} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-1">
                            {n.status === 'verified' ? (
                              <CheckCircle2 size={12} className="text-emerald-400" />
                            ) : (
                              <XCircle size={12} className="text-red-400" />
                            )}
                            <span className={cn("text-[10px] font-bold uppercase", n.status === 'verified' ? "text-emerald-400" : "text-red-400")}>
                              {n.status === 'verified' ? "Approved" : "Rejected"}
                            </span>
                          </div>
                          <p className="text-[11px] font-bold truncate">{n.game_title}</p>
                          {n.status === 'rejected' && n.rejection_reason && (
                            <p className="text-[10px] opacity-40 mt-1 line-clamp-2 italic">"{n.rejection_reason}"</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {user && (
        <div className="flex items-center gap-3 cursor-pointer group" onClick={onProfileClick}>
          <span className="text-sm opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap">Welcome {user.steamName}!</span>
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
