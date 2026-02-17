import os
import sys
import re
import shutil
import tempfile
from pathlib import Path
from copy import deepcopy

# Setup Project Paths
current_dir = Path(__file__).parent.absolute()
sys.path.insert(0, str(current_dir))

try:
    import pyRitoFile
    from pyRitoFile.bin import BIN, BINEntry, BINField, BINType, BINHasher
except ImportError as e:
    print(f"Error: Could not import pyRitoFile. {e}")
    sys.exit(1)


# ── Hash helpers ──────────────────────────────────────────────────────────────

def h(name: str) -> str:
    """Shorthand: get the FNV1a hex hash of a string."""
    return BINHasher.raw_to_hex(name)


# Pre-compute commonly used hashes
H_VFX_SYS_TYPE           = h('VfxSystemDefinitionData')
H_COMPLEX_EMITTER_DATA   = h('complexEmitterDefinitionData')
H_EMITTER_NAME           = h('emitterName')
H_PARTICLE_NAME          = h('particleName')
H_PARTICLE_PATH          = h('particlePath')
H_IS_SINGLE_PARTICLE     = h('isSingleParticle')
H_CHILD_PARTICLE_SET_DEF = h('childParticleSetDefinition')
H_CHILDREN_IDENTIFIERS   = h('childrenIdentifiers')
H_EFFECT                 = h('effect')
H_BIND_WEIGHT            = h('bindWeight')
H_PARTICLE_IS_LOCAL      = h('particleIsLocalOrientation')
H_RATE                   = h('rate')
H_CONSTANT_VALUE         = h('constantValue')

H_VFX_CHILD_PARTICLE_SET = h('VfxChildParticleSetDefinitionData')
H_VFX_CHILD_IDENTIFIER   = h('VfxChildIdentifier')
H_VFX_EMITTER_DEF        = h('VfxEmitterDefinitionData')
H_VALUE_FLOAT            = h('ValueFloat')


# ── Building blocks ──────────────────────────────────────────────────────────

def make_trigger_emitter(trigger_name: str, emitter_name_original: str, count: int) -> BINField:
    """
    Build a trigger emitter (POINTER to VfxEmitterDefinitionData).
    """
    effect_link_hash = h(trigger_name)

    child_identifier = BINField(
        hash=None,
        type=BINType.EMBED,
        hash_type=H_VFX_CHILD_IDENTIFIER,
        data=[
            BINField(hash=H_EFFECT, type=BINType.LINK, data=effect_link_hash),
        ]
    )

    children_identifiers = BINField(
        hash=H_CHILDREN_IDENTIFIERS,
        type=BINType.LIST,
        value_type=BINType.EMBED,
        data=[child_identifier]
    )

    child_particle_set = BINField(
        hash=H_CHILD_PARTICLE_SET_DEF,
        type=BINType.POINTER,
        hash_type=H_VFX_CHILD_PARTICLE_SET,
        data=[children_identifiers]
    )

    is_single = BINField(hash=H_IS_SINGLE_PARTICLE, type=BINType.FLAG, data=1)

    bind_weight = BINField(
        hash=H_BIND_WEIGHT,
        type=BINType.EMBED,
        hash_type=H_VALUE_FLOAT,
        data=[BINField(hash=H_CONSTANT_VALUE, type=BINType.F32, data=1.0)]
    )

    local_orient = BINField(hash=H_PARTICLE_IS_LOCAL, type=BINType.FLAG, data=1)

    rate = BINField(
        hash=H_RATE,
        type=BINType.EMBED,
        hash_type=H_VALUE_FLOAT,
        data=[BINField(hash=H_CONSTANT_VALUE, type=BINType.F32, data=1.0)]
    )

    trigger_emitter_name = BINField(
        hash=H_EMITTER_NAME,
        type=BINType.STRING,
        data=f"Trigger_{count}_{emitter_name_original}"
    )

    trigger_emitter = BINField(
        hash=None,
        type=BINType.POINTER,
        hash_type=H_VFX_EMITTER_DEF,
        data=[
            is_single,
            child_particle_set,
            bind_weight,
            local_orient,
            rate,
            trigger_emitter_name,
        ]
    )

    return trigger_emitter


def make_wrapper_system(trigger_name: str, original_emitter: BINField) -> BINEntry:
    """
    Create a new VfxSystemDefinitionData entry that wraps a single emitter.
    """
    emitter_list = BINField(
        hash=H_COMPLEX_EMITTER_DATA,
        type=BINType.LIST,
        value_type=BINType.POINTER,
        data=[original_emitter]
    )

    particle_name = BINField(
        hash=H_PARTICLE_NAME,
        type=BINType.STRING,
        data=trigger_name
    )

    particle_path = BINField(
        hash=H_PARTICLE_PATH,
        type=BINType.STRING,
        data=trigger_name
    )

    entry = BINEntry(
        hash=h(trigger_name),
        type=H_VFX_SYS_TYPE,
        data=[emitter_list, particle_name, particle_path]
    )

    return entry


