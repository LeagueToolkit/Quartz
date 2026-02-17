
import os
import sys
import re
from pathlib import Path

# Setup Project Paths
project_root = Path(r'C:\Users\Frog\Desktop\Projects coding\Quartz-main')
# Add both project root AND context_menu to path
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))
if str(project_root / 'context_menu') not in sys.path:
    sys.path.insert(0, str(project_root / 'context_menu'))

try:
    import pyRitoFile
    from pyRitoFile.bin import BIN
except ImportError:
    print("Error: Could not import pyRitoFile.")
    sys.exit(1)

def clean_unused_vfx():
    if len(sys.argv) < 2: 
        print("Usage: clean_unused_vfx.py <path_to_bin>")
        return
        
    bin_path = Path(sys.argv[1]).absolute()
    print(f"--- CLEAN UNUSED VFX ---")
    print(f"Target BIN: {bin_path.name}")
    
    # 1. Load Hash Tables
    hashtables = {}
    hashes_path = Path(os.getenv('APPDATA')) / "FrogTools" / "hashes"
    
    hash_files = ['hashes.game.txt', 'hashes.binentries.txt']
    
    print(f"Loading hashes from: {hashes_path}")
    if hashes_path.exists():
        for hf_name in hash_files:
            hf_path = hashes_path / hf_name
            if hf_path.exists():
                try:
                    with open(hf_path, 'r', encoding='utf-8', errors='ignore') as f:
                        count = 0
                        for line in f:
                            parts = line.strip().split(' ', 1)
                            if len(parts) == 2:
                                hashtables[parts[0].lower()] = parts[1].lower()
                                count += 1
                        print(f"  Loaded {count} hashes from {hf_name}")
                except Exception as e:
                    print(f"  Failed to load {hf_name}: {e}")
    else:
        print("  Hashes directory not found. Cannot verify entries without hashes.")
        return

    # 2. Read BIN
    try:
        bin_file = BIN().read(str(bin_path))
    except Exception as e:
        print(f"Error reading BIN: {e}")
        return

    # 3. Find ResourceResolver
    resource_resolver = None
    # Hashes for ResourceResolver (VfxResourceResolver)
    rr_hashes = [
        0x99566601, # ResourceResolver
        0xf24766db, # VfxResourceResolver 
        0x5f9a6e19  
    ]
    
    # First, try to find by direct hash match
    for e in bin_file.entries:
        if isinstance(e.type, int) and e.type in rr_hashes:
            resource_resolver = e
            # Resolve the type hash to a name for printing
            type_hash_str = f"{e.type:08x}"
            resolved_type = hashtables.get(type_hash_str, "Unknown")
            print(f"  [FOUND] ResourceResolver (Type: {resolved_type} | Hash: {type_hash_str})")
            break
            
    if not resource_resolver:
        # 3. Find ResourceResolver by RESOLVING NAMES
        print(f"  Scanning {len(bin_file.entries)} entries...")
        
        # We loop through ALL entries and check their resolved name
        for e in bin_file.entries:
            resolved_type = ""
            type_hash_str = ""

            # Handle STRING types (no format needed)
            if isinstance(e.type, str):
                 resolved_type = e.type
                 type_hash_str = "String"
            # Handle INT types (format as hex)
            elif isinstance(e.type, int):
                 type_hash_str = f"{e.type:08x}"
                 resolved_type = hashtables.get(type_hash_str, "")
            
            # Check if this is the ResourceResolver
            if "ResourceResolver" in resolved_type:
                resource_resolver = e
                print(f"  [FOUND] ResourceResolver (Type: {resolved_type} | Hash: {type_hash_str})")
                break
            
    if not resource_resolver:
        print("  [Error] Could not find 'ResourceResolver' in BIN entries.")
        print("  Dumping first 10 entry types to debug:")
        for i, e in enumerate(bin_file.entries[:10]):
            if isinstance(e.type, str):
                print(f"    {e.type} (string)")
            else:
                h = f"{e.type:08x}"
                print(f"    {h} -> {hashtables.get(h, 'Unknown')}")
        return

    # 4. Collect Registered VFX Paths
    registered_vfx_paths = set()
    found_map = False
    
    for field in resource_resolver.data:
        if field.type == pyRitoFile.bin.BINType.MAP:
            found_map = True
            print(f"  Scanning resourceMap with {len(field.data)} entries...")
            for key, value in field.data.items():
                if isinstance(value, str):
                    # Store normalized path
                    registered_vfx_paths.add(value.lower().replace('\\', '/'))
            break
            
    if not found_map:
        print("  [Error] Could not find resourceMap in ResourceResolver.")
        return
        
    print(f"  Identified {len(registered_vfx_paths)} registered VFX paths.")
    
    # 5. Identify and Remove Unused VfxSystemDefinitionData
    entries_to_remove = []
    vfx_entries_count = 0
    kept_count = 0
    
    for e in bin_file.entries:
        # Resolve entry type name
        type_name = ""
        type_hash_str = ""
        
        if isinstance(e.type, str):
            type_name = e.type
        elif isinstance(e.type, int):
            type_hash_str = f"{e.type:08x}"
            type_name = hashtables.get(type_hash_str, "")
        
        # Check if this is a VfxSystemDefinitionData
        if "VfxSystemDefinitionData" in type_name:
            vfx_entries_count += 1
            
            # Resolve Entry Hash -> Name (the system name)
            resolved_name = ""
            e_hash_val = e.hash
            
            if isinstance(e_hash_val, str):
                resolved_name = e_hash_val
            elif isinstance(e_hash_val, int):
                e_hash_str = f"{e_hash_val:08x}"
                resolved_name = hashtables.get(e_hash_str)
            
            is_used = False
            if resolved_name:
                clean_resolved = resolved_name.lower().replace('\\', '/')
                if clean_resolved in registered_vfx_paths:
                    is_used = True
                    kept_count += 1
                else:
                    # Found name, but not in resolver list
                    pass 
            else:
                # Hash unknown - treat as unused?
                pass

            if not is_used:
                entries_to_remove.append(e)

    if entries_to_remove:
        print(f"  Removing {len(entries_to_remove)} unused entries (Kept {kept_count}/{vfx_entries_count})")
        for e in entries_to_remove:
            bin_file.entries.remove(e)
            
        bin_file.write(str(bin_path))
        print(f"\n✓ SUCCESS: Cleaned unused VFX systems from {bin_path.name}")
    else:
        print("\n  No unused VFX systems found. File is clean.")

if __name__ == "__main__":
    clean_unused_vfx()
