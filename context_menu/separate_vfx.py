import os
import sys
import re
from pathlib import Path

# Setup Project Paths
current_dir = Path(__file__).parent.absolute()
project_root = current_dir.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(current_dir))

try:
    import pyRitoFile
    from pyRitoFile.bin import BIN, BINHasher
except ImportError:
    print("Error: Could not import pyRitoFile.")
    sys.exit(1)

def separate_vfx():
    if len(sys.argv) < 2: return
    main_bin_path = Path(sys.argv[1]).absolute()
    
    # 1. Determine Skin Root
    root_dir = main_bin_path.parent
    temp = main_bin_path.parent
    while temp.parent != temp:
        if temp.name.lower() == 'data':
            root_dir = temp.parent
            break
        temp = temp.parent

    print(f"--- CONTENT-BASED VFX SEPARATION ---")

    # Get VFX type hash as both int and string for comparison
    vfx_type_str = BINHasher.raw_to_hex('VfxSystemDefinitionData')
    vfx_type_int = int(vfx_type_str, 16)
    print(f"  VFX Type Hash: {vfx_type_str} (int: {vfx_type_int})")

    all_vfx_entries = []
    managed_hashes = set()
    
    # List of files to scan (Main bin + all bins in root)
    files_to_scan = [main_bin_path]
    files_to_scan.extend(list(root_dir.glob("*.bin")))
    
    bins_changed = []

    for f_path in files_to_scan:
        try:
            b = BIN().read(str(f_path))
            non_vfx = []
            extracted_count = 0
            
            for e in b.entries:
                # Compare as int or string
                is_vfx = (e.type == vfx_type_int) or (e.type == vfx_type_str)
                if is_vfx:
                    h = getattr(e, 'hash', '')
                    if h not in managed_hashes:
                        all_vfx_entries.append(e)
                        managed_hashes.add(h)
                        extracted_count += 1
                else:
                    non_vfx.append(e)
            
            if extracted_count > 0:
                print(f"  [EXTRACT] {extracted_count} VFX from {f_path.name}")
                b.entries = non_vfx
                # We save it back (emptying the file of VFX)
                b.write(str(f_path))
                bins_changed.append(f_path)
        except:
            continue

    if not all_vfx_entries:
        print("No VFX systems found in any bin.")
        return

    # Create the new VFX bin
    vfx_name = f"{main_bin_path.stem}_vfx.bin"
    vfx_path = root_dir / 'data' / vfx_name
    vfx_path.parent.mkdir(parents=True, exist_ok=True)
    
    vfx_bin = BIN(signature='PROP', version=3, is_patch=False, links=[], entries=all_vfx_entries, patches=[])
    vfx_bin.write(str(vfx_path))
    
    # Update main bin with the link
    main_bin = BIN().read(str(main_bin_path))
    link_str = f"data/{vfx_name}"
    if link_str not in main_bin.links:
        main_bin.links.append(link_str)
    main_bin.write(str(main_bin_path))
    
    print(f"\n[OK] SUCCESS: Created data/{vfx_name} with {len(all_vfx_entries)} systems.")

if __name__ == "__main__":
    separate_vfx()
