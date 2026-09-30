#!/bin/sh
# Wraps extension/ in a macOS app for Safari and the Mac App Store.
# Needs a Mac with Xcode. Writes the Xcode project to dist/safari/ and opens it.
# The project points at extension/ rather than copying it, so rebuilding in
# Xcode picks up changes; run `npm run build:extension` first.
set -e
cd "$(dirname "$0")/.."
node scripts/build-extension.mjs
rm -rf dist/safari
xcrun safari-web-extension-converter extension \
  --project-location dist/safari \
  --app-name dedoomify \
  --bundle-identifier com.dedoomify.dedoomify \
  --swift --macos-only --no-open --no-prompt --force

# The converter scales the 128px extension icon up for the app. Replace it with
# every size macOS wants, drawn from the 1024px App Store icon.
icon=store/icons/app-icon-1024.png
find dist/safari -name AppIcon.appiconset -type d | while read -r set; do
  rm -f "$set"/*.png
  images=""
  for size in 16 32 128 256 512; do
    for scale in 1 2; do
      px=$((size * scale))
      name="icon_${size}x${size}@${scale}x.png"
      sips -z "$px" "$px" "$icon" --out "$set/$name" >/dev/null
      images="$images{\"idiom\":\"mac\",\"size\":\"${size}x${size}\",\"scale\":\"${scale}x\",\"filename\":\"$name\"},"
    done
  done
  printf '{"images":[%s],"info":{"author":"xcode","version":1}}\n' "${images%,}" > "$set/Contents.json"
done

open "$(find dist/safari -maxdepth 3 -name "*.xcodeproj" | head -n 1)"
