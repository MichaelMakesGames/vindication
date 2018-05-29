import { mean, scaleLinear, voronoi } from 'd3';
import FastSimplexNoise from 'fast-simplex-noise';
import * as PriorityQueue from 'priorityqueuejs';
import * as seedrandom from 'seedrandom';

import { District, DistrictJson } from '../common/district';
import * as geometry from '../common/geometry';
import { Edge, Point, Polygon } from '../common/geometry';
import { MapJson } from '../common/map';
import { Options } from '../common/options';

import { generateName } from './namegen';

enum MapType {
	Bay,
	Delta,
	Coastal,
}

export function generate(options: Options): MapJson {
	console.info('Seed:', options.seed);
	const rng = seedrandom(options.seed);
	let map: MapJson = null;
	let tries = 0;
	while (!map) {
		const types = [MapType.Bay, MapType.Coastal, MapType.Delta];
		const type = types[Math.floor(rng() * types.length)];
		map = generateMap(type, options, rng);
		tries++;
		if (tries >= 86) {
			console.error('Too many tries, abandoning');
			break;
		}
	}
	return map;
}

const NUM_VILLAGES = 25;
const NUM_URBAN_DISTRICTS = 75;

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
const OUTER_STREET_WIDTH = 4;

const WIDTH = 4096;
const HEIGHT = 4096;
const SITE_GRID_SIZE = 128;

const NOISE_FREQUENCY = 0.001;
const NOISE_OCTAVES = 4;
const NOISE_MIN = -0.33;
const NOISE_MAX = 0.33;

const BASE_FLUX = 0.02;
const EROSION_CYCLES = 2;

const RIDGE_HEIGHT_DELTA = 0.08;
const RIDGE_MIN_LENGTH = 8;

const FOREST_ALTITUDE = 0.33;

function pickWeighted<T>(items: T[], weightFunc: (item: T) => number, rng): T {
	const weights = items.map((item) => weightFunc(item));
	const totalWeight = weights.reduce((acc, cur) => acc + cur, 0);

	const choice = rng() * totalWeight;

	let currentWeight = 0;
	for (let i = 0; i < items.length; i++) {
		currentWeight += weights[i];
		if (choice < currentWeight) {
			return items[i];
		}
	}
	throw new Error();
}

function pickRandom<T>(items: T[], rng: () => number): T {
	return items[Math.floor(items.length * rng())];
}

function nodeToKey(node: Point): string {
	return [node.x, node.y].toString();
}

function findPath(
	graph: { [point: string]: Point[] },
	distanceFunc: (from: Point, to: Point) => number,
	start: Point,
	target: Point,
): Point[] {
	// Dijkstra's algorithm, only runs until target found
	const dist: {[point: string]: number} = {};
	const prev: {[point: string]: Point} = {};
	const q = new PriorityQueue((a, b) => dist[nodeToKey(b)] - dist[nodeToKey(a)]);
	dist[nodeToKey(start)] = 0;
	q.enq(start);
	if (!graph[nodeToKey(start)]) {
		return;
	}
	while (!q.isEmpty()) {
		let current: Point = q.deq();
		if (geometry.arePointsEquivalent(current, target)) {
			const path = [];
			while (current) {
				path.unshift(current);
				current = prev[nodeToKey(current)];
			}
			return path;
		}
		for (const neighbor of graph[nodeToKey(current)]) {
			const distToNeighbor = distanceFunc(current, neighbor);
			const newDist = dist[nodeToKey(current)] + distToNeighbor;
			const neighborKey = nodeToKey(neighbor);
			if (!dist.hasOwnProperty(neighborKey) || newDist < dist[neighborKey]) {
				dist[neighborKey] = newDist;
				prev[neighborKey] = current;
				q.enq(neighbor);
			}
		}
	}
}

