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
}

export default function Sidebar({ userTeam, isAdmin, activeTab, setActiveTab }: SidebarProps) {
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
    <div className="w-72 bg-[#0c0c0c] border-r border-white/5 h-screen sticky top-0 flex flex-col p-6 overflow-y-auto">
      <div className="flex items-center gap-2 mb-10">
        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white font-display text-xl", logoColor)}>
          GWG
        </div>
        <span className="font-display text-xl text-white">Girls Who Game</span>
      </div>

      {/* Event Widget */}
      <div className="bg-[#151515] rounded-xl border border-white/5 overflow-hidden mb-8">
        <div className="bg-[#1a1a1a] px-4 py-2 text-[10px] uppercase tracking-widest font-bold text-center opacity-70">
          Current event
        </div>
        <div className="p-4 flex flex-col items-center">
          <div className={cn("w-full aspect-[16/6] rounded-lg flex items-center justify-center mb-4 border", theme.secondary, theme.border)}>
             <span className={cn("font-bold text-xl uppercase tracking-tighter", theme.text)}>
               {currentEvent ? currentEvent.title : 'No Event'}
             </span>
          </div>
          <span className="text-sm font-bold mb-1">{currentEvent ? currentEvent.title : 'Inactive'}</span>
          <span className="text-[10px] opacity-50 mb-4 text-center">
            {currentEvent 
              ? `Ends on ${new Date((currentEvent as any).end_date).toLocaleDateString()}` 
              : 'Waiting for next event'}
          </span>
          
          <div className="w-full flex justify-between gap-2 border-t border-white/5 pt-4">
            <div className="flex-1 flex flex-col items-center p-2 bg-black/30 rounded-lg">
              <span className="text-xl font-bold">{timeLeft.days}</span>
              <span className="text-[10px] opacity-40 uppercase">Days</span>
            </div>
            <div className="flex-1 flex flex-col items-center p-2 bg-black/30 rounded-lg">
              <span className="text-xl font-bold">{timeLeft.hours}</span>
              <span className="text-[10px] opacity-40 uppercase">Hrs</span>
            </div>
            <div className="flex-1 flex flex-col items-center p-2 bg-black/30 rounded-lg">
              <span className="text-xl font-bold">{timeLeft.minutes}</span>
              <span className="text-[10px] opacity-40 uppercase">Min</span>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-4">Member panel</div>
          <div className="space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-left",
                  activeTab === item.id 
                    ? `bg-white/5 ${colors.primary} border-l-2 ${colors.border}` 
                    : "text-white/40 hover:text-white/70 hover:bg-white/5"
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
            <div className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-4">Admin panel</div>
            <div className="space-y-1">
              {adminItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-left",
                    activeTab === item.id 
                      ? `bg-white/5 ${colors.primary} border-l-2 ${colors.border}` 
                      : "text-white/40 hover:text-white/70 hover:bg-white/5"
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
  );
}
