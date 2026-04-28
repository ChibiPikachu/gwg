/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth, AuthProvider } from '@/components/AuthProvider';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import LandingPage from '@/components/LandingPage';
import Events from '@/components/Dashboard';
import MySubmissions from '@/components/MySubmissions';
import Leaderboard from '@/components/Leaderboard';
import Profile from '@/components/Profile';
import MyTeam from '@/components/MyTeam';
import AdminPanel from '@/components/AdminPanel';
import { Team } from '@/types';
import { motion, AnimatePresence } from 'motion/react';

function AppContent() {
  const { user, loading, theme, loginWithSteam, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('submissions');
  const [viewedProfileId, setViewedProfileId] = useState<string | null>(null);

  const handleViewProfile = (steamId: string | null) => {
    setViewedProfileId(steamId);
    setActiveTab('profile');
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className={`w-12 h-12 border-4 ${theme.border} border-t-transparent rounded-full animate-spin`}></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex">
        <Sidebar userTeam="none" isAdmin={false} activeTab="" setActiveTab={() => {}} />
        <div className="flex-1 flex flex-col">
          <div className="h-16 flex items-center justify-end px-8 gap-4 sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-md z-50">
            <button 
              onClick={() => {
                // Quick hack for demo testing
                window.location.href = '/?demo=true';
              }}
              className="text-[10px] text-white/20 hover:text-white/40 transition-colors uppercase tracking-widest font-bold"
            >
              Demo Mode
            </button>
            <button 
              onClick={loginWithSteam}
              className="bg-[#1a1a1a] border border-white/10 hover:border-white/20 transition-all rounded-xl pl-4 pr-6 py-2.5 flex items-center gap-4 font-bold text-sm shadow-xl active:scale-95 group"
            >
              <img src="https://community.akamai.steamstatic.com/public/images/signinthroughsteam/sits_01.png" alt="Steam" className="h-6 opacity-80 group-hover:opacity-100 transition-opacity" />
              <span className="text-white/70 group-hover:text-white transition-colors uppercase tracking-tight text-[10px]">Sign in through STEAM</span>
            </button>
            <div className="flex items-center bg-black/30 rounded-full p-1 border border-white/5 shadow-inner">
              <div className="w-8 h-8 flex items-center justify-center text-white/30"><div className="w-4 h-4 rounded-full border border-current" /></div>
              <div className="w-8 h-8 flex items-center justify-center bg-[#1a1a1a] rounded-full text-blue-400"><div className="w-4 h-4 rounded-full bg-current" /></div>
            </div>
          </div>
          <LandingPage />
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'submissions':
        return <MySubmissions />;
      case 'profile':
        return <Profile steamId={viewedProfileId || undefined} />;
      case 'team':
        return <MyTeam onViewProfile={handleViewProfile} />;
      case 'leaderboard':
        return <Leaderboard onViewProfile={handleViewProfile} />;
      case 'events':
        return <Events />;
      case 'admin-users':
      case 'admin-teams':
        return <AdminPanel onViewProfile={handleViewProfile} />;
      default:
        return <MySubmissions />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <Sidebar 
        userTeam={user.team} 
        isAdmin={user.isAdmin} 
        activeTab={activeTab} 
        setActiveTab={(tab) => {
          if (tab !== 'profile') setViewedProfileId(null);
          setActiveTab(tab);
        }} 
      />
      <div className="flex-1 flex flex-col">
        <TopBar user={user} onLogout={logout} onProfileClick={() => handleViewProfile(null)} />
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

