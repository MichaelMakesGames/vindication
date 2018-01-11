import { generate } from './mapgen';
import { render } from './render';
import { Options } from './options';
// const SEED = getParameterByName('seed', null) || Math.random() * 1000;

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
}
let map = generate(options);
render(map, options);
