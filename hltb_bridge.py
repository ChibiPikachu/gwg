import sys
import json
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime

# Extracting exactly from scrapers.py logic
def _hours_to_minutes(val):
    if val is None or val < 0:
        return None
    return int(round(val * 60))

def _hltb_clean_name(name):
    """
    Normalize a Steam game title for HLTB search queries.
    Strips symbols and all punctuation so differences like trailing periods,
    semicolons, or colon-vs-dash separators don't prevent a match.
    """
    name = name[:500]
    name = re.sub(r'[®™©]', '', name)            # trademark/IP symbols
    name = name.rstrip()                                   # trailing year, e.g. "(2010)"
    if name.endswith(')') and len(name) >= 6 and name[-6] == '(' and name[-5:-1].isdigit():
        name = name[:-6].rstrip()
    name = re.sub(r'[^\w\s]', ' ', name)           # all remaining punctuation → space
    name = re.sub(r'\bsokpop\s+s\d+\b', '', name, flags=re.IGNORECASE)  # Sokpop S07 series prefix
    name = re.sub(r'\s{2,}', ' ', name)            # collapse whitespace
    return name.strip()

_HLTB_EDITION_RE = None

def _hltb_strip_edition(name):
    """
    Strip common trailing edition/remaster qualifiers that Steam adds but HLTB omits.
    Returns the stripped name, or the original if nothing was removed.
    """
    global _HLTB_EDITION_RE
    if _HLTB_EDITION_RE is None:
        qualifiers = '|'.join([
            r'definitive', r'remastered', r'hd remaster', r'hd edition',
            r'game of the year', r'goty', r'complete', r'ultimate', r'enhanced',
            r'special', r'anniversary', r'directors? cut', r'deluxe', r'gold',
            r'platinum', r'standard', r'extended', r'legendary',
        ])
        # optionally preceded by a separator word or space, followed by optional "edition/version/cut"
        _HLTB_EDITION_RE = re.compile(
            r'\s+(?:' + qualifiers + r')(?:\s+(?:edition|version|cut))?\s*$',
            re.IGNORECASE
        )
    stripped = _HLTB_EDITION_RE.sub('', name).strip()
    return stripped if stripped != name else name

def fetch_hltb_data(name, threshold=75):
    """
    Fetch HowLongToBeat data for a game by name.
    If the best match score >= threshold, returns full data including times.
    If below threshold, returns only hltb_id + hltb_match_score with
    hltb_fetched='unconfirmed' and no times (NULL) so bad data isn't stored.
    Returns None on no results or failure.
    Times are stored in minutes (HLTB returns hours as floats).
    """
    try:
        from howlongtobeatpy import HowLongToBeat

        def _search(query):
            results = HowLongToBeat(0.0).search(query, similarity_case_sensitive=False)
            if not results:
                return None, 0
            b = max(results, key=lambda r: r.similarity)
            return b, int(round(b.similarity * 100))

        cleaned = _hltb_clean_name(name)
        best, score = _search(cleaned)
        parens_fallback_used = False

        # Single secondary pass: try edition-stripped and paren-stripped variants
        # together, picking whichever yields the best effective score. Paren-stripped
        # results are penalised by 15 pts since removing brackets loses information.
        if not best or score < threshold:
            seen = {cleaned}
            candidates = []

            shorter = _hltb_strip_edition(cleaned)
            if shorter not in seen:
                seen.add(shorter)
                candidates.append((shorter, False))

            no_parens = _hltb_clean_name(re.sub(r'\s*[\(\[][^\)\]]*[\)\]]\s*', ' ', name))
            if no_parens and no_parens not in seen:
                candidates.append((no_parens, True))

            best_effective = score
            for query, penalised in candidates:
                alt_best, alt_score = _search(query)
                effective = alt_score - (15 if penalised else 0)
                if alt_best and effective > best_effective:
                    best, score, parens_fallback_used = alt_best, alt_score, penalised
                    best_effective = effective

        if not best:
            return None

        effective_score = score - 15 if parens_fallback_used else score
        if effective_score < threshold:
            return {
                'hltb_id':            best.game_id,
                'hltb_matched_name':  best.game_name,
                'hltb_match_score':   score,
                'hltb_main':          None,
                'hltb_extras':        None,
                'hltb_completionist': None,
                'hltb_fetched':       'unconfirmed',
            }

        today = datetime.now().strftime('%Y-%m-%d')
        return {
            'hltb_id':            best.game_id,
            'hltb_matched_name':  best.game_name,
            'hltb_main':          _hours_to_minutes(best.main_story),
            'hltb_extras':        _hours_to_minutes(best.main_extra),
            'hltb_completionist': _hours_to_minutes(best.completionist),
            'hltb_match_score':   score,
            'hltb_fetched':       today,
        }
    except Exception as e:
        # sys.stderr.write(f"[hltb] fetch failed for '{name}': {e}\n")
        return None

if __name__ == '__main__':
    if len(sys.argv) > 1:
        game_name = ' '.join(sys.argv[1:])
        result = fetch_hltb_data(game_name)
        if result:
            print(json.dumps(result))
        else:
            print(json.dumps(None))
    else:
        print(json.dumps(None))
