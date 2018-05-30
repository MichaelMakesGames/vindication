import * as seedrandom from 'seedrandom';

import { Action } from './action';
import { District } from './district';
import { GameState } from './gamestate';
import { Headline } from './headline';
import { Map } from './map';
import { Pop } from './pop';

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
		state.pops[district.id] = [];
	}

	const urbanDistricts = map.districts.filter((d) => d.type === 'urban');

	for (const district of urbanDistricts) {
		const pops = state.pops[district.id];
		const numPops = 9;
		const numRebelPops = Math.floor(rng() * 4);
		const numAuthorityPops = Math.floor(rng() * 4);
		const numNeutralPops = 9 - numRebelPops - numAuthorityPops;

		for (let i = 0; i < numPops; i++) {
			const pop: Pop = {
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
		const hasAuthorityPops = state.pops[district.id].some((p) => p.loyalty === 'authority');
		const hasNeutralPops = state.pops[district.id].some((p) => p.loyalty === 'neutral');
		const hasRebelPops = state.pops[district.id].some((p) => p.loyalty === 'rebel');

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
			!hasCheckpoints &&
			!hasEffect(state, district, 'riot')
		) {
			if (
				(isRebelPosition || isAdjacentToRebelPosition) &&
				hasRebelPops &&
				hasAuthorityPops
			) {
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
			}
		}

		// Tension Level 2 Actions

		if (
			state.tension.level === 2 &&
			isUrban &&
			hasRebelPops &&
			(isRebelPosition || isAdjacentToRebelPosition) &&
			!hasEffect(state, district, 'organized') &&
			!hasEffect(state, district, 'riot') &&
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
			!hasEffect(state, district, 'riot')
		) {
			actions.push({
				district: district.id,
				id: 'riot',
				label: 'Incite riot',
			});
		}

		if (
			state.tension.level >= 2 &&
			isUrban &&
			!hasEffect(state, district, 'riot')
		) {
			actions.push({
				district: district.id,
				id: 'root_out_infiltrators',
				label: 'Root out infiltrators',
			});
		}

	} else if (role === 'authority') {

		// Tension Level 1 Actions

		if (
			state.tension.level === 1 &&
			isUrban &&
			!hasEffect(state, district, 'patrolled')
		) {
			actions.push({
				district: district.id,
				id: 'patrol',
				label: 'Establish patrols',
			});
		}

		if (
			isUrban &&
			!hasEffect(state, district, 'informant') &&
			!hasEffect(state, district, 'riot')
		) {
			actions.push({
				district: district.id,
				id: 'plant_informant',
				label: 'Plant informant',
			});
		}

		// Tension Level 2 Actions

		if (
			state.tension.level === 2 &&
			isUrban &&
			!hasCheckpoints &&
			!hasEffect(state, district, 'riot')
		) {
			actions.push({
				district: district.id,
				id: 'establish_checkpoints',
				label: 'Establish checkpoints',
			});
		}

		if (
			state.tension.level === 2 &&
			isUrban &&
			!hasEffect(state, district, 'riot')
		) {
			actions.push({
				district: district.id,
				id: 'raid',
				label: 'Raid!',
			});
		}

		if (
			state.tension.level === 2 &&
			hasEffect(state, district, 'infiltrator')
		) {
			actions.push({
				district: district.id,
				id: 'arrange_meeting',
				label: 'Infiltrator: ask where the ringleader is',
			});
		}

		if (hasEffect(state, district, 'riot')) {
			actions.push({
				district: district.id,
				id: 'pacify_riot',
				label: 'Put down riot',
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
		// nothing yet
	}

	switch (state.turns.rebel.id) {
		case 'move': {
			state.rebelPosition = rebelTarget.id;
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
						text: `Informant: Your informant in ${ district.name } reports that a rebel ringleader gave a speech somewhere nearby`, // tslint:disable-line:max-line-length
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
			// move rebel leader
			state.rebelPosition = rebelTarget.id;
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
			state.rebelPosition = rebelTarget.id,
			state.effects[rebelTarget.id].push({
				id: 'organized',
				label: 'Rebels organized',
				visibleTo: {
					authority: hasEffect(state, rebelTarget, 'informant'),
					rebel: true,
				},
			});

			// Informant reports and becomes infiltrator
			if (hasEffect(state, rebelTarget, 'informant')) {
				log.headlines.push({
					district: rebelTarget.id,
					text: `Informant: The rebel ringleader has come to organize the dissidents in ${ rebelTarget.name }, and one of your informants secured a position as a local leader`, // tslint:disable-line:max-line-length
					visibleTo: {
						authority: true,
						rebel: false,
					},
				});
				state.effects[rebelTarget.id].push({
					id: 'infiltrator',
					label: 'Infiltrator',
					visibleTo: {
						authority: true,
						rebel: false,
					},
				});
			}

			break;
		}

		case 'riot': {
			// move rebel
			state.rebelPosition = rebelTarget.id;

			// add riot effect and remove all other effects
			state.effects[rebelTarget.id] = [{
				id: 'riot',
				label: 'Rioting',
				visibleTo: {
					authority: true,
					rebel: true,
				},
			}];

			// reveal loyalties
			for (const pop of state.pops[rebelTarget.id]) {
				pop.loyaltyVisibleTo.authority = true;
			}

			// add 1 authority pop to every district
			for (const district of map.districts) {
				if (state.pops[district.id].some((p) => p.loyalty === 'neutral')) {
					const convert = state.pops[district.id].find((p) => p.loyalty === 'neutral');
					convert.loyalty = 'authority';
					convert.loyaltyVisibleTo.authority = true;
					// TODO reveal rebel pops if one can't be converted? trigger additional riots?
				}
			}

			// add headline
			log.headlines.push({
				district: rebelTarget.id,
				text: `Riots break out in ${ rebelTarget.name }, raising concern across the city`,
				visibleTo: {
					authority: true,
					rebel: true,
				},
			});

			// raise tension
			state.tension.progress += 3;
			break;
		}

		case 'root_out_infiltrators': {
			const infiltrator = getEffect(state, rebelTarget, 'infiltrator');
			if (infiltrator) {
				// remove infiltrator if it exists
				state.effects[rebelTarget.id] = state.effects[rebelTarget.id].filter((e) => e.id !== 'infiltrator');
				log.headlines.push({
					district: rebelTarget.id,
					text: `We have found a collaborator in ${ rebelTarget.name }; they won't be a problem anymore`,
					visibleTo: {
						authority: false,
						rebel: true,
					},
				});
				log.headlines.push({
					district: rebelTarget.id,
					text: `Our infiltrator in ${ rebelTarget.name } has suddenly gone silent...`,
					visibleTo: {
						authority: true,
						rebel: false,
					},
				});
			} else {
				// make up to 2 rebel pops neutral if no infiltrator found
				let pop = state.pops[rebelTarget.id].find((p) => p.loyalty === 'rebel');
				if (pop) {
					pop.loyalty = 'neutral';
				}
				pop = state.pops[rebelTarget.id].find((p) => p.loyalty === 'rebel');
				if (pop) {
					pop.loyalty = 'neutral';
				}
				log.headlines.push({
					district: rebelTarget.id,
					text: `We found no infiltrators among our ranks in ${ rebelTarget.name }, and our hunt damaged our reputation`,
					visibleTo: {
						authority: false,
						rebel: true,
					},
				});
			}
			break;
		}
	}

	switch (state.turns.authority.id) {
		case 'patrol': {
			state.effects[authorityTarget.id].push({
				id: 'patrolled',
				label: 'Patrolled',
				visibleTo: {
					authority: true,
					rebel: true,
				},
			});

			const pops = state.pops[authorityTarget.id];
			const neutralPops = pops.filter((p) => p.loyalty === 'neutral');
			if (neutralPops.length < 2) {
				// if 2 pops can't be converted, then authority player can figure out that all remaining unknown pops are rebel
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
				log.headlines.push({
					district: authorityTarget.id,
					text: `Mixed reactions to additional police presence in ${ authorityTarget.name }`,
					visibleTo: {
						authority: true,
						rebel: true,
					},
				});
			}

			// move two pops to authority
			const pop1 = pops.find((p) => p.loyalty === 'neutral');
			if (pop1) {
				pop1.loyalty = 'authority';
				pop1.loyaltyVisibleTo.authority = true;
			}
			const pop2 = pops.find((p) => p.loyalty === 'neutral');
			if (pop2) {
				pop2.loyalty = 'authority';
				pop2.loyaltyVisibleTo.authority = true;
			}

			// move on pop to rebel and make it visible
			const pop3 = pops.find((p) => p.loyalty === 'neutral');
			if (pop3) {
				pop3.loyalty = 'rebel';
				pop3.loyaltyVisibleTo.authority = true;
			} else {
				// if no more neutral pops, make one existing rebel pop visible
				const rebelPop = pops.find((p) => p.loyalty === 'rebel' && !p.loyaltyVisibleTo.authority);
				if (rebelPop) {
					rebelPop.loyaltyVisibleTo.authority = true;
				}
			}

			// raise tension
			state.tension.progress += 2;
			break;
		}

		case 'plant_informant': {
			state.effects[authorityTarget.id].push({
				id: 'informant',
				label: 'Informant',
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

		case 'raid': {
			if (state.rebelPosition === authorityTarget.id) {
				state.victor = 'authority';
				log.headlines.push({
					district: authorityTarget.id,
					text: `Police raid in ${ authorityTarget.name } captures rebel leadership`,
					visibleTo: {
						authority: true,
						rebel: true,
					},
				});
			} else {
				state.tension.progress += 3;
				for (const pop of state.pops[authorityTarget.id]) {
					if (pop.loyalty === 'neutral') {
						pop.loyalty = 'rebel';
					}
					pop.loyaltyVisibleTo.authority = true;
				}
				log.headlines.push({
					district: authorityTarget.id,
					text: `Attempted raid of rebel headquarters in ${ authorityTarget.name } angers local residents`,
					visibleTo: {
						authority: true,
						rebel: true,
					},
				});
			}
			break;
		}

		case 'arrange_meeting': {
			let success = false;
			for (const neighbor of authorityTarget.neighbors.filter((n) => areDistrictsAdjacent(n, authorityTarget))) {
				if (state.rebelPosition === neighbor.id) {
					success = true;
					log.headlines.push({
						district: neighbor.id,
						text: `Infiltrator: your infiltrator has located the rebel ringleader in ${ neighbor.name }, but attracted attention doing so`, // tslint:disable-line:max-line-length
						visibleTo: {
							authority: true,
							rebel: false,
						},
					});
				}
			}
			if (!success) {
				log.headlines.push({
					district: authorityTarget.id,
					text: `Infiltrator: your infiltrator was unable to locate the ringleader, and worse, attracted attention trying`,
					visibleTo: {
						authority: true,
						rebel: false,
					},
				});
			}
			log.headlines.push({
				district: authorityTarget.id,
				text: `One the local resistance leaders in ${ authorityTarget.name } has been asking about your location...`,
				visibleTo: {
					authority: false,
					rebel: true,
				},
			});
			getEffect(state, authorityTarget, 'infiltrator').visibleTo.rebel = true;
			break;
		}

		case 'pacify_riot': {
			state.effects[authorityTarget.id] = [{
				id: 'checkpoints',
				label: 'Checkpoints established',
				visibleTo: {
					authority: true,
					rebel: true,
				},
			}];
			log.headlines.push({
				district: authorityTarget.id,
				text: `Authorities break up the riots in ${ authorityTarget.name }, establish checkpoints`,
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

		if (state.tension.level === 2) { // state 2 set up
			// patrolled districts become checkpoints
			for (const district of map.districts) {
				for (const effect of state.effects[district.id]) {
					if (effect.id === 'patrolled') {
						effect.id = 'checkpoints';
						effect.label = 'Checkpoints established';
						log.headlines.push({
							district: district.id,
							text: `With rising tensions, patrols in ${ district.name } have established checkpoints`,
							visibleTo: {
								authority: true,
								rebel: true,
							},
						});
					}
				}
			}
		}
	}

	state.turns.number++;
	state.turns.rebel = null;
	state.turns.authority = null;
	state.log.push(log);

	return state;
}
