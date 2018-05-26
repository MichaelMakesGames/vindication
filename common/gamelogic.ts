import * as seedrandom from 'seedrandom';

import { District } from './district';
import { GameState } from './gamestate';
import { Map } from './map';

export function createInitialState(map: Map, seed: number): GameState {
	const rng = seedrandom(seed);

	const state: GameState = {
		log: [],
		patrols: [],
		pops: {},
		rebelControlled: [],
		rebelPosition: 0,
		tension: {
			level: 1,
			progress: 0,
		},
		turns: {
			authority: null,
			number: 1,
			rebel: null,
		},
		uncovered: [],
		victor: null,
	};

	const urbanDistricts = map.districts.filter((d) => d.type === 'urban');

	for (const district of urbanDistricts) {
		const pops = [];
		const numPops = 9;
		const numRebelPops = Math.floor(rng() * 4);
		const numAuthorityPops = Math.floor(rng() * 4);
		const numNeutralPops = 9 - numRebelPops - numAuthorityPops;

		for (let i = 0; i < numPops; i++) {
			const pop = {
				loyalty: 'neutral',
				loyaltyVisibleTo: {
					authority: false,
					rebel: true,
				},
			};
			if (i < numAuthorityPops) {
				pop.loyalty = 'authority';
				pop.loyaltyVisibleTo.authority = true;
			} else if (i < numAuthorityPops + numNeutralPops) {
				// no other set up currently needed for neutral pops
			} else {
				pop.loyalty = 'rebel';
			}
			pops.push(pop);
		}

		state.pops[district.id] = pops;
	}

	const rebelStart = urbanDistricts[Math.floor(rng() * urbanDistricts.length)];
	state.rebelControlled.push(rebelStart.id);
	state.rebelPosition = rebelStart.id;

	return state;
}

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

export function submitTurn(
	map: Map,
	state: GameState,
	role: string,
	turn: {district: number, action: string},
): GameState {
	// validate turn
	if (!turn) {
		return state;
	}
	const district = map.districts[turn.district];
	const actions = getAvailableActions(role, district, state);
	if (!actions.includes(turn.action)) {
		return state;
	}

	if (role === 'rebel') {
		state.turns.rebel = turn;
	}
	if (role === 'authority') {
		state.turns.authority = turn;
	}
	return state;
}

export function processTurn(map: Map, state: GameState): GameState {

	const rebelDistrict = map.districts[state.turns.rebel.district];
	const authorityDistrict = map.districts[state.turns.authority.district];

	const log = {
		headlines: [],
		turn: state.turns.number,
	};

	if (state.turns.rebel.action === 'move') {
		state.rebelPosition = rebelDistrict.id;
	} else if (state.turns.rebel.action === 'organize') {
		state.rebelControlled.push(rebelDistrict.id);
		if (state.patrols.includes(rebelDistrict.id)) {
			state.patrols = state.patrols.filter((id) => id !== rebelDistrict.id);
			state.uncovered.push(rebelDistrict.id);
			log.headlines.push({
				district: rebelDistrict.id,
				text: `Police patrols driven out of ${rebelDistrict.name} by rebel attack`,
			});
		}
	}

	if (state.turns.authority.action === 'patrol') {
		if (state.uncovered.includes(authorityDistrict.id)) {
			state.uncovered = state.uncovered.filter((id) => id !== authorityDistrict.id);
			state.rebelControlled = state.rebelControlled.filter((id) => id !== authorityDistrict.id);
			state.patrols.push(authorityDistrict.id);
			log.headlines.push({
				district: authorityDistrict.id,
				text: `Raid in ${authorityDistrict.name}, rebels on the retreat!`,
			});
		} else if (state.rebelControlled.includes(authorityDistrict.id)) {
			state.uncovered.push(authorityDistrict.id);
			log.headlines.push({
				distrct: authorityDistrict.id,
				text: `Police uncover rebel menace in ${authorityDistrict.name}`,
			});
		} else {
			state.patrols.push(authorityDistrict.id);
			log.headlines.push({
				district: authorityDistrict.id,
				text: `New patrols established in ${authorityDistrict.name}, no insurgents found`,
			});
		}
	}

	if (state.rebelControlled.length >= 15) {
		state.victor = 'rebel';
		log.headlines.push({
			district: rebelDistrict.id,
			text: `The Old Regime has fallen, long live the Revolution!`,
		});
	}
	if (state.patrols.includes(state.rebelPosition)) {
		state.victor = 'authority';
		log.headlines.push({
			district: authorityDistrict.id,
			text: `Rebellion leadership captured during raid in ${authorityDistrict.name}`,
		});
	}

	state.turns.number++;
	state.turns.rebel = null;
	state.turns.authority = null;
	state.log.push(log);

	return state;
}
