import { District } from './district';
import { GameState } from './gamestate';

export function getAvailableActions(role: string, district: District, state: GameState): string[] {
	const actions: string[] = [];

	const filter = (n: District) => (!district.rivers.includes(n)) || district.bridges.includes(n);
	const nonRiverNeighbors = district.neighbors.filter(filter);

	if (role === 'rebel') {
		const isUrban = district.type === 'urban';
		const isRebelPosition = district.id === state.rebelPosition;
		const isAdjacentToRebelPosition = nonRiverNeighbors.some((n) => n.id === state.rebelPosition);
		const isRebelControlled = state.rebelControlled.includes(district.id);
		const isAdjacentToRebelControlled = nonRiverNeighbors.some((n) => state.rebelControlled.includes(n.id));
		if (isUrban && (isRebelPosition || isAdjacentToRebelPosition)) {
			actions.push('move');
		}
		if (isUrban && !isRebelControlled && isAdjacentToRebelControlled) {
			actions.push('organize');
		}
	} else if (role === 'authority') {
		if (district.type === 'urban') {
			actions.push('patrol');
		}
	}

	return actions;
}
