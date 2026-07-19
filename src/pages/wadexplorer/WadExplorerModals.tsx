import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, Search, Settings, X } from 'lucide-react';

function ModalShell({ title, icon, onClose, children, footer }: {
    title: string;
    icon: ReactNode;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
}) {
    return (
        <div className="wad-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <section className="wad-modal" role="dialog" aria-modal="true" aria-label={title}>
                <header><span>{icon}</span><h2>{title}</h2><button className="dl-btn dl-btn--sm dl-btn--icon dl-btn--ghost" onClick={onClose}><X size={15} /></button></header>
                <div className="wad-modal__body">{children}</div>
                {footer && <footer>{footer}</footer>}
            </section>
        </div>
    );
}

export function WadSettingsModal({ values, onChange, onClose }: {
    values: { rowHeight: number; fontSize: number; iconSize: number };
    onChange: (values: { rowHeight: number; fontSize: number; iconSize: number }) => void;
    onClose: () => void;
}) {
    const update = (key: keyof typeof values, value: number) => onChange({ ...values, [key]: value });
    return (
        <ModalShell
            title="WAD Explorer Settings"
            icon={<Settings size={17} />}
            onClose={onClose}
            footer={<button className="dl-btn dl-btn--primary" onClick={onClose}>Done</button>}
        >
            <p className="wad-modal__intro">Tune the archive tree without changing the rest of Quartz.</p>
            <RangeRow label="Row height" value={values.rowHeight} min={20} max={34} suffix="px" onChange={(value) => update('rowHeight', value)} />
            <RangeRow label="Text size" value={values.fontSize} min={11} max={15} suffix="px" onChange={(value) => update('fontSize', value)} />
            <RangeRow label="Icon size" value={values.iconSize} min={10} max={18} suffix="px" onChange={(value) => update('iconSize', value)} />
            <div className="wad-settings-preview" style={{ fontSize: values.fontSize, minHeight: values.rowHeight }}>
                <span style={{ width: values.iconSize, height: values.iconSize }} />
                data / characters / champion / skins / skin01
            </div>
        </ModalShell>
    );
}

function RangeRow({ label, value, min, max, suffix, onChange }: {
    label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void;
}) {
    return (
        <label className="wad-setting-row">
            <span><strong>{label}</strong><small>{value}{suffix}</small></span>
            <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        </label>
    );
}

interface CheatEntry { label: string; wad?: string; path?: string; note?: string }
interface CheatSection { id: string; title: string; intro?: string; entries: CheatEntry[]; footer?: string }

