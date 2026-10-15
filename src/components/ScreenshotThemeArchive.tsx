import React, { useState, useMemo } from 'react';
import { 
  Trophy, Medal, Award, Calendar, Sparkles, Star, 
  User, Camera, ExternalLink, ChevronRight, ChevronDown, 
  Check, Edit3, Image as ImageIcon, Archive, Clock, Eye, AlertCircle, Layers
} from 'lucide-react';
import SteamgiftsMarkdown from './SteamgiftsMarkdown';
import SteamgiftsMarkdownEditor from './SteamgiftsMarkdownEditor';
import { cn } from '@/lib/utils';
import { Team } from '@/types';

export interface ArchivedSubmission {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  user_team: Team;
  game_name: string;
  image_url: string;
  caption?: string;
  votes_count: number;
  rank: number; // 1 to 5
  points_awarded: number; // 50, 40, 30, 20, 10
}

export interface ArchivedCycle {
  id: string;
  title: string;
  cycleNumber: number;
  concludedDate: string;
  description: string;
  totalSubmissions: number;
  totalVotes: number;
  winners: ArchivedSubmission[];
}

// Built-in historical cycles representing previous contest themes
const HISTORICAL_CYCLES: ArchivedCycle[] = [
  {
    id: 'd64e3a06-eddc-43b2-95a9-87c9bf1cfd56', // Event #5 in DB
    title: 'Event #5: Cyberpunk Horizons & Retro Synthwave',
    cycleNumber: 5,
    concludedDate: 'September 2026',
    description: `## 🌆 Theme: Cyberpunk Horizons & Retro Synthwave
Capture the dazzling neon glow, towering monolithic architecture, and melancholic shadows of high-tech, low-life worlds.

### 📋 Contest Rules & Criteria:
* HUD elements turned off for cinematic composition.
* Screenshots must feature strong neon hues, rain-slicked city streets, or futuristic megastructures.
* [spoiler]Special consideration for atmospheric reflections and ray-traced shadows![/spoiler]

> *"The sky above the port was the color of television, tuned to a dead channel."*`,
    totalSubmissions: 38,
    totalVotes: 142,
    winners: [
      {
        id: 'hist-e5-1',
        user_id: '76561198012345678',
        user_name: 'Vespera',
        user_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        user_team: 'purple',
        game_name: 'Cyberpunk 2077',
        image_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&auto=format&fit=crop&q=80',
        caption: 'Night City rain reflection from Watson overpass.',
        votes_count: 36,
        rank: 1,
        points_awarded: 50
      },
      {
        id: 'hist-e5-2',
        user_id: '76561198023456789',
        user_name: 'Kaelen',
        user_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        user_team: 'blue',
        game_name: 'Ghostrunner 2',
        image_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80',
        caption: 'Neon blade dash across Dharma Tower skybridge.',
        votes_count: 31,
        rank: 2,
        points_awarded: 40
      },
      {
        id: 'hist-e5-3',
        user_id: '76561198034567890',
        user_name: 'Soren_V',
        user_avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
        user_team: 'green',
        game_name: 'The Ascent',
        image_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80',
        caption: 'Lower district neon alley bazaar after dusk.',
        votes_count: 27,
        rank: 3,
        points_awarded: 30
      },
      {
        id: 'hist-e5-4',
        user_id: '76561198045678901',
        user_name: 'Aeliana',
        user_avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        user_team: 'red',
        game_name: 'Stray',
        image_url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200&auto=format&fit=crop&q=80',
        caption: 'Dappled neon lights filtering through decaying slums.',
        votes_count: 25,
        rank: 4,
        points_awarded: 20
      },
      {
        id: 'hist-e5-5',
        user_id: '76561198056789012',
        user_name: 'Darius_R',
        user_avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
        user_team: 'purple',
        game_name: 'Cloudpunk',
        image_url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=1200&auto=format&fit=crop&q=80',
        caption: 'Hover-car descent through Nivalis smog.',
        votes_count: 23,
        rank: 5,
        points_awarded: 10
      }
    ]
  },
  {
    id: '3b4a1982-a13b-4448-8c94-4b1899a0606d', // Event #4 in DB
    title: 'Event #4: Solitude in the Wild & Atmospheric Vistas',
    cycleNumber: 4,
    concludedDate: 'July 2026',
    description: `## 🌲 Theme: Solitude in the Wild & Atmospheric Vistas
Vast untamed wilderness, mist-draped valleys, lonely alpine peaks, and quiet moments of reflection away from civilization.

### 📋 Guidelines:
* Landscape framing with natural light (golden hour, moonlight, or thick morning fog).
* Minimum UI distractions; let the environment tell the emotional story.
* Both high-fidelity simulations and stylized indie titles eligible.

> *"In every walk with nature one receives far more than he seeks."*`,
    totalSubmissions: 34,
    totalVotes: 128,
    winners: [
      {
        id: 'hist-e4-1',
        user_id: '76561198067890123',
        user_name: 'Njord_Wanderer',
        user_avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
        user_team: 'green',
        game_name: 'Red Dead Redemption 2',
        image_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&auto=format&fit=crop&q=80',
        caption: 'Morning mist settling over the Grizzlies East ridges.',
        votes_count: 34,
        rank: 1,
        points_awarded: 50
      },
      {
        id: 'hist-e4-2',
        user_id: '76561198078901234',
        user_name: 'Lyra_Sky',
        user_avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
        user_team: 'blue',
        game_name: 'The Witcher 3: Wild Hunt',
        image_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&auto=format&fit=crop&q=80',
        caption: 'Sunset breeze along the windswept cliffs of Ard Skellig.',
        votes_count: 29,
        rank: 2,
        points_awarded: 40
      },
      {
        id: 'hist-e4-3',
        user_id: '76561198089012345',
        user_name: 'Fenris_B',
        user_avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
        user_team: 'red',
        game_name: 'Ghost of Tsushima',
        image_url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1200&auto=format&fit=crop&q=80',
        caption: 'Golden forest canopy adrift in Autumn leaves.',
        votes_count: 26,
        rank: 3,
        points_awarded: 30
      },
      {
        id: 'hist-e4-4',
        user_id: '76561198090123456',
        user_name: 'Miriel',
        user_avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
        user_team: 'purple',
        game_name: 'Death Stranding',
        image_url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&auto=format&fit=crop&q=80',
        caption: 'Solitary trek across volcanic moss plains towards the mountain.',
        votes_count: 21,
        rank: 4,
        points_awarded: 20
      },
      {
        id: 'hist-e4-5',
        user_id: '76561198001234567',
        user_name: 'Corvo_Attano',
        user_avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
        user_team: 'blue',
        game_name: 'Skyrim Special Edition',
        image_url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&auto=format&fit=crop&q=80',
        caption: 'Aurora borealis dancing above Bleak Falls Barrow.',
        votes_count: 18,
        rank: 5,
        points_awarded: 10
      }
    ]
  },
  {
    id: 'b75f091c-c529-43a7-9777-e3ac350e6c2a', // Event #3 in DB
    title: 'Event #3: Grand Architecture & Ancient Ruins',
    cycleNumber: 3,
    concludedDate: 'May 2026',
    description: `## 🏛️ Theme: Grand Architecture & Ancient Ruins
Crumbling cathedrals, colossal forgotten temples, and timeless monuments carved from mountain stone.

### 📋 Guidelines:
* Emphasize scale, perspective, symmetry, and architectural majesty.
* Submissions should showcase monumental structures that dwarf the player.
* [spoiler]Extra appreciation for interior god-rays and gothic vaulting![/spoiler]`,
    totalSubmissions: 31,
    totalVotes: 115,
    winners: [
      {
        id: 'hist-e3-1',
        user_id: '76561198011223344',
        user_name: 'Gwynevere',
        user_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        user_team: 'purple',
        game_name: 'Elden Ring',
        image_url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1200&auto=format&fit=crop&q=80',
        caption: 'Leyndell Royal Capital gleaming under the Erdtree.',
        votes_count: 32,
        rank: 1,
        points_awarded: 50
      },
      {
        id: 'hist-e3-2',
        user_id: '76561198022334455',
        user_name: 'Ragnar_L',
        user_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        user_team: 'red',
        game_name: 'Dark Souls III',
        image_url: 'https://images.unsplash.com/photo-1548625361-19597282b0be?w=1200&auto=format&fit=crop&q=80',
        caption: 'Boreal Valley moonlit cathedral gates of Irithyll.',
        votes_count: 28,
        rank: 2,
        points_awarded: 40
      },
      {
        id: 'hist-e3-3',
        user_id: '76561198033445566',
        user_name: 'Zephyr',
        user_avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
        user_team: 'green',
        game_name: 'Shadow of the Colossus',
        image_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80',
        caption: 'Shrine of Worship towering over the barren peninsula.',
        votes_count: 23,
        rank: 3,
        points_awarded: 30
      },
      {
        id: 'hist-e3-4',
        user_id: '76561198044556677',
        user_name: 'Celes_Chere',
        user_avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        user_team: 'blue',
        game_name: 'Horizon Forbidden West',
        image_url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=1200&auto=format&fit=crop&q=80',
        caption: 'Sunken skyscraper overgrown with bioluminescent coral.',
        votes_count: 18,
        rank: 4,
        points_awarded: 20
      },
      {
        id: 'hist-e3-5',
        user_id: '76561198055667788',
        user_name: 'Dovah_99',
        user_avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
        user_team: 'red',
        game_name: 'Assassin\'s Creed Odyssey',
        image_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80',
        caption: 'Parthenon marble columns at sunrise over Athens.',
        votes_count: 14,
        rank: 5,
        points_awarded: 10
      }
    ]
  }
];

