export type Team = 'blue' | 'green' | 'purple' | 'red' | 'none';

export interface UserProfile {
  uid: string;
  id?: string;
  steamId: string;
  steamid?: string;
  steamName: string;
  steam_name?: string;
  displayName?: string;
  steamAvatar: string;
  steam_avatar?: string;
  active_avatar?: string;
  discordId?: string;
  discord_id?: string;
  discordName?: string;
  discord_name?: string;
  discordAvatar?: string;
  discord_avatar?: string;
  team: Team;
  isAdmin: boolean;
  is_admin?: boolean;
  role?: string;
  status: string;
  points: number;
  createdAt?: string;
  created_at?: string;
  eventTeams?: Record<string, string>;
  needs_registration?: boolean;
}

export type SubmissionStatus = 'pending' | 'verified' | 'rejected';
export type CompletionStatus = 'unfinished' | 'beaten' | 'completed' | 'abandoned';

export interface Submission {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  gameId: string;
  gameTitle: string;
  gameImage: string;
  achievementsBefore: number;
  hoursBefore: number;
  achievementsDuring: number;
  hoursDuring: number;
  multiplier: number;
  points: number;
  status: SubmissionStatus;
  completionStatus?: CompletionStatus;
  beaten_previous?: 'yes' | 'no';
  notes: string;
  eventId: string;
  createdAt: number;
  verifierId?: string;
  rejectionReason?: string;
}

export interface CompetitionEvent {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  isActive?: boolean;
  hide_scores?: boolean;
  winner_team?: string;
  winnerTeam?: string;
  event_number?: number;
  snapshot?: any;
}

export interface ThemeHelper {
  accent: string;
  text: string;
  bg: string;
  border: string;
  ring: string;
  shadow: string;
  glow: string;
  secondary: string;
  muted: string;
  border_focus?: string;
  text_accent?: string;
}

export const TEAM_COLORS: Record<Team, { primary: string; secondary: string; border: string; glow: string }> = {
  blue: { 
    primary: 'text-sky-400', 
    secondary: 'bg-sky-500/10', 
    border: 'border-sky-500/40',
    glow: 'shadow-[0_0_15px_-3px_rgba(0,0,0,0.1)] shadow-sky-500/30 border-sky-500/40' 
  },
  green: { 
    primary: 'text-green-400', 
    secondary: 'bg-green-500/10', 
    border: 'border-green-500/40',
    glow: 'shadow-[0_0_15px_-3px_rgba(0,0,0,0.1)] shadow-green-500/30 border-green-500/40' 
  },
  purple: { 
    primary: 'text-purple-400', 
    secondary: 'bg-purple-500/10', 
    border: 'border-purple-500/40',
    glow: 'shadow-[0_0_15px_-3px_rgba(0,0,0,0.1)] shadow-purple-500/30 border-purple-500/40' 
  },
  red: { 
    primary: 'text-red-400', 
    secondary: 'bg-red-500/10', 
    border: 'border-red-500/40',
    glow: 'shadow-[0_0_15px_-3px_rgba(0,0,0,0.1)] shadow-red-500/30 border-red-500/40' 
  },
  none: { 
    primary: 'text-white', 
    secondary: 'bg-white/10', 
    border: 'border-white/20',
    glow: 'shadow-none border-white/10' 
  }
};
