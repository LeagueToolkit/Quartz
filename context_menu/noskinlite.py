import os
import sys
import re
from pathlib import Path

# Add project root to sys.path to import pyRitoFile
# Since we are running from context_menu/python/python.exe, 
# and pyRitoFile is in context_menu/pyRitoFile,
# and noskinlite.py is in context_menu/noskinlite.py,
# we need to make sure the paths are correct.
current_dir = Path(__file__).parent.absolute()
sys.path.insert(0, str(current_dir))

try:
    import pyRitoFile
    from pyRitoFile.bin import BIN, BINEntry, BINField, BINType, BINHasher
except ImportError as e:
    print(f"Error: Could not import pyRitoFile libraries. {e}")
    sys.exit(1)

def apply_noskin_lite(source_bin_path, champ_name, source_skin_idx=0, output_root=None):
    if not os.path.exists(source_bin_path):
        print(f"Error: Source BIN not found: {source_bin_path}")
        return

    # Read the bin ONCE
    bin_file = BIN()
    bin_file.read(source_bin_path)

    scdp_type = BINHasher.raw_to_hex('SkinCharacterDataProperties')
    rr_type = BINHasher.raw_to_hex('ResourceResolver')
    mrr_field = BINHasher.raw_to_hex('mResourceResolver')

    # Find base entries
    base_scdp = None
    base_rr = None

    for entry in bin_file.entries:
        if entry.type == scdp_type:
            base_scdp = entry
        elif entry.type == rr_type:
            base_rr = entry

    if not base_scdp:
        print("Error: SkinCharacterDataProperties not found in source BIN")
        return

    champ = champ_name.lower()
    
    # Store original hashes so we can restore them
    original_scdp_hash = base_scdp.hash
    original_rr_hash = base_rr.hash if base_rr else None
    
    # Find mResourceResolver field if it exists
    base_mrr_field = None
    if base_rr:
        for field in base_scdp.data:
            if field.hash == mrr_field:
                base_mrr_field = field
                break
    
    original_mrr_data = base_mrr_field.data if base_mrr_field else None
    
    source_size = os.path.getsize(source_bin_path)
    source_dir = Path(source_bin_path).parent

    for target_idx in range(0, 100):
        # Skip the source file itself
        if target_idx == source_skin_idx:
            continue
            
        out_path = source_dir / f'skin{target_idx}.bin'
        
        # Safety skip: if sizes are DIFFERENT, it's likely a custom mod. 
        # Only overwrite if sizes are IDENTICAL (meaning it was probably cloned by noskinlite before)
        if out_path.exists():
            if out_path.stat().st_size != source_size:
                # print(f"  Skipping skin{target_idx}.bin (different size - custom mod protected)")
                continue

        # Update hashes in-place
        new_scdp_path = f"characters/{champ}/skins/skin{target_idx}"
        base_scdp.hash = BINHasher.raw_to_hex(new_scdp_path.lower())
        
        if base_rr:
            # The link path format (what mResourceResolver points to)
            new_rr_link = f"Characters/{champ}/Skins/Skin{target_idx}/Resources"
            # The entry hash is the hash of the lowercase path
            new_rr_hash = BINHasher.raw_to_hex(new_rr_link.lower())
            base_rr.hash = new_rr_hash
            if base_mrr_field:
                # mResourceResolver is a LINK field - it needs the path string, not hash
                base_mrr_field.data = new_rr_link
        
        # Write the bin with modified hashes
        if output_root:
            bin_file.write(str(out_path))
            print(f"✓ Created/Updated skin{target_idx}.bin")
    
    # Restore original hashes (optional, for cleanliness)
    base_scdp.hash = original_scdp_hash
    if base_rr:
        base_rr.hash = original_rr_hash
    if base_mrr_field:
        base_mrr_field.data = original_mrr_data

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python noskinlite.py <path_to_bin>")
        sys.exit(1)
        
    target_bin = sys.argv[1]
    
    # Try to detect champ and skin from path
    normalized_path = target_bin.replace('\\', '/')
    match = re.search(r'/characters/([^/]+)/skins/skin(\d+)', normalized_path, re.IGNORECASE)
    
    if match:
        champ_name = match.group(1)
        skin_idx = int(match.group(2))
    else:
        # Fallback if path doesn't match standard
        print("Warning: Path structure abnormal. Using filename for detection.")
        champ_name = "unknown"
        skin_idx = 0
    
    print(f"Running NoSkinLite for {champ_name} (Skin {skin_idx})")
    apply_noskin_lite(target_bin, champ_name, skin_idx, output_root=True)
    print(f"\n✓ Patching complete! Created 99 skin bins in {Path(target_bin).parent}")
