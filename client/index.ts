import * as d3 from 'd3';
import * as io from 'socket.io-client';

import { District, DistrictJson } from '../common/district';
import { getAvailableActions } from '../common/gamelogic';
import { GameState } from '../common/gamestate';
import { arePointsEquivalent, getBBoxCenter } from '../common/geometry';
import { Map, mapFromJson, MapJson } from '../common/map';
import { Options } from '../common/options';

import { generate } from './mapgen';
import { polygonToSVGPoints, render, renderPreview } from './render';

const socket = io();

const REBEL = 'rebel';
const AUTHORITY = 'authority';
const startGameButton = document.getElementById('start-game');
const joinGameButton = document.getElementById('join-game');
const previewMapButton = document.getElementById('preview-map');
const randomSeedButton = document.getElementById('random-seed');
const seedInput: HTMLInputElement = document.getElementById('seed-input') as HTMLInputElement;
const roleInput: HTMLSelectElement = document.getElementById('role-input') as HTMLSelectElement;
const newGameDialog: HTMLElement = document.getElementById('new-game-dialog');

function onStartGameClick() {
	const seed = seedInput.value;
	const role = roleInput.value;
	socket.emit('start-game', {seed, role});
}
startGameButton.addEventListener('click', onStartGameClick);

function onJoinGameClick() {
	const role = roleInput.value;
	socket.emit('join-game', role);
}
joinGameButton.addEventListener('click', onJoinGameClick);

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
	hoveredDistrict: District,
	map: Map,
	overlay: d3.Selection<SVGPolygonElement, District, SVGGElement, {}>,
	role: string,
	selectedDistrict: District,
	scale: number,
	turn: any,
} = {
	districtHoverEnabled: false,
	districtMenuOpen: false,
	hoveredDistrict: null,
	map: null,
	overlay: null,
	role: null,
	scale: 1,
	selectedDistrict: null,
	turn: null,
};

let gameState: GameState = null;

function socketOnRoles(roles: string[]) {
	roleInput.innerHTML = roles.map((role) => `<option value="${role}">${role}</option>`).join('');
}
socket.on('roles', socketOnRoles);

function socketOnStartGame() {
	startGameButton.style.display = 'none';
	joinGameButton.style.display = 'inline-block';
	seedInput.parentElement.style.display = 'none';
	previewMapButton.style.display = 'none';
	randomSeedButton.style.display = 'none';
}
socket.on('start-game', socketOnStartGame);

function socketOnJoinGame(roleAndMap: {role: string, mapJson: MapJson}) {
	newGameDialog.style.display = 'none';

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

	clientState.role = roleAndMap.role;
	document.getElementById('role').innerText = clientState.role;
	if (clientState.role === 'observer') {
		document.getElementById('submit-turn').onclick = null;
		document.getElementById('submit-turn').style.display = 'none';
	} else {
		document.getElementById('submit-turn').onclick = submitTurn;
	}

	clientState.map = mapFromJson(roleAndMap.mapJson);

	// tslint:disable:object-literal-sort-keys
	render(clientState.map, {
		width: 3200,
		height: 1800,
		seed: 0, // not used for rendering
	});
	// tslint:enable:object-literal-sort-keys

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

			openActionsMenu(actions.map((action) => {
				return {district: d, action};
			}));
		});
}
socket.on('join-game', socketOnJoinGame);

function setTurn(district: District, action: string) {
	clientState.turn = {district: district.id, action};
	d3.select('#turn-marker').remove();
	d3.select('#overlay').append('circle')
		.attr('id', 'turn-marker')
		.attr('r', 20)
		.attr('cx', getBBoxCenter(district.polygon).x)
		.attr('cy', getBBoxCenter(district.polygon).y)
		.style('fill', clientState.role === REBEL ? 'red' : 'blue' )
		.style('pointer-events', 'none');
}

function openActionsMenu(actions: Array<{action: string, district: District}>) {
	clientState.districtMenuOpen = true;
	d3.select('#tooltipActions').selectAll('button').remove();
	d3.select('#tooltipActions').selectAll('li').data(actions)
		.enter().append('li').append('button')
		.classed('action', true)
		.text((d) => d.action)
		.on('click', (d) => {
			setTurn(d.district, d.action);
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

	d3.select('#rebel-position').remove();
	if (clientState.role === REBEL) {
		d3.select('#overlay').append('circle')
			.attr('id', 'rebel-position')
			.attr('r', 10)
			.attr('cx', getBBoxCenter(clientState.map.districts[gameState.rebelPosition].polygon).x)
			.attr('cy', getBBoxCenter(clientState.map.districts[gameState.rebelPosition].polygon).y)
			.style('fill', 'red')
			.style('pointer-events', 'none');
	}

	clientState.overlay.classed(
		'district--selectable',
		(d) => !!getAvailableActions(clientState.role, d, gameState).length,
	);

	document.getElementById('log').innerHTML =
		'<h3>Headlines</h3>' +
		gameState.log.map((l) => `<h4>Day ${l.turn}</h4>` +
		l.headlines.map((h) => `<p>${h.text}</p>`)).reverse().join('</br>')
	;

	if (clientState.role === REBEL || gameState.victor) {
		d3.selectAll('.district')
		.classed('rebel-controlled', (d) => gameState.rebelControlled.includes((d as District).id));
	} else {
		d3.selectAll('.district')
		.classed('rebel-controlled', (d) => gameState.uncovered.includes((d as District).id));
	}
	d3.selectAll('.district').classed('patrolled', (d) => gameState.patrols.includes((d as District).id));

	d3.selectAll('.district')
		.each((d) => (d as District).rebelControlled = gameState.rebelControlled.includes((d as District).id));

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
	document.getElementById('rebel-controlled').innerText = gameState.rebelControlled.length.toString();
	document.getElementById('victor').innerText = gameState.victor || 'None';

	if (gameState.victor) {
		document.getElementById('submit-turn').style.display = 'none';
	}
}
socket.on('game-state', socketOnGameState);

function submitTurn() {
	socket.emit('submit-turn', clientState.role, clientState.turn);
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
	const districtActions = document.getElementById('districtActions');
	const noActionsMessage = document.getElementById('districtNoActions');

	districtBox.style.display = 'block';
	districtName.innerText = district.name;
	districtType.innerText = district.type;
	districtImage.setAttribute('src', `/images/${ district.type.toLowerCase() }.jpg`);

	const oldActions = Array.from(districtActions.children);
	oldActions.forEach((child) => districtActions.removeChild(child));
	oldActions.forEach((child) => child.remove());
	const actions = getAvailableActions(clientState.role, district, gameState);
	if (actions.length) {
		noActionsMessage.style.display = 'none';
		actions.map((action) => {
			const button = document.createElement('button');
			button.innerHTML = action;
			button.addEventListener('click', () => setTurn(district, action));
			const li = document.createElement('li');
			li.appendChild(button);
			return li;
		}).forEach((element) => districtActions.appendChild(element));
	} else {
		noActionsMessage.style.display = 'initial';
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
