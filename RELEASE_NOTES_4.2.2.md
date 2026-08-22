# 4.2.2

## Fixes

- **Hash auto-update actually installs now.** The daily hash check downloaded the new database every time and then failed to put it in place, so Quartz stayed on whatever hash snapshot it first installed no matter how long it ran. Windows refuses to replace a memory-mapped file, and one component kept the database mapped for the whole session, so the swap was denied every run and left a stray `data.mdb.tmp` behind. That handle is now released before the swap. If you have never seen your hashes update on their own, this is why.
- **A failed hash check no longer blocks the next one for a day.** The daily cooldown was stamped even when the download errored, so a run that installed nothing still counted as "checked" and every startup for the next 24 hours skipped the check entirely. That is what made the problem above permanent instead of self-correcting, and why downloading by hand in Settings was the only thing that worked. A failed check now retries on the next startup.
- **The hash sync no longer runs twice on startup.** Two copies of the check could start at once and race each other for the same database file, which is what produced the duplicated download and the odd behaviour from the title-bar hash indicator.
- **Mesh textures stay with the mesh again.** Riot moved skin textures from plaintext paths to hashed `file =` references. Consolidate decides what belongs to VFX by reading plaintext paths only, so it stopped recognising those textures as mesh textures and moved them into the skin's particles folder, leaving the model untextured. Seraphine's body and speaker textures were the reported case. Hashed references now count as mesh references, so they are left where the mesh expects them.
- **The model viewer shows textures again.** The same migration hit the preview resolver: the base texture, every per-submesh material override, and the textures reached through a material link were all read as plaintext only, so each one resolved to nothing and submeshes rendered as flat colour. Verified against Ahri and Aatrox, where every texture reference is now hashed.

Thank you for testing Quartz. Please report any remaining issues on GitHub.
