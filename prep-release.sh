#!/usr/bin/env bash
#
# Builds the Chrome Web Store upload package.
#
# Usage: ./prep-release.sh
#
# The zip is written to golinks-plus-<version>.zip in the repo root, with
# manifest.json at the archive root. Only runtime files are included; docs,
# screenshots, and other repo-only assets are left out.

set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f manifest.json ]]; then
  echo "error: manifest.json not found" >&2
  exit 1
fi

version="$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -n 1)"

if [[ -z "$version" ]]; then
  echo "error: could not read version from manifest.json" >&2
  exit 1
fi

out_file="golinks-plus-$version.zip"

# Runtime files. Keep this list in sync with manifest.json and the pages.
files=(
  CHANGELOG.md
  LICENSE
  manifest.json
  main.js
  managed_schema.json
  helpers/helpers.js
  images/icon-16.png
  images/icon-32.png
  images/icon-48.png
  images/icon-128.png
  images/icon-small-transparent.svg
)

# Include every page file, without pulling in hidden files like .DS_Store.
while IFS= read -r file; do
  files+=("$file")
done < <(find pages -type f ! -name '.*' | sort)

for file in "${files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "error: required file missing: $file" >&2
    exit 1
  fi
done

rm -f "$out_file"

zip -q -X "$out_file" "${files[@]}"

echo "Created $out_file"
echo
unzip -l "$out_file"
