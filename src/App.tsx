/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, Suspense, lazy } from 'react';
import { useAuth, AuthProvider } from '@/components/AuthProvider';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import LandingPage from '@/components/LandingPage';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, Loader2 } from 'lucide-react';

// Lazy-loaded tab components for code splitting & smaller initial bundle size
const MySubmissions = lazy(() => import('@/components/MySubmissions'));
const Profile = lazy(() => import('@/components/Profile'));
const MyTeam = lazy(() => import('@/components/MyTeam'));
const Games = lazy(() => import('@/components/Games'));
const Leaderboard = lazy(() => import('@/components/Leaderboard'));
const EventsPanel = lazy(() => import('@/components/Events'));
const ScreenshotContest = lazy(() => import('@/components/ScreenshotContest'));
const AdminPanel = lazy(() => import('@/components/AdminPanel'));
const DiscordRegistration = lazy(() => import('@/components/DiscordRegistration'));

function TabLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full p-8">
      <Loader2 className="w-8 h-8 animate-spin text-pink-500 mb-3" />
      <p className="text-xs uppercase tracking-wider font-semibold text-slate-400 dark:text-zinc-500 animate-pulse">
        Loading module...
      </p>
    </div>
  );
}

function AppContent() {
  const { user, loading, theme, loginWithSteam, loginWithDiscord, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('submissions');
  const [viewedProfileId, setViewedProfileId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleViewProfile = (steamId: string | null) => {
    setViewedProfileId(steamId);
    setActiveTab('profile');
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <div className={`w-12 h-12 border-4 ${theme.border} border-t-transparent rounded-full animate-spin`}></div>
      </div>
    );
  }

  if (user && user.needs_registration) {
    return (
      <Suspense fallback={<TabLoadingFallback />}>
        <DiscordRegistration />
      </Suspense>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row">
        <Sidebar 
          userTeam="none" 
          isAdmin={false} 
          activeTab="" 
          setActiveTab={() => {}} 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-16 flex items-center justify-between lg:justify-end px-4 md:px-8 gap-4 sticky top-0 bg-slate-50/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md z-50 border-b border-black/5 dark:border-white/5">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-2 md:gap-4 flex-wrap">
              <button 
                onClick={loginWithSteam}
                className="bg-[#1a1a1a] border border-white/10 hover:border-white/20 transition-all rounded-xl px-3 py-3 flex items-center justify-center font-bold text-sm shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)] active:scale-95 group cursor-pointer"
                title="Sign in through Steam"
              >
                <img src="https://community.akamai.steamstatic.com/public/images/signinthroughsteam/sits_01.png" alt="Steam" className="h-6 opacity-80 group-hover:opacity-100 transition-opacity" />
              </button>
              <button 
                onClick={loginWithDiscord}
                className="bg-[#5865F2] hover:bg-[#4752C4] text-white border border-[#5865F2]/20 hover:border-white/10 transition-all rounded-xl px-4 py-3 flex items-center justify-center font-bold text-sm shadow-[0_0_20px_-5px_rgba(88,101,242,0.4)] active:scale-95 cursor-pointer h-12"
              >
                Log in with Discord
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
      case 'games':
        return <Games onViewProfile={handleViewProfile} />;
      case 'leaderboard':
        return <Leaderboard onViewProfile={handleViewProfile} />;
      case 'events':
        return <EventsPanel />;
      case 'screenshots':
        return <ScreenshotContest onViewProfile={handleViewProfile} />;
      case 'admin-users':
      case 'admin-submissions':
      case 'admin-team_points':
        return <AdminPanel onViewProfile={handleViewProfile} activeAdminTab={
          activeTab === 'admin-submissions' ? 'submissions' :
          activeTab === 'admin-team_points' ? 'team_points' :
          'users'
        } />;
      default:
        return <MySubmissions />;
    }
  };

  return (
    <div className="flex min-h-screen transition-colors duration-300">
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
          activeTab={activeTab}
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
              <Suspense fallback={<TabLoadingFallback />}>
                {renderContent()}
              </Suspense>
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