interface ScreenshotThemeArchiveProps {
  currentTeamStyle: any;
  userTeam: Team;
  isAdmin: boolean;
  onOpenLightbox: (submissionId: string) => void;
  onViewProfile?: (userId: string) => void;
  allScreenshotEvents?: any[];
  allSubmissions?: any[];
  allVotes?: any[];
  competitionEvents?: any[];
  activeCompetitionEvent?: any;
}

export default function ScreenshotThemeArchive({
  currentTeamStyle,
  userTeam,
  isAdmin,
  onOpenLightbox,
  onViewProfile,
  allScreenshotEvents = [],
  allSubmissions = [],
  allVotes = [],
  competitionEvents = [],
  activeCompetitionEvent
}: ScreenshotThemeArchiveProps) {
  // Local state for dynamically edited descriptions per cycle ID
  const [editedDescriptions, setEditedDescriptions] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('theme_archive_custom_descriptions');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [editingCycleId, setEditingCycleId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Combine historical cycles with any concluded cycles from the database
  const combinedCycles = useMemo(() => {
    const list: ArchivedCycle[] = [];

    // Find any concluded events in allScreenshotEvents
    const concludedDbEvents = (allScreenshotEvents || []).filter(
      se => se.status === 'concluded' || (activeCompetitionEvent && se.id !== activeCompetitionEvent.id && se.status !== 'draft')
    );

    // Map DB concluded events to cycle entries if they have submissions/votes
    for (const dbEvt of concludedDbEvents) {
      // Avoid duplicate if already in HISTORICAL_CYCLES by id
      const matchedHistory = HISTORICAL_CYCLES.find(h => h.id === dbEvt.id);
      
      const evtSubs = allSubmissions.filter(s => s.event_id === dbEvt.id && s.status !== 'rejected');
      const evtVotes = allVotes.filter(v => v.event_id === dbEvt.id);

      const voteCountMap: Record<string, number> = {};
      evtVotes.forEach(v => {
        voteCountMap[v.submission_id] = (voteCountMap[v.submission_id] || 0) + 1;
      });

      const ranked = evtSubs
        .filter(s => s.is_selected)
        .map(s => ({
          ...s,
          votes_count: voteCountMap[s.id] || s.votes_count || 0
        }))
        .sort((a, b) => b.votes_count - a.votes_count);

      const scale = [50, 40, 30, 20, 10];
      const winners: ArchivedSubmission[] = ranked.slice(0, 5).map((s, idx) => ({
        id: s.id,
        user_id: s.user_id,
        user_name: s.user_name || 'Participant',
        user_avatar: s.user_avatar,
        user_team: (s.user_team || 'none') as Team,
        game_name: s.game_name || 'Screenshot Entry',
        image_url: s.image_url,
        caption: s.caption,
        votes_count: s.votes_count,
        rank: idx + 1,
        points_awarded: scale[idx] || 0
      }));

      const desc = editedDescriptions[dbEvt.id] || 
        (dbEvt.description ? dbEvt.description.replace(/<!--SUBMISSION_POINTS:\d+-->/g, '').trim() : '') ||
        matchedHistory?.description || 
        'Themes and guidelines for this cycle.';

      if (winners.length > 0 || !matchedHistory) {
        list.push({
          id: dbEvt.id,
          title: dbEvt.title || matchedHistory?.title || 'Concluded Screenshot Contest',
          cycleNumber: matchedHistory?.cycleNumber || 6,
          concludedDate: matchedHistory?.concludedDate || 'Recently Concluded',
          description: desc,
          totalSubmissions: evtSubs.length || matchedHistory?.totalSubmissions || 0,
          totalVotes: evtVotes.length || matchedHistory?.totalVotes || 0,
          winners: winners.length > 0 ? winners : (matchedHistory?.winners || [])
        });
      }
    }

    // Add historical cycles that aren't already represented
    for (const hc of HISTORICAL_CYCLES) {
      if (!list.some(l => l.id === hc.id)) {
        list.push({
          ...hc,
          description: editedDescriptions[hc.id] || hc.description
        });
      }
    }

    // Sort by cycleNumber descending
    return list.sort((a, b) => b.cycleNumber - a.cycleNumber);
  }, [allScreenshotEvents, allSubmissions, allVotes, activeCompetitionEvent, editedDescriptions]);

  // Selected cycle filter (null = all cycles)
  const [selectedCycleId, setSelectedCycleId] = useState<string>(() => {
    return combinedCycles[0]?.id || 'all';
  });

  const displayedCycles = useMemo(() => {
    if (!selectedCycleId || selectedCycleId === 'all') {
      return combinedCycles;
    }
    return combinedCycles.filter(c => c.id === selectedCycleId);
  }, [combinedCycles, selectedCycleId]);

  const handleStartEditing = (cycle: ArchivedCycle) => {
    setEditingCycleId(cycle.id);
    setEditText(cycle.description);
    setSaveSuccessNotice(null);
  };

  const handleSaveDescription = async (cycleId: string) => {
    setIsSaving(true);
    setSaveSuccessNotice(null);
    try {
      // 1. Save to local storage for instant responsiveness
      const updated = { ...editedDescriptions, [cycleId]: editText };
      setEditedDescriptions(updated);
      localStorage.setItem('theme_archive_custom_descriptions', JSON.stringify(updated));

      // 2. Persist to Supabase if it's a real event in screenshot_events
      try {
        await fetch('/api/screenshots?action=admin-update-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId: cycleId,
            description: editText
          })
        });
      } catch (apiErr) {
        console.warn('Backend update failed, using local storage fallback:', apiErr);
      }

      setSaveSuccessNotice('Archived theme description successfully saved!');
      setTimeout(() => setSaveSuccessNotice(null), 4000);
      setEditingCycleId(null);
    } catch (err: any) {
      console.error('Failed to save archive description:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const rankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span className="flex items-center gap-1 text-[11px] font-black text-amber-300 bg-amber-400/20 border border-amber-400/40 px-2.5 py-0.5 rounded-lg shadow-sm">
          <Trophy size={13} className="fill-amber-400 text-amber-400" />
          1st Place (+50 pts)
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="flex items-center gap-1 text-[11px] font-black text-slate-200 bg-slate-400/20 border border-slate-400/40 px-2.5 py-0.5 rounded-lg shadow-sm">
          <Medal size={13} className="text-slate-300" />
          2nd Place (+40 pts)
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="flex items-center gap-1 text-[11px] font-black text-amber-600 bg-amber-700/20 border border-amber-600/40 px-2.5 py-0.5 rounded-lg shadow-sm">
          <Medal size={13} className="text-amber-500" />
          3rd Place (+30 pts)
        </span>
      );
    }
    if (rank === 4) {
      return (
        <span className="flex items-center gap-1 text-[11px] font-bold text-slate-300 bg-white/10 border border-white/20 px-2.5 py-0.5 rounded-lg">
          <Award size={13} className="text-slate-400" />
          4th Place (+20 pts)
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[11px] font-bold text-slate-300 bg-white/10 border border-white/20 px-2.5 py-0.5 rounded-lg">
        <Award size={13} className="text-slate-400" />
        5th Place (+10 pts)
      </span>
    );
  };

  const teamBadgeColor = (team: Team) => {
    switch (team) {
      case 'purple':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'blue':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      case 'green':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'red':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Archive Header Banner */}
      <div className={cn(
        "relative overflow-hidden rounded-3xl border p-6 md:p-8 shadow-xl bg-gradient-to-br",
        currentTeamStyle.cardBg,
        currentTeamStyle.cardBorder
      )}>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
              <span className={cn("px-2.5 py-0.5 rounded-md border text-[10px] uppercase font-black tracking-wider flex items-center gap-1.5", currentTeamStyle.badgeBg, currentTeamStyle.badgeText, currentTeamStyle.badgeBorder)}>
                <Archive size={12} />
                Screenshot Hall of Fame
              </span>
              <span>·</span>
              <span>Finished Themes</span>
              <span>·</span>
              <span>Top 5 Voted Winners</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              Theme Archive & Hall of Fame
            </h2>
            <p className="text-sm text-slate-300/80 leading-relaxed">
              Explore previously concluded contest cycles, guidelines, and celebrate the community's top 5 voted screenshots awarded official team competition points.
            </p>
          </div>

          {/* Cycle Quick Switcher Segmented Control */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/10 shrink-0">
            <button
              onClick={() => setSelectedCycleId('all')}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                selectedCycleId === 'all'
                  ? currentTeamStyle.btnPrimary
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              All Concluded Cycles ({combinedCycles.length})
            </button>
            <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-1 sm:pb-0">
              {combinedCycles.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCycleId(c.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border",
                    selectedCycleId === c.id
                      ? cn(currentTeamStyle.badgeBg, currentTeamStyle.badgeText, currentTeamStyle.badgeBorder, "shadow-sm")
                      : "border-transparent text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  Cycle #{c.cycleNumber}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Save Notification */}
      {saveSuccessNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 shadow-sm animate-in fade-in">
          <Check size={16} className="text-emerald-400 shrink-0" />
          <span>{saveSuccessNotice}</span>
        </div>
      )}

      {/* Archived Cycles List */}
      <div className="space-y-12">
        {displayedCycles.map(cycle => {
          const isEditingThisCycle = editingCycleId === cycle.id;

          return (
            <div
              key={cycle.id}
              className="rounded-3xl bg-black/40 dark:bg-[#121214] border border-white/10 p-6 md:p-8 space-y-6 shadow-xl"
            >
              {/* Cycle Top Title Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
                    <span className="font-bold text-white uppercase text-[10px] tracking-wider px-2 py-0.5 rounded bg-white/10 border border-white/10">
                      Cycle #{cycle.cycleNumber} Concluded
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Calendar size={13} className="text-slate-400" />
                      {cycle.concludedDate}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <ImageIcon size={13} className="text-slate-400" />
                      {cycle.totalSubmissions} submissions
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Star size={13} className="text-slate-400" />
                      {cycle.totalVotes} total votes cast
                    </span>
                  </div>
                  <h3 className="text-xl md:text-2xl font-black text-white tracking-tight pt-1">
                    {cycle.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && !isEditingThisCycle && (
                    <button
                      onClick={() => handleStartEditing(cycle)}
                      className={cn(
                        "flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-sm active:scale-95",
                        currentTeamStyle.btnSubtle
                      )}
                    >
                      <Edit3 size={13} />
                      Edit Theme (Markdown)
                    </button>
                  )}
                </div>
              </div>

              {/* Theme Description & Criteria Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Sparkles size={13} className={currentTeamStyle.iconText} />
                    Theme Guidelines & Submission Criteria
                  </span>
                </div>

                {isEditingThisCycle ? (
                  <div className="bg-black/50 border border-white/10 rounded-2xl p-4 md:p-5">
                    <SteamgiftsMarkdownEditor
                      value={editText}
                      onChange={setEditText}
                      placeholder="Add or update markdown guidelines for this cycle..."
                      teamStyle={currentTeamStyle}
                      isSaving={isSaving}
                      onSave={() => handleSaveDescription(cycle.id)}
                      onCancel={() => setEditingCycleId(null)}
                      saveButtonText="Save Theme Markdown"
                      title={`Editing Cycle #${cycle.cycleNumber} Guidelines`}
                    />
                  </div>
                ) : (
                  <div className={cn(
                    "rounded-2xl p-5 md:p-6 border bg-gradient-to-br shadow-inner",
                    currentTeamStyle.cardBg,
                    currentTeamStyle.cardBorder
                  )}>
                    <SteamgiftsMarkdown
                      content={cycle.description}
                      teamAccent={currentTeamStyle.iconText}
                      teamStyle={currentTeamStyle}
                    />
                  </div>
                )}
              </div>

              {/* Top 5 Winning Submissions Section */}
              <div className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                  <div className="flex items-center gap-2">
                    <Trophy size={18} className="text-amber-400" />
                    <h4 className="text-base md:text-lg font-black text-white tracking-tight">
                      Winning Submissions (Top 5 with the Most Votes)
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400">
                    Awarded official team rewards: +50, +40, +30, +20, +10 points
                  </span>
                </div>

                {cycle.winners && cycle.winners.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    {cycle.winners.map(winner => (
                      <div
                        key={winner.id}
                        onClick={() => onOpenLightbox(winner.id)}
                        className="group relative flex flex-col bg-black/60 dark:bg-white/[0.03] border border-white/10 hover:border-white/30 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer"
                      >
                        {/* Image Container with hover zoom */}
                        <div className="relative aspect-video w-full overflow-hidden bg-black/80">
                          <img
                            src={winner.image_url}
                            alt={`${winner.game_name} winning submission`}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-80 group-hover:opacity-60 transition-opacity" />

                          {/* Rank Badge at top left */}
                          <div className="absolute top-2.5 left-2.5">
                            {rankBadge(winner.rank)}
                          </div>

                          {/* Vote Count Badge at top right */}
                          <div className="absolute top-2.5 right-2.5">
                            <span className="flex items-center gap-1 bg-black/70 backdrop-blur-md border border-white/20 text-white font-black text-[10px] px-2 py-0.5 rounded-lg shadow-md">
                              <Star size={11} className="fill-amber-400 text-amber-400" />
                              {winner.votes_count} votes
                            </span>
                          </div>

                          {/* Hover Lightbox Indicator */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <span className="bg-black/80 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-white/20 flex items-center gap-1.5 shadow-xl">
                              <Eye size={13} /> View Fullscreen
                            </span>
                          </div>
                        </div>

                        {/* Card Details */}
                        <div className="p-3.5 flex flex-col justify-between flex-1 space-y-2.5">
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors line-clamp-1">
                              {winner.game_name}
                            </p>
                            {winner.caption && (
                              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed italic">
                                "{winner.caption}"
                              </p>
                            )}
                          </div>

                          {/* User info & Team badge */}
                          <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                            <div 
                              onClick={(e) => {
                                if (onViewProfile && winner.user_id) {
                                  e.stopPropagation();
                                  onViewProfile(winner.user_id);
                                }
                              }}
                              className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity"
                            >
                              {winner.user_avatar ? (
                                <img
                                  src={winner.user_avatar}
                                  alt={winner.user_name}
                                  className="w-5 h-5 rounded-full object-cover shrink-0 border border-white/20"
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                                  <User size={10} className="text-white/70" />
                                </div>
                              )}
                              <span className="text-xs font-medium text-slate-300 truncate">
                                {winner.user_name}
                              </span>
                            </div>

                            <span className={cn(
                              "text-[9px] font-black uppercase px-2 py-0.5 rounded-md border shrink-0",
                              teamBadgeColor(winner.user_team)
                            )}>
                              Team {winner.user_team}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-black/20 rounded-2xl border border-dashed border-white/10 text-slate-400 text-xs">
                    <Trophy size={24} className="mx-auto mb-2 opacity-40" />
                    <p>No winning submissions recorded for this cycle yet.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
