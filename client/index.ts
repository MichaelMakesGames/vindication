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

let overlay = null;
let turn = null;
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
	for (let district of map.districts) {
		district.linkSites(map.districts);
	}

	render(map, options);
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
			if (role === REBEL && d.rebelControlled) return;
			if (role === REBEL && !d.neighbors.some(n => n.rebelControlled)) return;
			turn = { district: d.id };
			d3.select('#turn-marker').remove();
			d3.select('#overlay').append('circle')
				.attr('id', 'turn-marker')
				.attr('r', 20)
				.attr('cx', d.site[0])
				.attr('cy', d.site[1])
				.style('fill', role === REBEL ? 'red' : 'blue' );
		});
});

const REBEL = 'rebel';
const AUTHORITY = 'authority';
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

function updateGameState(state: GameState) {
	console.log('STATE', state);

	document.getElementById('log').innerHTML = state.log.map(l => `<p>${l}</p>`).reverse().join('');

	if (role === REBEL || state.victor) {
		d3.selectAll('.district').classed('rebel-controlled', d => state.rebelControlled.includes((d as District).id));
	} else {
		d3.selectAll('.district').classed('rebel-controlled', d => state.uncovered.includes((d as District).id));
	}

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
function submitTurn() {
	socket.emit('submit-turn', role, turn);
	turn = null;
	d3.select('#turn-marker').remove();
}