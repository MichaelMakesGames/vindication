import { generate } from './mapgen';
import { render, renderPreview } from './render';
import { Options } from '../common/options';
import { Map, MapJson } from '../common/map';
import { District, DistrictJson } from '../common/district';
import { arePointsEquivalent } from '../common/geometry';
import { GameState } from '../common/gamestate';
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
let overlay = null;
let turn = null;
let map: Map = null;

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

function socketOnJoinGame(roleAndMap) {
	newGameDialog.style.display = 'none';

	role = roleAndMap.role;
	document.getElementById('role').innerText = role;
	if (role === 'observer') {
		document.getElementById('submit-turn').onclick = null;
		document.getElementById('submit-turn').style.display = 'none';
	} else {
		document.getElementById('submit-turn').onclick = submitTurn;
	}

	const mapJson = roleAndMap.map;
	map = {
		districts: [] as District[],
		coasts: mapJson.coasts,
		river: mapJson.river,
		subRiver: mapJson.subRiver,
		sprawl: mapJson.sprawl,
		bridges: mapJson.bridges
	};
	map.districts = mapJson.districts.map(d => District.fromJson(d));
	for (let district of map.districts) {
		district.linkSites(map.districts);
	}

	render(map, {
		width: 3200,
		height: 1800,
		seed: 0 // not used for rendering
	});

	const tooltip = d3.select('#tooltip');
	overlay = d3.select('#overlay').selectAll('polygon').data(map.districts).enter()
		.append('polygon')
		.attr('points', d => d.polygon.join(' '))
		.classed('district', true)
		.classed('district--selectable', d => d.type === 'urban')
		.on('mousemove', d => {
			if (d.type === 'urban') {
				tooltip.style('display', 'block')
					.style('top', `${d3.event.clientY - 10}px`)
					.style('left', `${d3.event.clientX + 10}px`);
				(tooltip.node() as HTMLDivElement).innerText = d.name;
			} else {
				tooltip.style('display', 'none');
			}
		})
		.on('click', d => {
			console.log('click', d);
			if (role !== REBEL && role !== AUTHORITY) return;
			if (d.type !== 'urban') return;
			if (role === REBEL) {
				let rebelPosition = map.districts[state.rebelPosition];
				let nonRiverNeighbors = d.neighbors.filter(n => !d.rivers.includes(n) || d.bridges.includes(n));
				if (!nonRiverNeighbors.includes(rebelPosition)) {
					return;
				}
			}
			turn = { district: d.id };
			d3.select('#turn-marker').remove();
			d3.select('#overlay').append('circle')
				.attr('id', 'turn-marker')
				.attr('r', 20)
				.attr('cx', d.site[0])
				.attr('cy', d.site[1])
				.style('fill', role === REBEL ? 'red' : 'blue' );
		});
}
socket.on('join-game', socketOnJoinGame);

function socketOnGameState(newState: GameState) {
	state = newState;
	console.log('STATE', state);

	d3.select('#rebel-position').remove();
	if (role === REBEL) {
		d3.select('#overlay').append('circle')
			.attr('id', 'rebel-position')
			.attr('r', 10)
			.attr('cx', map.districts[state.rebelPosition].site[0])
			.attr('cy', map.districts[state.rebelPosition].site[1])
			.style('fill', 'red');
	}

	document.getElementById('log').innerHTML = state.log.map(l => `<p>${l}</p>`).reverse().join('');

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
