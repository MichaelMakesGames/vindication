import { Random } from 'rng';
import { District } from '../common/district';

export function generateName(district: District, rng): string {
	const noun = NOUNS[Math.floor(rng.random() * NOUNS.length)];
	const modifier = MODIFIERS[Math.floor(rng.random() * MODIFIERS.length)];
	return `${modifier} ${noun}`;
}

const MODIFIERS = [
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
	'Smiths\'',
	'Dyers\'',
	'Soldiers\'',

	'Fish',
	'Salt',
	'Ox',
	'Cloth',

	'Knott',
	'Dragon',

	'New',
	'Old',
	'Low',
	'High',
	'Black',
	'Green',
	'Red',
	'White',
	'Gold',
	'Free',
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
	'Avenue',
	'Alleys',
	'Labyrinth',
	'Garden',
	'Heights',
	'Fort',
	'Burg',
	'Bend',
	'Yard',
	'Brook',
	'Castle',
	'Tower',
	'Gate',
	'Spring',
];
