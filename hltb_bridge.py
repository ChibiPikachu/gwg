# api/hltb_bridge.py
from http.server import BaseHTTPRequestHandler
import json
import re
from urllib.parse import urlparse, parse_qs
from datetime import datetime
from howlongtobeatpy import HowLongToBeat # Ensure this is in requirements.txt

# ... keep your existing _hours_to_minutes, _hltb_clean_name, 
# and _hltb_strip_edition functions exactly as they are in[cite: 9] ...

def fetch_hltb_data(name, threshold=75):
    # ... keep your existing fetch_hltb_data logic exactly as it is in[cite: 9] ...
    # (Copy the entire function body here)

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        game_name = query.get('name', [None])[0]
        
        if not game_name:
            self.send_response(400)
            self.end_headers()
            return

        result = fetch_hltb_data(game_name)
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())