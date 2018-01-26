import { District } from '../common/district';
import { Random } from 'rng';

export function generateName(district: District, rng): string {
  const noun = NOUNS[Math.floor(rng.random() * NOUNS.length)];
  const modifier = MODIFIERS[Math.floor(rng.random() * MODIFIERS.length)];
  return `${modifier} ${noun}`;
}

const MODIFIERS =[
  'William\'s',
  'Saint James\'',

  'King\'s',
  'Queen\'s',
  'Duke\'s',
  'Lord\'s',

  'Butchers\'',
  'Bakers\'',
  'Millers\'',
  'Beggars\'',
  'Artists\'',
  'Brewers\'',
  'Weavers\'',
  'Chemists\'',

  'Fish',
  'Knott',
  'Ox',
  'Dragon',
  
  'New',
  'Old',
  'Black',
  'Green',
  'Red',
  'White',
  'Gold',
  'Free'
];

const NOUNS = [
  // 'Moor',
  // 'Heath',
  // 'Downs',
  // 'Fen',
  // 'Marsh',
  // 'Fields'
  'Hill',
  'Market',
  'Square',
  'Plaza',
  'Court',
  'Town',
  'Quarter',
  'Way',
  'Road',
  'Path',
  'Heights',
  'Fort',
  'Burg',
  'Bend',
  'Yard',
  'Brook',
  'Castle',
  'Tower',
  'Gate',
  'Spring'
];