# ── Extraction helpers ───────────────────────────────────────────────────────

def get_emitter_name(emitter_pointer: BINField) -> str:
    """Extract the emitterName string from a VfxEmitterDefinitionData pointer."""
    if emitter_pointer.data is None:
        return None
    for field in emitter_pointer.data:
        if field.hash == H_EMITTER_NAME and field.type == BINType.STRING:
            return field.data
    return None


def get_system_short_name(entry: BINEntry) -> str:
    """Get a short name from the VfxSystem."""
    name = None
    for field in entry.data:
        if field.hash == H_PARTICLE_NAME and field.type == BINType.STRING:
            name = field.data
            break
        if field.hash == H_PARTICLE_PATH and field.type == BINType.STRING:
            name = field.data

    if not name:
        return entry.hash[:8]

    short = name.split('/')[-1] if '/' in name else name
    short = re.sub(r'^[A-Za-z]+_(Base_|Skin\d+_)', '', short)

    if len(short) > 25:
        short = short[:25]

    return short


def get_emitter_list_field(entry: BINEntry) -> BINField:
    """Get the complexEmitterDefinitionData field."""
    for field in entry.data:
        if field.hash == H_COMPLEX_EMITTER_DATA:
            return field
    return None


# ── Main logic ───────────────────────────────────────────────────────────────

def batch_split_vfx():
    if len(sys.argv) < 2:
        print("Usage: batch_split_vfx.py <path_to_bin>")
        input("\nPress Enter to exit...")
        return

    bin_path = Path(sys.argv[1]).absolute()
    print("="*60)
    print("!!! WARNING !!!".center(60))
    print("="*60)
    print("\nAre you sure what you are doing?")
    print("This script is meant to make VFX separated to watch them")
    print("in replay with League Director.")
    print("\nCRITICAL: Once you close the replay and start actually")
    print("working on the skin, RESTORE THE BACKUP.")
    print("-" * 60)
    
    confirm = input("\nType 'yes' (exactly) to proceed: ").strip().lower()
    if confirm != 'yes':
        print("\nAborted. No changes made.")
        input("\nPress Enter to exit...")
        return

    print(f"\nTarget BIN: {bin_path.name}")
    
    # ── Backup Logic ─────────────────────────────────────────────────────────
    try:
        # 1. Backup to Temp Folder
        temp_dir = Path(tempfile.gettempdir())
        temp_backup_path = temp_dir / f"{bin_path.stem}_quartz_temp_{os.getpid()}.bin"
        shutil.copy2(bin_path, temp_backup_path)
        print(f"[BACKUP] Safety copy created in Temp: {temp_backup_path}")

        # 2. Local Backup with _backup suffix
        local_backup_path = bin_path.parent / f"{bin_path.stem}_backup.bin"
        shutil.copy2(bin_path, local_backup_path)
        print(f"[BACKUP] Local copy created: {local_backup_path.name}")
    except Exception as e:
        print(f"\n[ERROR] Failed to create backups: {e}")
        input("\nPress Enter to exit (Safe state: No changes made)...")
        return

    # ── Processing ───────────────────────────────────────────────────────────
    try:
        bin_file = BIN().read(str(bin_path))
    except Exception as e:
        print(f"\n[ERROR] Reading BIN failed: {e}")
        input("\nPress Enter to exit...")
        return

    vfx_entries = [e for e in bin_file.entries if e.type == H_VFX_SYS_TYPE]

    if not vfx_entries:
        print("\nNo VFX systems found in this BIN.")
        input("\nPress Enter to exit...")
        return

    print(f"\nProcessing {len(vfx_entries)} systems...")

    new_entries = []
    total_emitters = 0

    for sys_entry in vfx_entries:
        short_name = get_system_short_name(sys_entry)
        emitter_field = get_emitter_list_field(sys_entry)

        if not emitter_field or not emitter_field.data:
            continue

        triggers = []
        for idx, original_emitter in enumerate(emitter_field.data):
            emitter_name = get_emitter_name(original_emitter) or f"Emitter_{idx + 1}"
            trigger_name = f"REC_{short_name}_{emitter_name}"

            trigger = make_trigger_emitter(trigger_name, emitter_name, idx + 1)
            triggers.append(trigger)

            wrapper = make_wrapper_system(trigger_name, deepcopy(original_emitter))
            new_entries.append(wrapper)
            total_emitters += 1

        emitter_field.data = triggers

    bin_file.entries.extend(new_entries)
    bin_file.write(str(bin_path))

    print(f"\n{'='*50}")
    print(f"[OK] SUCCESS!")
    print(f"  Emitters split:    {total_emitters}")
    print(f"  New entries added: {len(new_entries)}")
    print(f"\nALL DONE! Remember to restore '{local_backup_path.name}'")
    print("when you finish with League Director.")
    print('='*50)
    
    input("\nSplit complete. Press Enter to exit...")


if __name__ == "__main__":
    batch_split_vfx()

