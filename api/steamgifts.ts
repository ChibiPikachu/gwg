import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// User-Agent and Anti-Ban Delay Settings
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 GWG-Tracker/1.0';
const DEFAULT_DELAY_MS = 1350;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Normalize game title for fuzzy/clean comparison
function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[:\-–—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract app_id or sub_id from URL
function extractSteamIds(href: string): { appId: number | null; subId: number | null } {
  if (!href) return { appId: null, subId: null };
  const appMatch = href.match(/store\.steampowered\.com\/app\/(\d+)/i) || 
                   href.match(/steamstatic\.com\/.*\/apps\/(\d+)/i);
  if (appMatch) {
    return { appId: parseInt(appMatch[1], 10), subId: null };
  }
  const subMatch = href.match(/store\.steampowered\.com\/sub\/(\d+)/i) || 
                   href.match(/steamstatic\.com\/.*\/subs\/(\d+)/i);
  if (subMatch) {
    return { appId: null, subId: parseInt(subMatch[1], 10) };
  }
  return { appId: null, subId: null };
}

// Helper to get group identifiers
function getGroupTarget(): { groupCode: string; groupSlug: string } {
  const fullGroupUrl = process.env.SG_GROUP_URL || '';
  if (fullGroupUrl) {
    const match = fullGroupUrl.match(/\/group\/([a-zA-Z0-9]+)(?:\/([a-zA-Z0-9\-_]+))?/);
    if (match) {
      return { groupCode: match[1], groupSlug: match[2] || 'group' };
    }
  }
  return {
    groupCode: process.env.SG_GROUP_CODE || 'girls-who-game',
    groupSlug: process.env.SG_GROUP_SLUG || 'girls-who-game'
  };
}

// Check SteamGifts PHPSESSID validity
export async function checkSteamgiftsSession(): Promise<{ valid: boolean; message: string; username?: string }> {
  const phpsessid = process.env.SG_PHPSESSID?.trim();
  if (!phpsessid) {
    return {
      valid: false,
      message: 'SG_PHPSESSID is not configured in environment variables. Group-only giveaways require an active SteamGifts member session.'
    };
  }

  try {
    const res = await fetch('https://www.steamgifts.com/', {
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': `PHPSESSID=${phpsessid}`,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!res.ok) {
      return {
        valid: false,
        message: `SteamGifts returned HTTP ${res.status} when checking session.`
      };
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // .nav__avatar-outer-wrap indicates logged in status
    const avatarWrap = $('.nav__avatar-outer-wrap');
    if (!avatarWrap || avatarWrap.length === 0) {
      return {
        valid: false,
        message: 'SG_PHPSESSID has expired or is invalid (no logged-in avatar detected). Please update SG_PHPSESSID.'
      };
    }

    const userProfileHref = avatarWrap.attr('href') || $('.nav__avatar-inner-wrap').attr('href') || '';
    const username = userProfileHref.replace(/^\/user\//, '').trim();

    return {
      valid: true,
      message: `SteamGifts session active as ${username || 'logged in member'}.`,
      username
    };
  } catch (err: any) {
    return {
      valid: false,
      message: `Failed to connect to SteamGifts: ${err.message}`
    };
  }
}

// Scrape additional winners if giveaway has >3 copies
async function fetchGiveawayWinners(code: string, slug?: string | null): Promise<Array<{ sg_username: string; status: string }>> {
  const phpsessid = process.env.SG_PHPSESSID?.trim();
  const url = `https://www.steamgifts.com/giveaway/${code}/${slug || 'giveaway'}/winners`;
  const winners: Array<{ sg_username: string; status: string }> = [];

  try {
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };
    if (phpsessid) {
      headers['Cookie'] = `PHPSESSID=${phpsessid}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) return winners;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Look for winner rows in table: .table__row-inner-wrap
    $('.table__row-inner-wrap').each((_, el) => {
      const userEl = $(el).find('a.table__column__heading');
      const username = userEl.text().trim();
      if (!username) return;

      // Status column
      const statusText = $(el).find('.table__column--width-small').text().trim();
      let status = 'Unknown';
      if (/Received/i.test(statusText)) status = 'Received';
      else if (/Awaiting/i.test(statusText)) status = 'Awaiting Feedback';
      else if (/Not Received/i.test(statusText)) status = 'Not Received';

      winners.push({ sg_username: username, status });
    });
  } catch (err) {
    console.warn(`[SteamGifts] Failed to fetch winners for ${code}:`, err);
  }

  return winners;
}

// Auto-backfill public.games.steam_appid when app_id is scraped
async function backfillGameAppId(gameName: string, appId: number | null): Promise<boolean> {
  if (!supabase || !appId || !gameName) return false;
  try {
    const normalized = normalizeTitle(gameName);
    if (!normalized) return false;

    // Look for existing game without steam_appid
    const { data: games } = await supabase
      .from('games')
      .select('id, title, steam_appid')
      .is('steam_appid', null);

    if (!games || games.length === 0) return false;

    let backfilled = false;
    for (const g of games) {
      if (normalizeTitle(g.title) === normalized) {
        await supabase
          .from('games')
          .update({ steam_appid: appId, updated_at: new Date().toISOString() })
          .eq('id', g.id);
        console.log(`[SteamGifts Backfill] Set steam_appid=${appId} for game "${g.title}" (id: ${g.id})`);
        backfilled = true;
      }
    }
    return backfilled;
  } catch (err) {
    console.warn('[SteamGifts Backfill] Error:', err);
    return false;
  }
}

// -----------------------------------------------------------------------------
// App Members & Mappings Lookup (Filter Out Non-Members)
// -----------------------------------------------------------------------------
export interface AppMemberMatch {
  steamid: string;
  profile_id: string | null;
  steam_name?: string | null;
}

export async function getAppMembersLookup(): Promise<{
  memberSteamIdSet: Set<string>;
  sgToMemberMap: Map<string, AppMemberMatch>;
  profNameMap: Map<string, string>;
}> {
  const memberSteamIdSet = new Set<string>();
  const sgToMemberMap = new Map<string, AppMemberMatch>();
  const profNameMap = new Map<string, string>();

  if (!supabase) return { memberSteamIdSet, sgToMemberMap, profNameMap };

  // 1. Fetch all profiles from public.profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, steamid, steam_name, discord_name');

  (profiles || []).forEach((p: any) => {
    if (p.steamid) {
      const sid = String(p.steamid).trim();
      memberSteamIdSet.add(sid);
      profNameMap.set(sid, p.steam_name || 'Member');

      if (p.steam_name) {
        sgToMemberMap.set(p.steam_name.toLowerCase().trim(), {
          steamid: sid,
          profile_id: p.id,
          steam_name: p.steam_name
        });
      }
      if (p.discord_name) {
        sgToMemberMap.set(p.discord_name.toLowerCase().trim(), {
          steamid: sid,
          profile_id: p.id,
          steam_name: p.steam_name
        });
      }
    }
  });

  // 2. Fetch all mappings from public.sg_user_mappings
  const { data: mappings } = await supabase
    .from('sg_user_mappings')
    .select('steamid, profile_id, sg_username');

  (mappings || []).forEach((m: any) => {
    if (m.steamid && memberSteamIdSet.has(String(m.steamid).trim()) && m.sg_username) {
      const sid = String(m.steamid).trim();
      sgToMemberMap.set(m.sg_username.toLowerCase().trim(), {
        steamid: sid,
        profile_id: m.profile_id || null,
        steam_name: profNameMap.get(sid) || null
      });
    }
  });

  return { memberSteamIdSet, sgToMemberMap, profNameMap };
}

// -----------------------------------------------------------------------------
// Cheerio HTML Parser for Raw SteamGifts HTML (.giveaway__row / .giveaway__row-outer-wrap)
// -----------------------------------------------------------------------------
export interface ParsedExtractedGiveaway {
  code: string;
  slug: string | null;
  name: string;
  app_id: number | null;
  sub_id: number | null;
  copies: number;
  points: number;
  creator_username: string | null;
  start_timestamp: number | null;
  end_timestamp: number | null;
  is_completed: boolean;
  winners: Array<{ sg_username: string; status: string }>;
}

export function parseSteamGiftsHtml(html: string): ParsedExtractedGiveaway[] {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const giveaways: ParsedExtractedGiveaway[] = [];

  // Match both .giveaway__row-outer-wrap and .giveaway__row (SteamGifts markup variations)
  let giveawayElements = $('.giveaway__row-outer-wrap');
  if (giveawayElements.length === 0) {
    giveawayElements = $('.giveaway__row');
  }

  giveawayElements.each((_, el) => {
    const headingEl = $(el).find('a.giveaway__heading__name');
    const href = headingEl.attr('href') || $(el).find('a[href*="/giveaway/"]').attr('href') || '';
    const match = href.match(/\/giveaway\/([a-zA-Z0-9]+)(?:\/([a-zA-Z0-9\-_]+))?/);
    if (!match) return;

    const code = match[1];
    const slug = match[2] || null;
    const name = headingEl.text().trim() || $(el).find('.giveaway__heading__name').text().trim();
    if (!name) return;

    // Extract copies and points: e.g. "(5 Copies)" "(50P)"
    let copies = 1;
    let points = 0;
    $(el).find('.giveaway__heading__thin').each((_, span) => {
      const text = $(span).text().trim();
      const copyMatch = text.match(/\((\d+)\s+Cop(?:y|ies)\)/i);
      if (copyMatch) copies = parseInt(copyMatch[1], 10);
      const ptMatch = text.match(/\((\d+)P\)/i);
      if (ptMatch) points = parseInt(ptMatch[1], 10);
    });

    // Extract steam app_id or sub_id from thumbnail background-image, steam store icon link, or raw img
    const thumbStyle = $(el).find('.giveaway_image_thumbnail').attr('style') || 
                       $(el).find('.giveaway__hide').attr('style') || 
                       $(el).find('.global__image-outer-wrap--game-medium').attr('style') || '';
    const storeLink = $(el).find('a[href*="store.steampowered.com"]').attr('href') || 
                      $(el).find('a[href*="steamcommunity.com/app/"]').attr('href') || '';
    const imgThumb = $(el).find('img[src*="steamstatic.com"]').attr('src') || '';
    const { appId, subId } = extractSteamIds(`${storeLink} ${thumbStyle} ${imgThumb}`);

    // Extract creator username
    const creator = $(el).find('.giveaway__username').text().trim() || null;

    // Timestamps
    let endTimestamp: number | null = null;
    let startTimestamp: number | null = null;
    const timeSpans = $(el).find('span[data-timestamp]');
    if (timeSpans.length >= 2) {
      startTimestamp = parseInt($(timeSpans[0]).attr('data-timestamp') || '0', 10) || null;
      endTimestamp = parseInt($(timeSpans[1]).attr('data-timestamp') || '0', 10) || null;
    } else if (timeSpans.length === 1) {
      endTimestamp = parseInt($(timeSpans[0]).attr('data-timestamp') || '0', 10) || null;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const isCompleted = endTimestamp ? endTimestamp <= nowSec : false;

    // Extract inline winners
    const winners: Array<{ sg_username: string; status: string }> = [];
    $(el).find('.giveaway__winner, a[href*="/user/"]').each((_, w) => {
      // Don't treat creator or pagination links as winners
      if ($(w).hasClass('giveaway__username')) return;
      const hrefUser = $(w).attr('href') || '';
      const userMatch = hrefUser.match(/\/user\/([a-zA-Z0-9\-_]+)/);
      if ($(w).hasClass('giveaway__winner') || userMatch) {
        const wUser = userMatch ? userMatch[1] : $(w).text().trim();
        if (wUser && wUser !== creator && !winners.some(item => item.sg_username.toLowerCase() === wUser.toLowerCase())) {
          winners.push({ sg_username: wUser, status: 'Unknown' });
        }
      }
    });

    giveaways.push({
      code,
      slug,
      name,
      app_id: appId,
      sub_id: subId,
      copies,
      points,
      creator_username: creator,
      start_timestamp: startTimestamp,
      end_timestamp: endTimestamp,
      is_completed: isCompleted,
      winners
    });
  });

  return giveaways;
}

// Ingest raw SteamGifts HTML parsed from manual browser console dump
export async function ingestSteamGiftsHtml(rawHtml: string) {
  if (!supabase) throw new Error('Supabase client unavailable');
  if (!rawHtml || typeof rawHtml !== 'string') {
    throw new Error('No raw HTML provided for ingestion.');
  }

  const parsedGiveaways = parseSteamGiftsHtml(rawHtml);
  if (parsedGiveaways.length === 0) {
    return {
      success: false,
      error: 'No valid SteamGifts giveaway rows found in the provided HTML. Make sure you copied from a group page containing .giveaway__row elements.',
      giveawaysSynced: 0,
      winnersRecorded: 0,
      appIdsBackfilled: 0,
      timestamp: new Date().toISOString()
    };
  }

  // Pre-fetch app members & mappings (ignore winners who are not app members)
  const { sgToMemberMap } = await getAppMembersLookup();

  let totalGiveaways = 0;
  let totalWinners = 0;
  let totalBackfilled = 0;

  for (const g of parsedGiveaways) {
    // 1. Upsert giveaway record
    const { error: gErr } = await supabase.from('sg_group_giveaways').upsert({
      code: g.code,
      slug: g.slug,
      name: g.name,
      app_id: g.app_id,
      sub_id: g.sub_id,
      copies: g.copies,
      points: g.points,
      creator_username: g.creator_username,
      start_timestamp: g.start_timestamp,
      end_timestamp: g.end_timestamp,
      is_completed: g.is_completed,
      synced_at: new Date().toISOString()
    }, { onConflict: 'code' });

    if (!gErr) totalGiveaways++;

    // 2. Auto-backfill public.games.steam_appid if valid app_id present
    if (g.app_id) {
      const backfilled = await backfillGameAppId(g.name, g.app_id);
      if (backfilled) totalBackfilled++;
    }

    // 3. Upsert winners (strictly app members only)
    for (const w of g.winners) {
      const member = sgToMemberMap.get(w.sg_username.toLowerCase().trim());
      if (!member) continue; // Skip non-app members

      const { error: wErr } = await supabase.from('sg_giveaway_winners').upsert({
        giveaway_code: g.code,
        sg_username: w.sg_username,
        steamid: member.steamid,
        profile_id: member.profile_id,
        status: w.status || 'Unknown'
      }, { onConflict: 'giveaway_code,sg_username' });

      if (!wErr) totalWinners++;
    }
  }

  // Cross-reference any unlinked winners
  await linkUnresolvedWinners();

  return {
    success: true,
    giveawaysSynced: totalGiveaways,
    winnersRecorded: totalWinners,
    appIdsBackfilled: totalBackfilled,
    message: `Successfully ingested ${totalGiveaways} giveaways and recorded ${totalWinners} winners (${totalBackfilled} game app_ids backfilled).`,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// Core Sync Routine for SteamGifts Group Giveaways
// -----------------------------------------------------------------------------
export async function syncGroupGiveaways(options: { maxPages?: number } = {}) {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { maxPages = 3 } = options;
  const phpsessid = process.env.SG_PHPSESSID?.trim();
  const sessionCheck = await checkSteamgiftsSession();
  
  if (!sessionCheck.valid) {
    return {
      success: false,
      sessionHealthy: false,
      error: sessionCheck.message,
      giveawaysSynced: 0,
      winnersRecorded: 0,
      appIdsBackfilled: 0,
      timestamp: new Date().toISOString()
    };
  }

  const { groupCode, groupSlug } = getGroupTarget();
  let totalGiveaways = 0;
  let totalWinners = 0;
  let totalBackfilled = 0;
  let pagesSynced = 0;
  let shouldStopPagination = false;

  // Pre-fetch app members & mappings (ignore winners who are not app members)
  const { sgToMemberMap } = await getAppMembersLookup();

  for (let page = 1; page <= maxPages; page++) {
    pagesSynced++;
    const pageUrl = `https://www.steamgifts.com/group/${groupCode}/${groupSlug}/search?page=${page}`;
    console.log(`[SteamGifts Sync] Fetching page ${page}: ${pageUrl}`);

    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': `PHPSESSID=${phpsessid}`,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!res.ok) {
      console.warn(`[SteamGifts Sync] Page ${page} returned HTTP ${res.status}`);
      break;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const giveawayElements = $('.giveaway__row-outer-wrap');
    if (giveawayElements.length === 0) {
      console.log(`[SteamGifts Sync] No giveaways found on page ${page}. Ending pagination.`);
      break;
    }

    let pageCompletedCount = 0;

    for (let i = 0; i < giveawayElements.length; i++) {
      const el = giveawayElements[i];
      const headingEl = $(el).find('a.giveaway__heading__name');
      const href = headingEl.attr('href') || '';
      const match = href.match(/\/giveaway\/([a-zA-Z0-9]+)(?:\/([a-zA-Z0-9\-_]+))?/);
      if (!match) continue;

      const code = match[1];
      const slug = match[2] || null;
      const name = headingEl.text().trim();
      if (!name) continue;

      // Extract copies and points: e.g. "(5 Copies)" "(50P)"
      let copies = 1;
      let points = 0;
      $(el).find('.giveaway__heading__thin').each((_, span) => {
        const text = $(span).text().trim();
        const copyMatch = text.match(/\((\d+)\s+Cop(?:y|ies)\)/i);
        if (copyMatch) copies = parseInt(copyMatch[1], 10);
        const ptMatch = text.match(/\((\d+)P\)/i);
        if (ptMatch) points = parseInt(ptMatch[1], 10);
      });

      // Extract steam app_id/sub_id from thumbnail or steam store icon
      const thumbStyle = $(el).find('.giveaway_image_thumbnail').attr('style') || 
                         $(el).find('.giveaway__hide').attr('style') || '';
      const storeLink = $(el).find('a[href*="store.steampowered.com"]').attr('href') || '';
      const { appId, subId } = extractSteamIds(storeLink || thumbStyle);

      // Extract creator username
      const creator = $(el).find('.giveaway__username').text().trim() || null;

      // Timestamps: data-timestamp on start / end time spans
      let endTimestamp: number | null = null;
      let startTimestamp: number | null = null;
      const timeSpans = $(el).find('span[data-timestamp]');
      if (timeSpans.length >= 2) {
        startTimestamp = parseInt($(timeSpans[0]).attr('data-timestamp') || '0', 10) || null;
        endTimestamp = parseInt($(timeSpans[1]).attr('data-timestamp') || '0', 10) || null;
      } else if (timeSpans.length === 1) {
        endTimestamp = parseInt($(timeSpans[0]).attr('data-timestamp') || '0', 10) || null;
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const isCompleted = endTimestamp ? endTimestamp <= nowSec : false;

      // Check if we already have this giveaway stored and completed in DB
      const { data: existingG } = await supabase
        .from('sg_group_giveaways')
        .select('code, is_completed')
        .eq('code', code)
        .maybeSingle();

      if (existingG && existingG.is_completed && isCompleted) {
        pageCompletedCount++;
      }

      // Upsert giveaway row
      await supabase.from('sg_group_giveaways').upsert({
        code,
        slug,
        name,
        app_id: appId,
        sub_id: subId,
        copies,
        points,
        creator_username: creator,
        start_timestamp: startTimestamp,
        end_timestamp: endTimestamp,
        is_completed: isCompleted,
        synced_at: new Date().toISOString()
      }, { onConflict: 'code' });
      totalGiveaways++;

      // Backfill public.games.steam_appid if valid app_id found
      if (appId) {
        const backfilled = await backfillGameAppId(name, appId);
        if (backfilled) totalBackfilled++;
      }

      // Winners extraction:
      // If completed or has winners listed
      const inlineWinners: Array<{ sg_username: string; status: string }> = [];
      const winnerLinks = $(el).find('.giveaway__winner');
      winnerLinks.each((_, w) => {
        const wUser = $(w).text().trim();
        if (wUser) {
          inlineWinners.push({ sg_username: wUser, status: 'Unknown' });
        }
      });

      // If copies > 3, winners are truncated on the main card, fetch /winners page
      let finalWinners = inlineWinners;
      if (isCompleted && copies > 3) {
        await sleep(DEFAULT_DELAY_MS);
        const fullWinners = await fetchGiveawayWinners(code, slug);
        if (fullWinners.length > 0) {
          finalWinners = fullWinners;
        }
      }

      // Upsert winners into sg_giveaway_winners (strictly app members only)
      for (const w of finalWinners) {
        const member = sgToMemberMap.get(w.sg_username.toLowerCase().trim());
        if (!member) continue; // Skip non-app members

        await supabase.from('sg_giveaway_winners').upsert({
          giveaway_code: code,
          sg_username: w.sg_username,
          steamid: member.steamid,
          profile_id: member.profile_id,
          status: w.status || 'Unknown'
        }, { onConflict: 'giveaway_code,sg_username' });
        totalWinners++;
      }
    }

    // Stop condition for fast sync: if all giveaways on this page are already finalized in DB
    if (pageCompletedCount >= giveawayElements.length && page > 1) {
      console.log(`[SteamGifts Sync] Page ${page} contained only already finalized giveaways. Halting.`);
      shouldStopPagination = true;
      break;
    }

    // Anti-ban rate limit delay before requesting next page
    if (page < maxPages && !shouldStopPagination) {
      await sleep(DEFAULT_DELAY_MS);
    }
  }

  // Cross-reference any unlinked winners against sg_user_mappings
  await linkUnresolvedWinners();

  return {
    success: true,
    sessionHealthy: true,
    syncedPages: pagesSynced,
    giveawaysSynced: totalGiveaways,
    winnersRecorded: totalWinners,
    appIdsBackfilled: totalBackfilled,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// Resolve Member SteamGifts Usernames (Group Roster Scraping + SteamID Resolution)
// -----------------------------------------------------------------------------
export interface RosterMemberInfo {
  sg_username: string;
  steamid?: string | null;
  steam_name?: string | null;
  avatar?: string | null;
}

export function parseGroupRosterHtml(html: string): RosterMemberInfo[] {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const rosterMembers: RosterMemberInfo[] = [];

  // Match table rows in .table__row-inner-wrap, .table__row, or user columns
  $('.table__row-inner-wrap, .table__row').each((_, r) => {
    // 1. SteamGifts username
    const userEl = $(r).find('a.table__column__heading, a[href*="/user/"]').first();
    const href = userEl.attr('href') || '';
    const userMatch = href.match(/\/user\/([a-zA-Z0-9\-_]+)/);
    const sgUsername = userMatch ? userMatch[1] : userEl.text().trim();
    if (!sgUsername) return;

    // 2. Steam profile link if present (Steam icon or link to /profiles/ or /id/)
    let steamid: string | null = null;
    let steamVanity: string | null = null;
    $(r).find('a[href*="steamcommunity.com"]').each((_, sLink) => {
      const sHref = $(sLink).attr('href') || '';
      const profMatch = sHref.match(/\/profiles\/(\d{17})/);
      if (profMatch) {
        steamid = profMatch[1];
      }
      const idMatch = sHref.match(/\/id\/([a-zA-Z0-9\-_]+)/);
      if (idMatch) {
        steamVanity = idMatch[1];
      }
    });

    const avatar = $(r).find('.global__image-inner-wrap, img').attr('style') || $(r).find('img').attr('src') || null;

    if (!rosterMembers.some(m => m.sg_username.toLowerCase() === sgUsername.toLowerCase())) {
      rosterMembers.push({
        sg_username: sgUsername,
        steamid,
        avatar
      });
    }
  });

  return rosterMembers;
}

export async function ingestGroupRosterHtml(rawHtml: string) {
  if (!supabase) throw new Error('Supabase client unavailable');
  const rosterMembers = parseGroupRosterHtml(rawHtml);
  if (rosterMembers.length === 0) {
    return {
      success: false,
      error: 'No member rows found in the provided HTML. Make sure you copied outerHTML from the group /users page.',
      membersIngested: 0,
      membersLinked: 0,
      timestamp: new Date().toISOString()
    };
  }

  // Fetch all profiles from public.profiles
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, steamid, steam_name, discord_name');

  if (error || !profiles) throw error || new Error('Failed to load profiles');

  const profileMapBySteamId = new Map<string, any>();
  const profileMapByName = new Map<string, any>();
  profiles.forEach(p => {
    if (p.steamid) profileMapBySteamId.set(String(p.steamid).trim(), p);
    if (p.steam_name) profileMapByName.set(normalizeTitle(p.steam_name), p);
    if (p.discord_name) profileMapByName.set(normalizeTitle(p.discord_name), p);
  });

  let linkedCount = 0;

  for (const m of rosterMembers) {
    const normalizedSg = normalizeTitle(m.sg_username);

    // 1. Direct match by SteamID64 if present in roster
    let matchedProfile = m.steamid ? profileMapBySteamId.get(m.steamid) : null;

    // 2. Fallback match by Steam name or Discord name matching SG username
    if (!matchedProfile) {
      matchedProfile = profileMapByName.get(normalizedSg);
    }

    if (matchedProfile && matchedProfile.steamid) {
      await supabase.from('sg_user_mappings').upsert({
        steamid: matchedProfile.steamid,
        profile_id: matchedProfile.id,
        sg_username: m.sg_username,
        has_sg_account: true,
        in_sg_group: true,
        last_checked_at: new Date().toISOString()
      }, { onConflict: 'steamid' });
      linkedCount++;
    }
  }

  await linkUnresolvedWinners();

  return {
    success: true,
    membersIngested: rosterMembers.length,
    membersLinked: linkedCount,
    message: `Processed ${rosterMembers.length} roster members, linked ${linkedCount} to existing platform accounts.`,
    timestamp: new Date().toISOString()
  };
}

// NOTE: Automated backend member resolution via /go/user/{steamid} has been removed
// because Cloudflare blocks server-side requests. Direct links are now generated in the frontend:
// https://www.steamgifts.com/go/user/{steamid}
export async function resolveMemberSgAccounts() {
  return {
    success: true,
    message: 'Server-side automated resolution is deprecated due to Cloudflare blocks. Direct profile links are available in the member directory, and manual HTML roster ingestion is supported.',
    profilesChecked: 0,
    newlyFoundCount: 0,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// Cross-reference sg_user_mappings with sg_giveaway_winners
// -----------------------------------------------------------------------------
async function linkUnresolvedWinners() {
  if (!supabase) return;
  try {
    const { data: mappings } = await supabase
      .from('sg_user_mappings')
      .select('steamid, profile_id, sg_username')
      .not('sg_username', 'is', null);

    if (!mappings || mappings.length === 0) return;

    for (const m of mappings) {
      if (!m.sg_username) continue;
      await supabase
        .from('sg_giveaway_winners')
        .update({
          steamid: m.steamid,
          profile_id: m.profile_id
        })
        .ilike('sg_username', m.sg_username)
        .is('steamid', null);
    }
  } catch (err) {
    console.warn('[SteamGifts] Error linking unresolved winners:', err);
  }
}

// -----------------------------------------------------------------------------
// Query Member Summaries & Wins
// -----------------------------------------------------------------------------
export async function getMemberSummaries() {
  if (!supabase) throw new Error('Supabase client unavailable');

  // 1. Fetch all profiles
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, steamid, steam_name, steam_avatar, discord_name, discord_avatar, active_avatar, team, role')
    .order('steam_name', { ascending: true });

  if (profErr || !profiles) throw profErr || new Error('Failed to load profiles');

  // 2. Fetch all mappings
  const { data: mappings } = await supabase.from('sg_user_mappings').select('*');
  const mappingMap = new Map<string, any>();
  (mappings || []).forEach((m: any) => mappingMap.set(m.steamid, m));

  // 3. Fetch winner records count grouped by steamid or sg_username
  const { data: winners } = await supabase
    .from('sg_giveaway_winners')
    .select('steamid, sg_username, status, giveaway_code');

  const winCountMap = new Map<string, number>();
  (winners || []).forEach((w: any) => {
    if (w.steamid) {
      winCountMap.set(w.steamid, (winCountMap.get(w.steamid) || 0) + 1);
    }
    if (w.sg_username) {
      const lower = w.sg_username.toLowerCase();
      winCountMap.set(`sg_${lower}`, (winCountMap.get(`sg_${lower}`) || 0) + 1);
    }
  });

  const memberSummaries = profiles.map((p: any) => {
    const map = mappingMap.get(p.steamid);
    const sgLower = map?.sg_username ? map.sg_username.toLowerCase() : null;
    const wins = (p.steamid ? winCountMap.get(p.steamid) : 0) || 
                 (sgLower ? winCountMap.get(`sg_${sgLower}`) : 0) || 0;

    return {
      steamid: p.steamid,
      steam_name: p.steam_name || 'Member',
      steam_avatar: p.steam_avatar,
      discord_name: p.discord_name,
      discord_avatar: p.discord_avatar,
      active_avatar: p.active_avatar,
      team: p.team || 'none',
      role: p.role,
      sg_username: map?.sg_username || null,
      has_sg_account: Boolean(map?.has_sg_account),
      in_sg_group: Boolean(map?.in_sg_group),
      last_checked_at: map?.last_checked_at || null,
      total_wins: wins
    };
  });

  return memberSummaries;
}

export async function getMemberWins(steamid: string) {
  if (!supabase) throw new Error('Supabase client unavailable');
  if (!steamid) throw new Error('Steam ID is required');

  // 1. Fetch user mapping
  const { data: mapping } = await supabase
    .from('sg_user_mappings')
    .select('*')
    .eq('steamid', steamid)
    .maybeSingle();

  const sgUsername = mapping?.sg_username;

  // 2. Find winners where steamid matches OR sg_username matches
  let query = supabase
    .from('sg_giveaway_winners')
    .select('*, giveaway:sg_group_giveaways(*)');

  if (sgUsername) {
    query = query.or(`steamid.eq.${steamid},sg_username.ilike.${sgUsername}`);
  } else {
    query = query.eq('steamid', steamid);
  }

  const { data: wins, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;

  return {
    steamid,
    mapping,
    wins: wins || []
  };
}

// -----------------------------------------------------------------------------
// Win Ledger Native Steam Playstats & Achievement Scanner
// -----------------------------------------------------------------------------
export interface SgPlayStats {
  minutes: number;
  earned: number;
  total: number;
  percent: number;
  status: 'zero' | 'started' | 'played' | 'completed';
  updated_at: string;
}

// Resolve package sub_id to app_ids
export async function resolvePackageAppIds(subId: number): Promise<number[]> {
  try {
    const res = await fetch(`https://store.steampowered.com/sub/${subId}/?l=english`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const appIds = new Set<number>();
    $('[data-ds-appid]').each((_, el) => {
      const idStr = $(el).attr('data-ds-appid');
      if (idStr) {
        idStr.split(',').forEach(id => {
          const num = parseInt(id.trim(), 10);
          if (num > 0) appIds.add(num);
        });
      }
    });
    $('a[href*="/app/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/\/app\/(\d+)/);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > 0) appIds.add(num);
      }
    });
    return Array.from(appIds);
  } catch (e) {
    console.warn(`Failed to resolve package apps for sub ${subId}:`, e);
    return [];
  }
}

// Scan Steam playstats and achievements for a member
export async function scanSteamPlaystats(
  steamid: string,
  options: { apiKey?: string; appIds?: number[] } = {}
) {
  const apiKey = (options.apiKey || process.env.STEAM_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Steam Web API key is required. Provide it in settings or set STEAM_API_KEY in environment variables.');
  }
  if (!steamid || !/^\d{17}$/.test(steamid)) {
    throw new Error('Valid 17-digit SteamID64 is required');
  }

  // 1. Get owned games & playtime
  const ownedUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamid}&include_appinfo=true&include_played_free_games=true`;
  const ownedRes = await fetch(ownedUrl);
  if (!ownedRes.ok) {
    throw new Error(`Steam API returned HTTP ${ownedRes.status} for owned games`);
  }
  const ownedData = await ownedRes.json();
  const gamesList: Array<{ appid: number; playtime_forever: number; name?: string }> = ownedData.response?.games || [];
  const playtimeMap = new Map<number, number>();
  gamesList.forEach(g => playtimeMap.set(g.appid, g.playtime_forever || 0));

  // 2. Identify target appIds to inspect
  let targetAppIds = options.appIds;
  if (!targetAppIds || targetAppIds.length === 0) {
    if (supabase) {
      const { data: wins } = await supabase
        .from('sg_giveaway_winners')
        .select('giveaway_code, giveaway:sg_group_giveaways(app_id, sub_id, name)')
        .eq('steamid', steamid);

      const foundAppIds: number[] = [];
      for (const w of (wins || [])) {
        const g: any = w.giveaway;
        if (g?.app_id) {
          foundAppIds.push(g.app_id);
        } else if (g?.sub_id) {
          const pkgApps = await resolvePackageAppIds(g.sub_id);
          foundAppIds.push(...pkgApps);
        }
      }
      targetAppIds = Array.from(new Set(foundAppIds));
    }
  }

  targetAppIds = targetAppIds || [];

  const results: Record<number, SgPlayStats> = {};

  for (const appId of targetAppIds) {
    const minutes = playtimeMap.get(appId) || 0;
    let earned = 0;
    let total = 0;

    // Fetch achievements
    try {
      const achUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${apiKey}&steamid=${steamid}&appid=${appId}&l=english`;
      const achRes = await fetch(achUrl);
      if (achRes.ok) {
        const achData = await achRes.json();
        const achievements: Array<{ apiname: string; achieved: number }> = achData.playerstats?.achievements || [];
        total = achievements.length;
        earned = achievements.filter(a => a.achieved === 1).length;
      }
    } catch (e) {
      // Game may not have achievements
    }

    const percent = total > 0 ? Math.round((earned / total) * 100) : (minutes >= 120 ? 100 : (minutes > 0 ? 50 : 0));
    let status: 'zero' | 'started' | 'played' | 'completed' = 'zero';
    if (total > 0) {
      if (percent === 100) status = 'completed';
      else if (percent >= 25) status = 'played';
      else if (percent > 0) status = 'started';
      else status = 'zero';
    } else {
      if (minutes >= 120) status = 'played';
      else if (minutes > 0) status = 'started';
      else status = 'zero';
    }

    const playStat: SgPlayStats = {
      minutes,
      earned,
      total,
      percent,
      status,
      updated_at: new Date().toISOString()
    };
    results[appId] = playStat;

    if (supabase) {
      try {
        const { data: matchedGiveaways } = await supabase
          .from('sg_group_giveaways')
          .select('code, name')
          .eq('app_id', appId);

        if (matchedGiveaways && matchedGiveaways.length > 0) {
          const codes = matchedGiveaways.map(g => g.code);
          await supabase
            .from('sg_giveaway_winners')
            .update({ play_stats: playStat })
            .eq('steamid', steamid)
            .in('giveaway_code', codes);

          for (const mg of matchedGiveaways) {
            await backfillGameAppId(mg.name, appId);
          }
        }
      } catch (err) {
        console.warn(`[SteamGifts Playstats] Could not update play_stats column:`, err);
      }
    }

    await sleep(200);
  }

  return {
    success: true,
    steamid,
    gamesScanned: targetAppIds.length,
    results,
    timestamp: new Date().toISOString()
  };
}

// Scan public unauthenticated SteamGifts JSON endpoint
export async function scanPublicSgWins(sgUsername: string, mode: 'won' | 'sent' = 'won', maxPages = 5) {
  if (!supabase) throw new Error('Supabase client unavailable');
  if (!sgUsername) throw new Error('SteamGifts username is required');

  let totalSynced = 0;
  let verifiedSteamId: string | null = null;
  const cleanUsername = sgUsername.trim();

  const { sgToMemberMap, memberSteamIdSet } = await getAppMembersLookup();

  for (let page = 1; page <= maxPages; page++) {
    const url = mode === 'won'
      ? `https://www.steamgifts.com/user/${cleanUsername}/giveaways/won?format=json&page=${page}`
      : `https://www.steamgifts.com/user/${cleanUsername}?format=json&include_winners=1&page=${page}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*'
      }
    });

    if (!res.ok) {
      console.warn(`Public SG scan page ${page} returned HTTP ${res.status}`);
      break;
    }

    const data = await res.json().catch(() => null);
    if (!data || !data.results || data.results.length === 0) break;

    // Verify user SteamID if returned
    if (data.user?.steam_id) {
      verifiedSteamId = String(data.user.steam_id).trim();
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('steamid', verifiedSteamId)
        .maybeSingle();

      await supabase.from('sg_user_mappings').upsert({
        steamid: verifiedSteamId,
        profile_id: profile?.id || null,
        sg_username: cleanUsername,
        has_sg_account: true,
        last_checked_at: new Date().toISOString()
      }, { onConflict: 'steamid' });
    }

    for (const item of data.results) {
      const code = item.code || (item.link ? item.link.match(/\/giveaway\/([a-zA-Z0-9]+)/)?.[1] : null);
      if (!code) continue;

      const slugMatch = item.link ? item.link.match(/\/giveaway\/[a-zA-Z0-9]+\/([a-zA-Z0-9\-_]+)/) : null;
      const slug = slugMatch ? slugMatch[1] : null;
      const appId = item.app_id ? parseInt(item.app_id, 10) : null;
      const subId = item.package_id ? parseInt(item.package_id, 10) : null;
      const copies = parseInt(item.copies, 10) || 1;
      const points = parseInt(item.points, 10) || 0;
      const creatorUsername = item.creator?.username || (mode === 'sent' ? cleanUsername : null);
      const endTimestamp = item.end_timestamp ? parseInt(item.end_timestamp, 10) : null;

      await supabase.from('sg_group_giveaways').upsert({
        code,
        slug,
        name: item.name || 'Giveaway',
        app_id: appId,
        sub_id: subId,
        copies,
        points,
        creator_username: creatorUsername,
        end_timestamp: endTimestamp,
        is_completed: true,
        synced_at: new Date().toISOString()
      }, { onConflict: 'code' });

      if (mode === 'won') {
        const member = (verifiedSteamId && memberSteamIdSet.has(verifiedSteamId)) 
          ? { steamid: verifiedSteamId, profile_id: null } 
          : sgToMemberMap.get(cleanUsername.toLowerCase());
        if (!member) continue; // Skip non-app members

        const receivedVal = item.received;
        const status = receivedVal === 1 ? 'Received' : (receivedVal === -1 ? 'Not Received' : 'Awaiting Feedback');
        await supabase.from('sg_giveaway_winners').upsert({
          giveaway_code: code,
          sg_username: cleanUsername,
          steamid: member.steamid,
          profile_id: member.profile_id,
          status
        }, { onConflict: 'giveaway_code,sg_username' });
      } else if (mode === 'sent' && item.winners && Array.isArray(item.winners)) {
        for (const w of item.winners) {
          const wName = w.username || w.user?.username;
          if (!wName) continue;
          const member = sgToMemberMap.get(String(wName).toLowerCase().trim());
          if (!member) continue; // Skip non-app members

          const status = w.received === 1 ? 'Received' : (w.received === -1 ? 'Not Received' : 'Awaiting Feedback');
          await supabase.from('sg_giveaway_winners').upsert({
            giveaway_code: code,
            sg_username: wName,
            steamid: member.steamid,
            profile_id: member.profile_id,
            status
          }, { onConflict: 'giveaway_code,sg_username' });
        }
      }

      if (appId && item.name) {
        await backfillGameAppId(item.name, appId);
      }

      totalSynced++;
    }

    if (data.page >= data.pages) break;
    await sleep(DEFAULT_DELAY_MS);
  }

  await linkUnresolvedWinners();

  return {
    success: true,
    sgUsername: cleanUsername,
    verifiedSteamId,
    totalSynced,
    timestamp: new Date().toISOString()
  };
}

// Update inline username mapping
export async function updateMemberSgUsername(steamid: string, sgUsername: string) {
  if (!supabase) throw new Error('Supabase client unavailable');
  if (!steamid) throw new Error('Steam ID is required');

  const cleanUsername = (sgUsername || '').trim();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('steamid', steamid)
    .maybeSingle();

  await supabase.from('sg_user_mappings').upsert({
    steamid,
    profile_id: profile?.id || null,
    sg_username: cleanUsername || null,
    has_sg_account: Boolean(cleanUsername),
    last_checked_at: new Date().toISOString()
  }, { onConflict: 'steamid' });

  await linkUnresolvedWinners();

  return {
    success: true,
    steamid,
    sg_username: cleanUsername,
    timestamp: new Date().toISOString()
  };
}

// Query full ledger entries and metrics
export async function getWinLedger(options: { type?: 'won' | 'sent'; steamid?: string; creator?: string }) {
  if (!supabase) throw new Error('Supabase client unavailable');

  // 1. Fetch profiles and mappings for winner cross-referencing
  const { memberSteamIdSet, sgToMemberMap, profNameMap } = await getAppMembersLookup();

  // 2. Fetch giveaways
  let gQuery = supabase.from('sg_group_giveaways').select('*');
  if (options.creator) {
    gQuery = gQuery.ilike('creator_username', options.creator);
  }
  const { data: giveaways } = await gQuery;
  const giveawayMap = new Map<string, any>();
  (giveaways || []).forEach(g => giveawayMap.set(g.code, g));

  // 3. Fetch winners
  let wQuery = supabase.from('sg_giveaway_winners').select('*');
  if (options.steamid) {
    wQuery = wQuery.eq('steamid', options.steamid);
  }
  const { data: rawWinners, error: wErr } = await wQuery.order('created_at', { ascending: false });
  if (wErr) throw wErr;

  // Filter out any winner who is not a registered member of our app (public.profiles)
  const validMemberWinners: any[] = [];
  (rawWinners || []).forEach((w: any) => {
    let sid = w.steamid ? String(w.steamid).trim() : null;
    let pid = w.profile_id || null;

    if (!sid || !memberSteamIdSet.has(sid)) {
      // Try resolving via sg_username in sgToMemberMap
      const match = w.sg_username ? sgToMemberMap.get(w.sg_username.toLowerCase().trim()) : null;
      if (match) {
        sid = match.steamid;
        pid = match.profile_id;
        w.steamid = sid;
        w.profile_id = pid;
      }
    }

    // Strictly ignore winner if they do not belong to our app's public.profiles
    if (sid && memberSteamIdSet.has(sid)) {
      validMemberWinners.push(w);
    }
  });

  const entries: any[] = [];
  let startedCount = 0;
  let playedCount = 0;
  let completedCount = 0;
  let anyPlaytimeCount = 0;
  let totalPlayMinutes = 0;
  let totalAchievementPercent = 0;
  let achievementEntriesCount = 0;
  const yearlyMap: Record<number, { count: number; played: number; completed: number; totalMinutes: number }> = {};

  validMemberWinners.forEach((w: any) => {
    const g = giveawayMap.get(w.giveaway_code) || {};
    const playStats = w.play_stats as SgPlayStats | null;

    if (playStats) {
      if (playStats.minutes > 0) {
        anyPlaytimeCount++;
        totalPlayMinutes += playStats.minutes;
      }
      if (playStats.status === 'started') startedCount++;
      else if (playStats.status === 'played') playedCount++;
      else if (playStats.status === 'completed') completedCount++;

      if (playStats.total > 0) {
        totalAchievementPercent += playStats.percent;
        achievementEntriesCount++;
      }
    }

    const year = g.end_timestamp ? new Date(g.end_timestamp * 1000).getFullYear() : new Date(w.created_at).getFullYear();
    if (!yearlyMap[year]) {
      yearlyMap[year] = { count: 0, played: 0, completed: 0, totalMinutes: 0 };
    }
    yearlyMap[year].count++;
    if (playStats && (playStats.status === 'played' || playStats.status === 'completed')) yearlyMap[year].played++;
    if (playStats && playStats.status === 'completed') yearlyMap[year].completed++;
    if (playStats) yearlyMap[year].totalMinutes += playStats.minutes || 0;

    entries.push({
      id: w.id,
      giveaway_code: w.giveaway_code,
      slug: g.slug || null,
      name: g.name || 'Group Giveaway',
      app_id: g.app_id || null,
      sub_id: g.sub_id || null,
      copies: g.copies || 1,
      points: g.points || 0,
      creator_username: g.creator_username || null,
      end_timestamp: g.end_timestamp || null,
      winner_sg_username: w.sg_username,
      winner_steamid: w.steamid || null,
      winner_steam_name: w.steamid ? profNameMap.get(w.steamid) : null,
      winner_profile_id: w.profile_id || null,
      status: w.status || 'Unknown',
      created_at: w.created_at,
      play_stats: playStats,
      type: 'won'
    });
  });

  const totalEntries = entries.length;
  const metrics = {
    totalEntries,
    startedCount,
    startedPercent: totalEntries > 0 ? Math.round((startedCount / totalEntries) * 100) : 0,
    playedCount,
    playedPercent: totalEntries > 0 ? Math.round((playedCount / totalEntries) * 100) : 0,
    completedCount,
    completedPercent: totalEntries > 0 ? Math.round((completedCount / totalEntries) * 100) : 0,
    anyPlaytimeCount,
    anyPlaytimePercent: totalEntries > 0 ? Math.round((anyPlaytimeCount / totalEntries) * 100) : 0,
    avgPlaytimeHours: anyPlaytimeCount > 0 ? Number((totalPlayMinutes / anyPlaytimeCount / 60).toFixed(1)) : 0,
    avgAchievementPercent: achievementEntriesCount > 0 ? Math.round(totalAchievementPercent / achievementEntriesCount) : 0,
    yearly: yearlyMap
  };

  return {
    entries,
    metrics
  };
}

// Import / Backup Parser (JSON, CSV, TSV, or raw HTML)
export async function importLedgerPayload(payload: string, format = 'auto', dryRun = false) {
  if (!supabase) throw new Error('Supabase client unavailable');
  const trimmed = payload.trim();
  if (!trimmed) throw new Error('Payload cannot be empty');

  let detectedFormat = format;
  if (format === 'auto') {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) detectedFormat = 'json';
    else if (trimmed.includes('<table') || trimmed.includes('giveaway__row') || trimmed.includes('<!DOCTYPE')) detectedFormat = 'html';
    else if (trimmed.includes('\t')) detectedFormat = 'tsv';
    else detectedFormat = 'csv';
  }

  const itemsToInsert: any[] = [];

  if (detectedFormat === 'html') {
    const parsed = parseSteamGiftsHtml(trimmed);
    for (const g of parsed) {
      itemsToInsert.push({
        code: g.code,
        slug: g.slug,
        name: g.name,
        app_id: g.app_id,
        sub_id: g.sub_id,
        copies: g.copies,
        points: g.points,
        creator_username: g.creator_username,
        end_timestamp: g.end_timestamp,
        winners: g.winners || []
      });
    }
  } else if (detectedFormat === 'json') {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : (parsed.results || parsed.giveaways || parsed.entries || [parsed]);
      for (const item of list) {
        const code = item.code || item.giveaway_code || item.id || (item.link ? item.link.match(/\/giveaway\/([a-zA-Z0-9]+)/)?.[1] : null);
        if (!code) continue;
        itemsToInsert.push({
          code: String(code),
          slug: item.slug || null,
          name: item.name || item.title || 'Giveaway',
          app_id: item.app_id ? parseInt(item.app_id, 10) : null,
          sub_id: item.sub_id || item.package_id ? parseInt(item.sub_id || item.package_id, 10) : null,
          copies: parseInt(item.copies, 10) || 1,
          points: parseInt(item.points, 10) || 0,
          creator_username: item.creator_username || item.creator?.username || item.creator || null,
          end_timestamp: item.end_timestamp ? parseInt(item.end_timestamp, 10) : null,
          winners: item.winners || (item.winner_sg_username || item.winner ? [{
            sg_username: item.winner_sg_username || item.winner,
            status: item.status || 'Received'
          }] : [])
        });
      }
    } catch (e: any) {
      throw new Error(`JSON parsing failed: ${e.message}`);
    }
  } else {
    // CSV or TSV
    const delimiter = detectedFormat === 'tsv' ? '\t' : ',';
    const lines = trimmed.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length >= 2) {
      const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = cols[idx] !== undefined ? cols[idx] : '';
        });
        const code = row.code || row.giveaway_code || row.id || (row.link ? row.link.match(/\/giveaway\/([a-zA-Z0-9]+)/)?.[1] : null);
        if (!code) continue;
        itemsToInsert.push({
          code: String(code),
          slug: row.slug || null,
          name: row.name || row.title || row.game || 'Giveaway',
          app_id: row.app_id || row.appid ? parseInt(row.app_id || row.appid, 10) : null,
          sub_id: row.sub_id || row.package_id ? parseInt(row.sub_id || row.package_id, 10) : null,
          copies: parseInt(row.copies, 10) || 1,
          points: parseInt(row.points, 10) || 0,
          creator_username: row.creator || row.creator_username || null,
          end_timestamp: row.end_timestamp ? parseInt(row.end_timestamp, 10) : null,
          winners: row.winner || row.sg_username ? [{
            sg_username: row.winner || row.sg_username,
            status: row.status || 'Received'
          }] : []
        });
      }
    }
  }

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      detectedFormat,
      totalParsed: itemsToInsert.length,
      preview: itemsToInsert.slice(0, 10)
    };
  }

  const { sgToMemberMap } = await getAppMembersLookup();

  let giveawaysUpserted = 0;
  let winnersUpserted = 0;
  let appIdsBackfilled = 0;

  for (const item of itemsToInsert) {
    await supabase.from('sg_group_giveaways').upsert({
      code: item.code,
      slug: item.slug,
      name: item.name,
      app_id: item.app_id,
      sub_id: item.sub_id,
      copies: item.copies,
      points: item.points,
      creator_username: item.creator_username,
      end_timestamp: item.end_timestamp,
      is_completed: true,
      synced_at: new Date().toISOString()
    }, { onConflict: 'code' });
    giveawaysUpserted++;

    if (item.winners && Array.isArray(item.winners)) {
      for (const w of item.winners) {
        const uName = (w.sg_username || w.username || '').toString().trim();
        if (!uName) continue;
        const member = sgToMemberMap.get(uName.toLowerCase());
        if (!member) continue; // Skip non-app members

        await supabase.from('sg_giveaway_winners').upsert({
          giveaway_code: item.code,
          sg_username: uName,
          steamid: member.steamid,
          profile_id: member.profile_id,
          status: w.status || 'Received'
        }, { onConflict: 'giveaway_code,sg_username' });
        winnersUpserted++;
      }
    }

    if (item.app_id && item.name) {
      const backfilled = await backfillGameAppId(item.name, item.app_id);
      if (backfilled) appIdsBackfilled++;
    }
  }

  await linkUnresolvedWinners();

  return {
    success: true,
    dryRun: false,
    detectedFormat,
    giveawaysUpserted,
    winnersUpserted,
    appIdsBackfilled,
    message: `Successfully imported ${giveawaysUpserted} giveaways and ${winnersUpserted} winner records (${appIdsBackfilled} app_ids backfilled).`,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// Main Express API Handler
// -----------------------------------------------------------------------------
export default async function steamgiftsHandler(req: Request, res: Response) {
  const action = String(req.query.action || req.body?.action || '').trim().toLowerCase();

  try {
    if (req.method === 'GET') {
      if (action === 'status') {
        const sessionCheck = await checkSteamgiftsSession();
        const { count: giveawaysCount } = await supabase
          ? await supabase.from('sg_group_giveaways').select('*', { count: 'exact', head: true })
          : { count: 0 };
        const { count: winnersCount } = await supabase
          ? await supabase.from('sg_giveaway_winners').select('*', { count: 'exact', head: true })
          : { count: 0 };
        const { count: mappedMembersCount } = await supabase
          ? await supabase.from('sg_user_mappings').select('*', { count: 'exact', head: true }).eq('has_sg_account', true)
          : { count: 0 };

        return res.json({
          session: sessionCheck,
          hasSteamApiKey: Boolean(process.env.STEAM_API_KEY?.trim()),
          stats: {
            totalGiveaways: giveawaysCount || 0,
            totalWinners: winnersCount || 0,
            mappedMembers: mappedMembersCount || 0
          }
        });
      }

      if (action === 'members') {
        const members = await getMemberSummaries();
        return res.json({ members });
      }

      if (action === 'wins') {
        const steamid = String(req.query.steamid || req.query.steamId || '').trim();
        if (!steamid) return res.status(400).json({ error: 'steamid parameter is required' });
        const data = await getMemberWins(steamid);
        return res.json(data);
      }

      if (action === 'ledger') {
        const steamid = req.query.steamid ? String(req.query.steamid) : undefined;
        const creator = req.query.creator ? String(req.query.creator) : undefined;
        const data = await getWinLedger({ steamid, creator });
        return res.json(data);
      }

      if (action === 'export-ledger') {
        const format = String(req.query.format || 'json').toLowerCase();
        const { entries } = await getWinLedger({});
        if (format === 'csv' || format === 'tsv') {
          const delim = format === 'tsv' ? '\t' : ',';
          const headers = ['Code', 'Name', 'AppID', 'Points', 'Copies', 'Creator', 'WinnerSG', 'WinnerSteamID', 'WinnerSteamName', 'Status', 'Minutes', 'Earned', 'Total', 'Percent', 'PlayStatus', 'DateWon'];
          const rows = entries.map(e => [
            e.giveaway_code,
            `"${(e.name || '').replace(/"/g, '""')}"`,
            e.app_id || '',
            e.points || 0,
            e.copies || 1,
            e.creator_username || '',
            e.winner_sg_username || '',
            e.winner_steamid || '',
            `"${(e.winner_steam_name || '').replace(/"/g, '""')}"`,
            e.status || '',
            e.play_stats?.minutes || 0,
            e.play_stats?.earned || 0,
            e.play_stats?.total || 0,
            `${e.play_stats?.percent || 0}%`,
            e.play_stats?.status || 'zero',
            e.end_timestamp ? new Date(e.end_timestamp * 1000).toISOString() : e.created_at
          ].join(delim));

          const content = [headers.join(delim), ...rows].join('\n');
          res.setHeader('Content-Type', format === 'tsv' ? 'text/tab-separated-values' : 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="steamgifts-ledger.${format}"`);
          return res.send(content);
        }

        return res.json({ entries });
      }

      return res.status(400).json({ error: 'Invalid GET action. Supported: status, members, wins, ledger, export-ledger' });
    }

    if (req.method === 'POST') {
      if (action === 'sync') {
        const fullSync = Boolean(req.body?.fullSync);
        const maxPages = fullSync ? 50 : 3;
        const result = await syncGroupGiveaways({ maxPages });
        return res.json(result);
      }

      if (action === 'scan-playstats') {
        const steamid = String(req.body?.steamid || req.body?.steamId || '').trim();
        const apiKey = String(req.body?.apiKey || req.headers['x-steam-api-key'] || '').trim();
        const appIds = Array.isArray(req.body?.appIds) ? req.body.appIds : undefined;
        if (!steamid) return res.status(400).json({ error: 'steamid is required' });
        const result = await scanSteamPlaystats(steamid, { apiKey, appIds });
        return res.json(result);
      }

      if (action === 'scan-public-sg') {
        const sgUsername = String(req.body?.sg_username || req.body?.username || '').trim();
        const mode = (req.body?.mode === 'sent' ? 'sent' : 'won') as 'won' | 'sent';
        const maxPages = parseInt(req.body?.maxPages, 10) || 5;
        if (!sgUsername) return res.status(400).json({ error: 'sg_username is required' });
        const result = await scanPublicSgWins(sgUsername, mode, maxPages);
        return res.json(result);
      }

      if (action === 'update-mapping') {
        const steamid = String(req.body?.steamid || req.body?.steamId || '').trim();
        const sgUsername = String(req.body?.sg_username || req.body?.sgUsername || '').trim();
        if (!steamid) return res.status(400).json({ error: 'steamid is required' });
        const result = await updateMemberSgUsername(steamid, sgUsername);
        return res.json(result);
      }

      if (action === 'import-ledger') {
        const payload = req.body?.payload || req.body?.data || req.body?.html || '';
        const format = req.body?.format || 'auto';
        const dryRun = Boolean(req.body?.dryRun);
        if (!payload) return res.status(400).json({ error: 'Missing import payload in request body' });
        const result = await importLedgerPayload(payload, format, dryRun);
        return res.json(result);
      }

      if (action === 'ingest-html') {
        const html = req.body?.html || req.body?.rawHtml || '';
        if (!html) {
          return res.status(400).json({ error: 'Missing html payload in request body' });
        }
        const result = await ingestSteamGiftsHtml(html);
        return res.json(result);
      }

      if (action === 'ingest-roster') {
        const html = req.body?.html || req.body?.rawHtml || '';
        if (!html) {
          return res.status(400).json({ error: 'Missing html payload in request body' });
        }
        const result = await ingestGroupRosterHtml(html);
        return res.json(result);
      }

      return res.status(400).json({ error: 'Invalid POST action. Supported: sync, scan-playstats, scan-public-sg, update-mapping, import-ledger, ingest-html, ingest-roster' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[SteamGifts Handler] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error in SteamGifts module' });
  }
}
