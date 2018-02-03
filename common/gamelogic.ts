import { GameState } from './gamestate';
import { District } from './district';

export function getAvailableActions(role: string, district: District, state: GameState): string[] {
	let actions: string[] = [];

	const nonRiverNeighbors = district.neighbors.filter(n => (!district.rivers.includes(n)) || district.bridges.includes(n));

	if (role === 'rebel') {
		const isUrban = district.type === 'urban';
		const isRebelPosition = district.id === state.rebelPosition;
		const isAdjacentToRebelPosition = nonRiverNeighbors.some(n => n.id === state.rebelPosition);
		if (isUrban && (isRebelPosition || isAdjacentToRebelPosition)) {
			actions.push('move');
		}
	} else if (role === 'authority') {
		if (district.type === 'urban') {
			actions.push('patrol');
		}
	}

	return actions;
}