function connectDistricts(
	start: District, end: District,
	graph: { [point: string]: Point[] },
	curRoads: Edge[],
): Edge[] {
	const startPoint = geometry.getPointClosestTo(start.polygon.points, end.site);
	if (!start.roadEnds.includes(startPoint)) {
		start.roadEnds.push(startPoint);
	}
	const endPoint = geometry.getPointClosestTo(end.polygon.points, start.site);
	if (!end.roadEnds.includes(endPoint)) {
		end.roadEnds.push(endPoint);
	}

	function distance(a: Point, b: Point): number {
		if (curRoads.some((road) => geometry.areEdgesEquivalent(road, { p1: a, p2: b }))) {
			return geometry.calcDistance(a, b) * 0.5;
		} else {
			return geometry.calcDistance(a, b);
		}
	}

	const path: Point[] = findPath(graph, distance, startPoint, endPoint);
	if (path) {
		const roads = geometry.getPolygonEdges({ points: path });
		roads.pop();

		return roads;
	} else {
		return [];
	}
}

function createRoads(
	districts: District[],
	diagram: d3.VoronoiDiagram<Point>,
	graph: { [point: string]: Point[] },
	options: Options,
): Edge[] {
	const villageVoronoi = voronoi<Point>()
		.x((d) => d.x)
		.y((d) => d.y)
		.extent([
			[SITE_GRID_SIZE * -2, SITE_GRID_SIZE * -2],
			[WIDTH + SITE_GRID_SIZE * 2, HEIGHT + SITE_GRID_SIZE * 2],
		]);
	const villages = districts.filter((d) => d.type === 'village');
	const villageDiagram = villageVoronoi(villages.map((v) => v.site));

	let roads: Edge[] = [];

	// Connect villages with roads according to delauney triangulation
	const triangles = villageDiagram.triangles();
	const connectedSites: Edge[] = [];
	for (const triangle of triangles) {
		const triangleDistricts = triangle.map((site) => districts.find((d) => geometry.arePointsEquivalent(site, d.site)));
		const edge1 = { p1: triangle[0], p2: triangle[1] };
		const edge2 = { p1: triangle[1], p2: triangle[2] };
		const edge3 = { p1: triangle[2], p2: triangle[0] };
		if (!connectedSites.some((edge) => geometry.areEdgesEquivalent(edge, edge1))) {
			roads.push(...connectDistricts(triangleDistricts[0], triangleDistricts[1], graph, roads));
			connectedSites.push(edge1);
		}
		if (!connectedSites.some((edge) => geometry.areEdgesEquivalent(edge, edge2))) {
			roads.push(...connectDistricts(triangleDistricts[1], triangleDistricts[2], graph, roads));
			connectedSites.push(edge2);
		}
		if (!connectedSites.some((edge) => geometry.areEdgesEquivalent(edge, edge2))) {
			roads.push(...connectDistricts(triangleDistricts[2], triangleDistricts[0], graph, roads));
			connectedSites.push(edge3);
		}
	}

	// Remove roads adjacent to villages
	roads = roads.filter((road) => {
		return villages.every((village) => {
			return geometry.getPolygonEdges(village.polygon).every((edge) => {
				return !geometry.areEdgesEquivalent(edge, road);
			});
		});
	});

	// Recalculate road ends
	for (const village of villages) {
		village.roadEnds = village.polygon.points.filter((p) => {
			return roads.some((road) => geometry.arePointsEquivalent(road.p1, p) || geometry.arePointsEquivalent(road.p2, p));
		});
	}

	return roads;
}

function urbanizationDifficulty(from: District, to: District): number {
	const canBeUrbanized = to.type !== 'water' && to.type !== 'urban';
	const crossingWithoutBridge = from.rivers.includes(to) && !from.bridges.includes(to);
	const crossingWithBridge = from.bridges.includes(to);
	const blockedByRidge = from.ridges.includes(to);
	const sharedRiver = from.rivers.some((r) => r.rivers.includes(to));
	const sharedRoad = from.roads.includes(to);
	const sharedCoast = from.neighbors.filter((n) => n.type === 'water').some((n) => n.neighbors.includes(to));

	return (
		(canBeUrbanized ? 1 : Infinity) *
		(blockedByRidge ? Infinity : 1) *
		(crossingWithoutBridge ? Infinity : 1) *
		(crossingWithBridge ? 0.5 : 1) *
		(sharedRiver ? 0.5 : 1) *
		(sharedRoad ? 0.5 : 1) *
		(sharedCoast ? 0.5 : 1) *
		16
	);
}

