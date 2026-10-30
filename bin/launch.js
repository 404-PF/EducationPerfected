#!/usr/bin/env node
// Entry point for start.cmd / start.sh and `npm start`:
// checks the Node version and the installed dependencies, repairing them when
// needed, then hands over to index.js. Keeping this in JavaScript means the launchers
// only need to find Node and run this file.

const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { diagnostic } = require('../lib/diagnostics');

const ROOT = path.join(__dirname, '..');
const MIN_NODE = readMinNode();

// Absolute path to npm (same directory as node on Windows, or in bin on Unix).
/**
 * Finds the npm CLI that belongs to the running Node install, so the launcher
 * never depends on npm being on PATH.
 * @returns {string}
 */
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
// Quoted on Windows: cmd.exe joins the command and its arguments into one shell
// line, so an unquoted path with spaces (C:\Program Files\...) breaks. With the
// shell on, this is passed through as-is; everywhere else the plain path is used.
const NPM_COMMAND = process.platform === 'win32' ? `"${NPM_PATH}"` : NPM_PATH;

/**
 * Reads the minimum Node version the package's engines field asks for, as a
 * comparable "x.y.z" string ("0.0.0" when nothing usable is declared).
 * @returns {string}
 */
function readMinNode() {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const re = /\d+(\.\d+){0,2}/;
    const m = re.exec(String(pkg.engines?.node || ''));
    return m ? m[0] : '0.0.0';
}

/**
 * Version comparison that is numeric rather than lexical: "22.9.0" is older
 * than "22.12.0". Compares part by part; a shorter version is padded with 0.
 * @param {string} version - the version to test
 * @param {string} minimum - the minimum acceptable version
 * @returns {boolean}
 */
function isAtLeast(version, minimum) {
    const a = version.split('.').map(n => Number.parseInt(n, 10) || 0);
    const b = minimum.split('.').map(n => Number.parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const difference = (a[i] || 0) - (b[i] || 0);
        if (difference !== 0) return difference > 0;
    }
    return true;
}

/**
 * The version of an installed dependency, read from its package manifest, or
 * null when the manifest is absent or unreadable (e.g. a partial install).
 * @param {string} name
 * @returns {string|null}
 */
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
/**
 * Whether the pinned dependencies are installed and loadable: the Puppeteer
 * version must equal the pin, and `require("puppeteer")` must actually load —
 * not just its manifest existing, since a partial install keeps the manifest
 * but misses its transitive dependencies.
 * @returns {boolean}
 */
function dependenciesReady() {
    const pinned = readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    const wanted = JSON.parse(pinned).dependencies?.puppeteer;
    if (!wanted) return false;
    if (installedVersion('puppeteer') !== wanted) return false;
    try {
        const runner = 'require("puppeteer"); console.log(require("puppeteer/package.json").version)';
        const output = execFileSync(process.execPath, ['-e', runner], { cwd: ROOT, encoding: 'utf8' });
        return output.trim() === wanted;
    } catch {
        return false;
    }
}

/**
 * (Re)installs the pinned dependencies (`npm ci`, scripts disabled — the browser
 * is fetched explicitly below) and, when the Chromium build Puppeteer expects is
 * missing, installs it via Puppeteer's own resolver.
 * @returns {boolean}
 */
function installDependencies() {
    console.log(`Dependencies are missing or out of date (pinned Puppeteer). Running "npm ci" once...`);
    try {
        // --ignore-scripts: dependency install hooks are not needed here, and the
        // browser download is done explicitly below instead.
        execFileSync(NPM_COMMAND, ['ci', '--ignore-scripts'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    } catch {
        console.error('"npm ci" failed. Install Node.js ' + MIN_NODE + ' or newer and run "npm ci" in this folder.');
        return false;
    }

    if (!puppeteerBrowserInstalled()) {
        console.log('Installing the Chrome build Puppeteer needs...');
        try {
            execFileSync(NPM_COMMAND, ['exec', '--', 'puppeteer', 'browsers', 'install', 'chrome'], {
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
/**
 * Whether the browser build the installed Puppeteer resolves to exists on disk
 * (its executablePath evaluates and points at a real file).
 * @returns {boolean}
 */
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

/**
 * Strips a prerelease suffix ("25.16.0-beta.1" -> "25.16.0"); prerelease
 * builds have no meaning for the Node version comparison.
 * @param {string|number} version
 * @returns {string}
 */
function baseVersion(version) {
    return String(version).split('-')[0];
}

/**
 * The launch sequence: verify the Node version, repair the dependency tree (and
 * the browser build) when needed, then hand over to index.js.
 * @returns {number} 0 on success, 1 on failure
 */
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
            execFileSync(NPM_COMMAND, ['exec', '--', 'puppeteer', 'browsers', 'install', 'chrome'], {
                cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
            });
        } catch {
            console.error('Could not download Chrome. Run `npx puppeteer browsers install chrome` in this folder.');
            return 1;
        }
    }

    try {
        require(path.join(ROOT, 'index.js')).launchProgram({ legacySignals: true }).catch(error => {
            console.error(diagnostic(error, 'EducationPerfected startup'));
            process.exitCode = 1;
        });
        return 0;
    } catch (error) {
        console.error(diagnostic(error, 'Launcher'));
        return 1;
    }
}

process.exitCode = main();
