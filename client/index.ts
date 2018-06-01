import * as d3 from 'd3';
import * as io from 'socket.io-client';

import { Action } from '../common/action';
import { District, DistrictJson } from '../common/district';
import { areDistrictsAdjacent, getAvailableActions, getEffect, hasEffect } from '../common/gamelogic';
import { GameState } from '../common/gamestate';
import { arePointsEquivalent, getBBoxCenter } from '../common/geometry';
import { Map, mapFromJson, MapJson } from '../common/map';
import { Options } from '../common/options';
import { Pop } from '../common/pop';

import { generate } from './mapgen';
import { polygonToSVGPoints, render, renderPreview } from './render';

const socket = io();

const REBEL = 'rebel';
const AUTHORITY = 'authority';
const gameList = document.getElementById('games');
const noGamesMessage = document.getElementById('no-games-message');
const newGameButton = document.getElementById('new-game-button');
const startGameButton = document.getElementById('start-game');
const joinGameButton = document.getElementById('join-game');
const previewMapButton = document.getElementById('preview-map');
const randomSeedButton = document.getElementById('random-seed');
const nameInput: HTMLInputElement = document.getElementById('name-input') as HTMLInputElement;
const seedInput: HTMLInputElement = document.getElementById('seed-input') as HTMLInputElement;
const roleInput: HTMLSelectElement = document.getElementById('role-input') as HTMLSelectElement;

const lobbyWindow: HTMLElement = document.getElementById('lobby-window');
const newGameWindow: HTMLElement = document.getElementById('new-game-window');
const gameWindow: HTMLElement = document.getElementById('game-window');

function openWindow(window: HTMLElement): void {
	lobbyWindow.style.display = 'none';
	newGameWindow.style.display = 'none';
	gameWindow.style.display = 'none';

	window.style.display = 'block';
}

openWindow(lobbyWindow);

function onNewGameClick() {
	openWindow(newGameWindow);
}
newGameButton.addEventListener('click', onNewGameClick);

function onStartGameClick() {
	const name = nameInput.value;
	const seed = parseFloat(seedInput.value);
	const role = roleInput.value;
	socket.emit('new-game', name, seed, role);
}
startGameButton.addEventListener('click', onStartGameClick);

function onJoinGameClick() {
	const id = parseFloat(this.dataset.gameId);
	const role = this.dataset.role;
	socket.emit('join-game', id, role);
}

function onRandomSeedClick() {
	seedInput.value = Math.floor(Math.random() * 1000000).toString();
	onPreviewMapClick();
}
randomSeedButton.addEventListener('click', onRandomSeedClick);

function onPreviewMapClick() {
	const seed = seedInput.value;
	if (seed !== '' && isFinite(parseFloat(seed))) {
		socket.emit('preview-map', parseFloat(seed));
	}
}
previewMapButton.addEventListener('click', onPreviewMapClick);
socket.on('preview-map', renderPreview);

const clientState: {
	districtHoverEnabled: boolean,
	districtMenuOpen: boolean,
	gameId: number,
	hoveredDistrict: District,
	map: Map,
	overlay: d3.Selection<SVGPolygonElement, District, SVGGElement, {}>,
	role: string,
	selectedDistrict: District,
	scale: number,
	turn: Action,
} = {
	districtHoverEnabled: false,
	districtMenuOpen: false,
	gameId: null,
	hoveredDistrict: null,
	map: null,
	overlay: null,
	role: null,
	scale: 1,
	selectedDistrict: null,
	turn: null,
};

let gameState: GameState = null;

