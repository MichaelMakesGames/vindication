import { generate } from './mapgen';
import { render } from './render';
import { Options } from '../common/options';
import { Map, MapJson } from '../common/map';
import { District, DistrictJson } from '../common/district';
import { arePointsEquivalent } from '../common/geometry';
import { GameState } from '../common/gamestate';
import * as d3 from 'd3';
import * as io from 'socket.io-client';

const socket = io();

/**
 * From SO post: https://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript/901144#901144
 * @param name 
 * @param url 
 */
function getParameterByName(name, url) {
	if (!url) url = window.location.href;
	name = name.replace(/[\[\]]/g, "\\$&");
	var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)");
	var results = regex.exec(url);
	if (!results) return null;
	if (!results[2]) return '';
	return decodeURIComponent(results[2].replace(/\+/g, " "));
}

let options = {
	width: 3200,
	height: 1800,
	seed: 762.0961349286894 //(getParameterByName('seed', null) || Math.random() * 1000) as number
};
// console.info(`requesting city with seed: ${options.seed}`);
// let init = {
// 	method: 'POST',
// 	body: JSON.stringify(options), 
// 	headers: new Headers({
// 		'Content-Type': 'application/json'
// 	})
// };
// fetch('/generate', init).then(response => {
// 	return response.json();
// }).then(mapJson => {
socket.on('map', mapJson => {
	let map: Map = {
		districts: [] as District[],
		coasts: mapJson.coasts,
		river: mapJson.river,
		subRiver: mapJson.subRiver,
		sprawl: mapJson.sprawl,
		bridges: mapJson.bridges
	};
	map.districts = mapJson.districts.map(d => District.fromJson(d));
	render(map, options);
	d3.select('#overlay').selectAll('polygon').data(map.districts).enter()
		.append('polygon')
		.attr('points', d => d.polygon.join(' '))
		.classed('district', true)
		.classed('district--selectable', d => d.type === 'urban');
});

let role = null;
socket.on('role', r => {
	document.getElementById('role').innerText = r;
	role = r;
	if (role === 'observer') {
		document.getElementById('submit-turn').onclick = null;
		document.getElementById('submit-turn').style.display = 'none';
	} else {
		document.getElementById('submit-turn').onclick = submitTurn;
	}
});
socket.on('game-state', updateGameState);

function updateGameState(state: any) {
	document.getElementById('turn').innerText = state.turns.number;
	if (role === 'rebel' && state.turns.rebel || role === 'authority' && state.turns.authority) {
		document.getElementById('submit-turn').innerText = 'Waiting for other player';
	} else {
		document.getElementById('submit-turn').innerText = 'Submit Turn';
	}
}
function submitTurn() {
	socket.emit('submit-turn', role, {});
}