import * as d3 from 'd3';
import * as geometry from './geometry';
import { Point, Edge, Polygon } from './geometry';
import District from "./district";
import * as Random from 'rng';
import { renderCoast, renderRiver } from './render';
import * as PriorityQueue from 'priorityqueuejs';

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

const SEED = getParameterByName('seed', null) || Math.random() * 1000;
console.info('Seed:', SEED);
const rng = new Random.MT(SEED);

const NUM_VILLAGES = 15;
const NUM_URBAN_DISTRICTS = 20;
const WIDTH = 3200;
const HEIGHT = 1800;

const VILLAGE_CHAOS = 0.25;
const VILLAGE_BLOCK_SIZE = 1000;
const VILLAGE_STREET_WIDTH = 6;

const INNER_CHAOS = 0.75;
const INNER_BLOCK_SIZE = 300;
const INNER_STREET_WIDTH = 4;

const MID_CHAOS = 0.5;
const MID_BLOCK_SIZE = 600;
const MID_STREET_WIDTH = 4;

const OUTER_CHAOS = 0;
const OUTER_BLOCK_SIZE = 1200;
const OUTER_STREET_WIDTH = 6;

const SITE_GRID_SIZE = 100;

function pickWeighted<T>(items: T[], weightFunc: (item: T) => number): T {
	const weights = items.map(item => weightFunc(item));
	const totalWeight = weights.reduce((acc, cur) => acc + cur, 0);

	const choice = rng.random() * totalWeight;

	let currentWeight = 0;
	for (let i = 0; i < items.length; i++) {
		currentWeight += weights[i];
		if (choice < currentWeight) {
			return items[i];
		}
	}
	throw new Error();
}

function findPath(graph: {[point: string]: Point[]}, distanceFunc: (from: Point, to: Point) => number, start: Point, target: Point): Point[] {
	// Dijkstra's algorithm, only runs until target found
	let dist = {};
	let prev = {};
	const q = new PriorityQueue((a, b) => dist[b] - dist[a])
	dist[start.toString()] = 0;
	q.enq(start);
	while (!q.isEmpty()) {
		let current = q.deq();
		if (current[0] === target[0] && current[1] === target[1]) {
			let path = [];
			while (current) {
				path.push(current);
				current = prev[current];
			}
			return path;
		}
		for (let neighbor of graph[current]) {
			let distToNeighbor = distanceFunc(current, neighbor);
			let newDist = dist[current] + distToNeighbor;
			let neighborString = neighbor.toString();
			if (!dist.hasOwnProperty(neighborString) || newDist < dist[neighborString]) {
				dist[neighborString] = newDist;
				prev[neighborString] = current;
				q.enq(neighbor)
			}
		}
	}
}

function connectDistricts(start: District, end: District, graph: {[point: string]: Point[]}, curRoads: Edge[]): Edge[] {

	let startPoint = geometry.getPointClosestTo(start.polygon, end.site);
	if (!start.roadEnds.includes(startPoint)) start.roadEnds.push(startPoint);
	let endPoint = geometry.getPointClosestTo(end.polygon, start.site);
	if (!end.roadEnds.includes(endPoint)) end.roadEnds.push(endPoint);

	function distance(a: Point, b: Point): number {
		if (curRoads.some(road => geometry.areEdgesEquivalent(road, [a, b]))) {
			return geometry.calcDistance(a, b) * 0.5;
		} else {
			return geometry.calcDistance(a, b);
		}
	}
	let path: Point[] = findPath(graph, distance, startPoint, endPoint);
	let roads = geometry.getPolygonEdges(path);
	roads.pop();

	return roads;
}