function urbanize(core: District, maxDistricts: number): void {
	const dist: {[id: number]: number} = {};
	const q = new PriorityQueue((a, b) => dist[b.id] - dist[a.id]);
	dist[core.id] = 0;
	q.enq(core);
	let urbanDistrictCount = 0;
	while (!q.isEmpty()) {
		const current: District = q.deq();
		current.type = 'urban';
		if (urbanDistrictCount < maxDistricts * 0.25) {
			current.chaos = INNER_CHAOS;
			current.blockSize = INNER_BLOCK_SIZE;
			current.streetWidth = INNER_STREET_WIDTH;
		} else if (urbanDistrictCount < maxDistricts * 0.5) {
			current.chaos = MID_CHAOS;
			current.blockSize = MID_BLOCK_SIZE;
			current.streetWidth = MID_STREET_WIDTH;
		} else {
			current.chaos = OUTER_CHAOS;
			current.blockSize = OUTER_BLOCK_SIZE;
			current.streetWidth = OUTER_STREET_WIDTH;
		}
		urbanDistrictCount++;
		if (urbanDistrictCount >= maxDistricts) {
			break;
		}
		for (const neighbor of current.neighbors) {
			const d = dist[current.id] + urbanizationDifficulty(current, neighbor);
			if (!dist.hasOwnProperty(neighbor.id) || d < dist[neighbor.id]) {
				dist[neighbor.id] = d;
				q.enq(neighbor);
			}
		}
	}
}

