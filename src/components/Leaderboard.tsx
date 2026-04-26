import React from 'react';
import { Trophy, Medal, Users } from 'lucide-react';
import { Team, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';

export default function Leaderboard() {
  const standings = [
    { team: 'blue', points: 4500, members: 12, rank: 1 },
    { team: 'purple', points: 3800, members: 10, rank: 2 },
    { team: 'green', points: 3200, members: 15, rank: 3 },
    { team: 'red', points: 2900, members: 8, rank: 4 },
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Team Standings</h1>
      <p className="opacity-60 mb-12">Real-time competition progress.</p>

      <div className="grid gap-6">
        {standings.map((s) => (
          <div 
            key={s.team}
            className={cn(
              "p-6 rounded-2xl border bg-[#111111] flex items-center justify-between shadow-lg",
              TEAM_COLORS[s.team as Team].border
            )}
          >
            <div className="flex items-center gap-6">
              <div className="w-12 h-12 flex items-center justify-center bg-black/40 rounded-xl font-bold text-xl">
                 {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : s.rank}
              </div>
              <div>
                <h3 className={cn("text-xl font-bold capitalize", TEAM_COLORS[s.team as Team].primary)}>
                  Team {s.team}
                </h3>
                <div className="flex items-center gap-2 opacity-50 text-sm mt-1">
                  <Users size={14} />
                  <span>{s.members} members</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-3xl font-mono font-bold">{s.points.toLocaleString()}</span>
              <span className="text-[10px] uppercase tracking-widest font-bold opacity-30 mt-1">Total Points</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16">
        <h2 className="text-xl font-bold mb-6">Recent Achievements</h2>
        <div className="space-y-4">
           {[1, 2, 3].map(i => (
             <div key={i} className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/5 opacity-60">
                <div className="w-8 h-8 rounded-full bg-pink-500/20" />
                <div className="flex-1">
                   <p className="text-sm border-b border-transparent">
                     <span className="font-bold text-blue-400">Chibi</span> just earned <span className="font-bold">10 points</span> for <span className="italic">Beyond: Two Souls</span>
                   </p>
                </div>
                <span className="text-[10px] opacity-40">2m ago</span>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
}
