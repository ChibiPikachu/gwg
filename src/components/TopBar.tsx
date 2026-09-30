import React from 'react';
import { LogOut, Moon, Sun, Bell, CheckCircle2, XCircle, Menu, X, User, MessageSquare, Camera } from 'lucide-react';
import { UserProfile, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface TopBarProps {
  user: UserProfile | null;
  activeTab?: string;
  onLogout: () => void;
  onProfileClick: () => void;
  onMenuClick?: () => void;
  onNavigateToScreenshot?: (submissionId: string, metadata?: any) => void;
}

const TAB_TITLES: Record<string, string> = {
  submissions: 'My Submissions',
  profile: 'Profile',
  team: 'My Team',
  games: 'Game Submissions',
  leaderboard: 'Leaderboard',
  events: 'Events',
  screenshots: 'Screenshot Contest',
  'admin-users': 'Admin: Users',
  'admin-submissions': 'Admin: Submissions',
  'admin-team_points': 'Admin: Team Points',
};

export default function TopBar({ user, activeTab = 'submissions', onLogout, onProfileClick, onMenuClick, onNavigateToScreenshot }: TopBarProps) {
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
  const [draftEvent, setDraftEvent] = React.useState<any>(null);
  const [timeLeft, setTimeLeft] = React.useState({ days: 0, hours: 0, minutes: 0 });

  const activeEventToUse = draftEvent && (draftEvent.is_active || (currentEvent && draftEvent.id === currentEvent.id))
    ? draftEvent
    : currentEvent;

  React.useEffect(() => {
    const handleDraftUpdate = () => {
      setDraftEvent((window as any).__activeEventDraft || null);
    };
    handleDraftUpdate();

    window.addEventListener('active-event-draft-updated', handleDraftUpdate);
    return () => {
      window.removeEventListener('active-event-draft-updated', handleDraftUpdate);
    };
  }, []);

  const getCountdownTarget = (endDateStr: string | number | undefined): number => {
    if (!endDateStr) return 0;
    if (typeof endDateStr === 'number') {
      return endDateStr * 1000;
    }
    const num = Number(endDateStr);
    if (!isNaN(num) && num > 100000) {
      return num * 1000;
    }
    const parsed = Date.parse(endDateStr);
    if (!isNaN(parsed)) return parsed;
    return 0;
  };

  React.useEffect(() => {
    const fetchActiveEvent = async () => {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase
            .from('events')
            .select('*')
            .order('start_date', { ascending: false });

          if (!error && Array.isArray(data)) {
            const active = data.find((e: any) => e.is_active || e.isActive);
            setCurrentEvent(active || null);
            return;
          }
        } catch (e) {
          console.warn('Supabase fetch active event error in TopBar:', e);
        }
      }

      try {
        const res = await fetch('/api/events');
        const contentType = res.headers.get('content-type');
        if (res.ok && contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const active = data.find((e: any) => e.is_active || e.isActive);
            setCurrentEvent(active || null);
          } else {
            setCurrentEvent(null);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch events in TopBar:', err);
      }
    };

    fetchActiveEvent();

    window.addEventListener('active-event-updated', fetchActiveEvent);
    return () => {
      window.removeEventListener('active-event-updated', fetchActiveEvent);
    };
  }, []);

  React.useEffect(() => {
    if (!activeEventToUse) {
      setTimeLeft({ days: 0, hours: 0, minutes: 0 });
      return;
    }

    const updateTimer = () => {
      const now = new Date().getTime();
      const end = getCountdownTarget(activeEventToUse.end_timestamp || activeEventToUse.end_date || activeEventToUse.endDate);
      const diff = end - now;

      if (diff <= 0 || isNaN(diff)) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0 });
      } else {
        setTimeLeft({
          days: Math.floor(diff / (1000 * 60 * 60 * 24)),
          hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        });
      }
    };

    const timer = setInterval(updateTimer, 1000);
    updateTimer();

    return () => clearInterval(timer);
  }, [activeEventToUse]);
  
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

  const unreadNotifications = React.useMemo(() => {
    return notifications.filter(n => !readIds.has(n.id));
  }, [notifications, readIds]);

  const unreadCount = unreadNotifications.length;

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
    if (!user?.steamId && !user?.uid && !user?.discordId) return;
    
    const candidateIds = Array.from(new Set([
      user.steamId,
      user.uid,
      user.discordId,
      user.discordId ? `discord_${user.discordId}` : null
    ].filter(Boolean))) as string[];

    const fetchAllNotifications = async () => {
      const mergedList: any[] = [];
      const seenIds = new Set<string>();

      // 1. Fetch screenshot comment alerts and approvals from /api/screenshots?action=notifications
      try {
        const queryId = user.steamId || user.discordId || user.uid;
        const res = await fetch(`/api/screenshots?action=notifications&userId=${queryId}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.notifications)) {
            data.notifications.forEach((n: any) => {
              if (!seenIds.has(n.id)) {
                seenIds.add(n.id);
                mergedList.push(n);
              }
            });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch screenshot notifications in TopBar:', err);
      }

      // If Supabase is configured, also query 'notifications' table directly
      if (isSupabaseConfigured && supabase) {
        try {
          const { data: dbNotifs } = await supabase
            .from('notifications')
            .select('*')
            .in('user_id', candidateIds)
            .order('created_at', { ascending: false })
            .limit(15);

          if (dbNotifs && Array.isArray(dbNotifs)) {
            dbNotifs.forEach((n: any) => {
              if (seenIds.has(n.id)) return;
              seenIds.add(n.id);

              let parsedMeta: any = {};
              if (n.message && typeof n.message === 'string') {
                const match = n.message.match(/<!--META:(.*?)-->/);
                if (match && match[1]) {
                  try { parsedMeta = JSON.parse(match[1]); } catch {}
                }
              }
              const cleanMessage = n.message ? n.message.replace(/<!--META:.*?-->/g, '').trim() : '';
              const notifType = parsedMeta.type || (n.title?.includes('Comment') ? 'screenshot_comment' : (n.title?.includes('Approved') ? 'screenshot_approved' : 'general'));

              mergedList.push({
                ...n,
                ...parsedMeta,
                id: n.id,
                title: n.title,
                message: cleanMessage,
                content: parsedMeta.content || cleanMessage,
                actor_name: parsedMeta.actor_name || parsedMeta.userName || 'Member',
                actor_avatar: parsedMeta.actor_avatar || parsedMeta.userAvatar || '',
                game_name: parsedMeta.game_name || parsedMeta.gameName || 'Screenshot',
                submission_id: parsedMeta.submission_id || parsedMeta.submissionId,
                submissionId: parsedMeta.submission_id || parsedMeta.submissionId,
                image_url: parsedMeta.image_url || parsedMeta.imageUrl || '',
                imageUrl: parsedMeta.image_url || parsedMeta.imageUrl || '',
                type: notifType,
                is_read: n.read ?? false
              });
            });
          }
        } catch (e) {
          console.warn('Supabase notifications query error in TopBar:', e);
        }
      }

      // 2. Fetch game submissions from submissions table (approved / rejected)
      if (isSupabaseConfigured && supabase) {
        try {
          const { data: subData, error } = await supabase
            .from('submissions')
            .select('*')
            .in('user_id', candidateIds)
            .neq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(8);

          if (!error && Array.isArray(subData)) {
            subData.forEach((s: any) => {
              if (seenIds.has(s.id)) return;
              seenIds.add(s.id);

              let targetScreenshotId: string | null = null;
              if (s.notes && typeof s.notes === 'string') {
                const match = s.notes.match(/__META_START__(.*?)__META_END__/);
                if (match && match[1]) {
                  try {
                    const parsedNotes = JSON.parse(match[1]);
                    if (parsedNotes.screenshotId) {
                      targetScreenshotId = String(parsedNotes.screenshotId);
                    }
                  } catch {}
                }
              }

              const isScreenshot = Boolean(targetScreenshotId) || s.platform === 'Screenshot Event' || String(s.game_name || '').includes('Screenshot');
              if (isScreenshot && targetScreenshotId) {
                const alreadyNotified = mergedList.some((m: any) => 
                  String(m.submission_id || m.submissionId) === targetScreenshotId && m.type === 'screenshot_approved'
                );
                if (alreadyNotified) return;
              }

              mergedList.push({
                ...s,
                type: isScreenshot ? (s.status === 'verified' ? 'screenshot_approved' : (s.status === 'rejected' ? 'screenshot_rejected' : 'submission')) : 'submission',
                submission_id: targetScreenshotId || s.id,
                submissionId: targetScreenshotId || s.id,
                is_screenshot: isScreenshot
              });
            });
          }
        } catch (e) {
          console.warn('Supabase submissions query error in TopBar:', e);
        }
      } else {
        try {
          const headers: Record<string, string> = {};
          if (user.steamId) headers['x-steam-id'] = user.steamId;
          if (user.discordId) headers['x-discord-id'] = user.discordId;
          if (user.uid) headers['x-user-id'] = user.uid;

          const res = await fetch('/api/submissions', { headers });
          const contentType = res.headers.get('content-type');
          if (res.ok && contentType && contentType.includes('application/json')) {
            const data = await res.json();
            if (Array.isArray(data)) {
              const filtered = data.filter(s => candidateIds.includes(String(s.user_id)) && s.status !== 'pending').slice(0, 8);
              filtered.forEach((s: any) => {
                if (seenIds.has(s.id)) return;
                seenIds.add(s.id);

                let targetScreenshotId: string | null = null;
                if (s.notes && typeof s.notes === 'string') {
                  const match = s.notes.match(/__META_START__(.*?)__META_END__/);
                  if (match && match[1]) {
                    try {
                      const parsedNotes = JSON.parse(match[1]);
                      if (parsedNotes.screenshotId) {
                        targetScreenshotId = String(parsedNotes.screenshotId);
                      }
                    } catch {}
                  }
                }

                const isScreenshot = Boolean(targetScreenshotId) || s.platform === 'Screenshot Event' || String(s.game_name || '').includes('Screenshot');
                if (isScreenshot && targetScreenshotId) {
                  const alreadyNotified = mergedList.some((m: any) => 
                    String(m.submission_id || m.submissionId) === targetScreenshotId && m.type === 'screenshot_approved'
                  );
                  if (alreadyNotified) return;
                }

                mergedList.push({
                  ...s,
                  type: isScreenshot ? (s.status === 'verified' ? 'screenshot_approved' : (s.status === 'rejected' ? 'screenshot_rejected' : 'submission')) : 'submission',
                  submission_id: targetScreenshotId || s.id,
                  submissionId: targetScreenshotId || s.id,
                  is_screenshot: isScreenshot
                });
              });
            }
          }
        } catch (err) {
          console.warn('Failed to fetch submissions in TopBar:', err);
        }
      }

      // Sort all notifications by created_at descending
      mergedList.sort((a, b) => {
        const timeA = new Date(a.created_at || a.createdAt || 0).getTime();
        const timeB = new Date(b.created_at || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setNotifications(mergedList.slice(0, 25));
    };

    fetchAllNotifications();

    if (!isSupabaseConfigured || !supabase) return;

    // Live subscription for notifications, submissions, and comments
    const channel = supabase
      .channel('topbar-live-notifications')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'submissions'
      }, (payload) => {
        const updatedSub = payload.new as any;
        if (updatedSub && candidateIds.includes(String(updatedSub.user_id)) && updatedSub.status !== 'pending') {
          fetchAllNotifications();
          setShowNotifications(true);
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'submissions',
        filter: `user_id=eq.system_notification`
      }, () => {
        fetchAllNotifications();
        setShowNotifications(true);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications'
      }, (payload) => {
        const newNotif = payload.new as any;
        if (newNotif && candidateIds.includes(String(newNotif.user_id))) {
          fetchAllNotifications();
          setShowNotifications(true);
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'screenshot_comments'
      }, () => {
        fetchAllNotifications();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'screenshot_submissions'
      }, () => {
        fetchAllNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.steamId, user?.uid, user?.discordId]);

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
          {activeTab && TAB_TITLES[activeTab] && (
            <span className="lg:hidden text-xs font-black tracking-wide dark:text-purple-300 text-purple-700 bg-purple-500/10 px-2.5 py-1 rounded-xl border border-purple-500/20 whitespace-nowrap">
              {TAB_TITLES[activeTab]}
            </span>
          )}
          {activeEventToUse && (
            <div className="hidden sm:flex lg:hidden items-center gap-1.5 px-2 py-1 rounded-xl text-[10px] font-black tracking-wider uppercase dark:bg-[#111111] bg-slate-100 border border-black/5 dark:border-white/10 shadow-sm text-slate-800 dark:text-white select-none whitespace-nowrap">
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
                <div className="max-h-[400px] overflow-y-auto w-full">
                  {unreadNotifications.length === 0 ? (
                    <div className="p-8 text-center opacity-30 text-xs italic dark:text-white text-slate-500">No recent updates</div>
                  ) : (
                    unreadNotifications.map((n) => {
                      const isScreenshotNotif = n.type === 'screenshot_comment' || n.type === 'screenshot_approved' || n.type === 'screenshot_rejected' || Boolean(n.submission_id || n.submissionId) || Boolean(n.is_screenshot);
                      let subId = n.submission_id || n.submissionId;
                      if (!subId && n.notes && typeof n.notes === 'string') {
                        const match = n.notes.match(/__META_START__(.*?)__META_END__/);
                        if (match && match[1]) {
                          try {
                            const parsedNotes = JSON.parse(match[1]);
                            if (parsedNotes.screenshotId) {
                              subId = String(parsedNotes.screenshotId);
                            }
                          } catch {}
                        }
                      }

                      const handleNotificationClick = () => {
                        setReadIds(prev => {
                          const next = new Set(prev);
                          next.add(n.id);
                          return next;
                        });
                        if (onNavigateToScreenshot) {
                          setShowNotifications(false);
                          onNavigateToScreenshot(subId || n.id, n);
                        }
                      };

                      return (
                        <div 
                          key={n.id} 
                          className={cn(
                            "p-4 border-b border-black/5 dark:border-white/5 dark:hover:bg-white/5 hover:bg-slate-50 transition-colors group relative cursor-pointer",
                            !readIds.has(n.id) ? "dark:bg-white/[0.03] bg-sky-50/40" : ""
                          )}
                          onClick={handleNotificationClick}
                        >
                          {!readIds.has(n.id) && (
                            <div className={cn("absolute top-5 left-2 w-1.5 h-1.5 rounded-full", theme.bg)} />
                          )}
                          <div className="flex gap-3 items-start pl-1">
                            {/* Thumbnail or Icon */}
                            {n.type === 'screenshot_comment' ? (
                              <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-black/10 dark:border-white/10 bg-sky-500/10 flex items-center justify-center">
                                {n.image_url || n.imageUrl ? (
                                  <img 
                                    src={n.image_url || n.imageUrl} 
                                    className="w-full h-full object-cover" 
                                    alt="" 
                                    referrerPolicy="no-referrer" 
                                  />
                                ) : (
                                  <Camera size={20} className="text-sky-400" />
                                )}
                                <div className="absolute -bottom-1 -right-1 bg-sky-500 text-white p-1 rounded-full shadow-sm">
                                  <MessageSquare size={10} />
                                </div>
                              </div>
                            ) : (n.type === 'screenshot_approved' || n.type === 'screenshot_rejected') ? (
                              <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-black/10 dark:border-white/10 bg-white/5 flex items-center justify-center">
                                {n.image_url || n.imageUrl ? (
                                  <img 
                                    src={n.image_url || n.imageUrl} 
                                    className="w-full h-full object-cover" 
                                    alt="" 
                                    referrerPolicy="no-referrer" 
                                  />
                                ) : (
                                  <Camera size={20} className="text-white/40" />
                                )}
                                <div className={cn(
                                  "absolute -bottom-1 -right-1 text-white p-1 rounded-full shadow-sm",
                                  n.type === 'screenshot_approved' ? "bg-emerald-500" : "bg-red-500"
                                )}>
                                  {n.type === 'screenshot_approved' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                                </div>
                              </div>
                            ) : (
                              <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 border border-black/5 dark:border-white/10 bg-white/5">
                                <img 
                                  src={n.game_name === 'Screenshot Points' || n.game_name === 'Bingo Points' || n.game_image?.includes('1471391') 
                                    ? (n.game_name === 'Bingo Points' ? 'https://cdn-icons-png.flaticon.com/512/5815/5815809.png' : 'https://i.ibb.co/gZPKx2qh/gwg-extra-points.png') 
                                    : (n.game_image || n.image_url || n.imageUrl || 'https://via.placeholder.com/150')} 
                                  className="w-full h-full object-cover" 
                                  alt="" 
                                  referrerPolicy="no-referrer" 
                                />
                              </div>
                            )}

                            {/* Notification details */}
                            <div className="flex-1 min-w-0">
                              {n.user_id === 'system_notification' ? (
                                <>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Bell size={13} className="text-indigo-500 dark:text-indigo-400" />
                                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                                      Announcement
                                    </span>
                                  </div>
                                  <p className="text-xs font-bold leading-relaxed mb-1 dark:text-white text-slate-800 select-text">
                                    {n.notes}
                                  </p>
                                </>
                              ) : n.type === 'screenshot_comment' ? (
                                <>
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <MessageSquare size={13} className="text-sky-400 shrink-0" />
                                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-400 truncate">
                                        Screenshot Comment
                                      </span>
                                    </div>
                                    <span className="text-[9px] opacity-40 shrink-0 font-mono">
                                      {n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                  </div>
                                  <p className="text-xs leading-snug mb-1 dark:text-zinc-200 text-slate-800">
                                    <strong className="font-bold text-sky-400">{n.actor_name || 'Someone'}</strong> commented on your <span className="font-semibold">{n.game_name || 'Screenshot'}</span> submission:
                                  </p>
                                  <p className="text-[11px] italic bg-black/5 dark:bg-white/5 p-2 rounded-lg border border-black/5 dark:border-white/5 dark:text-zinc-300 text-slate-600 line-clamp-2">
                                    "{n.content || n.message}"
                                  </p>
                                  <span className="inline-block mt-1.5 text-[9px] font-bold text-sky-400 hover:underline">
                                    View screenshot discussion →
                                  </span>
                                </>
                              ) : n.type === 'screenshot_approved' ? (
                                <>
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <div className="flex items-center gap-1.5">
                                      <CheckCircle2 size={13} className="text-emerald-500" />
                                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500">
                                        Screenshot Approved
                                      </span>
                                    </div>
                                    <span className="text-[9px] opacity-40 shrink-0 font-mono">
                                      {n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                  </div>
                                  <p className="text-xs font-bold leading-snug mb-1 dark:text-white text-slate-800">
                                    Your screenshot for <span className="underline decoration-emerald-500/40">{n.game_name || 'Screenshot Contest'}</span> has been approved!
                                  </p>
                                  <div className="mt-1 flex items-center gap-2">
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                      +{n.points || 20} PTS
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400 hover:text-white">
                                      View submission →
                                    </span>
                                  </div>
                                </>
                              ) : n.type === 'screenshot_rejected' ? (
                                <>
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <div className="flex items-center gap-1.5">
                                      <XCircle size={13} className="text-red-500" />
                                      <span className="text-[10px] font-black uppercase tracking-wider text-red-500">
                                        Screenshot Rejected
                                      </span>
                                    </div>
                                    <span className="text-[9px] opacity-40 shrink-0 font-mono">
                                      {n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                  </div>
                                  <p className="text-xs font-bold leading-snug mb-1 dark:text-white text-slate-800">
                                    Your screenshot for <span className="underline decoration-red-500/40">{n.game_name || 'Screenshot Contest'}</span> was rejected.
                                  </p>
                                  {n.rejection_reason && (
                                    <p className="text-[10px] text-red-400 mt-1 p-1.5 bg-red-500/10 rounded border border-red-500/20 font-medium">
                                      Note: {n.rejection_reason}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    {n.status === 'verified' ? (
                                      <CheckCircle2 size={13} className="text-emerald-500" />
                                    ) : (
                                      <XCircle size={13} className="text-red-500" />
                                    )}
                                    <span className={cn("text-[10px] font-black uppercase tracking-wider", n.status === 'verified' ? "text-emerald-500" : "text-red-500")}>
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

                                  {n.status === 'rejected' && (
                                    <p className="text-[10px] text-red-500 opacity-60 mt-1 p-1.5 bg-red-500/5 rounded italic border border-red-500/10 dark:text-red-300">
                                      "Read the notes to know why"
                                      {n.rejection_reason && <span className="block mt-1 font-bold text-red-600 dark:text-red-400 opacity-100">— {n.rejection_reason}</span>}
                                    </p>
                                  )}

                                  {n.status === 'verified' && (
                                    <div className="mt-1 flex items-center gap-2">
                                      <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full", theme.bg, "text-white")}>
                                        +{n.points || 0} PTS
                                      </span>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {unreadNotifications.length > 0 && (
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