#!/usr/bin/env bash
# Run every suite. No network, no real game folders — each suite builds its own sandbox.
#
#   bash harness/validate.sh
#
# Individual suites:
#   node harness/smoke.js      structure, IPC symmetry, registry, links, undefined globals
#   node harness/apidetect.js  render-API detection against real synthetic PE images
#   node harness/uninstall.js  install/uninstall lifecycle and per-game tracking
#   node harness/matrix.js     every mod against every engine layout, and every output format
#   node harness/conflicts.js  proxy slots, install order, ownership, uninstall permutations
#   node harness/configs.js    config round-trips, unknown keys, seeding without overwriting
#   node harness/wiring.js     renderer -> preload -> main wiring for both uninstall paths
#   node harness/apicompare.js old vs new API detector, head to head on realistic fixtures
#   node harness/uninstall-e2e.js  uninstall through the renderer's own payload contract
set -u
cd "$(dirname "$0")/.."

suites=(smoke wiring apidetect apicompare uninstall uninstall-e2e matrix conflicts configs)
failed=0
total_pass=0

for s in "${suites[@]}"; do
  echo
  echo "──────── $s ────────"
  if out=$(node "harness/$s.js" 2>&1); then
    echo "$out" | tail -2
    n=$(echo "$out" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | tail -1)
    total_pass=$((total_pass + ${n:-0}))
  else
    echo "$out"
    failed=$((failed + 1))
  fi
done

echo
echo "════════════════════════════════════════"
if [ "$failed" -eq 0 ]; then
  echo "ALL SUITES PASSED — $total_pass assertions"
else
  echo "$failed SUITE(S) FAILED"
fi
exit "$failed"
