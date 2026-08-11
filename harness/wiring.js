'use strict';
/*
 * Renderer -> preload -> main wiring.
 *
 * A backend that works is useless if the button does not reach it. This suite asserts the chain
 * statically: the markup calls the handler, the integration layer defines it, it calls the right IPC
 * channel, preload bridges that channel, and main registers it. It also asserts the shape of the two
 * uninstall paths, because the original faults were both wiring faults rather than logic faults.
 */

const fs=require("fs");
const path=require("path");
const R=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const html=R("renderer/index.html");
let pass=0,fail=0;
const fails=[];
const ck=(n,c)=>{ if(c)pass++; else {fail++;fails.push("  "+n);} };

console.log("\n=== markup buttons -> handlers ===");
ck("'Remove all mods' button calls uninstallAllMods()", /onclick="uninstallAllMods\(\)"/.test(html));
ck("per-mod card calls confirmUninstall(id)", /onclick="confirmUninstall\('\$\{m\.id\}'\)"/.test(html));

console.log("\n=== the REAL (integration-layer) implementations exist and override the mockup ===");
const block = html.split(/<script[^>]*>/).pop ? html.match(/<script[^>]*>([\s\S]*?)<\/script>/g) : [];
const integ = block.find(b=>/window\.stereo && window\.stereo\.isReal/.test(b))||"";
ck("integration layer found", integ.length>1000);
ck("window.uninstallAllMods defined in it", /window\.uninstallAllMods\s*=\s*async function/.test(integ));
ck("window.confirmUninstall defined in it", /window\.confirmUninstall\s*=\s*async function/.test(integ));
ck("openDetail defined BEFORE use", integ.indexOf("window.openDetail =") < integ.indexOf("uninstallAllMods"));

console.log("\n=== uninstallAllMods calls the right channels, in order ===");
const uam = (integ.match(/window\.uninstallAllMods\s*=\s*async function\(\)\{[\s\S]*?\n  \};/)||[""])[0];
ck("builds the payload with serializeGame", /serializeGame\(g,\s*sel\)/.test(uam));
ck("reads the manifest via S.installedMods", /S\.installedMods\(payload\)/.test(uam));
ck("calls S.uninstallAll", /S\.uninstallAll\(payload\)/.test(uam));
ck("does NOT loop g.inst calling S.uninstall (the old bug)", !/for\s*\(\s*const\s+id\s+of\s+order\s*\)/.test(uam));
ck("re-derives from disk afterwards", /refreshDetected\(sel,\{adopt:false\}\)/.test(uam));
ck("persists the library", /persistLibrary\(\)/.test(uam));
ck("reports the result to the user", /T\(/.test(uam));

console.log("\n=== confirmUninstall calls the right channel ===");
const cu = (integ.match(/window\.confirmUninstall\s*=\s*async function\(id\)\{[\s\S]*?\n  \};/)||[""])[0];
ck("maps card id -> registry id via bidOf", /S\.uninstall\(bidOf\(id\),\s*payload\)/.test(cu));
ck("uses serializeGame payload", /serializeGame\(g,\s*sel\)/.test(cu));
ck("handles the untracked outcome", /res\.untracked/.test(cu));
ck("re-derives with adopt:false", /refreshDetected\(sel,\{adopt:false\}\)/.test(cu));

console.log("\n=== preload actually bridges them ===");
const pre=R("preload.js");
ck("uninstall bridged", /uninstall:\s*\(modId, game\)/.test(pre));
ck("uninstallAll bridged", /uninstallAll:\s*\(game\)/.test(pre));
ck("installedMods bridged", /installedMods:\s*\(game\)/.test(pre));

console.log("\n=== main.js registers them ===");
const main=R("main.js");
for(const h of ["uninstall","uninstallAll","installedMods"])
  ck("handler registered: "+h, new RegExp("ipcMain\\.handle\\('"+h+"'").test(main));

console.log("\n=== no stale/duplicate definitions shadowing the fix ===");
ck("only one window.uninstallAllMods", (html.match(/window\.uninstallAllMods\s*=/g)||[]).length===1);
ck("only one window.confirmUninstall", (html.match(/window\.confirmUninstall\s*=/g)||[]).length===1);
ck("only one window.openDetail", (html.match(/window\.openDetail\s*=/g)||[]).length===1);
ck("no unguarded openDetail( calls remain",
   (html.match(/[^.\w]openDetail\(/g)||[]).every((_,i)=>true) &&
   !/render\(activeList\(\)\); openDetail\(sel\);/.test(html));

console.log("\nwiring: "+pass+" passed, "+fail+" failed");
if(fail){console.log("\nFailures:\n"+fails.join("\n"));}
process.exit(fail?1:0);
