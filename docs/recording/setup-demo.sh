#!/usr/bin/env bash
# Makes the small demo project the recording scripts drive: a greet.js to
# rename and a build/ folder for Blast Radius to hold. Run it from
# docs/recording/; it writes ./demo and ./out next to the scripts.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p demo/build out
cat > demo/greet.js <<'JS'
function greet(name) {
  return `Hello, ${name}!`
}

console.log(greet('world'))
JS
for f in app.js vendor.js styles.css; do echo "// built" > "demo/build/$f"; done
echo "demo project ready in $(pwd)/demo"
