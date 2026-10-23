/**
 * Section header icons — the real Stacked Design System tiles.
 *
 * These are the system's own artwork, not a reconstruction: chunky two-tone
 * squircles with hand-drawn edges, the glyph in a deeper shade of the tile's
 * own hue, each already rotated a degree or two. Exported from the design
 * system at 542×542 with transparency, so they need no tile wrapper and no
 * CSS rotation — the file is the whole icon.
 *
 * Hue carries loose meaning in the system, so each section wears the tile
 * that fits its job rather than one picked for looks:
 *
 *   Lead Progress   people (pink)        leads are people
 *   Score           shield + tick (lilac) a score is a trust mark
 *   Marketplace     shield + fork (pink)  the approved listing badge
 *   Market Intel    bar chart (sky)       comparative data
 *   Marketing       screen (peach)        content and placements
 *   Site Traffic    wifi (sky)            visits arriving
 *
 * Two sections share a hue, which the system allows — tiles are a scattered
 * motif, not a strict one-per-hue set.
 */

export type SectionIconName =
  | 'pipeline'
  | 'score'
  | 'market'
  | 'activity'
  | 'traffic'
  | 'glossary';

const TILES: Record<SectionIconName, { src: string; alt: string }> = {
  pipeline: { src: '/icons/tile-people-pink.png', alt: '' },
  score: { src: '/icons/tile-shield-tick-lilac.png', alt: '' },
  glossary: { src: '/icons/tile-shield-fork-pink.png', alt: '' },
  market: { src: '/icons/tile-chart-sky.png', alt: '' },
  activity: { src: '/icons/tile-screen-peach.png', alt: '' },
  traffic: { src: '/icons/tile-wifi-sky.png', alt: '' },
};

export default function SectionIcon({
  name,
  className = '',
}: {
  name: SectionIconName;
  className?: string;
}) {
  const tile = TILES[name];
  return (
    // Decorative: the heading beside it already names the section, so the
    // alt stays empty rather than repeating it to a screen reader.
    <img
      src={tile.src}
      alt={tile.alt}
      aria-hidden="true"
      width={40}
      height={40}
      className={`w-10 h-10 shrink-0 select-none ${className}`}
    />
  );
}
