import React, { useState, useEffect } from 'react';
import { Home, ClipboardList, Users, Trophy, Calendar, Settings, ShieldCheck, ListChecks, Group } from 'lucide-react';
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
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0 });

  useEffect(() => {
    fetch('/api/events')
      .then(res => res.json())
      .then(data => {
        const active = data.find((e: any) => e.is_active);
        if (active) setCurrentEvent(active);
      });
  }, []);

  useEffect(() => {
    if (!currentEvent) return;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const end = new Date((currentEvent as any).end_date).getTime();
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
    }, 60000);

    // Initial run
    const now = new Date().getTime();
    const end = new Date((currentEvent as any).end_date).getTime();
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
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy, section: 'member' },
    { id: 'events', label: 'Events', icon: Calendar, section: 'member' },
  ];

  const adminItems = [
    { id: 'admin-users', label: 'All users', icon: Users, section: 'admin' },
    { id: 'admin-submissions', label: 'All submissions', icon: ListChecks, section: 'admin' },
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

      <div className={cn(
        "fixed inset-y-0 left-0 z-[110] w-72 dark:bg-[#0c0c0c] bg-white border-r border-black/5 dark:border-white/5 h-screen flex flex-col p-6 overflow-y-auto transition-transform duration-300 lg:sticky lg:top-0 lg:translate-x-0 lg:z-auto shadow-xl dark:shadow-none",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-full flex items-center justify-center p-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 group-hover:border-black/20 dark:group-hover:border-white/20 transition-all overflow-hidden shrink-0">
              <img 
                src="https://64.media.tumblr.com/4cc7b39b35387b1cf8814cb69b4317de/9e872b03ce8fba32-13/s128x128u_c1/fa8978589ebd3c0d46250356d6a63ad428a76b80.png" 
                alt="Logo" 
                className="w-full h-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="flex flex-col">
              <span className="font-display text-lg dark:text-white text-slate-800 leading-tight tracking-tighter">Girls Who</span>
              <span className={cn("font-display text-lg leading-tight tracking-tighter", theme.text)}>Game</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="lg:hidden p-2 text-slate-400 dark:text-white/50 hover:text-slate-900 dark:hover:text-white"
          >
            <Settings size={20} className="rotate-45" />
          </button>
        </div>

      {/* Event Widget */}
      <div className="dark:bg-[#151515] bg-slate-100 rounded-xl border border-black/5 dark:border-white/5 overflow-hidden mb-8">
        <div className="dark:bg-[#1a1a1a] bg-slate-200/50 px-4 py-2 text-[10px] uppercase tracking-widest font-bold text-center opacity-70">
          Current event
        </div>
        <div className="p-4 flex flex-col items-center">
          <div className={cn("w-full aspect-[16/6] rounded-lg flex items-center justify-center mb-4 border", theme.secondary, theme.border)}>
             <span className={cn("font-bold text-xl uppercase tracking-tighter", theme.text)}>
               {currentEvent ? currentEvent.title : 'No Event'}
             </span>
          </div>
          <span className="text-sm font-bold mb-1 dark:text-white text-slate-800">{currentEvent ? currentEvent.title : 'Inactive'}</span>
          <span className="text-[10px] opacity-50 mb-4 text-center dark:text-white text-slate-600">
            {currentEvent 
              ? `Ends on ${new Date((currentEvent as any).end_date).toLocaleDateString()}` 
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
        </div>
      </div>

      <nav className="flex flex-col gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-4 dark:text-white text-slate-500">Member panel</div>
          <div className="space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-left",
                  activeTab === item.id 
                    ? `bg-black/5 dark:bg-white/5 ${colors.primary} border-l-2 ${colors.border}` 
                    : "dark:text-white/40 text-slate-500 hover:dark:text-white/70 hover:text-slate-900 dark:hover:bg-white/5 hover:bg-black/5"
                )}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-4 dark:text-white text-slate-500">Admin panel</div>
            <div className="space-y-1">
              {adminItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-left",
                    activeTab === item.id 
                      ? `bg-black/5 dark:bg-white/5 ${colors.primary} border-l-2 ${colors.border}` 
                      : "dark:text-white/40 text-slate-500 hover:dark:text-white/70 hover:text-slate-900 dark:hover:bg-white/5 hover:bg-black/5"
                  )}
                >
                  <item.icon size={18} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>
    </div>
    </>
  );
}
