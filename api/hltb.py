# api/hltb.py
from http.server import BaseHTTPRequestHandler
from howlongtobeatpy import HowLongToBeat
import json
from urllib.parse import urlparse, parse_qs

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        game_name = query.get('name', [None])[0]

        if not game_name:
            self.send_response(400)
            return

        results = HowLongToBeat(0.0).search(game_name)
        if results:
            best = max(results, key=lambda x: x.similarity)
            data = {
                "main_story": int(round(best.main_story)) if best.main_story else 0,
                "main_extra": int(round(best.main_extra)) if best.main_extra else 0,
                "completionist": int(round(best.completionist)) if best.completionist else 0,
                "id": best.game_id
            }
        else:
            data = None

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())