function createRoads(districts: District[], diagram: d3.VoronoiDiagram<Point>, graph: {[point: string]: Point[]}): Edge[] {
	let villageVoronoi = d3.voronoi();
	villageVoronoi.extent([[SITE_GRID_SIZE * -2, SITE_GRID_SIZE * -2], [WIDTH + SITE_GRID_SIZE * 2, HEIGHT + SITE_GRID_SIZE * 2]]);

	let villages = districts.filter(d => d.type === 'village');

	let villageDiagram = villageVoronoi(villages.map(v => v.site));

	let roads: Edge[] = [];

	let triangles = villageDiagram.triangles();
	for (let triangle of triangles) {
		// // DEBUG
		// d3.select('svg').append('polygon')
		// 	.attr('points', triangle.join(' '))
		// 	.attr('fill', 'none')
		// 	.attr('stroke', 'red')
		// 	.attr('stroke-width', 2);
		let triangleDistricts = triangle.map(site => districts.find(d => site.toString() === d.site.toString()));
		roads.push(...connectDistricts(triangleDistricts[0], triangleDistricts[1], graph, roads));
		roads.push(...connectDistricts(triangleDistricts[1], triangleDistricts[2], graph, roads));
		roads.push(...connectDistricts(triangleDistricts[2], triangleDistricts[0], graph, roads));
	}

	return roads;
}

function urbanize(district: District, urbanRim: District[]): void {
	district.type = 'urban';
	district.chaos = MID_CHAOS;
	district.blockSize = MID_BLOCK_SIZE;
	district.streetWidth = MID_STREET_WIDTH;
	
	for (let neighbor of district.neighbors) {
		if (
			neighbor.type !== 'urban' &&
			neighbor.type !== 'water' &&
			!urbanRim.includes(neighbor) &&
			(!district.rivers.includes(neighbor) || district.bridges.includes(neighbor))
		) {
			urbanRim.push(neighbor);
		}
	}

	if (urbanRim.includes(district)) urbanRim.splice(urbanRim.indexOf(district), 1);
}

