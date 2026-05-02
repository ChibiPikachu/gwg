# api/hltb_bridge.py
from http.server import BaseHTTPRequestHandler
from howlongtobeatpy import HowLongToBeat
import json
import re
from urllib.parse import urlparse, parse_qs
from datetime import datetime

def _hltb_clean_name(name):
    name = name[:500]
    name = re.sub(r'[®™©]', '', name)
    if name.endswith(')') and len(name) >= 6 and name[-6] == '(' and name[-5:-1].isdigit():
        name = name[:-6].rstrip()
    name = re.sub(r'[^\w\s]', ' ', name)
    name = re.sub(r'\bsokpop\s+s\d+\b', '', name, flags=re.IGNORECASE)
    name = re.sub(r'\s{2,}', ' ', name)
    return name.strip()

def _hours_to_minutes(val):
    if val is None or val < 0:
        return None
    return int(round(val * 60))

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        game_name = query.get('name', [None])[0]
        threshold = int(query.get('threshold', [75])[0])

        if not game_name:
            self.send_response(400)
            self.end_headers()
            return

        try:
            # Logic extracted exactly from Source 5
            cleaned = _hltb_clean_name(game_name)
            results = HowLongToBeat(0.0).search(cleaned, similarity_case_sensitive=False)
            
            best = None
            score = 0
            if results:
                best = max(results, key=lambda r: r.similarity)
                score = int(round(best.similarity * 100))

            if not best or score < threshold:
                data = {"hltb_fetched": "no_match", "hltb_id": None}
            else:
                today = datetime.now().strftime('%Y-%m-%d')
                data = {
                    'hltb_id': best.game_id,
                    'hltb_matched_name': best.game_name,
                    'hltb_main': _hours_to_minutes(best.main_story),
                    'hltb_extras': _hours_to_minutes(best.main_extra),
                    'hltb_completionist': _hours_to_minutes(best.completionist),
                    'hltb_match_score': score,
                    'hltb_fetched': today,
                }

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())

        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode())