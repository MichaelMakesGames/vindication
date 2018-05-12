import { generate } from './mapgen';
import { render, renderPreview } from './render';
import { Options } from '../common/options';
import { Map, MapJson, mapFromJson } from '../common/map';
import { District, DistrictJson } from '../common/district';
import { arePointsEquivalent, getBBoxCenter } from '../common/geometry';
import { GameState } from '../common/gamestate';
import { getAvailableActions } from '../common/gamelogic';
import * as d3 from 'd3';
import * as io from 'socket.io-client';

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
	if (seed !== '' && isFinite(parseFloat(seed))){
		socket.emit('preview-map', parseFloat(seed));
	}
}
previewMapButton.addEventListener('click', onPreviewMapClick);
socket.on('preview-map', renderPreview);

let role: string = null;
let state: GameState = null;
let overlay: d3.Selection<SVGPolygonElement, District, SVGGElement, {}> = null;
let turn = null;
let map: Map = null;
let selectedDistrict: District = null;
let hoveredDistrict: District = null;
let districtMenuOpen: boolean = false;
let districtHoverEnabled: boolean = false;
let scale = 1;

function socketOnRoles(roles: string[]) {
	roleInput.innerHTML = roles.map(role => `<option value="${role}">${role}</option>`).join('');
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
	document.addEventListener('keydown', e => {
		// submit turn
		if (e.key === 'Enter' || e.key === ' ') {
			submitTurn();
		}
		
		// pan up
		if (e.key === 'w' || e.key === 'ArrowUp') {
			let svg = document.getElementById('map');
			let viewBox = svg.getAttribute('viewBox').split(' ');
			let y = (Number(viewBox[1]) - 30 / scale).toString();
			viewBox[1] = y;
			svg.setAttribute('viewBox', viewBox.join(' '));
		}
		
		// pan left
		if (e.key === 'a' || e.key === 'ArrowLeft') {
			let svg = document.getElementById('map');
			let viewBox = svg.getAttribute('viewBox').split(' ');
			let x = (Number(viewBox[0]) - 30 / scale).toString();
			viewBox[0] = x;
			svg.setAttribute('viewBox', viewBox.join(' '));
		}

		// pan down
		if (e.key === 's' || e.key === 'ArrowDown') {
			let svg = document.getElementById('map');
			let viewBox = svg.getAttribute('viewBox').split(' ');
			let y = (Number(viewBox[1]) + 30 / scale).toString();
			viewBox[1] = y;
			svg.setAttribute('viewBox', viewBox.join(' '));
		}

		// pan right
		if (e.key === 'd' || e.key === 'ArrowRight') {
			let svg = document.getElementById('map');
			let viewBox = svg.getAttribute('viewBox').split(' ');
			let x = (Number(viewBox[0]) + 30 / scale).toString();
			viewBox[0] = x;
			svg.setAttribute('viewBox', viewBox.join(' '));
		}

		// start district hover mode
		if (e.key === 'Shift') {
			if (hoveredDistrict) {
				openDistrictBox(hoveredDistrict);
			}
			districtHoverEnabled = true;
		}
		console.log(e.key);
	});

	document.addEventListener('keyup', e => {
		// stop district hover mode
		if (e.key === 'Shift') {
			districtHoverEnabled = false;
			if (selectedDistrict) {
				openDistrictBox(selectedDistrict);
			} else {
				closeDistrictBox();
			}
		}
	});

	// set up zoom and drag controls
	const zoomed = function() {
		scale = d3.event.transform.k;
		d3.select('#map > g').attr('transform', d3.event.transform);
	};
	d3.select('#map').call(d3.zoom().filter(() => d3.event.type !== 'dblclick').clickDistance(10).on("zoom", zoomed));


	role = roleAndMap.role;
	document.getElementById('role').innerText = role;
	if (role === 'observer') {
		document.getElementById('submit-turn').onclick = null;
		document.getElementById('submit-turn').style.display = 'none';
	} else {
		document.getElementById('submit-turn').onclick = submitTurn;
	}

	map = mapFromJson(roleAndMap.mapJson);

	render(map, {
		width: 3200,
		height: 1800,
		seed: 0 // not used for rendering
	});

	const tooltip = d3.select('#tooltip');
	const centers = d3.select('#centers').selectAll('circle').data(map.districts.map(d => getBBoxCenter(d.polygon))).enter()
		.append('circle')
		.attr('fill', 'none')
		.attr('r', 0)
		.attr('cx', d => d[0])
		.attr('cy', d => d[1]);
	overlay = d3.select<SVGGElement, {}>('#overlay')
		.selectAll<SVGPolygonElement, District>('polygon')
		.data<District>(map.districts).enter()
		.append<SVGPolygonElement>('polygon')
		.attr('points', d => d.polygon.join(' '))
		.classed('district', true)
		.on('mouseenter', d => {
			hoveredDistrict = d;
			if (districtHoverEnabled) {
				openDistrictBox(hoveredDistrict);
			}
		})
		.on('click', d => {
			if (selectedDistrict === d) {
				deselectDistrict();
			} else {
				selectDistrict(d);
			}
		})
		.on('contextmenu', d => {

			d3.event.preventDefault();
			closeActionsMenu();
			const actions = getAvailableActions(role, d, state);
			if (!actions.length) return;

			const centerCircle = centers.nodes()[d.id] as SVGCircleElement;
			tooltip.style('display', 'block')
				.style('left', `${centerCircle.getBoundingClientRect().left}px`)
				.style('top', `${centerCircle.getBoundingClientRect().top}px`);
			document.getElementById('tooltipDistrictName').innerText = d.name;

			openActionsMenu(actions.map(action => {
				return {district: d, action}
			}));
		});
}
socket.on('join-game', socketOnJoinGame);

