import Headline from './headline';
import Pop from './pop';

export interface GameState {
	turns: {
		number: number;
		rebel: any | null;
		authority: any | null;
	};
	rebelPosition: number;
	victor: 'rebel' | 'authority' | null;
	log: Array<{
			turn: number;
			headlines: Headline[];
	}>;
	pops: { [districtId: number]: Pop[] };
	tension: {
		level: number;
		progress: number;
	};
}

export default GameState;