function generateMap(mapType: MapType, options: Options, rng): MapJson {
	console.time('generate map');
	const map: MapJson = {
		bridges: [] as Edge[],
		coasts: [] as Point[][],
		districts: [] as DistrictJson[],
		ridges: [] as Point[][],
		river: {
			path: [] as Point[],
			width: 0,
		},
		sprawl: [] as Polygon[],
		subRiver: {
			path: [] as Point[],
			width: 0,
		},
	};

	console.time('create sites');
	const points: Point[] = [];
	for (let i = 0; i < WIDTH; i += SITE_GRID_SIZE) {
		for (let j = 0; j < HEIGHT; j += SITE_GRID_SIZE) {
			let done = false;
			while (!done) {
				const point: Point = {
					x: Math.floor(rng() * SITE_GRID_SIZE) + i,
					y: Math.floor(rng() * SITE_GRID_SIZE) + j,
				};
				if (points.every((p) => p.x !== point.x && p.y !== point.y)) {
					points.push(point);
					done = true;
				}
			}
		}
	}
	console.timeEnd('create sites');

	console.time('create diagram');
	const voronoiDiagram = voronoi<Point>().x((d) => d.x).y((d) => d.y);
	voronoiDiagram.extent([[0, 0], [WIDTH, HEIGHT]]);
	const diagram = voronoiDiagram(points);
	console.timeEnd('create diagram');

	console.time('create districts');
	const d3Polygons = diagram.polygons().filter(Boolean);
	const districts: District[] = d3Polygons.map((d3Polygon, index) => {
		const polygon = { points: d3Polygon.map(([x, y]) => ({ x, y })) };
		const district = new District(index, polygon, 'rural');
		district.site = d3Polygon.data;
		return district;
	});
	console.timeEnd('create districts');

	console.time('create districts by site map');
	const districtsBySite: { [site: string]: District } = districts.reduce((
		acc: { [site: string]: District },
		cur: District,
	) => {
		acc[nodeToKey(cur.site)] = cur;
		return acc;
	}, {} as { string: District });
	function getDistrictBySite(site: Point): District {
		return districtsBySite[nodeToKey(site)];
	}
	console.timeEnd('create districts by site map');

	// add neighbors to districts
	console.time('add neighbors');
	for (const edge of diagram.edges.filter((e) => e && e.left && e.right)) {
		const left = getDistrictBySite(edge.left.data);
		const right = getDistrictBySite(edge.right.data);
		left.neighbors.push(right);
		right.neighbors.push(left);
	}
	console.timeEnd('add neighbors');

	function getSitePolygon(site) {
		return getCellPolygon(diagram.cells[site.index]);
	}
	function getCellPolygon(cell) {
		return d3Polygons.find((polygon) => nodeToKey(polygon.data) === nodeToKey(cell.site.data));
	}
	function getPolygonCell(polygon) {
		return diagram.cells.find((cell) => cell && nodeToKey(cell.site.data) === nodeToKey(polygon.data));
	}

	// create height map
	const noiseGen = new FastSimplexNoise({
		frequency: NOISE_FREQUENCY,
		max: NOISE_MAX,
		min: NOISE_MIN,
		octaves: NOISE_OCTAVES,
		random: rng,
	});
	const yHeightScale = scaleLinear()
		.domain([0, HEIGHT])
		.range([1, -1]);
	const xHeightScale = scaleLinear()
		.domain([0, WIDTH / 3, WIDTH / 2, WIDTH * 2 / 3, WIDTH])
		.range([0.5, 0.5, -0, 0.5, 0.5]);

	function calcHeight(x, y): number {
		const randomHeightFactor = noiseGen.scaled2D(x, y);
		const yHeightFactor = yHeightScale(y);
		const xHeightFactor = xHeightScale(x);
		return (yHeightFactor + xHeightFactor) / 2 + randomHeightFactor;
	}

	console.time('create river sites');
	const riverSites: number[][] = [];
	const getNeighborsCache: {[key: string]: number[][]} = {};
	const voronoiSiteToRiverSites: {[key: string]: number[][]} = {};
	for (const district of districts) {
		voronoiSiteToRiverSites[`${district.site.x},${district.site.y}`] = [];
	}

	for (const edge of diagram.edges.filter(Boolean)) {
		if (!riverSites.some((site) => site[0] === edge[0][0] && site[1] === edge[0][1])) {
			riverSites.push(edge[0]);
			getNeighborsCache[`${edge[0][0]},${edge[0][1]}`] = [];
		}
		if (!riverSites.some((site) => site[0] === edge[1][0] && site[1] === edge[1][1])) {
			riverSites.push(edge[1]);
			getNeighborsCache[`${edge[1][0]},${edge[1][1]}`] = [];
		}
		getNeighborsCache[`${edge[0][0]},${edge[0][1]}`].push(edge[1]);
		getNeighborsCache[`${edge[1][0]},${edge[1][1]}`].push(edge[0]);
		if (edge.left && edge.left.data) {
			const key = `${edge.left.data.x},${edge.left.data.y}`;
			const sites = voronoiSiteToRiverSites[key];
			if (!sites.includes(edge[0])) {
				sites.push(edge[0]);
			}
			if (!sites.includes(edge[1])) {
				sites.push(edge[1]);
			}
		}
		if (edge.right && edge.right.data) {
			const key = `${edge.right.data.x},${edge.right.data.y}`;
			const sites = voronoiSiteToRiverSites[key];
			if (!sites.includes(edge[0])) {
				sites.push(edge[0]);
			}
			if (!sites.includes(edge[1])) {
				sites.push(edge[1]);
			}
		}
	}
	console.timeEnd('create river sites');

	// push height and flux to each river site
	riverSites.forEach((s) => s.push(calcHeight(s[0], s[1]), 0));

	function getNeighbors(site: number[]): number[][] {
		const cacheKey = `${site[0]},${site[1]}`;
		return getNeighborsCache[cacheKey];
	}

	function getLowestNeighbor(site: number[]): number[] {
		const neighbors = getNeighbors(site);
		neighbors.sort((a, b) => a[2] - b[2]);
		return neighbors[0];
	}

	function isDepression(site: number[]) {
		return (
			site[1] !== HEIGHT &&
			getLowestNeighbor(site)[2] > site[2]
		);
	}

	function fillDepressions() {
		console.time('fill depressions');
		// depression filling
		let depressions = riverSites.filter(isDepression);
		while (depressions.length) {
			for (const depression of depressions) {
				depression[2] = getLowestNeighbor(depression)[2] + 0.001;
			}
			depressions = depressions
				.map(getNeighbors)
				.reduce((prev, cur) => prev.concat(cur), [])
				.filter((s, i, a) => !a.includes(s, i + 1))
				.filter(isDepression);
			// depressions = riverSites.filter(isDepression);
		}
		console.timeEnd('fill depressions');
	}

	// erosion
	fillDepressions();
	console.time('erosion');
	for (let i = 0; i < EROSION_CYCLES; i++) {
		riverSites.forEach((s) => s[3] = BASE_FLUX);
		riverSites.sort((a, b) => b[2] - a[2]);
		for (const site of riverSites) {
			const neighbor = getLowestNeighbor(site);
			neighbor[3] += site[3] * (site[2] - neighbor[2]);
		}
		const meanFlux = mean(riverSites.map((s) => s[3]));
		for (const site of riverSites) {
			site[2] -= site[3] + meanFlux;
		}
	}
	console.timeEnd('erosion');
	fillDepressions();
	console.log('depressions:', riverSites.filter(isDepression).length);

	// set district heights
	console.time('set district heights');
	for (const district of districts) {
		const cornerHeights = voronoiSiteToRiverSites[`${district.site.x},${district.site.y}`]
			.map((site) => site[2]);
		district.height = mean(cornerHeights);
		if (district.height < 0) {
			district.type = 'water';
		}
	}
	console.timeEnd('set district heights');

	// plant forests
	console.time('determine forests');
	for (const district of districts) {
		if (district.height > FOREST_ALTITUDE) {
			district.type = 'forest';
		}
	}
	console.timeEnd('determine forests');

	// determine coasts
	console.time('determine coasts');
	const coastEdges: Edge[] = [];
	(() => {
		for (const edge of diagram.edges.filter((e) => e && e.left && e.right)) {
			const leftDistrictType = getDistrictBySite(edge.left.data).type;
			const rightDistrictType = getDistrictBySite(edge.right.data).type;
			const leftIsWater = leftDistrictType === 'water';
			const rightIsWater = rightDistrictType === 'water';
			if ((leftIsWater && !rightIsWater) || (!leftIsWater && rightIsWater)) {
				coastEdges.push({
					p1: { x: edge[0][0], y: edge[0][1] },
					p2: { x: edge[1][0], y: edge[1][1] },
				});
			}
		}
		const coastLines = geometry.joinEdges(coastEdges);
		coastLines.sort((a, b) => b.length - a.length);
		map.coasts = coastLines;
	})();
	console.timeEnd('determine coasts');

	// make river
	console.time('determine river');
	const riverWidth = Math.floor(rng() * 30 + 30);
	const river: Point[] = [];

	// start at lowest site on upper edge
	let riverNode = riverSites
		.filter((s) => s[1] === 0)
		.sort((a, b) => a[2] - b[2])
		[0];
	river.push({ x: riverNode[0], y: riverNode[1] });

	// flow to lowest neighbor until coast is reached
	while (true) {
		const next = getLowestNeighbor(riverNode);
		river.push({
			x: next[0],
			y: next[1],
		});
		if (next[2] > riverNode[2]) {
			console.error('RIVER WENT UPHILL');
			break;
		}
		const onCoast = districts.filter((d) => d.type === 'water').some((d) => {
			return d.polygon.points.some((p) => p.x === next[0] && p.y === next[1]);
		});
		if (!onCoast) {
			riverNode = next;
		} else {
			break;
		}
	}

	map.river.path = river;
	map.river.width = riverWidth;
	console.timeEnd('determine river');

	// add river to districts
	console.time('add river to districts');
	const riverEdges = geometry.getPolygonEdges({points: river});
	riverEdges.length -= 1;
	for (const edge of riverEdges) {
		const vEdge = diagram.edges.filter(Boolean).find((e) => {
			return geometry.areEdgesEquivalent(
				{
					p1: { x: e[0][0], y: e[0][1] },
					p2: { x: e[1][0], y: e[1][1] },
				},
				edge,
			);
		});
		if (!vEdge) {
			continue;
		}
		const left = vEdge.left ? getDistrictBySite(vEdge.left.data) : null;
		const right = vEdge.right ? getDistrictBySite(vEdge.right.data) : null;
		if (left && right) {
			left.rivers.push(right);
			right.rivers.push(left);
		}
	}
	console.timeEnd('add river to districts');

	// determine ridges
	console.time('determine ridges');
	let ridgeEdges: Edge[] = [];
	for (
		const voronoiEdge
		of diagram.edges
			.filter(Boolean)
			.filter((e) => e.left && e.left.data && e.right && e.right.data)
	) {
		const left = getDistrictBySite(voronoiEdge.left.data);
		const right = getDistrictBySite(voronoiEdge.right.data);
		if (
			!left.rivers.includes(right) &&
			left.type !== 'water' &&
			right.type !== 'water' &&
			Math.abs(left.height - right.height) > RIDGE_HEIGHT_DELTA
		) {
			const edge = {
				p1: { x: voronoiEdge[0][0], y: voronoiEdge[0][1] },
				p2: { x: voronoiEdge[1][0], y: voronoiEdge[1][1] },
			};
			if (!ridgeEdges.some((ridge) => geometry.areEdgesEquivalent(ridge, edge))) {
				ridgeEdges.push(edge);
			}
		}
	}

	// remove short ridges
	const ridges: Point[][] = geometry.joinEdges(ridgeEdges).filter((ridge) => ridge.length > RIDGE_MIN_LENGTH);
	ridgeEdges = ridges.map((ridge) => {
		const edges = geometry.getPolygonEdges({ points: ridge });
		edges.pop();
		return edges;
	}).reduce((prev, cur) => {
		prev.push(...cur);
		return prev;
	}, []);
	console.timeEnd('determine ridges');

	// add ridges to districts
	console.time('add ridges to districts');
	for (const edge of ridgeEdges) {
		const voronoiEdge = diagram.edges.filter(Boolean).find((e) => {
			return geometry.areEdgesEquivalent(
				{
					p1: { x: e[0][0], y: e[0][1] },
					p2: { x: e[1][0], y: e[1][1] },
				},
				edge,
			);
		});
		if (!voronoiEdge) {
			continue;
		}
		const left = voronoiEdge.left ? getDistrictBySite(voronoiEdge.left.data) : null;
		const right = voronoiEdge.right ? getDistrictBySite(voronoiEdge.right.data) : null;
		if (left && right) {
			left.ridges.push(right);
			right.ridges.push(left);
		}
	}
	map.ridges = ridges;
	console.timeEnd('add ridges to districts');

	// place villages
	console.time('place villages');
	for (let i = 0; i < NUM_VILLAGES; i++) {
		const potentialDistricts = districts.filter((d) => d.type === 'rural');
		const newVillage = pickWeighted<District>(potentialDistricts, (d) => d.calcVillageScore(), rng);
		newVillage.type = 'village';
		newVillage.chaos = VILLAGE_CHAOS;
		newVillage.blockSize = VILLAGE_BLOCK_SIZE;
		newVillage.streetWidth = VILLAGE_STREET_WIDTH;
	}
	console.timeEnd('place villages');

	// place bridges on villages on river
	console.time('place bridges');
	for (const village of districts.filter((d) => d.type === 'village').filter((d) => d.rivers.length)) {
		// first place bridges between fillages
		for (const neighbor of village.neighbors.filter((d) => d.type === 'village')) {
			if (village.rivers.includes(neighbor)) {
				village.bridges.push(neighbor);
			}
		}
		// if still no bridges, choose a random neighbor across the river
		if (!village.bridges.length) {
			const bridgeTo = village.rivers[Math.floor(rng() * village.rivers.length)];
			village.bridges.push(bridgeTo);
			bridgeTo.bridges.push(village);
		}

		for (const neighbor of village.bridges) {
			// TODO clean up bridge drawing code
			const edge = geometry.findCommonEdge(village.polygon, neighbor.polygon);
			const slope = geometry.calcPerpendicularSlope(edge);
			const point = geometry.calcMidPoint(edge);
			const theta = Math.atan(slope);
			const dx = Math.cos(theta) * (riverWidth / 2 + 3);
			const dy = Math.sin(theta) * (riverWidth / 2 + 3);
			const bridgeEdge: Edge = {
				p1: { x: point.x + dx, y: point.y + dy },
				p2: { x: point.x - dx, y: point.y - dy },
			};
			map.bridges.push(bridgeEdge);
		}
	}
	console.timeEnd('place bridges');

	console.time('create road graph');
	const intersectionGraph: { [point: string]: Point[] } = {};
	for (const edge of diagram.edges.filter((e) => e && e.left && e.left.data && e.right && e.right.data)) {
		const leftDistrict = getDistrictBySite(edge.left.data);
		const rightDistrict = getDistrictBySite(edge.right.data);
		const isCoast = leftDistrict.type === 'water' || rightDistrict.type === 'water';
		const isRiver = leftDistrict.rivers.includes(rightDistrict);
		const isRidge = leftDistrict.ridges.includes(rightDistrict);
		if (!(isCoast || isRiver || isRidge )) {
			const leftKey: string = edge[0].slice(0, 2).toString();
			const leftPoint: Point = { x: edge[0][0], y: edge[0][1] };
			const rightKey: string = edge[1].slice(0, 2).toString();
			const rightPoint: Point = { x: edge[1][0], y: edge[1][1] };
			intersectionGraph[leftKey] = intersectionGraph[leftKey] || [];
			intersectionGraph[leftKey].push(rightPoint);
			intersectionGraph[rightKey] = intersectionGraph[rightKey] || [];
			intersectionGraph[rightKey].push(leftPoint);
		}
	}
	console.timeEnd('create road graph');

	// place roads on Delauney triangulation between villages
	console.time('determine roads');
	const mainRoads = createRoads(districts, diagram, intersectionGraph, options);
	for (const edge of mainRoads) {
		const voronoiEdge = diagram.edges.filter(Boolean).find((e) => {
			return geometry.areEdgesEquivalent(
				{
					p1: { x: e[0][0], y: e[0][1] },
					p2: { x: e[1][0], y: e[1][1] },
				},
				edge,
			);
		});
		if (!voronoiEdge) {
			continue;
		}
		const left = voronoiEdge.left ? getDistrictBySite(voronoiEdge.left.data) : null;
		const right = voronoiEdge.right ? getDistrictBySite(voronoiEdge.right.data) : null;
		if (left && right) {
			left.roads.push(right);
			right.roads.push(left);
		}
	}
	console.timeEnd('determine roads');

	// determine core and urbanize
	console.time('urbanize');
	const coreDistrictChoices = districts
		.filter((d) => d.rivers.length)
		.filter((d) => d.neighbors.some((n) => n.type === 'water'));
	const core = pickRandom(coreDistrictChoices, rng);
	core.isCore = true;
	urbanize(core, NUM_URBAN_DISTRICTS);
	console.timeEnd('urbanize');

	// remove forests next to city and village
	console.time('deforest');
	districts
		.filter((d) => d.type === 'forest')
		.filter((d) => d.neighbors.some((n) => n.type === 'urban' || n.type === 'village'))
		.forEach((d) => d.type = 'rural');
	console.timeEnd('deforest');

	console.time('inset roads, ridges, river');
	let riversRidgesRoads = riverEdges.concat(ridgeEdges).concat(mainRoads);
	// remove duplicates
	riversRidgesRoads = riversRidgesRoads.reduce((acc, cur) => {
		if (acc.every((edge) => !geometry.areEdgesEquivalent(edge, cur))) {
			acc.push(cur);
		}
		return acc;
	}, []);
	// make space for roads, ridges, and rivers
	for (const district of districts.filter((d) => d.type !== 'water')) {
		const copy = geometry.clonePolygon(district.polygon);
		const edges = geometry.getPolygonEdges(copy);
		edges.forEach((edge, index) => {
			for (const road of riversRidgesRoads) {
				if (geometry.areEdgesEquivalent(edge, road)) {
					if (copy.points.indexOf(edge.p1) !== -1) {
						let inset: number;
						let isRoad = false;
						if (riverEdges.includes(road)) {
							inset = riverWidth / 2 + 3;
						} else if (ridgeEdges.includes(road)) {
							inset = 30;
						} else {
							isRoad = true;
							inset = 3;
						}
						if (district.type === 'rural') {
							inset += 2;
						}
						const result = geometry.insetPolygonEdge(
							district.polygon,
							district.polygon.points[copy.points.indexOf(edge.p1)],
							inset,
						);
						if (result) {
							for (const splicedIndex of result.spliced) {
								copy.points.splice(splicedIndex, 1);
							}
							if (isRoad && district.type === 'rural') { // add urban sprawl buildings
								let numBuildings;
								let minWidth;
								let maxWidth;
								if (district.neighbors.some((d) => d.type === 'urban')) {
									numBuildings = 10;
									minWidth = 10;
									maxWidth = 20;
								} else if (
									district.neighbors.some((d) => d.neighbors.some((n) => n.type === 'urban')) ||
									district.neighbors.some((d) => d.type === 'village')
								) {
									numBuildings = 5;
									minWidth = 5;
									maxWidth = 10;
								} else {
									numBuildings = rng() > 0.75 ? 1 : 0;
									minWidth = 5;
									maxWidth = 10;
								}
								for (let i = 0; i < numBuildings; i++) {
									const p1 = geometry.getRandomPointOnEdge(result.newEdge, rng);
									let p2 = geometry.getRandomPointOnEdge(result.newEdge, rng);
									let tries = 0;
									while (
										tries < 10 &&
										(geometry.calcEuclideanDistance(p1, p2) > 20 ||
										geometry.calcEuclideanDistance(p1, p2) < 5
									)) {
										p2 = geometry.getRandomPointOnEdge(result.newEdge, rng);
										tries++;
									}
									const width = rng() * (maxWidth - minWidth) + minWidth;
									const rect = geometry.createRectFromEdge({ p1, p2 }, width, district.site);
									map.sprawl.push(rect);
								}
							}
						}
					}
				}
			}
		});
	}
	console.timeEnd('inset roads, ridges, river');

	console.time('inset districts');
	for (const district of districts) {
		const districtType = district.type;

		let inset: number = 0;
		if (districtType === 'rural') {
			inset = 1;
		}
		if (districtType === 'village') {
			inset = 3;
		}
		if (districtType === 'urban') {
			inset = 3;
		}

		if (inset) {
			for (const point of district.polygon.points) {
				geometry.insetPolygonEdge(district.polygon, point, inset);
			}
		}

		district.name = generateName(district, rng);
	}
	console.timeEnd('inset districts');

	console.time('convert to JSON');
	map.districts = districts.map((d) => d.toJson());
	console.timeEnd('convert to JSON');

	console.timeEnd('generate map');
	return map;
}
