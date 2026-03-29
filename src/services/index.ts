export { imageLoader, ImageLoader } from './imageLoader';
export type { LoadOptions, LoadResult, ImageLoaderStats, ImageType } from './imageLoader.types';
export { createPlaceholderSvg } from './imageLoader.types';
export {
  loadChampionIcon,
  loadChampionSplash,
  loadChampionLoading,
  preloadChampionIcons,
  isChampionIconCached,
  getCachedChampionIcon,
} from './championImageLoader';
