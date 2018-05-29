import * as seedrandom from 'seedrandom';

import { Action } from './action';
import { District } from './district';
import { GameState } from './gamestate';
import { Headline } from './headline';
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

function hasEffect(state: GameState, district: District, effectId: string) {
	return state.effects[district.id].map((effect) => effect.id).includes(effectId);
}

function getEffect(state: GameState, district: District, effectId: string) {
	return state.effects[district.id].find((e) => e.id === effectId);
}

export function areDistrictsAdjacent(from: District, to: District) {
	const river = from.rivers.includes(to);
	const bridge = from.bridges.includes(to);
	const ridge = from.ridges.includes(to);
	return (!ridge && (bridge || !river));
}

export function getAvailableActions(role: string, district: District, state: GameState): Action[] {
	const actions: Action[] = [];

	const filter = (neighbor: District) => areDistrictsAdjacent(district, neighbor);
	const adjacentDistricts = district.neighbors.filter(filter);

	const isUrban = district.type === 'urban';
	const hasCheckpoints = hasEffect(state, district, 'checkpoints');

	if (role === 'rebel') {
		const isRebelPosition = district.id === state.rebelPosition;
		const isAdjacentToRebelPosition = adjacentDistricts.some((n) => n.id === state.rebelPosition);
		const hasNeutralPops = state.pops[district.id] && state.pops[district.id].some((p) => p.loyalty === 'neutral');
		const hasRebelPops = state.pops[district.id] && state.pops[district.id].some((p) => p.loyalty === 'rebel');

		// Tension Level 1 Actions

		if (
			isUrban &&
			isAdjacentToRebelPosition &&
			!hasCheckpoints
		) {
			actions.push({
				district: district.id,
				id: 'move',
				label: 'Move',
			});
		}

		if (
			isUrban &&
			hasNeutralPops &&
			!hasCheckpoints
		) {
			if (hasRebelPops) {
				actions.push({
					district: district.id,
					id: 'provoke',
					label: 'Provoke confrontation',
				});
			}

			if (isRebelPosition || isAdjacentToRebelPosition) {
				actions.push({
					district: district.id,
					id: 'give_speech',
					label: 'Give speech',
				});
			} else {
				actions.push({
					district: district.id,
					id: 'propaganda',
					label: 'Spread propaganda',
				});
			}
		}

		// Tension Level 2 Actions

		if (
			state.tension.level === 2 &&
			isUrban &&
			hasRebelPops &&
			(isRebelPosition || isAdjacentToRebelPosition) &&
			!hasCheckpoints
		) {
			actions.push({
				district: district.id,
				id: 'organize',
				label: 'Organize sympathizers',
			});
		}

		if (
			state.tension.level === 2 &&
			isUrban &&
			hasRebelPops &&
			(isRebelPosition || isAdjacentToRebelPosition) &&
			hasCheckpoints
		) {
			actions.push({
				district: district.id,
				id: 'riot',
				label: 'Incite riot',
			});
		}

	} else if (role === 'authority') {

		// Tension Level 1 Actions

		if (isUrban) {
			actions.push({
				district: district.id,
				id: 'patrol',
				label: 'Send additional patrols',
			});
		}

		if (isUrban && !hasEffect(state, district, 'informant')) {
			actions.push({
				district: district.id,
				id: 'plant_informant',
				label: 'Plant informant',
			});
		}

		// Tension Level 2 Actions

		if (
			state.tension.level === 2 &&
			!hasCheckpoints
		) {
			actions.push({
				district: district.id,
				id: 'establish_checkpoints',
				label: 'Establish checkpoints',
			});
		}
	}

	return actions;
}

export function submitTurn(
	map: Map,
	state: GameState,
	role: string,
	action: Action,
): GameState {
	// validate turn
	if (!action) {
		return state;
	}
	const district = map.districts[action.district];
	const actions = getAvailableActions(role, district, state);
	if (!actions.map((a) => a.id).includes(action.id)) {
		return state;
	}

	if (role === 'rebel') {
		state.turns.rebel = action;
	}
	if (role === 'authority') {
		state.turns.authority = action;
	}
	return state;
}

