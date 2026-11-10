#!/bin/sh
# Copy the current build into the public GitHub Pages repo with a cache-busting version stamp.
set -e
cd "$(dirname "$0")"
./build.sh >/dev/null
V=$(git rev-parse --short HEAD)-$(date +%s)
P=../ironwake-play
cp dist/game.js "$P/game.js"
for f in dist/assets/*; do b=$(basename "$f"); [ "$b" = sword_still.jpg ] || cp "$f" "$P/assets/$b"; done
{ printf '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
  printf '<script>window.ASSET_V="%s"</script>\n' "$V"
  sed "s|<script src=\"game.js\"></script>|<script src=\"game.js?v=$V\"></script>|" src/index.html
  printf '\n</html>\n'; } > "$P/index.html"
echo "stamped $V"
