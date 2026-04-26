import React from 'react';
import { Search, Trophy, History, Clock } from 'lucide-react';
import { Submission, Team, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';

// Multiplier calculation
// 0-8h: 1x, 8-15h: 2x, 15-25h: 3x, 25+h: 4x
export const getMultiplier = (hours: number) => {
  if (hours < 8) return 1;
  if (hours < 15) return 2;
  if (hours < 25) return 3;
  return 4;
};

export default function Dashboard({ userTeam }: { userTeam: Team }) {
  const [search, setSearch] = React.useState('');
  const colors = TEAM_COLORS[userTeam];

  return (
    <div className="p-8 max-w-5xl mx-auto flex flex-col gap-12">
      <section>
        <h1 className="text-2xl font-bold mb-2">Welcome!</h1>
        <p className="opacity-60 mb-8">Ready to add your games?</p>

        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-white transition-colors" size={20} />
          <input 
            type="text"
            placeholder="Search a game..."
            className="w-full bg-white/5 border border-white/5 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-white/20 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Submit game</h2>
        </div>
        <p className="text-sm opacity-50 mb-8 max-w-2xl">
          Enter the achievements and hours you had before the event started, as well as the ones you got during the event for this game.
        </p>

        {/* Example Submission Card - Mirroring the UI */}
        <div className={cn("bg-[#111111] rounded-2xl border-2 p-8 flex flex-col md:flex-row gap-8 shadow-2xl", colors.border)}>
          <div className="w-full md:w-64 flex flex-col gap-4">
             <div className="aspect-[3/4] rounded-xl overflow-hidden relative group">
                <img 
                  src="https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/370770/header.jpg?t=1701335198" 
                  alt="Game Cover" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-xs font-bold uppercase tracking-widest">Change Image</span>
                </div>
             </div>
             <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="opacity-40">HLTB:</span>
                  <span className="bg-amber-400 text-black px-2 py-0.5 rounded font-bold">Medium</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="opacity-40">Easy tag:</span>
                  <span className="bg-emerald-500 text-black px-2 py-0.5 rounded font-bold">No</span>
                </div>
             </div>
          </div>

          <div className="flex-1 flex flex-col gap-8">
            <div className="flex justify-between items-start">
              <h3 className="text-3xl font-display">Beyond: Two Souls</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="text-[10px] uppercase tracking-widest font-bold opacity-30">Stats before the start of the event:</div>
                <div className="flex gap-4">
                   <div className="flex-1 bg-black/40 rounded-lg p-3 border border-white/5 flex items-center justify-between">
                     <Trophy size={16} className="text-white/30" />
                     <span className="font-mono text-lg">0</span>
                   </div>
                   <div className="flex-1 bg-black/40 rounded-lg p-3 border border-white/5 flex items-center justify-between">
                     <Clock size={16} className="text-white/30" />
                     <span className="font-mono text-lg">0 h</span>
                   </div>
                </div>

                <div className="text-[10px] uppercase tracking-widest font-bold opacity-30 mt-6">Stats during the event:</div>
                <div className="flex gap-4">
                   <div className="flex-1 bg-white/10 rounded-lg p-3 border border-white/20 flex items-center justify-between">
                     <Trophy size={16} className={colors.primary} />
                     <span className="font-mono text-lg">10</span>
                   </div>
                   <div className="flex-1 bg-white/10 rounded-lg p-3 border border-white/20 flex items-center justify-between">
                     <Clock size={16} className={colors.primary} />
                     <span className="font-mono text-lg">4.6 h</span>
                   </div>
                </div>
              </div>

              <div className="flex gap-6">
                <div className="flex-1 flex flex-col gap-2 p-6 border-l border-white/5">
                  <span className="text-[10px] uppercase tracking-widest font-bold opacity-30">Multiplier</span>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🔥</span>
                    <span className="text-4xl font-bold">x1</span>
                  </div>
                </div>
                <div className="flex-1 flex flex-col gap-2 p-6 border-l border-white/5">
                  <span className="text-[10px] uppercase tracking-widest font-bold opacity-30">Score Preview</span>
                  <div className="flex items-center gap-2">
                    <History size={24} className="text-white/30" />
                    <span className="text-4xl font-bold">10</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
               <span className="text-xs opacity-50">Notes / Proof:</span>
               <textarea 
                  className="w-full bg-black/40 border border-white/5 rounded-xl p-4 min-h-[100px] flex-1 text-sm focus:outline-none focus:border-white/20"
                  placeholder="Link to screenshots or any additional proof..."
               />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-white/5">
              <div className="flex items-center gap-3">
                <span className="text-sm opacity-50">Status:</span>
                <select className="bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none">
                  <option>Unfinished</option>
                  <option>Completed</option>
                </select>
              </div>
              <div className="flex gap-3">
                 <button className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors">
                    <History size={16} /> Submit
                 </button>
                 <button className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-6 py-2 rounded-lg font-bold transition-colors">
                    Cancel
                 </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