function socketOnGames(games: any[]) {
	if (games.length) {
		noGamesMessage.style.display = 'none';
	} else {
		noGamesMessage.style.display = 'inline';
	}

	for (const child of Array.from(gameList.children)) {
		for (const joinButton of Array.from(child.querySelectorAll('button[data-role]'))) {
			joinButton.removeEventListener('click', onJoinGameClick);
		}
		child.remove();
	}

	for (const game of games) {
		const li = document.createElement('li');
		li.classList.add('game-list__item');

		const span = document.createElement('span');
		span.classList.add('game-list__name');
		span.textContent = game.name;
		li.appendChild(span);

		const joinAsRebelButton = document.createElement('button');
		joinAsRebelButton.classList.add('game-list__join-button');
		joinAsRebelButton.dataset.role = 'rebel';
		joinAsRebelButton.dataset.gameId = game.id;
		if (game.rebel) {
			joinAsRebelButton.textContent = 'Rebel player present';
			joinAsRebelButton.setAttribute('disabled', 'true');
		} else {
			joinAsRebelButton.textContent = 'Join as rebel player';
			joinAsRebelButton.addEventListener('click', onJoinGameClick);
		}
		li.appendChild(joinAsRebelButton);

		const joinAsAuthorityButton = document.createElement('button');
		joinAsAuthorityButton.classList.add('game-list__join-button');
		joinAsAuthorityButton.dataset.role = 'authority';
		joinAsAuthorityButton.dataset.gameId = game.id;
		if (game.authority) {
			joinAsAuthorityButton.textContent = 'Authority player present';
			joinAsAuthorityButton.setAttribute('disabled', 'true');
		} else {
			joinAsAuthorityButton.addEventListener('click', onJoinGameClick);
			joinAsAuthorityButton.textContent = 'Join as authority player';
		}
		li.appendChild(joinAsAuthorityButton);

		gameList.appendChild(li);
	}
}
socket.on('games', socketOnGames);

function socketOnGameJoined(game: any, mapJson: MapJson) {
	openWindow(gameWindow);

	// set up key controls
	document.addEventListener('keydown', (e) => {
		// submit turn
		if (e.key === 'Enter' || e.key === ' ') {
			submitTurn();
		}

		// pan up
		if (e.key === 'w' || e.key === 'ArrowUp') {
			const svg = document.getElementById('map');
			const viewBox = svg.getAttribute('viewBox').split(' ');
			const y = (Number(viewBox[1]) - 30 / clientState.scale).toString();
			viewBox[1] = y;
			svg.setAttribute('viewBox', viewBox.join(' '));
		}

		// pan left
		if (e.key === 'a' || e.key === 'ArrowLeft') {
			const svg = document.getElementById('map');
			const viewBox = svg.getAttribute('viewBox').split(' ');
			const x = (Number(viewBox[0]) - 30 / clientState.scale).toString();
			viewBox[0] = x;
			svg.setAttribute('viewBox', viewBox.join(' '));
		}

		// pan down
		if (e.key === 's' || e.key === 'ArrowDown') {
			const svg = document.getElementById('map');
			const viewBox = svg.getAttribute('viewBox').split(' ');
			const y = (Number(viewBox[1]) + 30 / clientState.scale).toString();
			viewBox[1] = y;
			svg.setAttribute('viewBox', viewBox.join(' '));
		}

		// pan right
		if (e.key === 'd' || e.key === 'ArrowRight') {
			const svg = document.getElementById('map');
			const viewBox = svg.getAttribute('viewBox').split(' ');
			const x = (Number(viewBox[0]) + 30 / clientState.scale).toString();
			viewBox[0] = x;
			svg.setAttribute('viewBox', viewBox.join(' '));
		}

		// start district hover mode
		if (e.key === 'Shift') {
			if (clientState.hoveredDistrict) {
				openDistrictBox(clientState.hoveredDistrict);
			}
			clientState.districtHoverEnabled = true;
		}
	});

	document.addEventListener('keyup', (e) => {
		// stop district hover mode
		if (e.key === 'Shift') {
			clientState.districtHoverEnabled = false;
			if (clientState.selectedDistrict) {
				openDistrictBox(clientState.selectedDistrict);
			} else {
				closeDistrictBox();
			}
		}
	});

	// set up zoom and drag controls
	const zoomed = () => {
		clientState.scale = d3.event.transform.k;
		d3.select('#map > g').attr('transform', d3.event.transform);
	};
	d3.select('#map').call(d3.zoom().filter(() => d3.event.type !== 'dblclick').clickDistance(10).on('zoom', zoomed));

	clientState.gameId = game.id;
	clientState.role = game.rebel === socket.id ? 'rebel' : 'authority';
	document.getElementById('role').innerText = clientState.role;
	document.getElementById('name').innerText = game.name;
	if (clientState.role === 'observer') {
		document.getElementById('submit-turn').onclick = null;
		document.getElementById('submit-turn').style.display = 'none';
	} else {
		document.getElementById('submit-turn').onclick = submitTurn;
	}

	clientState.map = mapFromJson(mapJson);

	render(clientState.map);

	const tooltip = d3.select('#tooltip');
	const centers = d3.select('#centers')
		.selectAll('circle').data(clientState.map.districts.map((d) => getBBoxCenter(d.polygon))).enter()
		.append('circle')
		.attr('fill', 'none')
		.attr('r', 0)
		.attr('cx', (d) => d.x)
		.attr('cy', (d) => d.y);
	clientState.overlay = d3.select<SVGGElement, {}>('#overlay')
		.selectAll<SVGPolygonElement, District>('polygon')
		.data<District>(clientState.map.districts).enter()
		.append<SVGPolygonElement>('polygon')
		.attr('points', (d) => polygonToSVGPoints(d.polygon))
		.classed('district', true)
		.on('mouseenter', (d) => {
			clientState.hoveredDistrict = d;
			if (clientState.districtHoverEnabled) {
				openDistrictBox(clientState.hoveredDistrict);
			}
		})
		.on('click', (d) => {
			if (clientState.selectedDistrict === d) {
				deselectDistrict();
			} else {
				selectDistrict(d);
			}
		})
		.on('contextmenu', (d) => {

			d3.event.preventDefault();
			closeActionsMenu();
			const actions = getAvailableActions(clientState.role, d, gameState);
			if (!actions.length) {
				return;
			}

			const centerCircle = centers.nodes()[d.id] as SVGCircleElement;
			tooltip.style('display', 'block')
				.style('left', `${centerCircle.getBoundingClientRect().left}px`)
				.style('top', `${centerCircle.getBoundingClientRect().top}px`);
			document.getElementById('tooltipDistrictName').innerText = d.name;

			openActionsMenu(actions);
		});
}
socket.on('game-joined', socketOnGameJoined);

