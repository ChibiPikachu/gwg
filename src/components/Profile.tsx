import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Disc as Discord, Shield, Trophy, Edit2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEAM_COLORS } from '@/types';

export default function Profile() {
  const { user, syncWithDiscord, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState(user?.status || '');
  const [displayName, setDisplayName] = useState(user?.steamName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  if (!user) return null;

  const handleSave = async () => {
    setIsSaving(true);
    const success = await updateProfile({ displayName, status });
    setIsSaving(false);
    if (success) {
      setIsEditing(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  const handleCancel = () => {
    setStatus(user.status || '');
    setDisplayName(user.steamName || '');
    setIsEditing(false);
  };

  const colors = TEAM_COLORS[user.team];

  return (
    <div className="p-8 max-w-4xl mx-auto flex flex-col gap-12">
      <section className="flex flex-col md:flex-row gap-8 items-center md:items-start">
        <div className="w-32 h-32 rounded-full border-4 border-pink-500/30 p-1 relative">
           <img src={user.steamAvatar || user.discordAvatar} alt={user.steamName} className="w-full h-full rounded-full object-cover" />
           {user.isAdmin && (
             <div className="absolute -bottom-2 -right-2 bg-pink-500 text-white p-1.5 rounded-full shadow-lg" title="Admin">
               <Shield size={16} />
             </div>
           )}
        </div>

        <div className="flex-1 flex flex-col gap-4 text-center md:text-left">
           <div>
              {isEditing ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold opacity-30">Display Name</span>
                  <input 
                    type="text" 
                    className="text-3xl font-bold bg-white/5 border border-white/10 rounded-lg px-4 py-1 focus:outline-none focus:border-pink-500/50 w-full md:w-auto"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
              ) : (
                <div className="group flex items-center gap-3">
                  <h1 className="text-3xl font-bold">{user.steamName}</h1>
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/5 rounded-full transition-all text-pink-400"
                  >
                    <Edit2 size={16} />
                  </button>
                </div>
              )}
              <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-2">
                 <div className="flex items-center gap-2 opacity-60 text-sm">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    <span>Steam ID: {user.steamId}</span>
                 </div>
                 {user.discordName && (
                   <div className="flex items-center gap-2 opacity-60 text-sm">
                      <Discord size={14} className="text-purple-400" />
                      <span>{user.discordName}</span>
                   </div>
                 )}
              </div>
           </div>

           <div className="flex flex-col gap-2 relative max-w-xl">
              <span className="text-[10px] uppercase font-bold opacity-30">Status</span>
              <div className="flex items-center gap-3 group">
                {isEditing ? (
                  <div className="flex-1 flex flex-col gap-4">
                    <input 
                      type="text" 
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-pink-500/50"
                      value={status}
                      placeholder="What's on your mind?"
                      onChange={(e) => setStatus(e.target.value)}
                    />
                    <div className="flex gap-3">
                      <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        {isSaving ? <span className="animate-spin text-xs">●</span> : <Check size={18} />}
                        Save Changes
                      </button>
                      <button 
                        onClick={handleCancel}
                        disabled={isSaving}
                        className="px-6 py-2 bg-white/5 text-white/60 rounded-lg hover:bg-white/10 transition-all font-bold text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-lg opacity-80 italic">"{user.status || 'No status set'}"</p>
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="opacity-0 group-hover:opacity-100 p-2 hover:bg-white/5 rounded-full transition-all"
                    >
                      <Edit2 size={14} />
                    </button>
                  </>
                )}
              </div>
           </div>

           {showSuccess && (
             <div className="text-emerald-400 text-sm font-bold flex items-center gap-2 animate-bounce">
               <Check size={14} /> Profile updated successfully!
             </div>
           )}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         <div className="p-8 bg-[#111111] rounded-2xl border border-white/5 flex flex-col items-center gap-4 text-center shadow-xl">
            <Trophy size={32} className="text-amber-400" />
            <div>
               <span className="text-4xl font-mono font-bold block">{user.points}</span>
               <span className="text-[10px] uppercase font-bold opacity-30">Points Earned</span>
            </div>
         </div>

         <div className={cn("p-8 rounded-2xl border flex flex-col items-center gap-4 text-center shadow-xl bg-[#111111]", colors.border)}>
            <div className={cn("w-8 h-8 rounded-full", colors.secondary.replace('bg-', ''))} />
            <div>
               <span className={cn("text-2xl font-bold block capitalize", colors.primary)}>Team {user.team}</span>
               <span className="text-[10px] uppercase font-bold opacity-30">Your Faction</span>
            </div>
         </div>

         <div className="p-8 bg-[#111111] rounded-2xl border border-white/5 flex flex-col items-center gap-4 text-center shadow-xl">
            <div className="bg-purple-500/20 p-2 rounded-xl">
               <Discord size={32} className="text-purple-400" />
            </div>
            {user.discordId ? (
              <div className="flex flex-col items-center gap-2">
                 <span className="text-emerald-400 font-bold flex items-center gap-1">
                   <Check size={16} /> Linked
                 </span>
                 <span className="text-[10px] opacity-40">Account: {user.discordName}</span>
              </div>
            ) : (
              <button 
                onClick={syncWithDiscord}
                className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-6 py-2 rounded-lg font-bold text-sm transition-all shadow-lg"
              >
                Sync Discord
              </button>
            )}
         </div>
      </div>
    </div>
  );
}
