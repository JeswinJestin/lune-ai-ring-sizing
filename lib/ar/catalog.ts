export type RingLayer = {
  band: string;
  gem: string;
};

export type ARLayerRing = {
  id: number;
  name: string;
  slug: string;
  layers: RingLayer;
  description: string;
  innerHoleRatio?: number;
  minThickness_mm?: number;
  targetCoveragePct?: number;
  weightBias?: 'neutral' | 'stone-heavy' | 'band-heavy';
};

export const ARLayerCatalog: ARLayerRing[] = [
  { id: 1, name: 'Solitaire Diamond', slug: 'solitaire-diamond', layers: { band: '/assets/rings/solitaire-diamond/1_band.png', gem: '/assets/rings/solitaire-diamond/1_gem.png' }, description: 'Classic solitaire with brilliant-cut diamond.', innerHoleRatio: 0.58, minThickness_mm: 2.0, targetCoveragePct: 85, weightBias: 'stone-heavy' },
  { id: 2, name: 'Emerald Cut', slug: 'emerald-cut', layers: { band: '/assets/rings/emerald-cut/2_band.png', gem: '/assets/rings/emerald-cut/2_gem.png' }, description: 'Emerald cut center on sleek band.', innerHoleRatio: 0.60, minThickness_mm: 2.1, targetCoveragePct: 82, weightBias: 'stone-heavy' },
  { id: 3, name: 'Vintage Halo', slug: 'vintage-halo', layers: { band: '/assets/rings/vintage-halo/3_band.png', gem: '/assets/rings/vintage-halo/3_gem.png' }, description: 'Halo setting with vintage details.', innerHoleRatio: 0.57, minThickness_mm: 2.2, targetCoveragePct: 86, weightBias: 'stone-heavy' },
  { id: 4, name: 'Sapphire Band', slug: 'sapphire-band', layers: { band: '/assets/rings/sapphire-band/4_band.png', gem: '/assets/rings/sapphire-band/4_gem.png' }, description: 'Sapphire accent band.', innerHoleRatio: 0.62, minThickness_mm: 2.0, targetCoveragePct: 80, weightBias: 'band-heavy' },
  { id: 5, name: 'Classic Gold Band', slug: 'classic-gold-band', layers: { band: '/assets/rings/classic-gold-band/5_band.png', gem: '/assets/rings/classic-gold-band/5_gem.png' }, description: 'Minimalist classic gold band.', innerHoleRatio: 0.65, minThickness_mm: 2.2, targetCoveragePct: 90, weightBias: 'band-heavy' },
  { id: 6, name: 'Twisted Vine', slug: 'twisted-vine', layers: { band: '/assets/rings/twisted-vine/6_band.png', gem: '/assets/rings/twisted-vine/6_gem.png' }, description: 'Organic twisted band.', innerHoleRatio: 0.60, minThickness_mm: 2.0, targetCoveragePct: 82, weightBias: 'neutral' },
  { id: 7, name: 'Modern Bezel', slug: 'modern-bezel', layers: { band: '/assets/rings/modern-bezel/7_band.png', gem: '/assets/rings/modern-bezel/7_gem.png' }, description: 'Contemporary bezel setting.', innerHoleRatio: 0.59, minThickness_mm: 2.1, targetCoveragePct: 84, weightBias: 'stone-heavy' },
  { id: 8, name: 'Rose Gold Pearl', slug: 'rose-gold-pearl', layers: { band: '/assets/rings/rose-gold-pearl/8_band.png', gem: '/assets/rings/rose-gold-pearl/8_gem.png' }, description: 'Pearl set on rose gold.', innerHoleRatio: 0.60, minThickness_mm: 2.0, targetCoveragePct: 83, weightBias: 'stone-heavy' },
  { id: 9, name: 'Art Deco Emerald', slug: 'art-deco-emerald', layers: { band: '/assets/rings/art-deco-emerald/9_band.png', gem: '/assets/rings/art-deco-emerald/9_gem.png' }, description: 'Art Deco emerald centerpiece.', innerHoleRatio: 0.58, minThickness_mm: 2.2, targetCoveragePct: 86, weightBias: 'stone-heavy' },
];