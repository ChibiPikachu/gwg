/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth, AuthProvider } from '@/components/AuthProvider';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import LandingPage from '@/components/LandingPage';
import EventsPanel from '@/components/Events';
import MySubmissions from '@/components/MySubmissions';
import Leaderboard from '@/components/Leaderboard';
import Profile from '@/components/Profile';
import MyTeam from '@/components/MyTeam';
import AdminPanel from '@/components/AdminPanel';
import { Team } from '@/types';
import { motion, AnimatePresence } from 'motion/react';
import { Menu } from 'lucide-react';

function AppContent() {
  const { user, loading, theme, loginWithSteam, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('submissions');
  const [viewedProfileId, setViewedProfileId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleViewProfile = (steamId: string | null) => {
    setViewedProfileId(steamId);
    setActiveTab('profile');
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white dark:bg-[#0a0a0a]">
        <div className={`w-12 h-12 border-4 ${theme.border} border-t-transparent rounded-full animate-spin`}></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row bg-white dark:bg-[#0a0a0a]">
        <Sidebar 
          userTeam="none" 
          isAdmin={false} 
          activeTab="" 
          setActiveTab={() => {}} 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-16 flex items-center justify-between lg:justify-end px-4 md:px-8 gap-4 sticky top-0 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md z-50 border-b border-black/5 dark:border-white/5">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-2 md:gap-4">
              <button 
                onClick={() => {
                  window.location.href = '/?demo=true';
                }}
                className="text-[10px] text-slate-400 dark:text-white/20 hover:text-slate-600 dark:hover:text-white/40 transition-colors uppercase tracking-widest font-bold hidden sm:block"
              >
                Demo Mode
              </button>
              <button 
                onClick={loginWithSteam}
                className="bg-slate-100 dark:bg-[#1a1a1a] border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition-all rounded-xl pl-3 pr-4 md:pl-4 md:pr-6 py-2 md:py-2.5 flex items-center gap-2 md:gap-4 font-bold text-sm shadow-xl active:scale-95 group"
              >
                <img src="https://community.akamai.steamstatic.com/public/images/signinthroughsteam/sits_01.png" alt="Steam" className="h-5 md:h-6 opacity-80 group-hover:opacity-100 transition-opacity" />
                <span className="text-slate-600 dark:text-white/70 group-hover:text-slate-900 dark:group-hover:text-white transition-colors uppercase tracking-tight text-[8px] md:text-[10px]">Sign in through STEAM</span>
              </button>
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
        return <EventsPanel />;
      case 'admin-users':
      case 'admin-submissions':
      case 'admin-teams':
        return <AdminPanel onViewProfile={handleViewProfile} activeAdminTab={activeTab === 'admin-submissions' ? 'submissions' : 'users'} />;
      default:
        return <MySubmissions />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-[#0a0a0a] transition-colors duration-300">
      <Sidebar 
        userTeam={user.team} 
        isAdmin={user.isAdmin} 
        activeTab={activeTab} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        setActiveTab={(tab) => {
          if (tab !== 'profile') setViewedProfileId(null);
          setActiveTab(tab);
          setIsSidebarOpen(false);
        }} 
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar 
          user={user} 
          onLogout={logout} 
          onProfileClick={() => handleViewProfile(null)} 
          onMenuClick={() => setIsSidebarOpen(true)}
        />
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