function generateMap() {
	let voronoi = d3.voronoi();
	voronoi.extent([[SITE_GRID_SIZE * -2, SITE_GRID_SIZE * -2], [WIDTH + SITE_GRID_SIZE * 2, HEIGHT + SITE_GRID_SIZE * 2]]);

	let points: Point[] = [];
	for (let i = SITE_GRID_SIZE * -2; i < WIDTH + SITE_GRID_SIZE * 2; i += SITE_GRID_SIZE) {
		for (let j = 0; j < HEIGHT; j += SITE_GRID_SIZE) {
			let done = false;
			while (!done) {
				let point: Point = [
					Math.floor(rng.random() * SITE_GRID_SIZE) + i,
					Math.floor(rng.random() * SITE_GRID_SIZE) + j
				];
				if (points.every(p => p[0] !== point[0] && p[1] !== point[1])) {
					points.push(point);
					done = true;
				}
			}
		}
	}

	let diagram = voronoi(points);

	let svg = d3.select('#map')
	svg
		.attr('width', WIDTH)
		// .attr('height', 'auto')
		.attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
	svg = svg.select('g');

	let polygons: any[] = diagram.polygons().filter(Boolean);
	let districts: District[] = polygons.map(polygon => {
		let district = new District(polygon, 'rural');
		district.site = polygon.data;
		return district;
	});
	
	let districtsBySite: {string: District} = districts.reduce((acc: {string: District}, cur: District) => {
		acc[cur.site.toString()] = cur;
		return acc;
	}, {} as {string: District});
	function getDistrictBySite(site: Point): District {
		return districtsBySite[site.toString()];
	}

	// add neighbors to districts
	for (let edge of diagram.edges.filter(edge => edge && edge.left && edge.right)) {
		let left = getDistrictBySite(edge.left);
		let right = getDistrictBySite(edge.right);
		left.neighbors.push(right);
		right.neighbors.push(left);
	}

	let intersections = [];
	let intersectionGraph: {[point: string]: Point[]} = {};
	for (let edge of diagram.edges.filter(Boolean)) {
		intersectionGraph[edge[0].toString()] = intersectionGraph[edge[0].toString()] || [];
		intersectionGraph[edge[0].toString()].push(edge[1]);
		if (!intersections.indexOf(edge[0])) intersections.push(edge[0]);
		intersectionGraph[edge[1].toString()] = intersectionGraph[edge[1].toString()] || [];
		intersectionGraph[edge[1].toString()].push(edge[0]);
		if (intersections.indexOf(edge[1]) === -1) intersections.push(edge[1]);
	}

	function getSitePolygon(site) {
		return getCellPolygon(diagram.cells[site.index]);
	}
	function getCellPolygon(cell) {
		return polygons.find(polygon => polygon.data.toString() === cell.site.data.toString());
	};
	function getPolygonCell(polygon) {
		return diagram.cells.find(cell => cell && cell.site.data.toString() === polygon.data.toString());
	}

	// create ocean and coast
	for (let district of districts) {
		if (district.site[1] > HEIGHT * 0.75) district.type = 'water';
	}
	(() => {
		let coastEdges: Array<Edge> = [];
		for (let edge of diagram.edges.filter(edge => edge && edge.left && edge.right)) {
			let leftDistrictType = getDistrictBySite(edge.left).type;
			let rightDistrictType = getDistrictBySite(edge.right).type;
			let leftIsWater = leftDistrictType === 'water';
			let rightIsWater = rightDistrictType === 'water';
			if ((leftIsWater && !rightIsWater) || (!leftIsWater && rightIsWater)) {
				coastEdges.push([...edge] as Edge)
			}
		}
		let coastLines = geometry.joinEdges(coastEdges);
		console.assert(coastLines.length === 1, 'All coast edges should have been joined into one coast');
		coastLines.forEach(coast => {
			renderCoast(coast);
		});

		let d3Land = d3.select('#land');
		for (let district of districts.filter(d => d.type !== 'water')) {
			d3Land.append('polygon')
				.attr('fill', 'white')
				.attr('stroke-width', 0)
				.attr('points', district.polygon.join(' '));
		}
	})();

	// make river
	const riverWidth = Math.floor(rng.random() * 30 + 15)
	let river = [];
	(() => {
		let origin = intersections
			.filter(p => p[1] === SITE_GRID_SIZE * -2)
			.sort((a, b) => Math.abs(a[0] - WIDTH/2) - Math.abs(b[0] - WIDTH/2))
			[0];
		let destination = intersections
			.filter(p => p[1] === HEIGHT + SITE_GRID_SIZE * 2)
			.sort((a, b) => Math.abs(a[0] - WIDTH/2) - Math.abs(b[0] - WIDTH/2))
			[0];
		let path = findPath(intersectionGraph, (a, b) => geometry.calcDistance(a, b), origin, destination);
		let edges: Edge[] = path.map((p, i) => [p, path[(i+1) % path.length]]) as Edge[];
		edges = edges.filter(function isEdgeNotInOcean(edge) {
			let vEdge = diagram.edges.filter(Boolean).find(vEdge => {
				return geometry.areEdgesEquivalent(vEdge, edge);
			});
			if (!vEdge) return true;
			let left = vEdge.left ? getDistrictBySite(vEdge.left) : null;
			let right = vEdge.right ? getDistrictBySite(vEdge.right) : null;
			if (left && right) {
				left.rivers.push(right);
				right.rivers.push(left);
			}
			let leftIsWater = left ? left.type === 'water' : false;
			let rightIsWater = right ? right.type === 'water' : false;
			return !(leftIsWater && rightIsWater);
		});
		river.push(...edges);
		path = edges.map(edge => edge[0]);

		renderRiver(path, riverWidth);
	})();

	// remove river from intersections graph
	for (let edge of river) {
		const graph = intersectionGraph;
		const p0String = edge[0].toString();
		const p1String = edge[1].toString();
		if (graph[p0String]) {
			graph[p0String] = graph[p0String].filter((p: Point) => !geometry.arePointsEquivalent(p, edge[1]));
		}
		if (graph[p1String]) {
			graph[p1String] = graph[p1String].filter((p: Point) => !geometry.arePointsEquivalent(p, edge[0]));
		}
	}

	// place villages
	for (let i = 0; i < NUM_VILLAGES; i++) {
		let potentialDistricts = districts.filter(d => d.type === 'rural');
		let newVillage = pickWeighted<District>(potentialDistricts, d => d.calcVillageScore());
		newVillage.type = 'village';
	}

	// place bridges between neighboring villages across rivers
	for (let village of districts.filter(d => d.type === 'village')) {
		for (let neighbor of village.neighbors.filter(d => d.type === 'village')) {
			if (village.rivers.includes(neighbor)) {
				village.bridges.push(neighbor);
				// TODO clean up bridge drawing code
				let edge = geometry.findCommonEdge(village.polygon, neighbor.polygon);
				let slope = geometry.calcPerpendicularSlope(edge);
				let point = geometry.calcMidPoint(edge);
				let theta = Math.atan(slope);
				let dx = Math.cos(theta) * (riverWidth / 2 + 3);
				let dy = Math.sin(theta) * (riverWidth / 2 + 3);
				let bridgeEdge: Edge = [
					[point[0] + dx, point[1] + dy],
					[point[0] - dx, point[1] - dy]
				];
				svg.append('line')
					.attr('stroke-width', '12')
					.attr('stroke', 'black')
					.attr('x1', point[0] + dx)
					.attr('y1', point[1] + dy)
					.attr('x2', point[0] - dx)
					.attr('y2', point[1] - dy);
				svg.append('line')
					.attr('stroke-width', '8')
					.attr('stroke', 'white')
					.attr('x1', point[0] + dx)
					.attr('y1', point[1] + dy)
					.attr('x2', point[0] - dx)
					.attr('y2', point[1] - dy);
			}
		}
	}
	// TODO render bridges

	// place roads on Delauney triangulation between villages
	let mainRoads = createRoads(districts, diagram, intersectionGraph);
	// // DEBUG
	// for (let edge of mainRoads) {
	// 	svg.append('line')
	// 		.attr('stroke', 'red')
	// 		.attr('stroke-width', '1')
	// 		.attr('x1', edge[0][0])
	// 		.attr('x2', edge[1][0])
	// 		.attr('y1', edge[0][1])
	// 		.attr('y2', edge[1][1]);
	// }

	// determine urban core
	let core = districts
		.filter(d => d.type === 'village')
		.sort((d1, d2) => d2.calcUrbanScore() - d1.calcUrbanScore())[0];
	core.isCore = true;

	// grow city along rivers, coasts, and roads
	let urbanRim: District[] = [];
	urbanize(core, urbanRim);
	for (let i = 0; i < NUM_URBAN_DISTRICTS; i++) {
		let newUrbanDistrict = pickWeighted<District>(urbanRim, d => d.calcUrbanScore());
		urbanize(newUrbanDistrict, urbanRim);
	}

	// TODO determine urban district densities
	core.blockSize = INNER_BLOCK_SIZE;
	core.chaos = INNER_CHAOS;
	core.streetWidth = INNER_STREET_WIDTH;
	for (let district of urbanRim) {
		district.type = 'urban';
		district.chaos = OUTER_CHAOS;
		district.blockSize = OUTER_BLOCK_SIZE;
		district.streetWidth = OUTER_STREET_WIDTH;
	}

	// smooth urban districts
	let districtsToDeurbanize = [];
	for (let district of districts.filter(d => d.type === 'urban')) {
		let numRuralNonRiverNeighbors = district.neighbors.filter(d => d.type === 'rural' && !district.rivers.includes(d)).length;
		if (numRuralNonRiverNeighbors > district.neighbors.length * 0.67) {
			districtsToDeurbanize.push(district);
		}
	}
	for (let district of districtsToDeurbanize) {
		district.type = 'rural';
		district.blockSize = 0;
		district.chaos = 0;
	}

	let riversAndRoads = river.concat(mainRoads);
	// remove duplicates
	riversAndRoads = riversAndRoads.reduce((acc, cur) => {
		if (acc.every(edge => !geometry.areEdgesEquivalent(edge, cur))) acc.push(cur);
		return acc;
	}, []);
	// make main roads wider
	console.log('creating main roads');
	for (let district of districts.filter(d => d.type !== 'water')) {
		let copy = district.polygon.map(point => [...point]);
		let edges = copy.map((p, i) => [p, copy[(i+1) % copy.length]] as Edge);
		edges.forEach((edge, index)=> {
			for (let road of riversAndRoads) {
				if (geometry.areEdgesEquivalent(edge, road)) {
					if (copy.indexOf(edge[0]) !== -1) {
						let inset = river.includes(road) ? riverWidth / 2 + 3 : 3;
						if (district.type === 'rural') inset += 2;
						let result = geometry.insetPolygonEdge(district.polygon, district.polygon[copy.indexOf(edge[0])], inset);
						if (result) {
							for (let splicedIndex of result.spliced) {
								copy.splice(splicedIndex, 1);
							}
							if (district.type === 'rural') { // add urban sprawl buildings
								// const rect = geometry.createRectFromEdge(result.newEdge, 20, district.site);
								// svg.append('polygon')
								// 	.attr('fill', 'rgba(255,0,255,0.5)')
								// 	.attr('points', rect.join(' '));
								let numBuildings, minWidth, maxWidth;
								if (district.neighbors.some(d => d.type === 'urban')) {
									numBuildings = 10;
									minWidth = 10;
									maxWidth = 20;
								} else if (district.neighbors.some(d => d.neighbors.some(d => d.type === 'urban'))) {
									numBuildings = 5;
									minWidth = 5;
									maxWidth = 10;
								} else {
									numBuildings = rng.random() > 0.9 ? 1 : 0;
									minWidth = 5;
									maxWidth = 10;
								}
								for (let i = 0; i < numBuildings; i++) {
									const p1 = geometry.getRandomPointOnEdge(result.newEdge, rng);
									let p2 = geometry.getRandomPointOnEdge(result.newEdge, rng);
									let tries = 0;
									while (tries < 10 && (geometry.calcEuclideanDistance(p1, p2) > 20 || geometry.calcEuclideanDistance(p1, p2) < 5)) {
										p2 = geometry.getRandomPointOnEdge(result.newEdge, rng);
										tries++;
									}
									const width = rng.random() * (maxWidth - minWidth) + minWidth;
									const rect = geometry.createRectFromEdge([p1, p2], width, district.site);
									svg.select('#urban').append('polygon')
										.attr('class', 'building')
										.attr('points', rect.join(' '));
								}
							}
						}
					}
				}
			}
		});
	}

	let districtTypeToRenderTarget = {
		'urban': document.getElementById('urban'),
		'plaza': document.getElementById('urban'),
		'water': document.getElementById('water'),
		'rural': document.getElementById('rural'),
		'village': document.getElementById('urban')
	};
	for (let district of districts) {
		let districtType = district.type;

		let inset: number = 0;
		if (districtType === 'rural') inset = 1;
		if (districtType === 'village') inset = 3;
		if (districtType === 'urban') inset = 2.5;
		if (inset) {
			for (let point of district.polygon) geometry.insetPolygonEdge(district.polygon, point, inset);
		}
		// let district = new District(polygon, districtType);
		switch (districtType) {
		// 	case 'inner': {
		// 		district.chaos = INNER_CHAOS;
		// 		district.blockSize = INNER_BLOCK_SIZE;
		// 		break;
		// 	}
		// 	case 'mid': {
		// 		district.chaos = MID_CHAOS;
		// 		district.blockSize = MID_BLOCK_SIZE;
		// 		break;
		// 	}
		// 	case 'outer': {
		// 		district.chaos = OUTER_CHAOS;
		// 		district.blockSize = OUTER_BLOCK_SIZE;
		// 		break;
		// 	}
			case 'village': {
				district.chaos = VILLAGE_CHAOS;
				district.blockSize = VILLAGE_BLOCK_SIZE;
				district.streetWidth = VILLAGE_STREET_WIDTH;
			}
		}

		district.render(districtTypeToRenderTarget[district.type]);
	}

	return true;
}

let done = false;
let tries = 0;
while (!done) {
	done = generateMap();
	tries++;
	if (tries >= 860) {
		console.error('Too many tries, abandoning');
		break;
	}
}