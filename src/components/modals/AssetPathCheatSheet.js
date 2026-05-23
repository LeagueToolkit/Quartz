import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Asset Path Cheat Sheet
 *
 * Reference for where common League assets live across the various WAD
 * archives. Content sourced from the Obsidian WAD extraction cheat sheet
 * by Aropatnik (Feb 14 2026) and adapted to a structured form here. Each
 * "Show WAD" pill navigates to WAD Explorer so the user can dig into the
 * specific archive.
 */

// Each entry: { label, wad?, path?, note? }
// `wad` enables the "Show WAD" pill (the WAD filename, e.g. "Map11.wad.client").
// `path` is the in-archive sub-path (informational, monospace styled).
const SECTIONS = [
  {
    id: 'maps',
    title: 'Map & Mode WADs',
    intro: 'Per-map content lives in its own WAD. Several modes share Companions.wad.client.',
    entries: [
      { label: "Summoner's Rift", wad: 'Map11.wad.client' },
      { label: 'ARAM (Howling Abyss)', wad: 'Map12.wad.client' },
      { label: 'Nexus Blitz', wad: 'Map21.wad.client' },
      { label: 'TFT — main', wad: 'Map22.wad.client' },
      { label: 'TFT — per-set', wad: 'TFTSetXX.wad.client', note: 'Replace XX with the current set number.' },
      { label: 'Arena', wad: 'Map30.wad.client' },
      { label: 'Swarm', wad: 'Map33.wad.client' },
      { label: 'Brawl', wad: 'Map35.wad.client' },
      { label: 'Companions (Little Legends / Followers)', wad: 'Companions.wad.client', note: 'Also used by ARAM.' },
    ],
    footer: 'Ye Olde Map IDs: Dominion was Map8 (ODIN), Twisted Treeline was Map10 (TT).',
  },
  {
    id: 'ui-fonts',
    title: 'UI, Cursor & Fonts',
    entries: [
      { label: 'Cursor', wad: 'Ui.wad.client', path: 'assets/ux/cursors/', note: '.tga files (GIMP edits natively).' },
      { label: 'Fonts', wad: 'Ui.wad.client', path: 'assets/ux/fonts/' },
      { label: 'Random HUD icons (non-champion-specific)', wad: 'Ui.wad.client', note: 'Search for "atlas".' },
      { label: 'Loading-screen borders + spinner', wad: 'Ui.wad.client', path: 'assets/ux/loadingscreen/' },
      { label: 'Healthbar color, CC icons, Yuumi, ammo, revive', wad: 'Ui.wad.client', path: 'assets/ux/floatinghealthbars/' },
    ],
  },
  {
    id: 'items',
    title: 'Items',
    entries: [
      { label: 'Item icons', wad: 'Global.wad.client', path: 'assets/items/icons2d/', note: 'Remember to edit the two atlases in the autoatlas folder.' },
      { label: 'Item borders', wad: 'Global.wad.client', path: 'assets/items/itemmodifiers/' },
      { label: 'Item shop atlas', wad: 'Ui.wad.client', path: 'assets/ux/itemshop/itemshop_texture_atlas.tex' },
      { label: 'Item shop atlas (alt)', wad: 'Ui.wad.client', path: 'assets/ux/itemshop/itemshop_texture_atlas_3.tex' },
      { label: 'Clarity HUD atlas', wad: 'Ui.wad.client', path: 'assets/ux/lol/clarity_hudatlas.tex' },
      { label: 'Item sounds', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/items_global_audio.bnk' },
    ],
  },
  {
    id: 'spells',
    title: 'Summoner Spells',
    entries: [
      { label: 'Summoner spell icons', wad: 'Data.wad.client', path: 'data/spells/icons2d/summonerXXXXX.dds' },
      { label: 'Twisted Fate W — red card', wad: 'Data.wad.client', path: 'data/spells/icons2d/cardmaster_red.dds' },
      { label: 'Twisted Fate W — blue card', wad: 'Data.wad.client', path: 'data/spells/icons2d/cardmaster_blue.dds' },
      { label: 'Twisted Fate W — gold card', wad: 'TwistedFate.wad.client', path: 'assets/spells/icons2d/cardmaster_gold.dds', note: "Yes, these don't make sense. Disable 'remove unknown' when adding to a single-WAD mod." },
    ],
  },
  {
    id: 'sounds-gameplay',
    title: 'Gameplay Sounds',
    intro: 'All of these also need data/maps/shipping/common/common.bin from Common.wad.client to register the events.',
    entries: [
      { label: 'Killstreaks', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/misc_gameplay_killstreak_sfx_audio.bnk' },
      { label: 'Killstreak events', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/misc_gameplay_killstreak_sfx_events.bnk' },
      { label: 'Level up / summoner / rune / recall sounds', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/misc_gameplay_sfx_audio.bnk' },
      { label: 'Pings, store, chat, "no mana" etc.', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/hud_global_audio.bnk' },
      { label: 'Game-end sounds', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/env_eog_sfx_audio.bnk' },
    ],
  },
  {
    id: 'announcer',
    title: 'Announcer',
    intro: 'MapXX.yy_ZZ.wad.client — replace XX with the map (11=SR, 12=HA) and yy_ZZ with the language (en_US, es_MX, ru_RU…).',
    entries: [
      { label: 'Announcer audio (.wpk)', wad: 'Map11.en_US.wad.client', path: 'assets/sounds/wwise2016/vo/en_US/shared/announcer_global_female1_vo_audio.wpk' },
      { label: 'Announcer events', wad: 'Map11.en_US.wad.client', path: 'assets/sounds/wwise2016/vo/en_US/shared/announcer_global_female1_vo_events.bnk' },
      { label: 'Bin reference', wad: 'Map11.wad.client', path: 'data/maps/shipping/map11/map11.bin' },
    ],
  },
  {
    id: 'minions',
    title: 'Minions, Jungle & Target Dummy',
    entries: [
      { label: "Summoner's Rift minions", wad: 'Map11.wad.client', path: 'assets/characters/sru_<minion>/' },
      { label: "SR minion sounds", wad: 'Map11.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/npc_global_minion_<minion>_sfx_audio.bnk' },
      { label: 'SR jungle pets', wad: 'Map11.wad.client', path: 'assets/characters/sru_jungle_companions/' },
      { label: 'ARAM minions', wad: 'Map12.wad.client', path: 'assets/characters/ha_<minion>/' },
      { label: 'ARAM minion sounds', wad: 'Map12.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/npc_global_minion_<minion>_sfx_audio.bnk' },
      { label: 'Target dummy (practice tool)', wad: 'Map11.wad.client', path: 'assets/characters/practicetool_targetdummy/' },
    ],
  },
  {
    id: 'wards',
    title: 'Wards',
    intro: 'Use lol-db.com/lol-wards/ to find the correct ward skin id. Some wards share animations and skeletons.',
    entries: [
      { label: 'Sight ward (support item)', wad: 'Map11.wad.client', path: 'assets/characters/sightward/' },
      { label: 'Blue trinket', wad: 'Map11.wad.client', path: 'assets/characters/bluetrinket/' },
      { label: 'Yellow trinket', wad: 'Map11.wad.client', path: 'assets/characters/yellowtrinket/' },
      { label: 'Control ward (jammer device)', wad: 'Map11.wad.client', path: 'assets/characters/jammerdevice/' },
      { label: 'Zombie ward (perk)', wad: 'Global.wad.client', path: 'assets/characters/perkszombieward/' },
    ],
  },
  {
    id: 'emotes',
    title: 'Emotes',
    entries: [
      { label: 'Summoner emote assets', wad: 'Global.wad.client', path: 'assets/loadouts/summoneremotes/flairs/' },
      { label: 'Emote SFX audio (.wpk)', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/misc_emotes_sfx_audio.wpk' },
      { label: 'Emote SFX events', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/misc_emotes_sfx_events.bnk' },
      { label: 'Emote VO audio (per language)', wad: 'Common.en_US.wad.client', path: 'assets/sounds/wwise2016/vo/en_us/shared/misc_emotes_vo_audio.wpk' },
      { label: 'Emote VO events', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/vo/en_us/shared/misc_emotes_vo_events.bnk' },
    ],
    footer: 'To find the event behind a particular emote: search the emote name in Global/loadouts/summoneremotes, note the hashed VfxSystem, then search for that hash in Global → open the summoneremotes.<hash>.bin and look for "sound".',
  },
  {
    id: 'loading',
    title: 'Loading Screen',
    entries: [
      { label: 'SR loading background', wad: 'Map11.wad.client', path: 'assets/ux/loadingscreen/' },
      { label: 'ARAM loading background', wad: 'Map12.wad.client', path: 'assets/ux/loadingscreen/' },
      { label: 'Loading screen borders / spinner', wad: 'Ui.wad.client', path: 'assets/ux/loadingscreen/' },
    ],
  },
  {
    id: 'runes-buffs',
    title: 'Runes, Buffs & Map Decor',
    entries: [
      { label: 'Rune VFX', wad: 'Global.wad.client', path: 'assets/perks/' },
      { label: 'Blue buff', wad: 'Global.wad.client', path: 'assets/maps/particles/sr/buff_blue_rocks.tex' },
      { label: 'Blue buff glow', wad: 'Global.wad.client', path: 'assets/maps/particles/sr/jungle_buff_blue_glow.tex' },
      { label: 'Red buff', wad: 'Global.wad.client', path: 'assets/maps/particles/sr/buff_red_branches.tex' },
      { label: 'Red buff glow', wad: 'Global.wad.client', path: 'assets/maps/particles/sr/jungle_buff_red_glow.tex' },
      { label: 'Baron buff (ring/smoke)', wad: 'Map11.wad.client', path: 'assets/shared/particles/ring_soft_02.*.dds + srx_infernal_smoke_trail.*.tex' },
      { label: 'Bush colors (SR)', wad: 'Map11LEVELS.wad.client', path: 'levels/map11/info/' },
      { label: 'Bush colors (ARAM)', wad: 'Map12LEVELS.wad.client', path: 'levels/map12/info/' },
    ],
  },
  {
    id: 'hats',
    title: 'Hats',
    intro: '"Hat" particles are scattered across the global WAD. Just search for "hat" in Global.wad.client.',
    entries: [
      { label: 'Caitlyn skin11 hats', wad: 'Global.wad.client', path: 'assets/characters/caitlyn/skins/skin11/particles/' },
      { label: 'Urgot base hats', wad: 'Global.wad.client', path: 'assets/characters/urgot/skins/base/particles/', note: 'Texture: urgot_base_z_emoteprops.dds' },
      { label: 'Item 3181 hats', wad: 'Global.wad.client', path: 'assets/items/3181/particles/' },
      { label: 'Cherry (Arena) hats', wad: 'Global.wad.client', path: 'assets/maps/particles/cherry/' },
    ],
  },
  {
    id: 'champions',
    title: 'Champions',
    intro: 'Replace <champion> with the lowercase folder name (e.g. ahri, kaisa, monkeyking).',
    entries: [
      { label: 'HUD: ability icons + skin tiles', wad: '<Champion>.wad.client', path: 'assets/characters/<champion>/huds/' },
      { label: '3D model + skeleton + textures + particles + animations', wad: '<Champion>.wad.client', path: 'assets/characters/<champion>/skins/skin<N>/' },
      { label: 'Voiceover (per language)', wad: '<Champion>.en_US.wad.client', path: 'assets/sounds/wwise2016/vo/en_US/characters/<champion>/skins/skin<N>/<champion>_<N>_vo_audio.wpk' },
      { label: 'Sound effects (SFX)', wad: '<Champion>.wad.client', path: 'assets/sounds/wwise2016/sfx/characters/<champion>/skins/skin<N>/<champion>_<N>_sfx_audio.bnk' },
      { label: 'Skin BIN (data root)', wad: '<Champion>.wad.client', path: 'data/characters/<champion>/skins/skin<N>.bin' },
    ],
    footer: 'Some champions ship subcharacters (e.g. nasusult). When in doubt, use the WAD Explorer search to grep the WAD TOC.',
  },
  {
    id: 'profile-icons',
    title: 'Profile Icons',
    entries: [
      { label: 'Summoner profile icons', wad: 'Global.wad.client', path: 'assets/ux/summonericons/' },
    ],
  },
  {
    id: 'misc',
    title: 'Misc, Codenames & Tips',
    intro: 'Internal codenames you may see scattered through filenames.',
    entries: [
      { label: 'ARAM Mayhem augment particles', wad: 'Map12.wad.client', path: 'maps/modespecificdata/kiwi.bin' },
    ],
    footer: [
      'kiwi → ARAM Mayhem',
      'sodapop → 2026 Split 1 Demacia',
      'milkshake → 2025 Winter Rift',
      'ruby → Doombots of Doom',
      'bloom → Spirit Blossom Rift',
      'cherry → Noxus Arena (maybe Arena in general)',
      'boba → Noxus Rift',
      'slime → Nexus Blitz',
      'crepe → Arcane Season 2',
      'strawberry → Swarm PVE event',
      '',
      'Ye Olde Map IDs:  Dominion = Map8 (ODIN),  Twisted Treeline = Map10 (TT).',
    ].join('\n'),
  },
];

const AssetPathCheatSheet = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return SECTIONS;
    return SECTIONS
      .map((section) => {
        const matchesTitle = section.title.toLowerCase().includes(needle)
          || (section.intro || '').toLowerCase().includes(needle);
        const matchingEntries = section.entries.filter((e) =>
          (e.label || '').toLowerCase().includes(needle)
          || (e.wad || '').toLowerCase().includes(needle)
          || (e.path || '').toLowerCase().includes(needle)
          || (e.note || '').toLowerCase().includes(needle)
        );
        if (matchesTitle) return section;
        if (matchingEntries.length === 0) return null;
        return { ...section, entries: matchingEntries };
      })
      .filter(Boolean);
  }, [filter]);

  const goToWad = (wad, innerPath) => {
    // WAD Explorer reads ?wad= and ?path= and (after auto-indexing if needed)
    // opens the group, force-loads the WAD TOC, walks down the inner path
    // expanding each directory, then scrolls the deepest match into view.
    const qp = new URLSearchParams();
    qp.set('wad', wad);
    if (innerPath) qp.set('path', innerPath);
    const target = `/wad-explorer?${qp.toString()}`;
    try {
      window.dispatchEvent(new CustomEvent('celestia:navigate', {
        detail: { path: target },
      }));
    } catch (_) {
      navigate(target);
    }
    onClose?.();
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px',
      }}
    >
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'relative',
          width: '100%', maxWidth: 1040,
          maxHeight: '88vh',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: 16,
          boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            height: 3,
            background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
            backgroundSize: '200% 100%',
            animation: 'shimmer 3s linear infinite',
          }}
        />

        {/* Header */}
        <div style={{ padding: '20px 24px 12px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontSize: '1.05rem', fontWeight: 700,
              color: 'var(--text)', letterSpacing: '0.02em',
            }}>Asset Path Cheat Sheet</h2>
            <div style={{ marginTop: 2, fontSize: '0.74rem', color: 'rgba(255,255,255,0.5)' }}>
              {filtered.length} of {SECTIONS.length} sections
            </div>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter sections, paths or WADs…"
            spellCheck={false}
            style={{
              width: 260,
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              outline: 'none',
            }}
          />
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.65)',
              cursor: 'pointer', fontSize: 14,
            }}
            title="Close"
          >✕</button>
        </div>

        {/* Intro */}
        <div style={{
          margin: '0 24px 14px',
          padding: '10px 14px',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.03)',
          fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5,
        }}>
          <div style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.55)' }}>
            Original cheat sheet by <strong style={{ color: 'var(--accent2)' }}>Aropatnik</strong>. Adapted for Quartz.
          </div>
          <div style={{ marginTop: 4 }}>
            "Show WAD" jumps to WAD Explorer — use its tree to dig into the listed paths. Placeholders like <code style={{ color: 'var(--accent)' }}>&lt;champion&gt;</code> or <code style={{ color: 'var(--accent)' }}>XX</code> need to be replaced for your target.
          </div>
        </div>

        {/* Scrollable section list */}
        <div style={{
          flex: 1, minHeight: 0,
          overflowY: 'auto',
          padding: '0 24px 24px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
              No sections match "{filter}".
            </div>
          )}
          {filtered.map((section) => (
            <Section key={section.id} section={section} onShowWad={goToWad} />
          ))}
        </div>

        {/* Footer credit strip */}
        <div style={{
          padding: '10px 24px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: '0.7rem',
          color: 'rgba(255,255,255,0.4)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--accent2)', display: 'inline-block',
          }} />
          Original cheat sheet by Aropatnik
        </div>
      </div>
    </div>
  );
};

