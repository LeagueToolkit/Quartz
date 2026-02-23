#!/usr/bin/env node

/**
 * Interactive release script
 * Creates a git commit and tag for a new release
 * Run: npm run release
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read current version
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

console.log(`\n📦 Current version: ${version}\n`);

// Check git status
try {
    const status = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf8' });
    if (status.trim()) {
        console.log('⚠️  You have uncommitted changes:');
        console.log(status);

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const answer = await new Promise((resolve) => {
            rl.question('\nContinue anyway? (y/N): ', resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 'y') {
            console.log('❌ Aborted');
            process.exit(1);
        }
    }
} catch (err) {
    console.error('❌ Git error:', err.message);
    process.exit(1);
}

console.log('\n📝 Creating release...\n');

try {
    // Add version files
    console.log('  Adding version files...');
    execSync('git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml', { cwd: rootDir });

    // Create commit
    console.log(`  Creating commit...`);
    execSync(`git commit -m "Bump version to ${version}"`, { cwd: rootDir, stdio: 'inherit' });

    // Create tag
    console.log(`  Creating tag v${version}...`);
    execSync(`git tag v${version}`, { cwd: rootDir });

    console.log(`\n✅ Release v${version} created!\n`);
    console.log('Next steps:');
    console.log(`  1. Review: git log -1 && git show v${version}`);
    console.log(`  2. Push: git push && git push origin v${version}`);
    console.log(`  3. GitHub Actions will build and release automatically\n`);

} catch (err) {
    console.error('❌ Release failed:', err.message);
    process.exit(1);
}
