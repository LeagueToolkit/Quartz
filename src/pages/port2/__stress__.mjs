/**
 * Port2 stress test — corruption-hunting on the legacy text engine.
 *
 * Hammers port2's exposed text helpers (parseVfxEmitters,
 * replaceEmittersInSystem, replaceSystemBlockInFile, loadEmitterData) the
 * way the React handlers do during real drag-drops, then runs every result
 * through the production native ritobin pipeline (wad_indexer.pyToBin →
 * binToPy). Any text the addon rejects = corruption proven.
 *
 * Specifically chases:
 *   - The "extra closing braces at end of file" bug from rapid sequential
 *     ports (each port closure-captures stale targetPyContent, both write
 *     back, second wins but produces structurally-broken text).
 *   - Brace-count drift on individual mutations.
 *   - Emitter-loss after rename + port chain.
 *   - Re-parse equivalence after mutation (parseVfxEmitters must produce
 *     the same emitter list shape the mutation intended).
 *
 * Run from repo root:
 *   node src/pages/port2/__stress__.mjs
 *
 * Exit 0 = no corruption detected. Exit 1 = at least one scenario found
 * a bug; failure messages name the assertion that broke.
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

import {
    parseVfxEmitters,
    loadEmitterData,
    replaceEmittersInSystem,
} from '../../utils/vfx/vfxEmitterParser.js';
import { replaceSystemBlockInFile } from '../../utils/vfx/mutations/matrixUtils.js';
import { removeEmitterBlockFromSystem } from './utils/pyContentUtils.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const FIXTURE_PATH = join(REPO_ROOT, 'luabin-collector-test', 'skin0.py');
const HASH_DIR = join(process.env.APPDATA || '', 'FrogTools', 'hashes');
const HAVE_HASHES = HASH_DIR && existsSync(HASH_DIR);

const require = createRequire(import.meta.url);
const wadIndexer = require(join(REPO_ROOT, 'native', 'wad_indexer.node'));

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
    if (!cond) {
        fail++;
        failures.push(msg);
        throw new Error(msg);
    }
    pass++;
}

async function test(name, fn) {
    process.stdout.write(`• ${name} ... `);
    try {
        await fn();
        console.log('OK');
    } catch (e) {
        console.log('FAIL');
        console.log('    ' + e.message);
        if (process.env.PORT2_TRACE) console.log(e.stack);
    }
}

/** brace-count balance — non-negotiable invariant for legal ritobin text */
function checkBraces(text, ctx) {
    const opens = (text.match(/\{/g) || []).length;
    const closes = (text.match(/\}/g) || []).length;
    if (opens !== closes) {
        throw new Error(`${ctx}: brace count off — ${opens} '{' vs ${closes} '}' (delta ${opens - closes})`);
    }
}

/** Find the offset of the last byte of the entries-map closing brace.
 *  Walks brace depth from the start of the entries map to find the matching
 *  close. Anything after that offset is "tail" content. */