const Section = ({ section, onShowWad }) => {
  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.025)',
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          aria-hidden
          style={{
            width: 4, height: 14, borderRadius: 2,
            background: 'var(--accent2)',
            boxShadow: '0 0 8px color-mix(in srgb, var(--accent2), transparent 50%)',
          }}
        />
        <h3 style={{
          margin: 0, color: 'var(--accent2)',
          fontSize: '0.78rem', fontWeight: 700,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>{section.title}</h3>
      </div>
      {section.intro && (
        <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.55)', fontStyle: 'italic', marginBottom: 10 }}>
          {section.intro}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {section.entries.map((e, i) => (
          <Entry key={i} entry={e} onShowWad={onShowWad} />
        ))}
      </div>
      {section.footer && (
        <div style={{
          marginTop: 10,
          padding: '8px 12px',
          borderRadius: 8,
          background: 'color-mix(in srgb, var(--accent2), transparent 92%)',
          borderLeft: '3px solid var(--accent2)',
          fontSize: '0.74rem',
          color: 'rgba(255,255,255,0.72)',
          whiteSpace: 'pre-line',
          lineHeight: 1.5,
        }}>
          {section.footer}
        </div>
      )}
    </div>
  );
};

const Entry = ({ entry, onShowWad }) => (
  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: '0.78rem', lineHeight: 1.5 }}>
    <span style={{ color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>{entry.label}:</span>
    {entry.wad && (
      <code style={{
        padding: '2px 6px',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.45)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: 'var(--text)',
        fontSize: '0.74rem',
      }}>{entry.wad}</code>
    )}
    {entry.path && (
      <code style={{
        padding: '2px 6px',
        borderRadius: 4,
        background: 'rgba(255,255,255,0.03)',
        border: '1px dashed rgba(255,255,255,0.12)',
        color: 'rgba(255,255,255,0.7)',
        fontSize: '0.72rem',
      }}>{entry.path}</code>
    )}
    {entry.wad && !/[<>]/.test(entry.wad) && (
      <button
        onClick={() => onShowWad(entry.wad, entry.path)}
        style={{
          padding: '2px 10px',
          borderRadius: 999,
          border: '1px solid color-mix(in srgb, var(--accent2), transparent 50%)',
          background: 'color-mix(in srgb, var(--accent2), transparent 82%)',
          color: 'var(--accent2)',
          fontSize: '0.66rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
        title={`Open ${entry.wad} in WAD Explorer`}
      >
        Show WAD
      </button>
    )}
    {entry.note && (
      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem' }}>
        — {entry.note}
      </span>
    )}
  </div>
);

export default AssetPathCheatSheet;