function setTurn(action: Action) {
	const district = clientState.map.districts[action.district];
	clientState.turn = action;
	d3.select('#turn-marker').remove();
	d3.select('svg > g').append('circle')
		.attr('id', 'turn-marker')
		.attr('r', 20)
		.attr('cx', getBBoxCenter(district.polygon).x)
		.attr('cy', getBBoxCenter(district.polygon).y)
		.style('fill', clientState.role === REBEL ? 'red' : 'blue' )
		.style('pointer-events', 'none');
}

function openActionsMenu(actions: Action[]) {
	clientState.districtMenuOpen = true;
	d3.select('#tooltipActions').selectAll('button').remove();
	d3.select('#tooltipActions').selectAll('li').data(actions)
		.enter().append('li').append('button')
		.classed('action', true)
		.text((d) => d.label)
		.on('click', (d) => {
			setTurn(d);
		});
}

function closeActionsMenu() {
	clientState.districtMenuOpen = false;
	document.getElementById('tooltipActions').innerHTML = '';
	document.getElementById('tooltip').style.display = 'none';
}
document.addEventListener('click', closeActionsMenu);

function socketOnGameState(newState: GameState) {
	gameState = newState;

	// refresh district box
	if (clientState.districtHoverEnabled && clientState.hoveredDistrict) {
		openDistrictBox(clientState.hoveredDistrict);
	} else if (clientState.selectedDistrict) {
		openDistrictBox(clientState.selectedDistrict);
	}

	document.getElementById('tension-level').innerHTML = gameState.tension.level.toString();
	document.getElementById('tension-progress').innerHTML = gameState.tension.progress.toString();

	d3.select('#rebel-position').remove();
	if (clientState.role === REBEL) {
		d3.select('svg > g').append('circle')
			.attr('id', 'rebel-position')
			.attr('r', 10)
			.attr('cx', getBBoxCenter(clientState.map.districts[gameState.rebelPosition].polygon).x)
			.attr('cy', getBBoxCenter(clientState.map.districts[gameState.rebelPosition].polygon).y)
			.style('fill', 'red')
			.style('pointer-events', 'none');
	}

	clientState.overlay.classed('district--patrolled', (d) => hasEffect(gameState, d, 'patrolled'));
	clientState.overlay.classed('district--checkpoints', (d) => hasEffect(gameState, d, 'checkpoints'));
	clientState.overlay.classed('district--organized', (d) => {
		const organizedEffect = getEffect(gameState, d, 'organized');
		return organizedEffect && organizedEffect.visibleTo[clientState.role];
	});
	clientState.overlay.classed('district--rebel', (d) => hasEffect(gameState, d, 'rebel_controlled'));
	clientState.overlay.classed('district--authority', (d) => hasEffect(gameState, d, 'authority_controlled'));
	clientState.overlay.classed('district--contested', (d) => hasEffect(gameState, d, 'contested'));

	for (const textElement of Array.from(document.querySelectorAll('text'))) {
		textElement.remove();
	}
	for (const district of clientState.map.districts) {
		const informant = getEffect(gameState, district, 'informant');
		const infiltrator = getEffect(gameState, district, 'infiltrator');
		const riot = getEffect(gameState, district, 'riot');
		const mob = getEffect(gameState, district, 'rebel_mob');

		if (
			(informant && informant.visibleTo[clientState.role]) ||
			(infiltrator && infiltrator.visibleTo[clientState.role])
		) {
			console.log('adding informant icon');
			d3.select('svg > g').append('text')
				.style('fill', '#228')
				.style('font-size', '48pt')
				.style('font-weight', 'bold')
				.style('stroke', 'white')
				.style('dominant-baseline', 'middle')
				.style('text-anchor', 'middle')
				.text('👁️')
				.attr('x', getBBoxCenter(district.polygon).x)
				.attr('y', getBBoxCenter(district.polygon).y);
		}

		if (riot || mob) {
			d3.select('svg > g').append('text')
				.style('fill', '#822')
				.style('font-size', '48pt')
				.style('font-weight', 'bold')
				.style('stroke', 'white')
				.style('dominant-baseline', 'middle')
				.style('text-anchor', 'middle')
				.text('🔥')
				.attr('x', getBBoxCenter(district.polygon).x)
				.attr('y', getBBoxCenter(district.polygon).y);
		}
	}

	clientState.overlay.classed(
		'district--selectable',
		(d) => !!getAvailableActions(clientState.role, d, gameState).length,
	);

	updateHeadlines(gameState);

	document.getElementById('turn').innerText = gameState.turns.number.toString();
	if (
		clientState.role === 'rebel' &&
		gameState.turns.rebel ||
		clientState.role === 'authority' &&
		gameState.turns.authority) {
		document.getElementById('submit-turn').innerText = 'Waiting for other player';
	} else {
		document.getElementById('submit-turn').innerText = 'Submit Turn';
	}
	document.getElementById('victor').innerText = gameState.victor || 'None';

	if (gameState.victor) {
		document.getElementById('submit-turn').style.display = 'none';
	}
}
socket.on('game-state', socketOnGameState);

