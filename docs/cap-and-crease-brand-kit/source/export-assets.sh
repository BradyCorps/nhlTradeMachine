#!/usr/bin/env bash
set -euo pipefail

kit_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
svg_dir="$kit_root/assets/svg"
png_dir="$kit_root/assets/png"
favicon_dir="$kit_root/assets/favicon"

mkdir -p "$png_dir" "$favicon_dir"

render_square() {
  local source_file="$1"
  local output_file="$2"
  local size="$3"
  inkscape "$source_file" \
    --export-filename="$output_file" \
    --export-width="$size" \
    --export-height="$size"
}

for size in 1024 512 256 128 64 48; do
  render_square \
    "$svg_dir/cap-and-crease-mark-primary.svg" \
    "$png_dir/cap-and-crease-mark-primary-${size}.png" \
    "$size"
done

for size in 32 24 16; do
  render_square \
    "$svg_dir/cap-and-crease-mark-small.svg" \
    "$png_dir/cap-and-crease-mark-small-${size}.png" \
    "$size"
done

render_square \
  "$svg_dir/cap-and-crease-mark-reversed.svg" \
  "$png_dir/cap-and-crease-mark-reversed-1024.png" \
  1024

render_square \
  "$svg_dir/cap-and-crease-mark-one-color-ink.svg" \
  "$png_dir/cap-and-crease-mark-one-color-ink-1024.png" \
  1024

render_square \
  "$svg_dir/cap-and-crease-mark-one-color-cream.svg" \
  "$png_dir/cap-and-crease-mark-one-color-cream-1024.png" \
  1024

inkscape "$svg_dir/cap-and-crease-ampersand.svg" \
  --export-filename="$png_dir/cap-and-crease-ampersand-1024.png" \
  --export-width=1024

inkscape "$svg_dir/cap-and-crease-ampersand.svg" \
  --export-filename="$png_dir/cap-and-crease-ampersand-512.png" \
  --export-width=512

inkscape "$svg_dir/cap-and-crease-wordmark.svg" \
  --export-filename="$png_dir/cap-and-crease-wordmark-2400.png" \
  --export-width=2400

inkscape "$svg_dir/cap-and-crease-wordmark.svg" \
  --export-filename="$png_dir/cap-and-crease-wordmark-1200.png" \
  --export-width=1200

inkscape "$svg_dir/cap-and-crease-lockup-horizontal.svg" \
  --export-filename="$png_dir/cap-and-crease-lockup-horizontal-3000.png" \
  --export-width=3000

inkscape "$svg_dir/cap-and-crease-lockup-horizontal.svg" \
  --export-filename="$png_dir/cap-and-crease-lockup-horizontal-1500.png" \
  --export-width=1500

inkscape "$svg_dir/cap-and-crease-lockup-stacked.svg" \
  --export-filename="$png_dir/cap-and-crease-lockup-stacked-1200.png" \
  --export-width=1200

inkscape "$svg_dir/cap-and-crease-social-card.svg" \
  --export-filename="$png_dir/cap-and-crease-og-1200x630.png" \
  --export-width=1200 \
  --export-height=630

render_square \
  "$favicon_dir/icon-maskable.svg" \
  "$png_dir/cap-and-crease-social-avatar-1024.png" \
  1024

for size in 16 32 48; do
  render_square \
    "$favicon_dir/favicon.svg" \
    "$favicon_dir/favicon-${size}.png" \
    "$size"
done

render_square \
  "$favicon_dir/icon-maskable.svg" \
  "$favicon_dir/apple-touch-icon.png" \
  180

render_square \
  "$favicon_dir/icon-maskable.svg" \
  "$favicon_dir/icon-192.png" \
  192

render_square \
  "$favicon_dir/icon-maskable.svg" \
  "$favicon_dir/icon-512.png" \
  512

render_square \
  "$favicon_dir/icon-maskable.svg" \
  "$favicon_dir/icon-maskable-512.png" \
  512

render_square \
  "$favicon_dir/icon-maskable.svg" \
  "$favicon_dir/mstile-150.png" \
  150

convert \
  "$favicon_dir/favicon-16.png" \
  "$favicon_dir/favicon-32.png" \
  "$favicon_dir/favicon-48.png" \
  "$favicon_dir/favicon.ico"

echo "Cap & Crease exports complete."
