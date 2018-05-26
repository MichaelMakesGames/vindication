import * as seedrandom from 'seedrandom';

import { District } from './district';
import { GameState } from './gamestate';
import { Map } from './map';

export function createInitialState(map: Map, seed: number): GameState {
	const rng = seedrandom(seed);

	const state: GameState = {
		log: [],
		pops: {},
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
	state.rebelPosition = rebelStart.id;

	return state;
}

function areDistrictsAdjacent(from: District, to: District) {
	const river = from.rivers.includes(to);
	const bridge = from.bridges.includes(to);
	const ridge = from.ridges.includes(to);
	return (!ridge && (bridge || !river));
}

export function getAvailableActions(role: string, district: District, state: GameState): string[] {
	const actions: string[] = [];

	const filter = (neighbor: District) => areDistrictsAdjacent(district, neighbor);
	const adjacentDistricts = district.neighbors.filter(filter);

	if (role === 'rebel') {
		const isUrban = district.type === 'urban';
		const isRebelPosition = district.id === state.rebelPosition;
		const isAdjacentToRebelPosition = adjacentDistricts.some((n) => n.id === state.rebelPosition);
		const hasNeutralPops = state.pops[district.id] && state.pops[district.id].some((p) => p.loyalty === 'neutral');

		if (isUrban && (isAdjacentToRebelPosition)) {
			actions.push('move');
		}

		if (isUrban && hasNeutralPops) {
			if (isRebelPosition || isAdjacentToRebelPosition) {
				actions.push('propaganda_strong');
			} else {
				actions.push('propaganda');
			}
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

	const rebelTarget = map.districts[state.turns.rebel.district];
	const authorityTarget = map.districts[state.turns.authority.district];

	const log = {
		headlines: [],
		turn: state.turns.number,
	};

	switch (state.turns.rebel.action) {
		case 'move': {
			state.rebelPosition = rebelTarget.id;
			break;
		}

		case 'propaganda': {
			state.pops[rebelTarget.id].find((p) => p.loyalty === 'neutral').loyalty = 'rebel';
			break;
		}

		case 'propaganda_strong': {
			state.pops[rebelTarget.id].find((p) => p.loyalty === 'neutral').loyalty = 'rebel';
			for (const district of [rebelTarget, ...rebelTarget.neighbors.filter((n) => areDistrictsAdjacent(n, rebelTarget))]) {
				const hasNeutralPop = state.pops[district.id] && state.pops[district.id].some((p) => p.loyalty === 'neutral');
				if (hasNeutralPop) {
					state.pops[district.id].find((p) => p.loyalty === 'neutral').loyalty = 'rebel';
				}
			}
			break;
		}
	}

	switch (state.turns.authority.action) {
		case 'patrol': {
			// TODO
			break;
		}
	}

	state.turns.number++;
	state.turns.rebel = null;
	state.turns.authority = null;
	state.log.push(log);

	return state;
}
