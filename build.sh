#!/bin/sh
# Bundle the game and stage the publishable files in dist/
set -e
cd "$(dirname "$0")"
mkdir -p dist/assets
npx esbuild src/main.js --bundle --minify --format=iife --target=es2020,safari15 --outfile=dist/game.js --log-level=warning
cp src/index.html dist/index.html
for f in hero grunt boss sword weapons props; do cp assets/$f.glb dist/assets/; done
node tools/glb2json.js dist/assets/*.glb
cp assets/*.jpg assets/skeleton.json dist/assets/ 2>/dev/null || true
# local test page with the document skeleton the artifact host adds
{ printf '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src '"'"'self'"'"'; script-src '"'"'self'"'"' '"'"'unsafe-inline'"'"'; style-src '"'"'self'"'"' '"'"'unsafe-inline'"'"' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src '"'"'self'"'"' data: blob:; connect-src '"'"'self'"'"'">'; cat src/index.html; printf '</html>'; } > dist/test.html
ls -la dist dist/assets | awk '{print $5, $9}'
