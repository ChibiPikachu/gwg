import React from 'react';
import { LogOut, Moon, Sun, Bell, CheckCircle2, XCircle, Menu, X, User } from 'lucide-react';
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
  const { theme, isDarkMode, toggleDarkMode } = useAuth();
  const colors = user ? TEAM_COLORS[user.team] : null;
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [readIds, setReadIds] = React.useState<Set<string>>(() => {
    const saved = localStorage.getItem('read_notification_ids');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);
  
  const [currentEvent, setCurrentEvent] = React.useState<any>(null);
  const [timeLeft, setTimeLeft] = React.useState({ days: 0, hours: 0, minutes: 0 });

  const getCountdownTarget = (endDateStr: string): number => {
    if (!endDateStr) return 0;
    if (endDateStr.includes('T')) {
      const parts = endDateStr.split('T');
      const timePart = parts[1];
      const isBareDate = !timePart || timePart.startsWith('00:00:00') || timePart.startsWith('23:59:59');
      if (isBareDate) {
        return new Date(`${parts[0]}T23:59:59-03:00`).getTime();
      }
      return new Date(endDateStr).getTime();
    }
    return new Date(`${endDateStr}T23:59:59-03:00`).getTime();
  };

  React.useEffect(() => {
    const fetchActiveEvent = () => {
      fetch('/api/events')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const active = data.find((e: any) => e.is_active || e.isActive);
            setCurrentEvent(active || null);
          } else {
            setCurrentEvent(null);
          }
        })
        .catch(err => console.error('Failed to fetch events in TopBar:', err));
    };

    fetchActiveEvent();

    window.addEventListener('active-event-updated', fetchActiveEvent);
    return () => {
      window.removeEventListener('active-event-updated', fetchActiveEvent);
    };
  }, []);

  React.useEffect(() => {
    if (!currentEvent) return;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const end = getCountdownTarget(currentEvent.end_date || currentEvent.endDate);
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0 });
        clearInterval(timer);
        return;
      }

      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      });
    }, 10000);

    const now = new Date().getTime();
    const end = getCountdownTarget(currentEvent.end_date || currentEvent.endDate);
    const diff = end - now;
    if (diff > 0) {
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      });
    }

    return () => clearInterval(timer);
  }, [currentEvent]);
  
  const notificationRef = React.useRef<HTMLDivElement>(null);
  const profileContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileContainerRef.current && !profileContainerRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
      <div className="w-10 h-10 rounded-full flex items-center justify-center p-1 dark:bg-white/5 bg-slate-100 border border-black/10 dark:border-white/10 group-hover:border-black/20 dark:group-hover:border-white/20 transition-all overflow-hidden shrink-0 shadow-lg">
        <img 
          src="https://64.media.tumblr.com/4cc7b39b35387b1cf8814cb69b4317de/9e872b03ce8fba32-13/s128x128u_c1/fa8978589ebd3c0d46250356d6a63ad428a76b80.png" 
          alt="Logo" 
          className="w-full h-full rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="flex flex-col">
        <span className="font-display text-sm dark:text-white text-slate-800 leading-tight tracking-tighter">Girls Who</span>
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
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'submissions',
        filter: `user_id=eq.system_notification`
      }, (payload) => {
        const newNotification = payload.new as any;
        // Add to start of notification list
        setNotifications(prev => {
          const exists = prev.find(n => n.id === newNotification.id);
          if (exists) return prev;
          return [newNotification, ...prev].slice(0, 5);
        });
        
        // Ensure it's marked as unread
        setReadIds(prev => {
          const next = new Set(prev);
          next.delete(newNotification.id);
          return next;
        });
        
        setShowNotifications(true); // Auto-show when an event ends
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
            className="lg:hidden p-2 text-slate-400 dark:text-white/50 hover:text-slate-900 dark:hover:text-white transition-colors"
            id="mobile-menu-trigger"
          >
            <Menu size={24} />
          </button>
        )}
        <div className="flex-1 flex items-center gap-2">
          <Logo />
          {currentEvent && (
            <div className="lg:hidden flex items-center gap-1.5 px-2 py-1 rounded-xl text-[10px] font-black tracking-wider uppercase dark:bg-[#111111] bg-slate-100 border border-black/5 dark:border-white/10 shadow-sm text-slate-800 dark:text-white select-none whitespace-nowrap">
              <span className={cn("w-2 h-2 rounded-full animate-pulse", theme.bg || "bg-emerald-500")} />
              <span>{timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2 md:gap-4">
        
        {/* Single Theme Toggle Button */}
        <button 
          onClick={toggleDarkMode}
          className="p-2 w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors border border-black/5 dark:border-white/5"
          title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDarkMode ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        {user && (
          <div className="relative">
            <button 
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowProfileMenu(false);
              }}
              className="p-2 text-slate-400 dark:text-white/50 hover:text-slate-900 dark:hover:text-white transition-colors relative"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className={cn("absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-[#0a0a0a]", theme.bg)} />
              )}
            </button>

            {showNotifications && (
              <div ref={notificationRef} className="fixed top-16 left-4 right-4 sm:absolute sm:top-auto sm:left-auto sm:right-0 sm:mt-4 sm:w-96 dark:bg-[#111111] bg-white border border-black/5 dark:border-white/10 rounded-2xl shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-4 border-b border-black/5 dark:border-white/5 dark:bg-white/5 bg-slate-50 flex justify-between items-center">
                  <span className="text-xs uppercase font-bold opacity-40 tracking-widest dark:text-white text-slate-500">Notifications</span>
                  <button onClick={() => setShowNotifications(false)} className="opacity-40 hover:opacity-100 dark:text-white text-slate-800 transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center opacity-30 text-xs italic dark:text-white text-slate-500">No recent updates</div>
                  ) : (
                    notifications.map((n) => (
                      <div 
                        key={n.id} 
                        className={cn(
                          "p-5 border-b border-black/5 dark:border-white/5 dark:hover:bg-white/5 hover:bg-slate-50 transition-colors group relative",
                          !readIds.has(n.id) && "dark:bg-white/[0.02] bg-blue-50/30"
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
                          <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 border border-black/5 dark:border-white/10">
                            <img src={n.game_image} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                          </div>
                          <div className="flex-1 min-w-0">
                            {n.user_id === 'system_notification' ? (
                              <>
                                <div className="flex items-center gap-1.5 mb-2">
                                  <Bell size={14} className="text-indigo-500 dark:text-indigo-400" />
                                  <span className="text-[10px] font-black uppercase tracking-tighter text-indigo-500 dark:text-indigo-400">
                                    Announcement
                                  </span>
                                </div>
                                <p className="text-sm font-bold leading-relaxed mb-1 dark:text-white text-slate-850 select-text">
                                  {n.notes}
                                </p>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5 mb-2">
                                  {n.status === 'verified' ? (
                                    <CheckCircle2 size={14} className="text-emerald-500" />
                                  ) : (
                                    <XCircle size={14} className="text-red-500" />
                                  )}
                                  <span className={cn("text-[10px] font-black uppercase tracking-tighter", n.status === 'verified' ? "text-emerald-500" : "text-red-500")}>
                                    {n.status === 'verified' ? "Approved" : "Rejected"}
                                  </span>
                                </div>
                                
                                <p className="text-xs font-bold leading-relaxed mb-1 dark:text-white text-slate-800">
                                  {n.status === 'verified' ? (
                                    <>Your submission of <span className="underline decoration-slate-200 dark:decoration-white/20 underline-offset-2">{n.game_name || n.game_title}</span> has been approved!</>
                                  ) : (
                                    <>Your submission of <span className="underline decoration-slate-200 dark:decoration-white/20 underline-offset-2">{n.game_name || n.game_title}</span> has been rejected.</>
                                  )}
                                </p>
                              </>
                            )}

                            {n.status === 'rejected' && (
                              <p className="text-[10px] text-red-500 opacity-60 mt-2 p-2 bg-red-500/5 rounded italic border border-red-500/10 dark:text-red-300">
                                "Read the notes to know why"
                                {n.rejection_reason && <span className="block mt-1 font-bold text-red-600 dark:text-red-400 opacity-100">— {n.rejection_reason}</span>}
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
                    className="w-full py-3 dark:bg-white/5 bg-slate-50 hover:dark:bg-white/10 hover:bg-slate-100 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-all border-t border-black/5 dark:border-white/5 dark:text-white text-slate-600"
                  >
                    Mark all as read
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Profile Dropdown Container */}
        {user && (
          <div className="relative" ref={profileContainerRef}>
            <div 
              className="flex items-center gap-3 cursor-pointer group" 
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifications(false);
              }}
            >
              <span className="text-sm opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden sm:block dark:text-white text-slate-600">
                Welcome {user.steamName}!
              </span>
              <div className={cn(
                "w-10 h-10 rounded-full border-2 p-0.5 transition-colors",
                user?.team === 'blue' && "border-blue-accent/50 group-hover:border-blue-accent",
                user?.team === 'green' && "border-green-accent/50 group-hover:border-green-accent",
                user?.team === 'purple' && "border-purple-accent/50 group-hover:border-purple-accent",
                user?.team === 'red' && "border-red-accent/50 group-hover:border-red-accent",
                (!user || user.team === 'none') && "dark:border-white/20 border-black/10"
              )}>
                <img 
                  src={user.steamAvatar || user.discordAvatar} 
                  alt="Avatar" 
                  className="w-full h-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            {/* Profile Dropdown Menu */}
            {showProfileMenu && (
              <div className="absolute top-full right-0 mt-3 w-48 dark:bg-[#111111] bg-white border border-black/5 dark:border-white/10 rounded-xl shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <button 
                  onClick={() => {
                    onProfileClick();
                    setShowProfileMenu(false);
                  }} 
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-slate-50 dark:hover:bg-white/5 dark:text-white text-slate-800 transition-colors"
                >
                  <User size={16} className="opacity-50" /> View Profile
                </button>
                <div className="h-px w-full bg-black/5 dark:bg-white/5" />
                <button 
                  onClick={() => {
                    onLogout();
                    setShowProfileMenu(false);
                  }} 
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 transition-colors"
                >
                  <LogOut size={16} className="opacity-70" /> Log Out
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}