# 4.1.5 is a hotfix for Port.

## Fixes

- Fixed the big one: if you loaded a new donor and ported, you could get emitters from the **previous** donor mixed in. A system with 12 emitters would come out with 14. Quartz now clears the old donor properly, and if anything is ever out of sync it tells you to re-select instead of porting the wrong thing.
- Fixed searching in Port. Typing something like "Q_tar" listed a pile of unrelated systems because it was also matching texture names. Name matches now come first, and texture search still works when nothing matches by name.

ty to froggles for report

Thank you for testing Quartz. Please report any remaining issues on GitHub.