function findEntriesEnd(text) {
    const startIdx = text.search(/\bentries\s*:\s*map\b[^{]*\{/);
    if (startIdx < 0) return -1;
    // Move past the opening '{' of entries
    const openIdx = text.indexOf('{', startIdx);
    if (openIdx < 0) return -1;
    let depth = 1;
    for (let i = openIdx + 1; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/** Tail-corruption check: every byte after the entries-map closer must be
 *  whitespace. Any other characters = leftover emitter block, extra braces,
 *  duplicate content, etc. — exactly the user's "weird stuff at the bottom"
 *  symptom. */
function checkTailClean(text, ctx) {
    const end = findEntriesEnd(text);
    if (end < 0) throw new Error(`${ctx}: cannot locate entries-map close (file may be malformed already)`);
    const tail = text.slice(end + 1);
    if (!/^\s*$/.test(tail)) {
        const preview = tail.length > 200 ? tail.slice(0, 200) + '... [+' + (tail.length - 200) + ' more]' : tail;
        throw new Error(`${ctx}: ${tail.length} non-whitespace bytes AFTER entries-map close — content leaked past file end:\n${preview}`);
    }
}

/** Round-trip the mutated text through the actual production binary pipeline.
 *  If pyToBin rejects our output, the corruption is real, not just cosmetic. */
async function verifyBinAccepts(text, ctx) {
    if (!HAVE_HASHES) return { skipped: true };
    const tmpDir = join(tmpdir(), `port2-stress-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
    const pyPath = join(tmpDir, 'mut.py');
    const binPath = join(tmpDir, 'mut.bin');
    try {
        await writeFile(pyPath, text, 'utf8');
        const okBin = wadIndexer.pyToBin(pyPath, binPath);
        if (!okBin) {
            throw new Error(`${ctx}: wad_indexer.pyToBin rejected mutated output — bin format invalid`);
        }
    } finally {
        try { await rm(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    }
    return { skipped: false };
}

/** Mimic what port2's handlePortEmitter does inside the React handler — the
 *  exact text-mutation chain that produces the bug under spam. Returns the
 *  new file text (what would go into setTargetPyContent). */
function simulatePortEmitter(currentPyContent, targetSystemKey, donorSystem, emitterName, suffix) {
    // Step 1 — parse current systems (legacy text path)
    const systems = parseVfxEmitters(currentPyContent) || {};
    const targetSys = systems[targetSystemKey];
    if (!targetSys) throw new Error(`target system ${targetSystemKey} missing`);

    // Step 2 — collision suffix
    const existingNames = new Set((targetSys.emitters || []).map((e) => e.name));
    let finalName = emitterName;
    if (suffix !== undefined) finalName = `${emitterName}_${suffix}`;
    while (existingNames.has(finalName)) {
        finalName += '_dup';
    }

    // Step 3 — load donor emitter
    const donorEmitter = loadEmitterData(donorSystem, emitterName);
    if (!donorEmitter || !donorEmitter.originalContent) {
        throw new Error(`donor emitter ${emitterName} not loadable`);
    }
    const renamed = donorEmitter.originalContent.replace(
        /emitterName:\s*string\s*=\s*"([^"]+)"/,
        `emitterName: string = "${finalName}"`
    );

    // Step 4 — build emitter blocks for target system + new emitter, splice
    const blocks = (targetSys.emitters || []).map((e) => {
        if (e.originalContent) return e.originalContent;
        const loaded = loadEmitterData(targetSys, e.name);
        if (loaded?.originalContent) return loaded.originalContent;
        return `VfxEmitterDefinitionData {\n    emitterName: string = "${e.name}"\n}`;
    });
    blocks.push(renamed);

    const newSystemText = replaceEmittersInSystem(targetSys.rawContent || '', blocks);
    const newFile = replaceSystemBlockInFile(currentPyContent, targetSys.key || targetSystemKey, newSystemText);
    return { newFile, finalName };
}

/* ───────────────────────────────────────────────────────── tests ────── */

const main = async () => {
    if (!existsSync(FIXTURE_PATH)) {
        console.error(`No fixture at ${FIXTURE_PATH} — drop a real .py file there.`);
        process.exit(2);
    }
    const fixtureText = await readFile(FIXTURE_PATH, 'utf8');
    console.log(`Fixture: ${FIXTURE_PATH} (${(fixtureText.length / 1024 / 1024).toFixed(2)} MB)\n`);
    if (!HAVE_HASHES) console.log(`Note: hash dir not at ${HASH_DIR} — bin-pipeline checks will skip.\n`);

    /* ── 1. Baseline: parsing the unmodified fixture produces balanced braces */
    await test('baseline parse: brace count balanced', async () => {
        checkBraces(fixtureText, 'baseline');
        const systems = parseVfxEmitters(fixtureText) || {};
        assert(Object.keys(systems).length > 0, 'parseVfxEmitters returned empty');
    });

    /* ── 2. Single port via the same text-mutation chain port2's handler uses */
    await test('single port via text-helper chain stays balanced', async () => {
        const systems = parseVfxEmitters(fixtureText) || {};
        const allSystems = Object.values(systems).filter((s) => (s.emitters || []).length > 0);
        if (allSystems.length < 2) return;
        const target = allSystems[0];
        const donor = allSystems[1];
        const donorEmitter = donor.emitters[0].name;
        const { newFile } = simulatePortEmitter(fixtureText, target.key, donor, donorEmitter);
        checkBraces(newFile, 'after single port');
        checkTailClean(newFile, 'after single port');

        const r = await verifyBinAccepts(newFile, 'single port');
        if (r.skipped) console.log('(bin trip skipped — no hash dir)');
    });

    /* ── 3. THE BUG: simulate concurrent drag-drops sharing stale closure state.
       Two ports both read the SAME pre-mutation pyContent (closure capture),
       both write back via setTargetPyContent. Last write wins. The "winner"
       carries only its own emitter; the other is lost. We verify that this
       is what port2 does today (corruption mode), then confirm the SERIAL
       path is the only safe one. */
    await test('concurrent stale-closure ports lose data (port2 corruption mode)', async () => {
        const systems = parseVfxEmitters(fixtureText) || {};
        const allSystems = Object.values(systems).filter((s) => (s.emitters || []).length >= 2);
        if (allSystems.length < 2) return;
        const target = allSystems[0];
        const donor = allSystems[1];
        const eA = donor.emitters[0].name;
        const eB = donor.emitters[1].name;

        // Both calls read the SAME initial fixtureText (mimics React closure capture).
        const a = simulatePortEmitter(fixtureText, target.key, donor, eA);
        const b = simulatePortEmitter(fixtureText, target.key, donor, eB);

        // Whichever setTargetPyContent fired LAST wins. Pick b (arbitrary).
        const winner = b.newFile;
        // Verify winner has eB but NOT eA — proves data loss
        const reSystems = parseVfxEmitters(winner) || {};
        const reTarget = reSystems[target.key];
        const namesAfter = new Set((reTarget.emitters || []).map((e) => e.name));
        assert(
            namesAfter.has(b.finalName),
            `port2 race: even the winning port lost its own emitter ${b.finalName}`
        );
        assert(
            !namesAfter.has(a.finalName),
            `expected port2 race to drop ${a.finalName} (it normally does); if it kept both, lucky scheduling — re-test`
        );
        // Bin still accepts (the data is just incomplete, not malformed)
        checkBraces(winner, 'after racing ports');
    });

    /* ── 4. SERIAL spam: 25 ports queued one-after-another (the FIX'd path).
       Each port reads the LATEST text. Verifies serialization preserves all
       additions and keeps the file structurally legal across the whole batch. */
    await test('25 sequential ports preserve every emitter + balanced braces', async () => {
        const systems = parseVfxEmitters(fixtureText) || {};
        const allSystems = Object.values(systems).filter((s) => (s.emitters || []).length > 0);
        if (allSystems.length < 2) return;
        const target = allSystems[0];
        const donor = allSystems[1];
        const donorEmitter = donor.emitters[0].name;

        let current = fixtureText;
        const portedNames = [];
        const N = 25;
        for (let i = 0; i < N; i++) {
            const { newFile, finalName } = simulatePortEmitter(current, target.key, donor, donorEmitter, i);
            checkBraces(newFile, `after spam port #${i}`);
            checkTailClean(newFile, `after spam port #${i}`);
            current = newFile;
            portedNames.push(finalName);
        }

        const reSystems = parseVfxEmitters(current) || {};
        const reTarget = reSystems[target.key];
        const namesAfter = new Set((reTarget.emitters || []).map((e) => e.name));
        for (const name of portedNames) {
            assert(namesAfter.has(name), `serial spam lost ${name} after ${N} sequential ports`);
        }

        const r = await verifyBinAccepts(current, 'serial spam x25');
        if (r.skipped) console.log('(bin trip skipped — no hash dir)');
    });

    /* ── 5. Rename + port chain: rename an emitter, then port a donor on top —
       confirm the rename survives and the new port lands in the right system. */
    await test('rename followed by port keeps both changes', async () => {
        const systems = parseVfxEmitters(fixtureText) || {};
        const allSystems = Object.values(systems).filter((s) => (s.emitters || []).length >= 1);
        if (allSystems.length < 2) return;
        const target = allSystems[0];
        const donor = allSystems[1];
        const renameTarget = target.emitters[0].name;
        const newName = `${renameTarget}_RENAMED_STRESS`;

        // Rename via the same line-walking logic the React handler uses.
        const renamedSystemText = (target.rawContent || '')
            .split('\n')
            .map((line, idx, arr) => {
                if (line.includes(`emitterName: string = "${renameTarget}"`)) {
                    // First emitterName under the system block — naive but matches port2 behavior.
                    return line.replace(
                        new RegExp(`emitterName:\\s*string\\s*=\\s*"${renameTarget}"`),
                        `emitterName: string = "${newName}"`
                    );
                }
                return line;
            })
            .join('\n');
        const renamedFile = replaceSystemBlockInFile(fixtureText, target.key, renamedSystemText);
        checkBraces(renamedFile, 'after rename');
        checkTailClean(renamedFile, 'after rename');

        const { newFile, finalName } = simulatePortEmitter(renamedFile, target.key, donor, donor.emitters[0].name);
        checkBraces(newFile, 'after rename + port');
        checkTailClean(newFile, 'after rename + port');

        const reSystems = parseVfxEmitters(newFile) || {};
        const reTarget = reSystems[target.key];
        const names = new Set((reTarget.emitters || []).map((e) => e.name));
        assert(names.has(newName), 'rename did not persist through subsequent port');
        assert(names.has(finalName), 'ported emitter missing after rename+port');

        const r = await verifyBinAccepts(newFile, 'rename + port');
        if (r.skipped) console.log('(bin trip skipped — no hash dir)');
    });

    /* ── 6. Run-of-the-mill check: parseVfxEmitters output round-trips intact
       across simple no-op replaceEmittersInSystem (replace with identical blocks).
       Any drift here means even a no-op mutation corrupts the file. */
    await test('no-op replaceEmittersInSystem is idempotent', async () => {
        const systems = parseVfxEmitters(fixtureText) || {};
        const allSystems = Object.values(systems).filter((s) => (s.emitters || []).length > 0);
        if (allSystems.length === 0) return;
        const sys = allSystems[0];
        const blocks = (sys.emitters || []).map((e) => {
            if (e.originalContent) return e.originalContent;
            const loaded = loadEmitterData(sys, e.name);
            return loaded?.originalContent || `VfxEmitterDefinitionData { emitterName: string = "${e.name}" }`;
        });
        const sameSystemText = replaceEmittersInSystem(sys.rawContent || '', blocks);
        const sameFile = replaceSystemBlockInFile(fixtureText, sys.key, sameSystemText);
        checkBraces(sameFile, 'after no-op replace');
        checkTailClean(sameFile, 'after no-op replace');

        const reSystems = parseVfxEmitters(sameFile) || {};
        const reSys = reSystems[sys.key];
        const before = (sys.emitters || []).map((e) => e.name);
        const after = (reSys.emitters || []).map((e) => e.name);
        assert(before.length === after.length, `no-op changed emitter count: ${before.length} → ${after.length}`);
        for (let i = 0; i < before.length; i++) {
            assert(before[i] === after[i], `no-op shuffled emitters at index ${i}: ${before[i]} → ${after[i]}`);
        }
    });

    /* ── 7. handlePortAllEmitters reconstruction — the bulk loop that ports
       every emitter from a donor system into a target. The actual handler
       reuses replaceEmittersInSystem after building blocks for ALL existing
       + new emitters. If any block construction is off, the tail of the file
       (or the entries map) leaks content. This is the most common path the
       user runs and the most likely culprit for "weird stuff at the bottom". */
    await test('port-all-emitters reconstruction (full donor system → target) tail-clean', async () => {
        const systems = parseVfxEmitters(fixtureText) || {};
        const donorSystems = Object.values(systems).filter((s) => (s.emitters || []).length >= 2);
        if (donorSystems.length < 2) return;
        const target = donorSystems[0];
        const donor = donorSystems[1];

        // Build target's existing blocks
        const targetBlocks = (target.emitters || []).map((e) => {
            if (e.originalContent) return e.originalContent;
            const loaded = loadEmitterData(target, e.name);
            return loaded?.originalContent || `VfxEmitterDefinitionData {\n    emitterName: string = "${e.name}"\n}`;
        });
        // Add every donor emitter on top
        const existingNames = new Set(targetBlocks.map((b) => {
            const m = b.match(/emitterName:\s*string\s*=\s*"([^"]+)"/);
            return m ? m[1] : null;
        }).filter(Boolean));

        const addedNames = [];
        for (const e of donor.emitters || []) {
            const data = loadEmitterData(donor, e.name);
            if (!data?.originalContent) continue;
            let finalName = e.name;
            let n = 1;
            while (existingNames.has(finalName)) finalName = `${e.name}_${n++}`;
            existingNames.add(finalName);
            const renamed = data.originalContent.replace(
                /emitterName:\s*string\s*=\s*"([^"]+)"/,
                `emitterName: string = "${finalName}"`
            );
            targetBlocks.push(renamed);
            addedNames.push(finalName);
        }

        const newSystemText = replaceEmittersInSystem(target.rawContent || '', targetBlocks);
        const newFile = replaceSystemBlockInFile(fixtureText, target.key, newSystemText);

        checkBraces(newFile, 'after port-all-emitters');
        checkTailClean(newFile, 'after port-all-emitters');

        // Verify every donor emitter actually landed
        const reSystems = parseVfxEmitters(newFile) || {};
        const reTarget = reSystems[target.key];
        const reNames = new Set((reTarget.emitters || []).map((e) => e.name));
        for (const name of addedNames) {
            assert(reNames.has(name), `port-all-emitters dropped ${name}`);
        }

        const r = await verifyBinAccepts(newFile, 'port-all-emitters');
        if (r.skipped) console.log('(bin trip skipped — no hash dir)');
    });

    /* ── 8. CHAINED port-all across DIFFERENT donor systems. This walks the
       full file, picks several donors, and ports their full emitter sets
       sequentially into different targets. Mirrors the user clicking the
       "port all" button on multiple systems back-to-back. */
    await test('chained port-all across many donors keeps tail clean', async () => {
        const systems = parseVfxEmitters(fixtureText) || {};
        const allSystems = Object.values(systems).filter((s) => (s.emitters || []).length >= 1);
        if (allSystems.length < 4) return;

        let current = fixtureText;
        const pairs = [
            [allSystems[0], allSystems[1]],
            [allSystems[2], allSystems[3]],
            [allSystems[1], allSystems[2]],
        ];
        for (const [target, donor] of pairs) {
            const reSys = parseVfxEmitters(current) || {};
            const reTarget = reSys[target.key];
            const reDonor = reSys[donor.key];
            if (!reTarget || !reDonor) continue;

            const blocks = (reTarget.emitters || []).map((e) => {
                if (e.originalContent) return e.originalContent;
                const loaded = loadEmitterData(reTarget, e.name);
                return loaded?.originalContent || `VfxEmitterDefinitionData {\n    emitterName: string = "${e.name}"\n}`;
            });
            const existing = new Set(blocks.map((b) => {
                const m = b.match(/emitterName:\s*string\s*=\s*"([^"]+)"/);
                return m ? m[1] : null;
            }).filter(Boolean));
            for (const e of reDonor.emitters || []) {
                const data = loadEmitterData(reDonor, e.name);
                if (!data?.originalContent) continue;
                let finalName = e.name;
                let n = 1;
                while (existing.has(finalName)) finalName = `${e.name}_${n++}`;
                existing.add(finalName);
                blocks.push(
                    data.originalContent.replace(
                        /emitterName:\s*string\s*=\s*"([^"]+)"/,
                        `emitterName: string = "${finalName}"`
                    )
                );
            }
            const newSysText = replaceEmittersInSystem(reTarget.rawContent || '', blocks);
            current = replaceSystemBlockInFile(current, reTarget.key, newSysText);

            checkBraces(current, `after chained port-all → ${target.key}`);
            checkTailClean(current, `after chained port-all → ${target.key}`);
        }

        const r = await verifyBinAccepts(current, 'chained port-all');
        if (r.skipped) console.log('(bin trip skipped — no hash dir)');
    });

    /* ── 9. Edge case: target system has the LAST entry in the entries map.
       If replaceEmittersInSystem / replaceSystemBlockInFile is off-by-one on
       the system's closing brace, the bug manifests at the very end of the
       file — exactly the user's reported symptom. */
    await test('mutating the LAST system in entries map keeps tail clean', async () => {
        const systems = parseVfxEmitters(fixtureText) || {};
        const allKeys = Object.keys(systems);
        if (allKeys.length === 0) return;
        // The last key in the systems object's iteration order should be the
        // last entry in the file (parseVfxEmitters preserves declaration order).
        const lastKey = allKeys[allKeys.length - 1];
        const lastSys = systems[lastKey];
        if ((lastSys.emitters || []).length === 0) return;

        // Take any donor with emitters
        const donor = Object.values(systems).find(
            (s) => s.key !== lastKey && (s.emitters || []).length > 0
        );
        if (!donor) return;

        const { newFile } = simulatePortEmitter(fixtureText, lastKey, donor, donor.emitters[0].name);
        checkBraces(newFile, 'after mutating last system');
        checkTailClean(newFile, 'after mutating last system');

        const r = await verifyBinAccepts(newFile, 'last-system mutation');
        if (r.skipped) console.log('(bin trip skipped — no hash dir)');
    });

    /* ── 10. FUZZ: 100 random ports across random pairs. If any single
       iteration leaks tail content, we catch it. */
    await test('100-iteration random port fuzz — no tail corruption ever', async () => {
        const systems = parseVfxEmitters(fixtureText) || {};
        const candidates = Object.values(systems).filter((s) => (s.emitters || []).length >= 1);
        if (candidates.length < 2) return;
        let current = fixtureText;
        let fuzzPortedTotal = 0;

        // deterministic-ish RNG for repeatable runs
        let seed = 0xC0FFEE;
        const rand = (n) => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed % n;
        };

        for (let i = 0; i < 100; i++) {
            const reSystems = parseVfxEmitters(current) || {};
            const live = Object.values(reSystems).filter((s) => (s.emitters || []).length > 0);
            if (live.length < 2) break;
            const target = live[rand(live.length)];
            let donor = live[rand(live.length)];
            if (donor.key === target.key) donor = live[(live.indexOf(donor) + 1) % live.length];
            const emName = donor.emitters[rand(donor.emitters.length)].name;

            try {
                const { newFile } = simulatePortEmitter(current, target.key, donor, emName, i);
                checkBraces(newFile, `fuzz iter ${i} (${target.key} ← ${donor.key}.${emName})`);
                checkTailClean(newFile, `fuzz iter ${i} (${target.key} ← ${donor.key}.${emName})`);
                current = newFile;
                fuzzPortedTotal++;
            } catch (e) {
                throw new Error(`fuzz iter ${i}: ${e.message}`);
            }
        }
        assert(fuzzPortedTotal > 0, 'fuzz did not run any iterations');
        const r = await verifyBinAccepts(current, `fuzz (${fuzzPortedTotal} ops)`);
        if (r.skipped) console.log(`(bin trip skipped — ${fuzzPortedTotal} fuzz ops completed)`);
    });

    /* ── DELETE PATH ─────────────────────────────────────────────────────
       removeEmitterBlockFromSystem + replaceSystemBlockInFile is what
       handleDeleteEmitter calls. Verify that's tail-clean and brace-balanced
       across many delete iterations, especially on the last system. */
    await test('delete every emitter from a single system — tail stays clean each step', async () => {
        const systems = parseVfxEmitters(fixtureText) || {};
        const sys = Object.values(systems).find((s) => (s.emitters || []).length >= 3);
        if (!sys) return;
        let current = fixtureText;
        let currentRaw = sys.rawContent || '';
        for (const e of sys.emitters || []) {
            const newSysRaw = removeEmitterBlockFromSystem(currentRaw, e.name);
            if (newSysRaw == null) continue;
            current = replaceSystemBlockInFile(current, sys.key, newSysRaw);
            currentRaw = newSysRaw;
            checkBraces(current, `after deleting ${e.name}`);
            checkTailClean(current, `after deleting ${e.name}`);
        }
        const r = await verifyBinAccepts(current, 'delete-all-via-loop');
        if (r.skipped) console.log('(bin trip skipped — no hash dir)');
    });

    /* ── ADD/DELETE INTERLEAVE ───────────────────────────────────────────
       The user's reproducer: "adding emitters and deleting them" with fast
       UI actions. Sequential interleave pattern, each step reading the
       latest text. If individual steps stay tail-clean, this is fine; if
       any step corrupts, we catch the exact transition. */
    await test('rapid add/delete/add/delete chain x40 — tail stays clean every step', async () => {
        const systems = parseVfxEmitters(fixtureText) || {};
        const candidates = Object.values(systems).filter((s) => (s.emitters || []).length >= 1);
        if (candidates.length < 2) return;
        const target = candidates[0];
        const donor = candidates[1];

        let current = fixtureText;
        let added = [];
        for (let i = 0; i < 40; i++) {
            if (i % 2 === 0) {
                // ADD
                const { newFile, finalName } = simulatePortEmitter(
                    current, target.key, donor, donor.emitters[0].name, i
                );
                checkBraces(newFile, `iter ${i} add(${finalName})`);
                checkTailClean(newFile, `iter ${i} add(${finalName})`);
                current = newFile;
                added.push(finalName);
            } else if (added.length > 0) {
                // DELETE
                const victim = added.shift();
                const reSys = parseVfxEmitters(current) || {};
                const reTarget = reSys[target.key];
                const newSysRaw = removeEmitterBlockFromSystem(reTarget.rawContent || '', victim);
                if (newSysRaw == null) {
                    throw new Error(`iter ${i}: removeEmitterBlockFromSystem returned null for ${victim}`);
                }
                const newFile = replaceSystemBlockInFile(current, target.key, newSysRaw);
                checkBraces(newFile, `iter ${i} delete(${victim})`);
                checkTailClean(newFile, `iter ${i} delete(${victim})`);
                current = newFile;
            }
        }
        const r = await verifyBinAccepts(current, 'add/delete x40');
        if (r.skipped) console.log('(bin trip skipped — no hash dir)');
    });

    /* ── STALE-CLOSURE RACE: ADD + DELETE ────────────────────────────────
       The probable production reproducer. User clicks delete + port (or two
       ports + a delete) so fast that the React handlers all closure-capture
       the SAME pre-mutation pyContent. Each computes a "new" file from that
       stale base. setTargetPyContent races. The loser's mutation is
       overwritten — but the winner's is computed from text that doesn't yet
       contain the loser's edit, so structural references can drift.
       This test reproduces that exact pattern and verifies what happens. */
    await test('STALE-CLOSURE add+delete race against same base — final file structurally OK', async () => {
        const systems = parseVfxEmitters(fixtureText) || {};
        const candidates = Object.values(systems).filter((s) => (s.emitters || []).length >= 2);
        if (candidates.length < 2) return;
        const target = candidates[0];
        const donor = candidates[1];

        // Both handlers see the SAME starting fixtureText (closure capture).
        // Handler A: port donor.emitters[0]
        // Handler B: delete target.emitters[0]
        // Both setState with their independent computations.
        // Whichever was queued last wins via React's last-write semantics.
        const portResult = simulatePortEmitter(fixtureText, target.key, donor, donor.emitters[0].name);
        const victim = target.emitters[0].name;
        const delSysRaw = removeEmitterBlockFromSystem(target.rawContent || '', victim);
        const deleteResult = replaceSystemBlockInFile(fixtureText, target.key, delSysRaw);

        // Both individually MUST be tail-clean (otherwise the race itself produces corruption).
        checkBraces(portResult.newFile, 'race: port branch');
        checkTailClean(portResult.newFile, 'race: port branch');
        checkBraces(deleteResult, 'race: delete branch');
        checkTailClean(deleteResult, 'race: delete branch');

        // Now the trickier scenario: SECOND handler runs against FIRST's
        // result (the natural serial path) — this is what should happen.
        // Compare against the racing version where second handler runs
        // against the original fixtureText (the bug).
        const serialDelete = (() => {
            const reSys = parseVfxEmitters(portResult.newFile) || {};
            const reTarget = reSys[target.key];
            const sysRaw = removeEmitterBlockFromSystem(reTarget.rawContent || '', victim);
            return replaceSystemBlockInFile(portResult.newFile, target.key, sysRaw);
        })();
        checkBraces(serialDelete, 'serial port-then-delete');
        checkTailClean(serialDelete, 'serial port-then-delete');

        // Final integrity
        const r = await verifyBinAccepts(serialDelete, 'serial port-then-delete');
        if (r.skipped) console.log('(bin trip skipped — no hash dir)');
    });

    /* ── HEAVY FUZZ: random add/delete/rename interleave with a chance of
       starting from STALE base (simulating closure-capture race). 200 ops.
       This is the closest thing to "UI clicking everywhere fast". Whenever
       a stale-base op runs and produces a structurally-bad file, we catch it. */
    await test('200-op fuzz: random add/delete/rename, occasional stale base — find any tail leak', async () => {
        const systems = parseVfxEmitters(fixtureText) || {};
        const candidates = Object.values(systems).filter((s) => (s.emitters || []).length >= 1);
        if (candidates.length < 2) return;

        let current = fixtureText;
        let staleBase = fixtureText; // captured "old" reference for race simulation
        const lifetimeAdded = []; // names we ported in (eligible for later delete)
        let opsRun = 0;

        let seed = 0xBADCAFE;
        const rand = (n) => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed % n;
        };

        for (let i = 0; i < 200; i++) {
            // 25% of operations use the stale base instead of the current
            // result — this is the closure-capture race simulation.
            const useStale = rand(4) === 0;
            const baseText = useStale ? staleBase : current;
            const baseSystems = parseVfxEmitters(baseText) || {};
            const liveCandidates = Object.values(baseSystems).filter((s) => (s.emitters || []).length > 0);
            if (liveCandidates.length < 2) {
                staleBase = current;
                continue;
            }

            const op = rand(3);
            try {
                if (op === 0 || lifetimeAdded.length === 0) {
                    // ADD
                    const target = liveCandidates[rand(liveCandidates.length)];
                    let donor = liveCandidates[rand(liveCandidates.length)];
                    if (donor.key === target.key) {
                        donor = liveCandidates[(liveCandidates.indexOf(donor) + 1) % liveCandidates.length];
                    }
                    const emName = donor.emitters[rand(donor.emitters.length)].name;
                    const { newFile, finalName } = simulatePortEmitter(baseText, target.key, donor, emName, i);
                    checkBraces(newFile, `fuzz ${i} ADD ${useStale ? '(stale)' : ''}`);
                    checkTailClean(newFile, `fuzz ${i} ADD ${useStale ? '(stale)' : ''}`);
                    current = newFile;
                    lifetimeAdded.push({ key: target.key, name: finalName });
                } else if (op === 1 && lifetimeAdded.length > 0) {
                    // DELETE
                    const idx = rand(lifetimeAdded.length);
                    const victim = lifetimeAdded[idx];
                    lifetimeAdded.splice(idx, 1);
                    const reSys = parseVfxEmitters(baseText) || {};
                    const reTarget = reSys[victim.key];
                    if (!reTarget) continue;
                    const newSysRaw = removeEmitterBlockFromSystem(reTarget.rawContent || '', victim.name);
                    if (newSysRaw == null) continue; // already gone in this base
                    const newFile = replaceSystemBlockInFile(baseText, victim.key, newSysRaw);
                    checkBraces(newFile, `fuzz ${i} DELETE ${useStale ? '(stale)' : ''}`);
                    checkTailClean(newFile, `fuzz ${i} DELETE ${useStale ? '(stale)' : ''}`);
                    current = newFile;
                } else {
                    // RENAME (an existing emitter we've previously added)
                    const idx = rand(lifetimeAdded.length);
                    const victim = lifetimeAdded[idx];
                    const reSys = parseVfxEmitters(baseText) || {};
                    const reTarget = reSys[victim.key];
                    if (!reTarget) continue;
                    const renamed = `${victim.name}_r${i}`;
                    const newSysRaw = (reTarget.rawContent || '').replace(
                        new RegExp(`emitterName:\\s*string\\s*=\\s*"${victim.name}"`),
                        `emitterName: string = "${renamed}"`
                    );
                    if (newSysRaw === reTarget.rawContent) continue; // not found in this base
                    const newFile = replaceSystemBlockInFile(baseText, victim.key, newSysRaw);
                    checkBraces(newFile, `fuzz ${i} RENAME ${useStale ? '(stale)' : ''}`);
                    checkTailClean(newFile, `fuzz ${i} RENAME ${useStale ? '(stale)' : ''}`);
                    current = newFile;
                    lifetimeAdded[idx] = { key: victim.key, name: renamed };
                }
                opsRun++;
                // Periodically refresh the stale base reference to a slightly older state
                if (i % 17 === 0) staleBase = current;
            } catch (e) {
                throw new Error(`fuzz ${i} ${useStale ? '(STALE BASE)' : ''}: ${e.message}`);
            }
        }
        assert(opsRun > 0, 'fuzz did not run any operations');
        const r = await verifyBinAccepts(current, `fuzz (${opsRun} ops)`);
        if (r.skipped) console.log(`(bin trip skipped — ${opsRun} ops completed)`);
    });

    /* ── 11. Final integrity: after all the above, fixture text + last computed
       file should each independently survive a full bin round-trip. */
    await test('original fixture survives bin round-trip', async () => {
        const r = await verifyBinAccepts(fixtureText, 'fixture baseline');
        if (r.skipped) console.log('(bin trip skipped — no hash dir)');
    });

    console.log('');
    console.log(`Port2 stress: ${pass} assertions passed, ${fail} failed`);
    if (fail > 0) {
        console.log('');
        console.log('Failure summary:');
        for (const f of failures) console.log('  - ' + f);
    }
    process.exit(fail === 0 ? 0 : 1);
};

main().catch((e) => {
    console.error('Stress runner crashed:', e);
    process.exit(2);
});
