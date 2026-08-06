#!/usr/bin/env node
'use strict';
/*
 * Refresh the build fingerprint in main.js from the current source.
 *
 * Run this before packaging. It means the id logged at startup and shown in Settings always
 * matches the files that were actually built, so "is this the new build?" is never a guess.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = __dirname;
const FILES = ['main.js', 'preload.js', 'renderer/index.html', 'src/scanner.js', 'src/installer.js', 'src/mods.js'];
let blob = '';
for (const f of FILES) { try { blob += fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) {} }
const id = crypto.createHash('sha1').update(blob).digest('hex').slice(0, 8);
const d = new Date();
const p = n => String(n).padStart(2, '0');
const date = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
const mainPath = path.join(root, 'main.js');
let s = fs.readFileSync(mainPath, 'utf8');
s = s.replace(/const BUILD_ID = '[^']*';/, "const BUILD_ID = '" + id + "';")
     .replace(/const BUILD_DATE = '[^']*';/, "const BUILD_DATE = '" + date + "';");
fs.writeFileSync(mainPath, s);
console.log('build ' + id + '  ' + date);