function updateHeadlines(state: GameState): void {
	const log = document.getElementById('log');

	for (const p of Array.from(log.querySelectorAll('[data-headline-district]'))) {
		p.removeEventListener('mouseenter', onHeadlineMouseEnter);
		p.removeEventListener('mouseleave', onHeadlineMouseLeave);
	}

	log.innerHTML = '<h3>Headlines</h3>';

	for (const logItem of state.log.map((foo) => foo).reverse()) {
		const h4 = document.createElement('h4');
		h4.innerText = `Turn ${ logItem.turn }`;
		log.appendChild(h4);

		for (const headline of logItem.headlines.filter((h) => h.visibleTo[clientState.role])) {
			const p = document.createElement('p');
			p.innerText = headline.text;
			p.dataset.headlineDistrict = headline.district.toString();
			p.classList.add('log__headline');
			p.addEventListener('mouseenter', onHeadlineMouseEnter);
			p.addEventListener('mouseleave', onHeadlineMouseLeave);
			log.appendChild(p);
		}
	}
}

function onHeadlineMouseEnter() {
	clientState.overlay.classed('selected', (d) => d.id === parseFloat(this.dataset.headlineDistrict));
	openDistrictBox(clientState.map.districts[this.dataset.headlineDistrict]);
}

function onHeadlineMouseLeave() {
	clientState.overlay.classed(
		'selected',
		(d) => d.id === (clientState.selectedDistrict && clientState.selectedDistrict.id),
	);
	if (clientState.selectedDistrict) {
		openDistrictBox(clientState.selectedDistrict);
	} else {
		closeDistrictBox();
	}
}

