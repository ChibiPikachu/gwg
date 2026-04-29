import React from 'react';
import { LogOut, Moon, Sun, Bell, CheckCircle2, XCircle, Menu } from 'lucide-react';
import { UserProfile, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface TopBarProps {
  user: UserProfile | null;
  onLogout: () => void;
  onProfileClick: () => void;
  onMenuClick?: () => void;
}

export default function TopBar({ user, onLogout, onProfileClick, onMenuClick }: TopBarProps) {
  const { theme } = useAuth();
  const colors = user ? TEAM_COLORS[user.team] : null;
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [readIds, setReadIds] = React.useState<Set<string>>(() => {
    const saved = localStorage.getItem('read_notification_ids');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [showNotifications, setShowNotifications] = React.useState(false);

  React.useEffect(() => {
    localStorage.setItem('read_notification_ids', JSON.stringify(Array.from(readIds)));
  }, [readIds]);

  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  const markAllRead = () => {
    setReadIds(new Set(notifications.map(n => n.id)));
  };

  const markAllReadAndClose = () => {
    markAllRead();
    setShowNotifications(false);
  };

  const Logo = () => (
    <div className="flex items-center gap-3 group cursor-pointer" onClick={() => window.location.href = '/'}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center p-1 bg-white/5 border border-white/10 group-hover:border-white/20 transition-all overflow-hidden shrink-0 shadow-lg">
        <img 
          src="https://64.media.tumblr.com/4cc7b39b35387b1cf8814cb69b4317de/9e872b03ce8fba32-13/s128x128u_c1/fa8978589ebd3c0d46250356d6a63ad428a76b80.png" 
          alt="Logo" 
          className="w-full h-full rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="flex flex-col">
        <span className="font-display text-sm text-white leading-tight tracking-tighter">Girls Who</span>
        <span className={cn("font-display text-sm leading-tight tracking-tighter", theme.text)}>Game</span>
      </div>
    </div>
  );

  React.useEffect(() => {
    if (!user?.steamId || !isSupabaseConfigured) return;
    
    // Initial fetch
    fetch('/api/submissions')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const filtered = data.filter(s => s.status !== 'pending').slice(0, 5);
          setNotifications(filtered);
        }
      })
      .catch(err => console.error('Failed to fetch notifications:', err));

    // Live subscription for notifications
    const channel = supabase
      .channel('submission-notifications')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'submissions',
        filter: `user_id=eq.${user.steamId}`
      }, (payload) => {
        const updatedSub = payload.new as any;
        if (updatedSub.status !== 'pending') {
          // Add to start of notification list
          setNotifications(prev => {
            const exists = prev.find(n => n.id === updatedSub.id);
            if (exists) {
              return prev.map(n => n.id === updatedSub.id ? updatedSub : n);
            }
            return [updatedSub, ...prev].slice(0, 5);
          });
          
          // Ensure it's marked as unread if it's a status change
          setReadIds(prev => {
            const next = new Set(prev);
            next.delete(updatedSub.id);
            return next;
          });
          
          setShowNotifications(true); // Auto-show notification when status changes
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.steamId]);

  return (
    <div className="h-16 flex items-center justify-between px-4 md:px-8 gap-4 relative">
      <div className="flex items-center gap-4">
        {user && (
          <button 
            onClick={onMenuClick}
            className="lg:hidden p-2 text-white/50 hover:text-white transition-colors"
            id="mobile-menu-trigger"
          >
            <Menu size={24} />
          </button>
        )}
        <div className="flex-1">
          <Logo />
        </div>
      </div>
      
      <div className="flex items-center gap-3 md:gap-6">
        {user && (
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 text-white/50 hover:text-white transition-colors relative"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className={cn("absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-[#0a0a0a]", theme.bg)} />
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-4 w-96 bg-[#111111] border border-white/10 rounded-2xl shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                  <span className="text-xs uppercase font-bold opacity-40 tracking-widest">Notifications</span>
                  <button onClick={() => setShowNotifications(false)} className="text-[10px] opacity-40 hover:opacity-100">Close</button>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center opacity-30 text-xs italic">No recent updates</div>
                  ) : (
                    notifications.map((n) => (
                      <div 
                        key={n.id} 
                        className={cn(
                          "p-5 border-b border-white/5 hover:bg-white/5 transition-colors group relative",
                          !readIds.has(n.id) && "bg-white/[0.02]"
                        )}
                        onClick={() => {
                          setReadIds(prev => {
                            const next = new Set(prev);
                            next.add(n.id);
                            return next;
                          });
                        }}
                      >
                        {!readIds.has(n.id) && (
                          <div className={cn("absolute top-6 left-2 w-1.5 h-1.5 rounded-full", theme.bg)} />
                        )}
                        <div className="flex gap-4">
                          <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 border border-white/10">
                            <img src={n.game_image} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-2">
                              {n.status === 'verified' ? (
                                <CheckCircle2 size={14} className="text-emerald-400" />
                              ) : (
                                <XCircle size={14} className="text-red-400" />
                              )}
                              <span className={cn("text-[10px] font-black uppercase tracking-tighter", n.status === 'verified' ? "text-emerald-400" : "text-red-400")}>
                                {n.status === 'verified' ? "Approved" : "Rejected"}
                              </span>
                            </div>
                            
                            <p className="text-xs font-bold leading-relaxed mb-1">
                              {n.status === 'verified' ? (
                                <>Your submission of <span className="text-white underline decoration-white/20 underline-offset-2">{n.game_name || n.game_title}</span> has been approved!</>
                              ) : (
                                <>Your submission of <span className="text-white underline decoration-white/20 underline-offset-2">{n.game_name || n.game_title}</span> has been rejected.</>
                              )}
                            </p>

                            {n.status === 'rejected' && (
                              <p className="text-[10px] text-red-300 opacity-60 mt-2 p-2 bg-red-500/5 rounded italic border border-red-500/10">
                                "Read the notes to know why"
                                {n.rejection_reason && <span className="block mt-1 font-bold text-red-400 opacity-100">— {n.rejection_reason}</span>}
                              </p>
                            )}

                            {n.status === 'verified' && (
                              <div className="mt-2 flex items-center gap-2">
                                <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full", theme.bg, "text-white")}>
                                  +{n.points || 0} PTS
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {notifications.length > 0 && (
                  <button 
                    onClick={markAllReadAndClose}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-all border-t border-white/5"
                  >
                    Mark all as read
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {user && (
          <div className="flex items-center gap-3 cursor-pointer group" onClick={onProfileClick}>
            <span className="text-sm opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden sm:block">Welcome {user.steamName}!</span>
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
    </div>
  );
}
