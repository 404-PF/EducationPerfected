#!/usr/bin/env node
// Entry point for start.cmd / start.sh and `npm start`:
// checks the Node version and the installed dependencies, repairing them when
// needed, then hands over to index.js. Keeping this in JavaScript means the launchers
// only need to find Node and run this file.

const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MIN_NODE = readMinNode();

// Absolute path to npm (same directory as node on Windows, or in bin on Unix).
function resolveNpm() {
    const nodeDir = path.dirname(process.execPath);
    const candidates = [
        path.join(nodeDir, 'npm' + (process.platform === 'win32' ? '.cmd' : '')),
        path.join(nodeDir, '..', 'bin', 'npm'),
    ];
    for (const c of candidates) {
        if (existsSync(c)) return c;
    }
    // Fallback to bare 'npm' - low risk for this test/launcher script.
    return 'npm';
}
const NPM_PATH = resolveNpm();

function readMinNode() {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const re = /\d+(\.\d+){0,2}/;
    const m = re.exec(String(pkg.engines?.node || ''));
    return m ? m[0] : '0.0.0';
}

// Numeric rather than lexical: "22.9.0" is older than "22.12.0".
function isAtLeast(version, minimum) {
    const a = version.split('.').map(n => Number.parseInt(n, 10) || 0);
    const b = minimum.split('.').map(n => Number.parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const difference = (a[i] || 0) - (b[i] || 0);
        if (difference !== 0) return difference > 0;
    }
    return true;
}

function installedVersion(name) {
    const manifest = path.join(ROOT, 'node_modules', name, 'package.json');
    if (!existsSync(manifest)) return null;
    try {
        return JSON.parse(readFileSync(manifest, 'utf8')).version || null;
    } catch {
        return null;
    }
}

// True when the installed tree is usable as-is: the Puppeteer version matches the
// pin in package.json and it actually loads (a partial install leaves the package
// directory in place but its dependencies missing). Anything else is reinstalled.
function dependenciesReady() {
    const pinned = readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    const wanted = JSON.parse(pinned).dependencies?.puppeteer;
    if (!wanted) return false;
    if (installedVersion('puppeteer') !== wanted) return false;
    try {
        const runner = 'console.log(require("puppeteer/package.json").version)';
        const output = execFileSync(process.execPath, ['-e', runner], { cwd: ROOT, encoding: 'utf8' });
        return output.trim() === wanted;
    } catch {
        return false;
    }
}

function installDependencies() {
    console.log(`Dependencies are missing or out of date (pinned Puppeteer). Running "npm ci" once...`);
    try {
        // --ignore-scripts: dependency install hooks are not needed here, and the
        // browser download is done explicitly below instead.
        execFileSync(NPM_PATH, ['ci', '--ignore-scripts'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    } catch {
        console.error('"npm ci" failed. Install Node.js ' + MIN_NODE + ' or newer and run "npm ci" in this folder.');
        return false;
    }

    if (!puppeteerBrowserInstalled()) {
        console.log('Installing the Chrome build Puppeteer needs...');
        try {
            execFileSync(NPM_PATH, ['exec', '--', 'puppeteer', 'browsers', 'install', 'chrome'], {
                cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
            });
        } catch {
            console.error('Could not download Chrome. Run `npx puppeteer browsers install chrome` in this folder.');
            return false;
        }
    }
    return dependenciesReady();
}

// Runs Puppeteer's own resolver and reports whether the browser build it expects is on disk.
function puppeteerBrowserInstalled() {
    const check = `
        const { existsSync } = require('node:fs');
        const puppeteer = require('puppeteer');
        Promise.resolve(puppeteer.executablePath())
            .then(browser => process.exit(existsSync(browser) ? 0 : 1))
            .catch(() => process.exit(1));`;
    try {
        execFileSync(process.execPath, ['-e', check], { cwd: ROOT, stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function baseVersion(version) {
    return String(version).split('-')[0];
}

function main() {
    if (!isAtLeast(baseVersion(process.versions.node), MIN_NODE)) {
        console.error(`Node.js ${process.versions.node} is too old. Install Node.js ${MIN_NODE} or newer from https://nodejs.org/.`);
        return 1;
    }

    if (!dependenciesReady()) {
        if (!installDependencies()) return 1;
    } else if (!puppeteerBrowserInstalled()) {
        // Dependencies are installed but the Chrome build is missing (e.g. npm ci
        // ran with --ignore-scripts). Install it explicitly.
        console.log('Installing the Chrome build Puppeteer needs...');
        try {
            execFileSync(NPM_PATH, ['exec', '--', 'puppeteer', 'browsers', 'install', 'chrome'], {
                cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
            });
        } catch {
            console.error('Could not download Chrome. Run `npx puppeteer browsers install chrome` in this folder.');
            return 1;
        }
    }

    try {
        require(path.join(ROOT, 'index.js'));
        return 0;
    } catch (error) {
        console.error(error);
        return 1;
    }
}

process.exitCode = main();
