import type { ImageSourcePropType } from 'react-native';
import type { PaperChallengeArtworkId } from './paperChallenge.ts';

export const EVENT_ARENA_ARTWORK_SOURCES: Record<PaperChallengeArtworkId, ImageSourcePropType> = {
  stadium: require('../assets/event-arena-stadium.jpg'),
  'neon-nightclub': require('../assets/event-arena-neon-nightclub.jpg'),
  'mountain-summit': require('../assets/event-arena-mountain-summit.jpg'),
  'red-showdown': require('../assets/event-arena-red-showdown.jpg'),
  'green-stock-exchange': require('../assets/event-arena-green-stock-exchange.jpg'),
  'penny-stock-mayhem': require('../assets/event-arena-penny-stock-mayhem.jpg'),
  'lightning-round-arena': require('../assets/lightning-round-arena-clean.jpg'),
};
