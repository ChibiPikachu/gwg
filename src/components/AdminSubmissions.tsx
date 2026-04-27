import React from 'react';
import { Submission, TEAM_COLORS } from '@/types';
import { CheckCircle2, XCircle, Clock, Eye, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminSubmissions() {
  // Mock data for now, ideally fetched from Supabase
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
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-12">
      <section>
        <h2 className="text-xl font-bold mb-2">Submission Queue</h2>
        <p className="opacity-60 text-sm mb-8">Review and verify player game completions.</p>
        
        <div className="flex gap-4 mb-8">
           <button className="px-6 py-2 bg-pink-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-pink-500/20">Pending (2)</button>
           <button className="px-6 py-2 bg-white/5 text-white/50 rounded-lg text-sm font-bold hover:bg-white/10 transition-all">Verified</button>
           <button className="px-6 py-2 bg-white/5 text-white/50 rounded-lg text-sm font-bold hover:bg-white/10 transition-all">Rejected</button>
        </div>

        <div className="flex flex-col gap-4">
          {submissions.map((sub) => (
            <div key={sub.id} className="bg-[#111111] border border-white/5 rounded-2xl p-6 flex flex-col md:flex-row gap-8 group hover:border-white/10 transition-all">
              <div className="w-full md:w-40 aspect-video rounded-xl overflow-hidden shadow-xl">
                 <img src={sub.gameImage} alt="" className="w-full h-full object-cover" />
              </div>
              
              <div className="flex-1 flex flex-col gap-4">
                 <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                       <img src={sub.userAvatar} className="w-8 h-8 rounded-full border border-pink-500/30" alt="" />
                       <div>
                          <h3 className="font-bold text-lg">{sub.gameTitle}</h3>
                          <p className="text-sm opacity-50 font-medium">Submitted by <span className="text-pink-400 font-bold">{sub.userName}</span></p>
                       </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs opacity-30">
                       <Clock size={14} />
                       {new Date(sub.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                 </div>

                 <div className="grid grid-cols-3 gap-8 bg-black/20 p-4 rounded-xl border border-white/5">
                    <div className="flex flex-col gap-1">
                       <span className="text-[10px] uppercase font-bold opacity-30">Achievements</span>
                       <span className="text-xl font-mono text-emerald-400">{sub.achievements}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                       <span className="text-[10px] uppercase font-bold opacity-30">Hours</span>
                       <span className="text-xl font-mono text-blue-400">{sub.hours}h</span>
                    </div>
                    <div className="flex flex-col gap-1">
                       <span className="text-[10px] uppercase font-bold opacity-30">Points</span>
                       <span className="text-xl font-mono text-amber-400">{sub.points}</span>
                    </div>
                 </div>

                 {sub.notes && (
                    <div className="flex items-start gap-2 p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                       <MessageSquare size={16} className="text-blue-400 mt-0.5" />
                       <p className="text-sm text-blue-100/70">{sub.notes}</p>
                    </div>
                 )}
              </div>

              <div className="flex flex-col gap-2 justify-center border-l border-white/5 pl-8">
                 <button className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">
                    <CheckCircle2 size={18} /> Verify
                 </button>
                 <button className="flex items-center gap-2 px-6 py-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-sm font-bold hover:bg-red-500/20 transition-all">
                    <XCircle size={18} /> Reject
                 </button>
                 <button className="flex items-center gap-2 px-6 py-2.5 bg-white/5 text-white/50 rounded-xl text-sm font-bold hover:bg-white/10 transition-all">
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
