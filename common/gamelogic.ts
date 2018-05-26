import * as seedrandom from 'seedrandom';

import { District } from './district';
import { GameState } from './gamestate';
import { Map } from './map';

export function createInitialState(map: Map, seed: number): GameState {
	const rng = seedrandom(seed);

	const state: GameState = {
		effects: {},
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

	for (const district of map.districts) {
		state.effects[district.id] = [];
	}

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

function districtHasEffect(state: GameState, district: District, effectId: string) {
	return state.effects[district.id].map((effect) => effect.id).includes(effectId);
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

	const isUrban = district.type === 'urban';

	if (role === 'rebel') {
		const isRebelPosition = district.id === state.rebelPosition;
		const isAdjacentToRebelPosition = adjacentDistricts.some((n) => n.id === state.rebelPosition);
		const hasNeutralPops = state.pops[district.id] && state.pops[district.id].some((p) => p.loyalty === 'neutral');
		const hasRebelPops = state.pops[district.id] && state.pops[district.id].some((p) => p.loyalty === 'rebel');

		if (isUrban && (isAdjacentToRebelPosition)) {
			actions.push('move');
		}

		if (isUrban && hasNeutralPops) {
			if (hasRebelPops) {
				actions.push('provoke');
			}

			if (isRebelPosition || isAdjacentToRebelPosition) {
				actions.push('propaganda_strong');
			} else {
				actions.push('propaganda');
			}
		}

	} else if (role === 'authority') {
		if (isUrban) {
			actions.push('patrol');
		}

		if (isUrban && !districtHasEffect(state, district, 'informant')) {
			actions.push('plant_informant');
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
			// make one pop rebel
			state.pops[rebelTarget.id].find((p) => p.loyalty === 'neutral').loyalty = 'rebel';
			for (const district of [rebelTarget, ...rebelTarget.neighbors.filter((n) => areDistrictsAdjacent(n, rebelTarget))]) {
				// make one more pop rebel in the same district and each adjacent district
				const hasNeutralPop = state.pops[district.id] && state.pops[district.id].some((p) => p.loyalty === 'neutral');
				if (hasNeutralPop) {
					state.pops[district.id].find((p) => p.loyalty === 'neutral').loyalty = 'rebel';
				}
			}
			break;
		}

		case 'provoke': {
			// split up neutral pops according to current loyalties
			const pops = state.pops[rebelTarget.id];
			const numRebelPops = pops.filter((p) => p.loyalty === 'rebel').length;
			const numAuthorityPops = pops.filter((p) => p.loyalty === 'authority').length;
			let numConvertedToRebel = 0;
			let numConvertedToAuthority = 0;
			for (const pop of pops.filter((p) => p.loyalty === 'neutral')) {
				if (
					numConvertedToRebel === 0 ||
					((numConvertedToRebel / numConvertedToAuthority) <= (numRebelPops / numAuthorityPops))
				) {
					pop.loyalty = 'rebel';
					numConvertedToRebel++;
				} else {
					pop.loyalty = 'authority';
					numConvertedToAuthority++;
				}
			}

			// make all loyalties visible to authority
			for (const pop of pops) {
				pop.loyaltyVisibleTo.authority = true;
			}

			// raise tension
			state.tension.progress += 3;
			break;
		}
	}

	switch (state.turns.authority.action) {
		case 'patrol': {
			const pops = state.pops[authorityTarget.id];
			if (!pops.some((p) => p.loyalty === 'neutral')) {
				// if no pop can be converted, then authority player can figure out that all remaining unknown pops are rebel
				for (const pop of pops) {
					pop.loyaltyVisibleTo.authority = true;
				}
			} else {
				// move one pop to authority
				const pop1 = pops.find((p) => p.loyalty === 'neutral');
				pop1.loyalty = 'authority';
				pop1.loyaltyVisibleTo.authority = true;

				// move on pop to rebel and make it visible
				const pop2 = pops.find((p) => p.loyalty === 'neutral');
				if (pop2) {
					pop2.loyalty = 'rebel';
					pop2.loyaltyVisibleTo.authority = true;
				} else {
					// if no more neutral pops, make one existing rebel pop visible
					const rebelPop = pops.find((p) => p.loyalty === 'rebel' && !p.loyaltyVisibleTo.authority);
					if (rebelPop) {
						rebelPop.loyaltyVisibleTo.authority = true;
					}
				}
			}

			// raise tension
			state.tension.progress += 1;
			break;
		}

		case 'plant_informant': {
			state.effects[authorityTarget.id].push({
				id: 'informant',
				label: 'informant',
				visibleTo: {
					authority: true,
					rebel: false,
				},
			});
			for (const pop of state.pops[authorityTarget.id]) {
				pop.loyaltyVisibleTo.authority = true;
			}
			break;
		}
	}

	if (state.tension.progress >= 10) {
		state.tension.level++;
		state.tension.progress = 0;
	}

	state.turns.number++;
	state.turns.rebel = null;
	state.turns.authority = null;
	state.log.push(log);

	return state;
}
