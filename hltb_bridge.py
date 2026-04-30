import sys
import json
import asyncio
from howlongtobeatpy import HowLongToBeat

async def search_game(game_name):
    try:
        # Initialize and search
        # If your version of the library is synchronous, remove 'await'
        results = await HowLongToBeat().search(game_name)
        
        if results:
            # Find the best match
            best = max(results, key=lambda element: element.similarity)
            
            def format_time(t):
                # Ensure t is a number before rounding
                try:
                    if t is None or float(t) <= 0: return "--"
                    return f"{int(round(float(t)))} Hours"
                except (ValueError, TypeError):
                    return "--"
                
            out = {
                "hastily": format_time(best.main_story),
                "normally": format_time(best.main_extra),
                "completionist": format_time(best.completionist),
            }
            print(json.dumps(out))
        else:
            print(json.dumps(None))
    except Exception:
        print(json.dumps(None))

if __name__ == '__main__':
    if len(sys.argv) > 1:
        game_query = " ".join(sys.argv[1:])
        asyncio.run(search_game(game_query))