function submitTurn() {
	socket.emit('submit-turn', clientState.gameId, clientState.role, clientState.turn);
	clientState.turn = null;
	d3.select('#turn-marker').remove();
}

function openDistrictBox(district: District) {
	const districtBox = document.getElementById('districtBox');
	const districtName = document.getElementById('districtName');
	const districtType = document.getElementById('districtType');
	const districtImage = document.getElementById('districtImage');
	const districtPops = document.getElementById('districtPops');
	const noPopsMessage = document.getElementById('districtNoPops');
	const districtEffects = document.getElementById('districtEffects');
	const noEffectsMessage = document.getElementById('districtNoEffects');
	const districtNeighbors = document.getElementById('districtNeighbors');
	const noNeighborsMessage = document.getElementById('districtNoNeighbors');
	const districtActions = document.getElementById('districtActions');
	const noActionsMessage = document.getElementById('districtNoActions');

	districtBox.style.display = 'block';
	districtName.innerText = district.name;
	districtType.innerText = district.type;
	districtImage.setAttribute('src', `/images/${ district.type.toLowerCase() }.jpg`);

	const pops = gameState.pops[district.id];
	if (!pops || !pops.length) {
		noPopsMessage.style.display = '';
		districtPops.style.display = 'none';
	} else {
		noPopsMessage.style.display = 'none';
		districtPops.style.display = '';

		const sortValue = (pop: Pop) => {
			if (pop.loyaltyVisibleTo[clientState.role]) {
				if (pop.loyalty === 'authority') {
					return 1;
				} else if (pop.loyalty === 'neutral') {
					return 2;
				} else {
					return 3;
				}
			} else {
				return 4;
			}
		};
		pops.sort((a, b) => sortValue(a) - sortValue(b));

		districtPops.innerHTML = pops.map((pop) => {
			if (pop.loyaltyVisibleTo[clientState.role]) {
				if (pop.loyalty === 'authority') {
					return '<span style="color: blue; font-weight: bold;">A</span>';
				} else if (pop.loyalty === 'neutral') {
					return '<span style="color: black; font-weight: bold;">N</span>';
				} else {
					return '<span style="color: red; font-weight: bold;">R</span>';
				}
			} else {
				return '<span style="color: gray; font-weight: bold;">?</span>';
			}
		}).join(' ');
	}

	const visibleEffects = gameState.effects[district.id].filter((effect) => effect.visibleTo[clientState.role]);
	if (visibleEffects.length) {
		noEffectsMessage.style.display = 'none';
		districtEffects.style.display = '';
		districtEffects.innerHTML = visibleEffects.map((effect) => `<li>${ effect.label }</li>`).join('');
	} else {
		noEffectsMessage.style.display = '';
		districtEffects.style.display = 'none';
	}

	const neighbors = district.neighbors
		.filter((n) => n.type === 'urban')
		.filter((n) => areDistrictsAdjacent(n, district));
	districtNeighbors.innerHTML = neighbors.map((n) => `<li>${ n.name }</li>`).join('');
	if (neighbors.length) {
		noNeighborsMessage.style.display = 'none';
	} else {
		noNeighborsMessage.style.display = '';
	}

	const oldActions = Array.from(districtActions.children);
	oldActions.forEach((child) => districtActions.removeChild(child));
	oldActions.forEach((child) => child.remove());
	const actions = getAvailableActions(clientState.role, district, gameState);
	if (actions.length) {
		noActionsMessage.style.display = 'none';
		actions.map((action) => {
			const button = document.createElement('button');
			button.innerHTML = action.label;
			button.addEventListener('click', () => setTurn(action));
			const li = document.createElement('li');
			li.appendChild(button);
			return li;
		}).forEach((element) => districtActions.appendChild(element));
	} else {
		noActionsMessage.style.display = '';
	}
}

function closeDistrictBox() {
	document.getElementById('districtBox').style.display = 'none';
	clientState.overlay.classed('selected', false);
}

function selectDistrict(district: District) {
	clientState.selectedDistrict = district;
	openDistrictBox(district);
	clientState.overlay.classed('selected', (d) => d === district);
}

function deselectDistrict() {
	clientState.selectedDistrict = null;
	closeDistrictBox();
}
document.getElementById('districtClose').addEventListener('click', deselectDistrict);
