import os
import sys
import re
import json
from pathlib import Path

# Setup Project Paths
current_dir = Path(__file__).parent.absolute()
project_root = current_dir.parent
# Add both project root AND context_menu to path to ensure we can find pyRitoFile wherever it is
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

try:
    import pyRitoFile
    from pyRitoFile.bin import BIN, BINHasher
    try:
        from pyRitoFile.wad import WADHasher
    except ImportError:
        print("Warning: Could not import WADHasher. Hashed bin matching will be disabled.")
        WADHasher = None
except ImportError:
    print("Error: Could not import pyRitoFile.")
    sys.exit(1)

def get_bin_entry_hashes(bin_obj):
    """Return a set of all entry hashes in a BIN."""
    return {getattr(e, 'hash', '') for e in bin_obj.entries}

def combine_linked():
    if len(sys.argv) < 2: return
    main_bin_path = Path(sys.argv[1]).absolute()
    
    # 1. Determine Skin Root (Parent of 'data')
    root_dir = main_bin_path.parent
    temp = main_bin_path.parent
    while temp.parent != temp:
        if temp.name.lower() == 'data':
            root_dir = temp.parent
            break
        temp = temp.parent

    print(f"--- CONTENT-BASED MERGE ---")
    print(f"Main BIN: {main_bin_path.name}")
    print(f"Scanning Root: {root_dir}")

    # 2. Read Main BIN
    main_bin = BIN().read(str(main_bin_path))
    main_entry_hashes = get_bin_entry_hashes(main_bin)
    
    # 3. Detect champ name to skip base bin
    champ_name = None
    match = re.search(r'/characters/([^/]+)/', main_bin_path.as_posix(), re.IGNORECASE)
    if match: champ_name = match.group(1).lower()

    merged_files = []

    # Load hashed_files.json from root_dir (maps hashed filename -> original path)
    # This is created during WAD extraction and tells us which hashed .bin files map to which paths
    hashed_files_map = {}  # hashed_filename (without .bin) -> original_path
    path_to_hash = {}      # original_path -> hashed_filename (without .bin)

    hashed_json_path = root_dir / "hashed_files.json"
    if hashed_json_path.exists():
        try:
            with open(hashed_json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for hashed_name, orig_path in data.items():
                    # hashed_name is like "38bfb361f6e60b7b.bin"
                    # orig_path is like "data/akali_skins_skin0_skins_skin1_...bin"
                    h = hashed_name.replace('.bin', '').lower()
                    p = orig_path.lower().replace('\\', '/')
                    hashed_files_map[h] = p
                    path_to_hash[p] = h
                print(f"  Loaded {len(data)} entries from hashed_files.json")
        except Exception as e:
            print(f"  Failed to load hashed_files.json: {e}")
    else:
        print("  No hashed_files.json found (files may not be hashed)")

    # 4. Find bins via LINKS (Smart Scan)
    # ... (Keep existing Link check logic) ...
    files_to_process = []
    processed_paths = set()
    
    # Helper to check if a file is the base bin
    def is_base_bin(p):
        return champ_name and p.name.lower() == f"{champ_name}.bin"

    # Helper to check if file is main bin
    def is_main_bin(p):
        return p.resolve() == main_bin_path.resolve()

    # 4a. Check explicitly linked files
    print(f"\n--- LINKED BINS ({len(main_bin.links)} links) ---")
    for link in main_bin.links:
        # Skip non-bin links
        if not link.lower().endswith('.bin'):
            continue

        link_name = Path(link).name
        normalized_link = link.lower().replace('\\', '/')

        candidates = [
            (root_dir / link_name, "name"),
            (root_dir / link, "path"),
        ]

        # Try to find hash from loaded hashtables (reverse lookup)
        hashed_name = None
        if normalized_link in path_to_hash:
            hashed_name = path_to_hash[normalized_link] + ".bin"
            candidates.append((root_dir / hashed_name, "hash-lookup"))

        # Fallback: compute hash if WADHasher available
        if WADHasher and not hashed_name:
            hashed_name = WADHasher.raw_to_hex(normalized_link) + ".bin"
            candidates.append((root_dir / hashed_name, "hash-computed"))

        print(f"  Link: {link}")
        if hashed_name:
            print(f"    -> Hash: {hashed_name}")

        found = False
        for cand, method in candidates:
            if cand.exists() and cand.is_file():
                if cand.resolve() not in processed_paths:
                    if not is_base_bin(cand) and not is_main_bin(cand):
                        print(f"    -> Found via {method}: {cand.name}")
                        files_to_process.append((cand, link))
                        processed_paths.add(cand.resolve())
                        found = True
                    break

        if not found and WADHasher:
            print(f"    -> NOT FOUND") 

    links_to_remove = set()

    for f, original_link in files_to_process:
        try:
            # Open the bin
            mystery_bin = BIN().read(str(f))
            
            # Check if this bin has "new" entries we don't have yet
            new_entries = []
            for e in mystery_bin.entries:
                h = getattr(e, 'hash', '')
                if h and h not in main_entry_hashes:
                    new_entries.append(e)
            
            if new_entries:
                print(f"  [MERGE] Found {len(new_entries)} relevant entries in {f.name}")
                if original_link:
                    print(f"          (Matched via link: {original_link})")
                
                main_bin.entries.extend(new_entries)
                # Update our tracking set
                for e in new_entries:
                    main_entry_hashes.add(getattr(e, 'hash', ''))
                
                merged_files.append(f)
                if original_link:
                    links_to_remove.add(original_link)
        except Exception as e:
            print(f"  [Error] Failed to merge {f.name}: {e}")
            continue

    if not merged_files:
        print("No matching content found to merge.")
        return

    # 5. Save and Cleanup
    # Filter links: Keep those NOT merged
    new_links = []
    for link in main_bin.links:
        if link in links_to_remove:
            continue
        is_champ_bin = champ_name and f"{champ_name}.bin" in link.lower()
        is_non_bin = '/' in link and not link.endswith('.bin')
        
        if is_champ_bin or is_non_bin:
            new_links.append(link)
    main_bin.links = new_links
    
    main_bin.write(str(main_bin_path))

    for f in merged_files:
        try: os.remove(str(f))
        except: pass

    print(f"\n[OK] SUCCESS: Combined {len(merged_files)} files into {main_bin_path.name}")

if __name__ == "__main__":
    combine_linked()