const CHEAT_SECTIONS: CheatSection[] = [
    {
        id: 'maps',
        title: 'Map & Mode WADs',
        intro: 'Per-map content lives in its own WAD. Several modes share Companions.wad.client.',
        entries: [
            { label: "Summoner's Rift", wad: 'Map11.wad.client' },
            { label: 'ARAM / Howling Abyss', wad: 'Map12.wad.client' },
            { label: 'Nexus Blitz', wad: 'Map21.wad.client' },
            { label: 'TFT main', wad: 'Map22.wad.client' },
            { label: 'TFT per-set', wad: 'TFTSetXX.wad.client', note: 'Replace XX with the current set number.' },
            { label: 'Arena', wad: 'Map30.wad.client' },
            { label: 'Swarm', wad: 'Map33.wad.client' },
            { label: 'Brawl', wad: 'Map35.wad.client' },
            { label: 'Companions / Little Legends', wad: 'Companions.wad.client', note: 'Also used by ARAM.' },
        ],
        footer: 'Old map IDs: Dominion was Map8, Twisted Treeline was Map10.',
    },
    {
        id: 'ui',
        title: 'UI, Cursor & Fonts',
        entries: [
            { label: 'Cursor', wad: 'Ui.wad.client', path: 'assets/ux/cursors/', note: '.tga files.' },
            { label: 'Fonts', wad: 'Ui.wad.client', path: 'assets/ux/fonts/' },
            { label: 'HUD atlases', wad: 'Ui.wad.client', path: 'assets/ux/lol/' },
            { label: 'Loading-screen borders + spinner', wad: 'Ui.wad.client', path: 'assets/ux/loadingscreen/' },
            { label: 'Healthbar color, CC icons, ammo, revive', wad: 'Ui.wad.client', path: 'assets/ux/floatinghealthbars/' },
        ],
    },
    {
        id: 'items',
        title: 'Items',
        entries: [
            { label: 'Item icons', wad: 'Global.wad.client', path: 'assets/items/icons2d/', note: 'Remember the autoatlas files too.' },
            { label: 'Item borders', wad: 'Global.wad.client', path: 'assets/items/itemmodifiers/' },
            { label: 'Item shop atlas', wad: 'Ui.wad.client', path: 'assets/ux/itemshop/itemshop_texture_atlas.tex' },
            { label: 'Item shop atlas alt', wad: 'Ui.wad.client', path: 'assets/ux/itemshop/itemshop_texture_atlas_3.tex' },
            { label: 'Item sounds', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/items_global_audio.bnk' },
        ],
    },
    {
        id: 'spells',
        title: 'Summoner Spells',
        entries: [
            { label: 'Summoner spell icons', wad: 'Data.wad.client', path: 'data/spells/icons2d/summonerXXXXX.dds' },
            { label: 'Twisted Fate red card', wad: 'Data.wad.client', path: 'data/spells/icons2d/cardmaster_red.dds' },
            { label: 'Twisted Fate blue card', wad: 'Data.wad.client', path: 'data/spells/icons2d/cardmaster_blue.dds' },
            { label: 'Twisted Fate gold card', wad: 'TwistedFate.wad.client', path: 'assets/spells/icons2d/cardmaster_gold.dds' },
        ],
    },
    {
        id: 'sounds',
        title: 'Gameplay Sounds',
        intro: 'Most gameplay sound swaps also need data/maps/shipping/common/common.bin from Common.wad.client.',
        entries: [
            { label: 'Killstreaks audio', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/misc_gameplay_killstreak_sfx_audio.bnk' },
            { label: 'Killstreak events', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/misc_gameplay_killstreak_sfx_events.bnk' },
            { label: 'Level up, runes, recall', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/misc_gameplay_sfx_audio.bnk' },
            { label: 'Pings, shop, chat, no mana', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/hud_global_audio.bnk' },
            { label: 'Game-end sounds', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/env_eog_sfx_audio.bnk' },
        ],
    },
    {
        id: 'announcer',
        title: 'Announcer',
        intro: 'MapXX.yy_ZZ.wad.client: XX is the map id, yy_ZZ is language.',
        entries: [
            { label: 'Announcer audio', wad: 'Map11.en_US.wad.client', path: 'assets/sounds/wwise2016/vo/en_US/shared/announcer_global_female1_vo_audio.wpk' },
            { label: 'Announcer events', wad: 'Map11.en_US.wad.client', path: 'assets/sounds/wwise2016/vo/en_US/shared/announcer_global_female1_vo_events.bnk' },
            { label: 'Map bin reference', wad: 'Map11.wad.client', path: 'data/maps/shipping/map11/map11.bin' },
        ],
    },
    {
        id: 'minions',
        title: 'Minions, Jungle & Target Dummy',
        entries: [
            { label: 'SR minions', wad: 'Map11.wad.client', path: 'assets/characters/sru_<minion>/' },
            { label: 'SR minion sounds', wad: 'Map11.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/npc_global_minion_<minion>_sfx_audio.bnk' },
            { label: 'SR jungle pets', wad: 'Map11.wad.client', path: 'assets/characters/sru_jungle_companions/' },
            { label: 'ARAM minions', wad: 'Map12.wad.client', path: 'assets/characters/ha_<minion>/' },
            { label: 'Target dummy', wad: 'Map11.wad.client', path: 'assets/characters/practicetool_targetdummy/' },
        ],
    },
    {
        id: 'wards-emotes',
        title: 'Wards & Emotes',
        entries: [
            { label: 'Sight ward', wad: 'Map11.wad.client', path: 'assets/characters/sightward/' },
            { label: 'Blue trinket', wad: 'Map11.wad.client', path: 'assets/characters/bluetrinket/' },
            { label: 'Yellow trinket', wad: 'Map11.wad.client', path: 'assets/characters/yellowtrinket/' },
            { label: 'Zombie ward', wad: 'Global.wad.client', path: 'assets/characters/perkszombieward/' },
            { label: 'Summoner emote assets', wad: 'Global.wad.client', path: 'assets/loadouts/summoneremotes/flairs/' },
            { label: 'Emote SFX audio', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/misc_emotes_sfx_audio.wpk' },
            { label: 'Emote SFX events', wad: 'Common.wad.client', path: 'assets/sounds/wwise2016/sfx/shared/misc_emotes_sfx_events.bnk' },
        ],
    },
    {
        id: 'champions',
        title: 'Champions',
        intro: 'Replace <champion> with the lowercase folder name, like ahri, kaisa, or monkeyking.',
        entries: [
            { label: 'HUD ability icons + skin tiles', wad: '<Champion>.wad.client', path: 'assets/characters/<champion>/huds/' },
            { label: 'Model, skeleton, textures, particles, animations', wad: '<Champion>.wad.client', path: 'assets/characters/<champion>/skins/skin<N>/' },
            { label: 'Voiceover per language', wad: '<Champion>.en_US.wad.client', path: 'assets/sounds/wwise2016/vo/en_US/characters/<champion>/skins/skin<N>/<champion>_<N>_vo_audio.wpk' },
            { label: 'Sound effects', wad: '<Champion>.wad.client', path: 'assets/sounds/wwise2016/sfx/characters/<champion>/skins/skin<N>/<champion>_<N>_sfx_audio.bnk' },
            { label: 'Skin BIN', wad: '<Champion>.wad.client', path: 'data/characters/<champion>/skins/skin<N>.bin' },
        ],
        footer: 'Some champions ship subcharacters, like nasusult. When in doubt, search the WAD TOC.',
    },
    {
        id: 'misc',
        title: 'Misc, Codenames & Tips',
        entries: [
            { label: 'Profile icons', wad: 'Global.wad.client', path: 'assets/ux/summonericons/' },
            { label: 'Rune VFX', wad: 'Global.wad.client', path: 'assets/perks/' },
            { label: 'Blue buff', wad: 'Global.wad.client', path: 'assets/maps/particles/sr/buff_blue_rocks.tex' },
            { label: 'Red buff', wad: 'Global.wad.client', path: 'assets/maps/particles/sr/buff_red_branches.tex' },
            { label: 'Bush colors SR', wad: 'Map11LEVELS.wad.client', path: 'levels/map11/info/' },
            { label: 'Bush colors ARAM', wad: 'Map12LEVELS.wad.client', path: 'levels/map12/info/' },
        ],
        footer: 'Codenames: kiwi = ARAM Mayhem, cherry = Arena, boba = Noxus Rift, slime = Nexus Blitz, strawberry = Swarm.',
    },
];

export function WadCheatSheet({ onSearch, onShowWad, onClose }: {
    onSearch: (value: string) => void;
    onShowWad: (wad: string, path?: string) => void;
    onClose: () => void;
}) {
    const [filter, setFilter] = useState('');
    const filtered = useMemo(() => {
        const needle = filter.trim().toLowerCase();
        if (!needle) return CHEAT_SECTIONS;
        return CHEAT_SECTIONS.map((section) => {
            const titleMatch = section.title.toLowerCase().includes(needle) || (section.intro || '').toLowerCase().includes(needle);
            const entries = section.entries.filter((entry) => [entry.label, entry.wad, entry.path, entry.note].some((value) => (value || '').toLowerCase().includes(needle)));
            if (titleMatch) return section;
            if (!entries.length) return null;
            return { ...section, entries };
        }).filter(Boolean) as CheatSection[];
    }, [filter]);
    return (
        <ModalShell title="Asset Path Cheat Sheet" icon={<BookOpen size={17} />} onClose={onClose}>
            <div className="wad-cheat-head">
                <p className="wad-modal__intro">Original cheat sheet by Aropatnik, adapted for Quartz. Show WAD opens the archive and expands the listed path when it is available.</p>
                <label><Search size={13} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter sections, paths or WADs..." spellCheck={false} /></label>
            </div>
            <div className="wad-cheat">
                {filtered.length === 0 && <div className="wad-cheat__empty">No sections match "{filter}".</div>}
                {filtered.map((section) => <CheatSectionView key={section.id} section={section} onSearch={onSearch} onShowWad={onShowWad} onClose={onClose} />)}
            </div>
        </ModalShell>
    );
}

function CheatSectionView({ section, onSearch, onShowWad, onClose }: {
    section: CheatSection;
    onSearch: (value: string) => void;
    onShowWad: (wad: string, path?: string) => void;
    onClose: () => void;
}) {
    return (
        <section className="wad-cheat__section">
            <h3>{section.title}</h3>
            {section.intro && <p>{section.intro}</p>}
            <div>
                {section.entries.map((entry, index) => (
                    <div className="wad-cheat__entry" key={`${section.id}-${index}`}>
                        <span>{entry.label}</span>
                        {entry.wad && <code>{entry.wad}</code>}
                        {entry.path && <code className="is-path">{entry.path}</code>}
                        {entry.wad && !/[<>]/.test(entry.wad) && (
                            <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={() => { onShowWad(entry.wad!, entry.path); onClose(); }}>
                                Show WAD
                            </button>
                        )}
                        {entry.path && (
                            <button className="dl-btn dl-btn--sm dl-btn--ghost" onClick={() => { onSearch(entry.path!.replace(/<[^>]+>|\*/g, '').replace(/\/+/g, '/')); onClose(); }}>
                                Search Path
                            </button>
                        )}
                        {entry.note && <em>{entry.note}</em>}
                    </div>
                ))}
            </div>
            {section.footer && <footer>{section.footer}</footer>}
        </section>
    );
}

export function WadNotice({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
    return (
        <ModalShell
            title={title}
            icon={<BookOpen size={17} />}
            onClose={onClose}
            footer={<button className="dl-btn dl-btn--primary" onClick={onClose}>OK</button>}
        >
            <p className="wad-notice">{message}</p>
        </ModalShell>
    );
}
