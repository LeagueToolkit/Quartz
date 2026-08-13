# 4.2.0

## What's new

- **Open the current bin in RubyRe.** A Ruby button sits next to the Jade hand-off in the title bar and sends whatever bin you have open straight across. If RubyRe is not installed, you get a short explainer and a download link instead of a launch error.
- **Name your mod folder when extracting.** The Asset Extractor's repath step now has a Folder name field, so you can call the finished mod what you want instead of living with the generated `<champ>_skin<N>_extracted`. Leave it blank to keep the old name. Single-skin runs only, since one name cannot serve several skins without colliding.
- **Remove Black, for full black chroma support.** Textures authored for an additive blend mode rely on it dropping black for free. Move one to a blend mode that does not, and all that black shows up as solid instead of empty. Remove Black fades the black out into the alpha channel so the texture works on BlendMode 1, which is what makes proper black chromas possible. It fades rather than hard-cutting, so soft glow edges stay smooth instead of going jagged, and it weights the channels the way the eye sees them so saturated blues do not survive as grey haze. It overwrites in place with no undo and is not idempotent, so it confirms first and tells you how many files it will touch.
- **Set the blend mode on many emitters at once, in Paint.** Pick a mode and apply it to everything you have selected in one step, as a single undo. It pairs with Select BM: grab every emitter already on one mode, then move the whole lot to another. Locked systems are skipped, the same as the other bulk operations.

## Fixes

- **Bulk-editing Lifetime works again.** Multiplying or setting Lifetime failed with "Type mismatch: node is option, edit value is f32" and changed nothing. Lifetime is stored as an optional value, and the bulk path was writing a plain number into it. Editing the field one emitter at a time was always fine, which is why this only showed up from the toolbar.
- **Bulk changes show up immediately in Paint.** Blend mode and color values kept displaying the old number after a bulk edit until you scrolled the row off screen and back.
- **Shared particle textures no longer go missing when repathing.** When a champion and its subcharacter both used the same texture, the first one moved the file into its own folder and the second was left pointing at a path that no longer existed. Locke and LockeTotem were the case that surfaced this.

Thank you for testing Quartz. Please report any remaining issues on GitHub.
