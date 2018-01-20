import { generate } from './mapgen';
import { render } from './render';
import { Options } from '../common/options';
import { Map, MapJson } from '../common/map';
import { District, DistrictJson } from '../common/district';

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
	seed: (getParameterByName('seed', null) || Math.random() * 1000) as number
};
console.info(`requesting city with seed: ${options.seed}`);
let init = {
	method: 'POST',
	body: JSON.stringify(options), 
	headers: new Headers({
		'Content-Type': 'application/json'
	})
};
fetch('/generate', init).then(response => {
	return response.json();
}).then(mapJson => {
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
});

