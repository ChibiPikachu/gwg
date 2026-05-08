import React from 'react';
import { CheckCircle2, XCircle, Clock, Eye, MessageSquare } from 'lucide-react';
// Assuming you have these imports elsewhere:
// import { Submission, TEAM_COLORS } from '@/types';
// import { cn } from '@/lib/utils';

export default function AdminSubmissions() {
  const submissions: any[] = [
    { 
      id: '1', 
      userName: 'Chibi', 
      userAvatar: 'https://avatars.akamai.steamstatic.com/ec7f4262aeae81e74f38697669d05634e02a9023_full.jpg',
      gameTitle: 'Beyond: Two Souls', 
      gameImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/370770/header.jpg', 
      status: 'pending', 
      achievements: 10, 
      hours: 4.6, 
      points: 10,
      createdAt: Date.now() - 3600000,
      notes: 'Final chapter screenshots uploaded to discord.'
    },
     { 
      id: '2', 
      userName: 'Skye', 
      userAvatar: 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
      gameTitle: 'Life is Strange', 
      gameImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/319630/header.jpg', 
      status: 'pending', 
      achievements: 5, 
      hours: 12, 
      points: 5,
      createdAt: Date.now() - 7200000,
      notes: ''
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto flex flex-col gap-8 md:gap-12 overflow-x-hidden">
      <section>
        <h2 className="text-xl font-bold mb-2">Submission Queue</h2>
        <p className="opacity-60 text-sm mb-6 md:mb-8">Review and verify player game completions.</p>
        
        <div className="flex flex-wrap gap-3 md:gap-4 mb-6 md:mb-8">
           <button className="px-5 md:px-6 py-2 bg-pink-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-pink-500/20">Pending (2)</button>
           <button className="px-5 md:px-6 py-2 bg-white/5 text-white/50 rounded-lg text-sm font-bold hover:bg-white/10 transition-all">Verified</button>
           <button className="px-5 md:px-6 py-2 bg-white/5 text-white/50 rounded-lg text-sm font-bold hover:bg-white/10 transition-all">Rejected</button>
        </div>

        <div className="flex flex-col gap-4">
          {submissions.map((sub) => (
            <div key={sub.id} className="bg-[#111111] border border-white/5 rounded-2xl p-4 md:p-6 flex flex-col lg:flex-row gap-6 md:gap-8 group hover:border-white/10 transition-all">
              
              {/* Image Container - Added shrink-0 and ensured it takes full width gracefully on mobile */}
              <div className="w-full lg:w-40 aspect-video rounded-xl overflow-hidden shadow-xl shrink-0">
                 <img src={sub.gameImage} alt="" className="w-full h-full object-cover" />
              </div>
              
              <div className="flex-1 flex flex-col gap-4 min-w-0">
                 {/* Header - Allowed wrapping on very small screens */}
                 <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                       <img src={sub.userAvatar} className="w-8 h-8 rounded-full border border-pink-500/30 shrink-0" alt="" />
                       <div className="min-w-0">
                          <h3 className="font-bold text-lg truncate sm:whitespace-normal break-words">{sub.gameTitle}</h3>
                          <p className="text-sm opacity-50 font-medium">Submitted by <span className="text-pink-400 font-bold">{sub.userName}</span></p>
                       </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs opacity-30 shrink-0">
                       <Clock size={14} />
                       {new Date(sub.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                 </div>

                 {/* Stats Grid - Reduced gap on mobile so it doesn't blow out the width */}
                 <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-8 bg-black/20 p-3 md:p-4 rounded-xl border border-white/5">
                    <div className="flex flex-col gap-1">
                       <span className="text-[10px] uppercase font-bold opacity-30 truncate">Achievements</span>
                       <span className="text-lg md:text-xl font-mono text-emerald-400">{sub.achievements}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                       <span className="text-[10px] uppercase font-bold opacity-30 truncate">Hours</span>
                       <span className="text-lg md:text-xl font-mono text-blue-400">{sub.hours}h</span>
                    </div>
                    <div className="flex flex-col gap-1">
                       <span className="text-[10px] uppercase font-bold opacity-30 truncate">Points</span>
                       <span className="text-lg md:text-xl font-mono text-amber-400">{sub.points}</span>
                    </div>
                 </div>

                 {sub.notes && (
                    <div className="flex items-start gap-2 p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                       <MessageSquare size={16} className="text-blue-400 mt-0.5 shrink-0" />
                       <p className="text-sm text-blue-100/70">{sub.notes}</p>
                    </div>
                 )}
              </div>

              {/* Action Buttons - Switched border-left to border-top on mobile, fixed paddings */}
              <div className="flex flex-col sm:flex-row lg:flex-col gap-2 lg:justify-center border-t lg:border-t-0 lg:border-l border-white/5 pt-4 lg:pt-0 lg:pl-8 mt-2 lg:mt-0 shrink-0">
                 <button className="flex-1 lg:flex-none flex items-center justify-center lg:justify-start gap-2 px-6 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">
                    <CheckCircle2 size={18} /> Verify
                 </button>
                 <button className="flex-1 lg:flex-none flex items-center justify-center lg:justify-start gap-2 px-6 py-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-sm font-bold hover:bg-red-500/20 transition-all">
                    <XCircle size={18} /> Reject
                 </button>
                 <button className="flex-1 lg:flex-none flex items-center justify-center lg:justify-start gap-2 px-6 py-2.5 bg-white/5 text-white/50 rounded-xl text-sm font-bold hover:bg-white/10 transition-all">
                    <Eye size={18} /> Details
                 </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}