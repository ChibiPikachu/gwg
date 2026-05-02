import sys
import json
from howlongtobeatpy import HowLongToBeat

def search_game(game_name):
    try:
        # 0.0 threshold returns all results
        results = HowLongToBeat(0.0).search(game_name, similarity_case_sensitive=False)
        
        if results and len(results) > 0:
            # Grab the best match based on similarity
            best = max(results, key=lambda element: element.similarity)
            
            def format_time(t):
                if t is None or t <= 0: return "0"
                return str(int(round(t)))
                
            out = {
                "main_story": format_time(best.main_story),
                "main_extra": format_time(best.main_extra),
                "completionist": format_time(best.completionist),
                "id": best.game_id,
                "name": best.game_name
            }
            print(json.dumps(out))
        else:
            print(json.dumps(None))
    except Exception as e:
        print(json.dumps(None))

if __name__ == '__main__':
    if len(sys.argv) > 1:
        search_game(sys.argv[1])
