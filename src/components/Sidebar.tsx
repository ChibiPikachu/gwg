import React, { useState, useEffect } from 'react';
import { Home, ClipboardList, Users, Trophy, Calendar, Settings, ShieldCheck, ListChecks, Group } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Team, TEAM_COLORS } from '@/types';

interface SidebarProps {
  userTeam: Team;
  isAdmin: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Sidebar({ userTeam, isAdmin, activeTab, setActiveTab }: SidebarProps) {
  const colors = TEAM_COLORS[userTeam];

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
    { id: 'admin-teams', label: 'Teams', icon: Group, section: 'admin' },
  ];

  return (
    <div className="w-72 bg-[#0c0c0c] border-r border-white/5 h-screen sticky top-0 flex flex-col p-6 overflow-y-auto">
      <div className="flex items-center gap-2 mb-10">
        <div className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center text-white font-display text-xl">
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
          <div className="w-full aspect-[16/6] bg-blue-500/20 rounded-lg flex items-center justify-center mb-4 border border-blue-500/30">
             <span className="font-bold text-2xl text-blue-400">Event #3</span>
          </div>
          <span className="text-sm font-bold mb-1">Event #3</span>
          <span className="text-[10px] opacity-50 mb-4 text-center">Runs from April 1st to May 29th</span>
          
          <div className="w-full flex justify-between gap-2 border-t border-white/5 pt-4">
            <div className="flex-1 flex flex-col items-center p-2 bg-black/30 rounded-lg">
              <span className="text-xl font-bold">24</span>
              <span className="text-[10px] opacity-40 uppercase">Days</span>
            </div>
            <div className="flex-1 flex flex-col items-center p-2 bg-black/30 rounded-lg">
              <span className="text-xl font-bold">12</span>
              <span className="text-[10px] opacity-40 uppercase">Hours</span>
            </div>
            <div className="flex-1 flex flex-col items-center p-2 bg-black/30 rounded-lg">
              <span className="text-xl font-bold">57</span>
              <span className="text-[10px] opacity-40 uppercase">Minutes</span>
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
