import sys
import json
from howlongtobeatpy import HowLongToBeat

def main():
    try:
        game_name = sys.argv[1]
        results = HowLongToBeat().search(game_name)
        if results:
            best_element = max(results, key=lambda element: element.similarity)
            print(json.dumps({
                "main": best_element.main_extra, # or gameplay_main
                "mainExtra": best_element.main_extra,
                "completionist": best_element.completionist
            }))
        else:
            print(json.dumps(None)) # Ensure valid JSON is always printed
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()