import React from 'react';
import { History, CheckCircle2, AlertCircle } from 'lucide-react';
import { Submission, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';

export default function MySubmissions() {
  // Stub data for visualization
  const submissions: any[] = [
    { id: '1', gameTitle: 'Beyond: Two Souls', gameImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/370770/header.jpg', status: 'verified', achievements: 10, hours: 4.6, points: 10 },
    { id: '2', gameTitle: "Catto's Post Office", gameImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2693710/header.jpg', status: 'pending', achievements: 0, hours: 0, points: 0 },
    { id: '3', gameTitle: 'Alba', gameImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1337010/header.jpg', status: 'verified', achievements: 10, hours: 4, points: 10 },
    { id: '4', gameTitle: 'Life is Strange', gameImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/319630/header.jpg', status: 'verified', achievements: 10, hours: 12, points: 10 },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Welcome!</h1>
      <p className="opacity-60 mb-12">Ready to add your games?</p>

      {/* Search Stub */}
      <div className="bg-white/5 border border-white/5 rounded-xl py-4 px-6 mb-16 opacity-30 select-none">
        Search a game...
      </div>

      <h2 className="text-xl font-bold mb-8">My submissions</h2>
      
      <div className="mb-12">
        <h3 className="text-xs uppercase tracking-widest font-bold opacity-30 mb-6">Current event</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {submissions.map((sub) => (
            <div key={sub.id} className="flex flex-col gap-3 group">
              <div className="aspect-[3/4] bg-[#111111] rounded-xl overflow-hidden border border-white/5 relative shadow-xl">
                 <img src={sub.gameImage} alt={sub.gameTitle} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                 
                 {sub.id === '1' && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4 gap-4">
                       <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-2 text-xs opacity-80 font-bold">
                             🏆 10
                          </div>
                          <div className="flex items-center gap-2 text-xs opacity-80 font-bold">
                             🕒 4.6h
                          </div>
                          <div className="flex items-center gap-2 text-xs opacity-80 font-bold">
                             📊 10
                          </div>
                       </div>
                       <div className="flex gap-2">
                          <button className="p-2 bg-blue-500 rounded-lg hover:after:bg-blue-600 transition-colors">
                             <History size={16} />
                          </button>
                          <button className="p-2 bg-red-500 rounded-lg hover:bg-red-600 transition-colors">
                             <AlertCircle size={16} />
                          </button>
                       </div>
                    </div>
                 )}
              </div>
              <div className="flex items-center gap-2 px-1">
                {sub.status === 'verified' ? (
                  <>
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="text-[10px] font-bold opacity-70">Game verified</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} className="text-amber-400" />
                    <span className="text-[10px] font-bold opacity-70">Pending, see comments</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-widest font-bold opacity-30 mb-6">Past events</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 opacity-40 grayscale pointer-events-none">
          {/* Past events stubs */}
          <div className="aspect-[3/4] bg-[#1a1a1a] rounded-xl border border-white/5" />
          <div className="aspect-[3/4] bg-[#1a1a1a] rounded-xl border border-white/5" />
          <div className="aspect-[3/4] bg-[#1a1a1a] rounded-xl border border-white/5" />
          <div className="aspect-[3/4] bg-[#1a1a1a] rounded-xl border border-white/5" />
        </div>
      </div>
    </div>
  );
}