function setTurn(district: District, action: string) {
	turn = {district: district.id, action: action};
	d3.select('#turn-marker').remove();
	d3.select('#overlay').append('circle')
		.attr('id', 'turn-marker')
		.attr('r', 20)
		.attr('cx', getBBoxCenter(district.polygon)[0])
		.attr('cy', getBBoxCenter(district.polygon)[1])
		.style('fill', role === REBEL ? 'red' : 'blue' )
		.style('pointer-events', 'none');
}

function openActionsMenu(actions: {action: string, district: District}[]) {
	districtMenuOpen = true;
	d3.select('#tooltipActions').selectAll('button').remove();
	d3.select('#tooltipActions').selectAll('li').data(actions)
		.enter().append('li').append('button')
		.classed('action', true)
		.text(d => d.action)
		.on('click', d => {
			setTurn(d.district, d.action);
		});
}

function closeActionsMenu() {
	districtMenuOpen = false;
	document.getElementById('tooltipActions').innerHTML = '';
	document.getElementById('tooltip').style.display = 'none';
}
document.addEventListener('click', closeActionsMenu);

function socketOnGameState(newState: GameState) {
	state = newState;
	console.log('STATE', state);

	d3.select('#rebel-position').remove();
	if (role === REBEL) {
		d3.select('#overlay').append('circle')
			.attr('id', 'rebel-position')
			.attr('r', 10)
			.attr('cx', getBBoxCenter(map.districts[state.rebelPosition].polygon)[0])
			.attr('cy', getBBoxCenter(map.districts[state.rebelPosition].polygon)[1])
			.style('fill', 'red')
			.style('pointer-events', 'none');
	}

	overlay.classed('district--selectable', d => !!getAvailableActions(role, d, state).length);

	document.getElementById('log').innerHTML = '<h3>Headlines</h3>' + state.log.map(l => `<h4>Day ${l.turn}</h4>` + l.headlines.map(h => `<p>${h.text}</p>`)).reverse().join('</br>');

	if (role === REBEL || state.victor) {
		d3.selectAll('.district').classed('rebel-controlled', d => state.rebelControlled.includes((d as District).id));
	} else {
		d3.selectAll('.district').classed('rebel-controlled', d => state.uncovered.includes((d as District).id));
	}
	d3.selectAll('.district').classed('patrolled', d => state.patrols.includes((d as District).id));

	d3.selectAll('.district').each(d => (d as District).rebelControlled = state.rebelControlled.includes((d as District).id));

	document.getElementById('turn').innerText = state.turns.number.toString();
	if (role === 'rebel' && state.turns.rebel || role === 'authority' && state.turns.authority) {
		document.getElementById('submit-turn').innerText = 'Waiting for other player';
	} else {
		document.getElementById('submit-turn').innerText = 'Submit Turn';
	}
	document.getElementById('rebel-controlled').innerText = state.rebelControlled.length.toString();
	document.getElementById('victor').innerText = state.victor || 'None';

	if (state.victor) {
		document.getElementById('submit-turn').style.display = 'none';
	}
}
socket.on('game-state', socketOnGameState);

function submitTurn() {
	socket.emit('submit-turn', role, turn);
	turn = null;
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
	oldActions.forEach(child => districtActions.removeChild(child));
	oldActions.forEach(child => child.remove());
	const actions = getAvailableActions(role, district, state);
	if (actions.length) {
		noActionsMessage.style.display = "none";
		actions.map(action => {
			const button = document.createElement("button");
			button.innerHTML = action;
			button.addEventListener("click", () => setTurn(district, action));
			const li = document.createElement("li");
			li.appendChild(button);
			return li;
		}).forEach(element => districtActions.appendChild(element));
	} else {
		noActionsMessage.style.display = "initial";
	}
}

function closeDistrictBox() {
	document.getElementById('districtBox').style.display = 'none';
	overlay.classed('selected', false);
}

function selectDistrict(district: District) {
	selectedDistrict = district;
	openDistrictBox(district);
	overlay.classed('selected', d => d === district);
}

function deselectDistrict() {
	selectedDistrict = null;
	closeDistrictBox();
}
document.getElementById('districtClose').addEventListener('click', deselectDistrict);