export function processTurn(map: Map, state: GameState): GameState {

	const rebelTarget = map.districts[state.turns.rebel.district];
	const authorityTarget = map.districts[state.turns.authority.district];

	const log: {
		headlines: Headline[],
		turn: number,
	} = {
		headlines: [],
		turn: state.turns.number,
	};

	// pre-turn processing
	for (const district of map.districts) {
		if (hasEffect(state, district, 'riot')) {
			state.effects[district.id] = state.effects[district.id].filter((e) => e.id !== 'riot');
			log.headlines.push({
				district: district.id,
				text: `Rioters in ${ district.name } disperse after night of destruction`,
				visibleTo: {
					authority: true,
					rebel: true,
				},
			});
		}
	}

	switch (state.turns.rebel.id) {
		case 'move': {
			state.rebelPosition = rebelTarget.id;
			break;
		}

		case 'propaganda': {
			state.pops[rebelTarget.id].find((p) => p.loyalty === 'neutral').loyalty = 'rebel';
			log.headlines.push({
				district: rebelTarget.id,
				text: `Informant: Your informant reports growing rebel sentiment in ${ rebelTarget.name }`,
				visibleTo: {
					authority: true,
					rebel: false,
				},
			});
			break;
		}

		case 'give_speech': {
			// move rebel
			state.rebelPosition = rebelTarget.id;

			// make one pop rebel
			state.pops[rebelTarget.id].find((p) => p.loyalty === 'neutral').loyalty = 'rebel';

			// make one more pop rebel in the same district and each adjacent district
			for (const district of [rebelTarget, ...rebelTarget.neighbors.filter((n) => areDistrictsAdjacent(n, rebelTarget))]) {
				const hasNeutralPop = state.pops[district.id] && state.pops[district.id].some((p) => p.loyalty === 'neutral');
				if (hasNeutralPop) {
					state.pops[district.id].find((p) => p.loyalty === 'neutral').loyalty = 'rebel';
				}

				if (district !== rebelTarget && hasEffect(state, district, 'informant')) {
					log.headlines.push({
						district: district.id,
						text: `Informant: Your informant reports growing rebel sentiment in ${ district.name }`,
						visibleTo: {
							authority: true,
							rebel: false,
						},
					});
				}
			}

			if (hasEffect(state, rebelTarget, 'informant')) {
				log.headlines.push({
					district: rebelTarget.id,
					text: `Informant: Your informant reports that the rebel leadership was seen giving a speech in ${ rebelTarget.name }`, // tslint:disable-line:max-line-length
					visibleTo: {
						authority: true,
						rebel: false,
					},
				});
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

			log.headlines.push({
				district: rebelTarget.id,
				text: `Confrontation between police and protesters in ${ rebelTarget.name } turns violent!`,
				visibleTo: {
					authority: true,
					rebel: true,
				},
			});
			break;
		}

		case 'organize': {
			state.effects[rebelTarget.id].push({
				id: 'organized',
				label: 'Rebels organized',
				visibleTo: {
					authority: hasEffect(state, rebelTarget, 'informant'),
					rebel: true,
				},
			});
			if (hasEffect(state, rebelTarget, 'informant')) {
				log.headlines.push({
					district: rebelTarget.id,
					text: `Informant: Your informant reports that dissedents in ${ rebelTarget.name } are organizing`,
					visibleTo: {
						authority: true,
						rebel: false,
					},
				});
			}
			break;
		}

		case 'riot': {
			state.rebelPosition = rebelTarget.id;
			state.effects[rebelTarget.id].push({
				id: 'riot',
				label: 'Rioting',
				visibleTo: {
					authority: true,
					rebel: true,
				},
			});
			log.headlines.push({
				district: rebelTarget.id,
				text: `Riots break out in ${ rebelTarget.name }`,
				visibleTo: {
					authority: true,
					rebel: true,
				},
			});
			state.tension.progress += 3;
			break;
		}
	}

	switch (state.turns.authority.id) {
		case 'patrol': {
			const pops = state.pops[authorityTarget.id];
			if (!pops.some((p) => p.loyalty === 'neutral')) {
				// if no pop can be converted, then authority player can figure out that all remaining unknown pops are rebel
				for (const pop of pops) {
					pop.loyaltyVisibleTo.authority = true;
				}

				log.headlines.push({
					district: authorityTarget.id,
					text: `Residents of ${ authorityTarget.name} angered by additional patrols`,
					visibleTo: {
						authority: true,
						rebel: true,
					},
				});
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

				log.headlines.push({
					district: authorityTarget.id,
					text: `Mixed reactions to additional police presence in ${ authorityTarget.name }`,
					visibleTo: {
						authority: true,
						rebel: true,
					},
				});
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

			// reveal if rebels are organized
			if (hasEffect(state, authorityTarget, 'organized')) {
				log.headlines.push({
					district: authorityTarget.id,
					text: `Informant: Your newly recruited informant reports existing rebel cells in ${ authorityTarget.name }`,
					visibleTo: {
						authority: true,
						rebel: false,
					},
				});
				getEffect(state, authorityTarget, 'organized').visibleTo.authority = true;
			}
			break;
		}

		case 'establish_checkpoints': {
			state.effects[authorityTarget.id].push({
				id: 'checkpoints',
				label: 'Checkpoints established',
				visibleTo: {
					authority: true,
					rebel: true,
				},
			});
			state.tension.progress += 1;
			log.headlines.push({
				district: authorityTarget.id,
				text: `Police establish checkpoints in ${ authorityTarget.name } in effort to combat rebel menace`,
				visibleTo: {
					authority: true,
					rebel: true,
				},
			});
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
