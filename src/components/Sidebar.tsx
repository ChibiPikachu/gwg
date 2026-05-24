import React, { useState, useEffect } from 'react';
import { Home, ClipboardList, Users, Trophy, Calendar, Settings, ShieldCheck, ListChecks, Group, ChevronLeft, ChevronRight, XCircle, Gamepad2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Team, TEAM_COLORS, CompetitionEvent } from '@/types';
import { useAuth } from '@/components/AuthProvider';

interface SidebarProps {
  userTeam: Team;
  isAdmin: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ userTeam, isAdmin, activeTab, setActiveTab, isOpen, onClose }: SidebarProps) {
  const { theme } = useAuth();
  const [currentEvent, setCurrentEvent] = useState<CompetitionEvent | null>(null);
  const [draftEvent, setDraftEvent] = useState<CompetitionEvent | null>(null);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0 });
  const [votingTimeLeft, setVotingTimeLeft] = useState({ days: 0, hours: 0, minutes: 0 });
  
  // Desktop-only collapse state
  const [isCollapsed, setIsCollapsed] = useState(false);

  const activeEventToUse = draftEvent && (draftEvent.is_active || (currentEvent && draftEvent.id === currentEvent.id))
    ? draftEvent
    : currentEvent;

  const formatLiteralDateTime = (isoStr: string | undefined): string => {
    if (!isoStr) return '';
    if (isoStr.includes('T')) {
      const [datePart, timePart] = isoStr.split('T');
      const dateParts = datePart.split('-');
      if (dateParts.length === 3) {
        const year = dateParts[0];
        const monthNum = parseInt(dateParts[1], 10);
        const day = dateParts[2];
        const timeParts = timePart.split(':');
        const hour = timeParts[0] || '00';
        const minute = timeParts[1] || '00';
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = monthNames[monthNum - 1] || 'Jan';
        
        return `${monthName} ${parseInt(day, 10)}, ${year} at ${hour}:${minute}`;
      }
    }
    
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const formattedDate = d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    const formattedTime = d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return `${formattedDate} at ${formattedTime}`;
  };

  const getVotingLegend = (isoStr: string | undefined): string => {
    if (!isoStr) return '';
    const formatted = formatLiteralDateTime(isoStr);
    return formatted ? `Voting period begins on ${formatted}` : '';
  };

  const getVotingFormatted = (isoStr: string | undefined): string => {
    return formatLiteralDateTime(isoStr);
  };

  useEffect(() => {
    const fetchActiveEvent = () => {
      fetch('/api/events')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const active = data.find((e: any) => e.is_active);
            setCurrentEvent(active || null);
          } else {
            setCurrentEvent(null);
          }
        })
        .catch(err => console.error('Failed to fetch events in Sidebar:', err));
    };

    fetchActiveEvent();

    window.addEventListener('active-event-updated', fetchActiveEvent);
    return () => {
      window.removeEventListener('active-event-updated', fetchActiveEvent);
    };
  }, []);

  useEffect(() => {
    const handleDraftUpdate = () => {
      setDraftEvent((window as any).__activeEventDraft || null);
    };
    handleDraftUpdate();

    window.addEventListener('active-event-draft-updated', handleDraftUpdate);
    return () => {
      window.removeEventListener('active-event-draft-updated', handleDraftUpdate);
    };
  }, []);

  const getCountdownTarget = (endDateStr: string): number => {
    if (!endDateStr) return 0;
    if (endDateStr.includes('T')) {
      const [datePart, timePart] = endDateStr.split('T');
      const dateParts = datePart.split('-');
      if (dateParts.length === 3) {
        const year = Number(dateParts[0]);
        const month = Number(dateParts[1]);
        const day = Number(dateParts[2]);
        
        const cleanTimePart = timePart.split(/[Z+-]/)[0];
        const timeParts = cleanTimePart.split(':');
        const hour = Number(timeParts[0] || 0);
        const minute = Number(timeParts[1] || 0);
        const second = Number(timeParts[2] || 0);
        
        const d = new Date(year, month - 1, day, hour, minute, second, 0);
        return d.getTime();
      }
    }
    return new Date(endDateStr).getTime();
  };

  const formatToLocalTime = (isoStr: string | undefined): string => {
    return formatLiteralDateTime(isoStr);
  };

  useEffect(() => {
    if (!activeEventToUse) {
      setTimeLeft({ days: 0, hours: 0, minutes: 0 });
      setVotingTimeLeft({ days: 0, hours: 0, minutes: 0 });
      return;
    }

    const votingMatch = activeEventToUse?.description?.match(/<!--VOTING:(.*?)-->/);
    const votingStartIso = votingMatch ? votingMatch[1] : '';

    const updateTimers = () => {
      const now = new Date().getTime();
      
      // 1. End Date Countdown
      const endDateStr = (activeEventToUse as any).end_date;
      const end = endDateStr ? getCountdownTarget(endDateStr) : 0;
      
      const diffEnd = end - now;
      if (diffEnd <= 0 || isNaN(diffEnd)) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0 });
      } else {
        setTimeLeft({
          days: Math.floor(diffEnd / (1000 * 60 * 60 * 24)),
          hours: Math.floor((diffEnd % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((diffEnd % (1000 * 60 * 60)) / (1000 * 60))
        });
      }

      // 2. Voting Start Countdown
      if (votingStartIso) {
        const vStart = getCountdownTarget(votingStartIso);
        
        const diffVoting = vStart - now;
        if (diffVoting <= 0 || isNaN(diffVoting)) {
          setVotingTimeLeft({ days: 0, hours: 0, minutes: 0 });
        } else {
          setVotingTimeLeft({
            days: Math.floor(diffVoting / (1000 * 60 * 60 * 24)),
            hours: Math.floor((diffVoting % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
            minutes: Math.floor((diffVoting % (1000 * 60 * 60)) / (1000 * 60))
          });
        }
      } else {
        setVotingTimeLeft({ days: 0, hours: 0, minutes: 0 });
      }
    };

    const timer = setInterval(updateTimers, 1000);
    updateTimers();

    return () => clearInterval(timer);
  }, [activeEventToUse]);

  const votingMatchStr = activeEventToUse?.description?.match(/<!--VOTING:(.*?)-->/);
  const votingStartIsoStr = votingMatchStr ? votingMatchStr[1] : '';
  const currentEventNumber = (activeEventToUse as any)?.event_number || 1;

  const colors = TEAM_COLORS[userTeam];
  const logoColor = userTeam === 'blue' ? 'bg-blue-accent' : 
                    userTeam === 'green' ? 'bg-green-accent' : 
                    userTeam === 'purple' ? 'bg-purple-accent' : 
                    userTeam === 'red' ? 'bg-red-accent' :
                    'bg-pink-500';

  const menuItems = [
    { id: 'submissions', label: 'My submissions', icon: ClipboardList, section: 'member' },
    { id: 'profile', label: 'My profile', icon: Users, section: 'member' },
    { id: 'team', label: 'My team', icon: Users, section: 'member' },
    { id: 'games', label: 'Games', icon: Gamepad2, section: 'member' },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy, section: 'member' },
    { id: 'events', label: 'Events', icon: Calendar, section: 'member' },
  ];

  const adminItems = [
    { id: 'admin-users', label: 'All users', icon: Users, section: 'admin' },
    { id: 'admin-submissions', label: 'All submissions', icon: ListChecks, section: 'admin' },
    { id: 'admin-team_points', label: 'Team points', icon: ShieldCheck, section: 'admin' },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] lg:hidden"
          onClick={onClose}
        />
      )}

      {/* OUTER WRAPPER: Handles sizing, borders, and position. (Removed overflow-y-auto and padding) */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-[110] dark:bg-[#0c0c0c] bg-white border-r border-black/5 dark:border-white/5 h-screen flex flex-col transition-all duration-300 lg:sticky lg:top-0 lg:z-[60] shadow-xl dark:shadow-none",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        isCollapsed ? "w-72 lg:w-20" : "w-72"
      )}>
        
        {/* Desktop Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex absolute -right-5 top-12 items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-[#1a1a1a] border-2 border-slate-200 dark:border-white/20 text-slate-700 dark:text-white/80 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/40 hover:scale-105 z-150 transition-all shadow-md"
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>

        {/* INNER SCROLL WRAPPER: Handles the scrolling and padding */}
        <div className={cn(
          "flex-1 flex flex-col overflow-y-auto",
          isCollapsed ? "lg:p-4 p-6" : "p-6"
        )}>
          
          <div className={cn("flex items-center mb-10 transition-all", isCollapsed ? "lg:justify-center justify-between" : "justify-between")}>
            <div className="flex items-center gap-3 group">
              <div className="w-12 h-12 rounded-full flex items-center justify-center p-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 group-hover:border-black/20 dark:group-hover:border-white/20 transition-all overflow-hidden shrink-0">
                <img 
                  src="https://64.media.tumblr.com/4cc7b39b35387b1cf8814cb69b4317de/9e872b03ce8fba32-13/s128x128u_c1/fa8978589ebd3c0d46250356d6a63ad428a76b80.png" 
                  alt="Logo" 
                  className="w-full h-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className={cn("flex flex-col overflow-hidden transition-all duration-300", isCollapsed ? "lg:hidden" : "")}>
                <span className="font-display text-lg dark:text-white text-slate-800 leading-tight tracking-tighter whitespace-nowrap">Girls Who</span>
                <span className={cn("font-display text-lg leading-tight tracking-tighter", theme.text)}>Game</span>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="lg:hidden p-2 text-slate-400 dark:text-white/50 hover:text-slate-900 dark:hover:text-white shrink-0"
            >
              <XCircle size={20} />
            </button>
          </div>

          {/* Event Widget */}
          <div className={cn("transition-all duration-300", isCollapsed ? "lg:hidden lg:mb-0 lg:opacity-0 lg:h-0" : "mb-8 opacity-100 h-auto")}>
            <div className="dark:bg-[#151515] bg-slate-100 rounded-xl border border-black/5 dark:border-white/5">
              <div className="dark:bg-[#1a1a1a] bg-slate-200/50 px-4 py-2 text-[10px] uppercase tracking-widest font-bold text-center opacity-70">
                Current event
              </div>
              <div className="p-4 flex flex-col items-center">
                <div className={cn("w-full aspect-[16/6] rounded-lg flex items-center justify-center mb-4 border", theme.secondary, theme.border)}>
                  <span className={cn("font-bold text-xl uppercase tracking-tighter text-center px-2", theme.text)}>
                    {activeEventToUse ? activeEventToUse.title : 'No Event'}
                  </span>
                </div>
                <span className="text-sm font-bold mb-1 dark:text-white text-slate-800 text-center">{activeEventToUse ? activeEventToUse.title : 'Inactive'}</span>
                <span className="text-[10px] opacity-50 mb-4 text-center dark:text-white text-slate-600">
                  {activeEventToUse 
                    ? `Ends on ${getVotingFormatted((activeEventToUse as any).end_date)}`
                    : 'Waiting for next event'}
                </span>
                
                <div className="w-full flex justify-between gap-2 border-t border-black/5 dark:border-white/5 pt-4">
                  <div className="flex-1 flex flex-col items-center p-2 dark:bg-black/30 bg-white shadow-sm dark:shadow-none rounded-lg">
                    <span className="text-xl font-bold dark:text-white text-slate-800">{timeLeft.days}</span>
                    <span className="text-[10px] opacity-40 uppercase dark:text-white text-slate-600">Days</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center p-2 dark:bg-black/30 bg-white shadow-sm dark:shadow-none rounded-lg">
                    <span className="text-xl font-bold dark:text-white text-slate-800">{timeLeft.hours}</span>
                    <span className="text-[10px] opacity-40 uppercase dark:text-white text-slate-600">Hrs</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center p-2 dark:bg-black/30 bg-white shadow-sm dark:shadow-none rounded-lg">
                    <span className="text-xl font-bold dark:text-white text-slate-800">{timeLeft.minutes}</span>
                    <span className="text-[10px] opacity-40 uppercase dark:text-white text-slate-600">Min</span>
                  </div>
                </div>

                {votingStartIsoStr && (
                  <div className="w-full border-t border-black/5 dark:border-white/5 pt-4 mt-4 flex flex-col items-center">
                    <span className="text-xs font-bold mb-1 dark:text-white text-slate-800 text-center">
                      Event #{currentEventNumber} voting period
                    </span>
                    <span className="text-[10px] opacity-50 mb-4 text-center dark:text-white text-slate-600">
                      {getVotingLegend(votingStartIsoStr)}
                    </span>
                    
                    <div className="w-full flex justify-between gap-2">
                      <div className="flex-1 flex flex-col items-center p-2 dark:bg-black/30 bg-white shadow-sm dark:shadow-none rounded-lg">
                        <span className="text-xl font-bold dark:text-white text-slate-800">{votingTimeLeft.days}</span>
                        <span className="text-[10px] opacity-40 uppercase dark:text-white text-slate-600">Days</span>
                      </div>
                      <div className="flex-1 flex flex-col items-center p-2 dark:bg-black/30 bg-white shadow-sm dark:shadow-none rounded-lg">
                        <span className="text-xl font-bold dark:text-white text-slate-800">{votingTimeLeft.hours}</span>
                        <span className="text-[10px] opacity-40 uppercase dark:text-white text-slate-600">Hrs</span>
                      </div>
                      <div className="flex-1 flex flex-col items-center p-2 dark:bg-black/30 bg-white shadow-sm dark:shadow-none rounded-lg">
                        <span className="text-xl font-bold dark:text-white text-slate-800">{votingTimeLeft.minutes}</span>
                        <span className="text-[10px] opacity-40 uppercase dark:text-white text-slate-600">Min</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-6 flex-1">
            <div>
              <div className={cn("text-[10px] uppercase tracking-widest font-bold opacity-30 mb-4 dark:text-white text-slate-500 whitespace-nowrap overflow-hidden transition-all", isCollapsed ? "lg:hidden" : "")}>
                Member panel
              </div>
              {isCollapsed && <div className="hidden lg:block w-full h-px bg-black/5 dark:bg-white/5 mb-4" />}
              <div className="space-y-1">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    title={item.label}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "w-full flex items-center rounded-lg text-sm transition-all text-left",
                      isCollapsed ? "lg:justify-center lg:px-0 lg:py-3 px-3 py-2 gap-3" : "gap-3 px-3 py-2",
                      activeTab === item.id 
                        ? `bg-black/5 dark:bg-white/5 ${colors.primary} border-l-2 ${colors.border}` 
                        : "dark:text-white/40 text-slate-500 hover:dark:text-white/70 hover:text-slate-900 dark:hover:bg-white/5 hover:bg-black/5"
                    )}
                  >
                    <item.icon size={18} className="shrink-0" />
                    <span className={cn("whitespace-nowrap transition-all", isCollapsed ? "lg:hidden" : "")}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {isAdmin && (
              <div>
                <div className={cn("text-[10px] uppercase tracking-widest font-bold opacity-30 mb-4 dark:text-white text-slate-500 whitespace-nowrap overflow-hidden transition-all", isCollapsed ? "lg:hidden" : "")}>
                  Admin panel
                </div>
                {isCollapsed && <div className="hidden lg:block w-full h-px bg-black/5 dark:bg-white/5 mb-4 mt-2" />}
                <div className="space-y-1">
                  {adminItems.map((item) => (
                    <button
                      key={item.id}
                      title={item.label}
                      onClick={() => setActiveTab(item.id)}
                      className={cn(
                        "w-full flex items-center rounded-lg text-sm transition-all text-left",
                        isCollapsed ? "lg:justify-center lg:px-0 lg:py-3 px-3 py-2 gap-3" : "gap-3 px-3 py-2",
                        activeTab === item.id 
                          ? `bg-black/5 dark:bg-white/5 ${colors.primary} border-l-2 ${colors.border}` 
                          : "dark:text-white/40 text-slate-500 hover:dark:text-white/70 hover:text-slate-900 dark:hover:bg-white/5 hover:bg-black/5"
                      )}
                    >
                      <item.icon size={18} className="shrink-0" />
                      <span className={cn("whitespace-nowrap transition-all", isCollapsed ? "lg:hidden" : "")}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </nav>
        </div>
      </div>
    </>
  );
}