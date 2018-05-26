import Headline from './headline';
import Pop from './pop';

export interface GameState {
	turns: {
		number: number,
		rebel: any | null,
		authority: any | null,
	};
	rebelControlled: number[];
	rebelPosition: number;
	uncovered: number[];
	patrols: number[];
	victor: 'rebel' | 'authority' | null;
	log: Array<{
			turn: number,
			headlines: Headline[],
	}>;
	pops: { [districtId: number]: Pop[] };
}

export default GameState;
