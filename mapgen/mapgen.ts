import { voronoi } from 'd3';
import * as PriorityQueue from 'priorityqueuejs';
import * as Random from 'rng';

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
	const rng = new Random.MT(options.seed);
	let map: MapJson = null;
	let tries = 0;
	while (!map) {
		const types = [MapType.Bay, MapType.Coastal, MapType.Delta];
		const type = types[Math.floor(rng.random() * types.length)];
		map = generateMap(type, options, rng);
		tries++;
		if (tries >= 860) {
			console.error('Too many tries, abandoning');
			break;
		}
	}
	return map;
}

const NUM_VILLAGES = 15;
const NUM_URBAN_DISTRICTS = 20;

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

const SITE_GRID_SIZE = 100;

function pickWeighted<T>(items: T[], weightFunc: (item: T) => number, rng): T {
	const weights = items.map((item) => weightFunc(item));
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
	const roads = geometry.getPolygonEdges({ points: path });
	roads.pop();

	return roads;
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
			[options.width + SITE_GRID_SIZE * 2, options.height + SITE_GRID_SIZE * 2],
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

function urbanize(district: District, urbanRim: District[]): void {
	district.type = 'urban';
	district.chaos = MID_CHAOS;
	district.blockSize = MID_BLOCK_SIZE;
	district.streetWidth = MID_STREET_WIDTH;

	for (const neighbor of district.neighbors) {
		if (
			neighbor.type !== 'urban' &&
			neighbor.type !== 'water' &&
			!urbanRim.includes(neighbor) &&
			(!district.rivers.includes(neighbor) || district.bridges.includes(neighbor))
		) {
			urbanRim.push(neighbor);
		}
	}

	if (urbanRim.includes(district)) {
		urbanRim.splice(urbanRim.indexOf(district), 1);
	}
}

function generateMap(mapType: MapType, options: Options, rng): MapJson {
	const map: MapJson = {
		bridges: [] as Edge[],
		coasts: [] as Point[][],
		districts: [] as DistrictJson[],
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

	const voronoiDiagram = voronoi<Point>().x((d) => d.x).y((d) => d.y);
	voronoiDiagram.extent([
		[SITE_GRID_SIZE * -2, SITE_GRID_SIZE * -2],
		[options.width + SITE_GRID_SIZE * 2, options.height + SITE_GRID_SIZE * 2],
	]);

	const points: Point[] = [];
	for (let i = SITE_GRID_SIZE * -2; i < options.width + SITE_GRID_SIZE * 2; i += SITE_GRID_SIZE) {
		for (let j = 0; j < options.height; j += SITE_GRID_SIZE) {
			let done = false;
			while (!done) {
				const point: Point = {
					x: Math.floor(rng.random() * SITE_GRID_SIZE) + i,
					y: Math.floor(rng.random() * SITE_GRID_SIZE) + j,
				};
				if (points.every((p) => p.x !== point.x && p.y !== point.y)) {
					points.push(point);
					done = true;
				}
			}
		}
	}

	const diagram = voronoiDiagram(points);

	const d3Polygons = diagram.polygons().filter(Boolean);
	const districts: District[] = d3Polygons.map((d3Polygon, index) => {
		const polygon = { points: d3Polygon.map(([x, y]) => ({ x, y })) };
		const district = new District(index, polygon, 'rural');
		district.site = d3Polygon.data;
		return district;
	});

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

	// add neighbors to districts
	for (const edge of diagram.edges.filter((e) => e && e.left && e.right)) {
		const left = getDistrictBySite(edge.left.data);
		const right = getDistrictBySite(edge.right.data);
		left.neighbors.push(right);
		right.neighbors.push(left);
	}

	const intersections: number[][] = [];
	const intersectionGraph: { [point: string]: Point[] } = {};
	for (const edge of diagram.edges.filter(Boolean)) {
		intersectionGraph[edge[0].toString()] = intersectionGraph[edge[0].toString()] || [];
		intersectionGraph[edge[0].toString()].push({ x: edge[1][0], y: edge[1][1] });
		if (!intersections.indexOf(edge[0])) {
			intersections.push(edge[0]);
		}
		intersectionGraph[edge[1].toString()] = intersectionGraph[edge[1].toString()] || [];
		intersectionGraph[edge[1].toString()].push({ x: edge[0][0], y: edge[0][1] });
		if (intersections.indexOf(edge[1]) === -1) {
			intersections.push(edge[1]);
		}
	}

	function getSitePolygon(site) {
		return getCellPolygon(diagram.cells[site.index]);
	}
	function getCellPolygon(cell) {
		return d3Polygons.find((polygon) => nodeToKey(polygon.data) === nodeToKey(cell.site.data));
	}
	function getPolygonCell(polygon) {
		return diagram.cells.find((cell) => cell && nodeToKey(cell.site.data) === nodeToKey(polygon.data));
	}

	// create ocean
	if ([MapType.Bay, MapType.Delta, MapType.Coastal].includes(mapType)) {
		for (const district of districts) {
			if (district.site.y > options.height * 0.75) {
				district.type = 'water';
			}
		}
	}

	// determine coasts
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

	// make river
	const riverWidth = Math.floor(rng.random() * 30 + 30);
	const river: Edge[] = [];
	(() => {
		const origin = intersections
			.filter((p) => p[1] === SITE_GRID_SIZE * -2)
			.sort((a, b) => Math.abs(a[0] - options.width / 2) - Math.abs(b[0] - options.width / 2))
		[0];

		const destination = coastEdges
			.map<Point>((e) => e.p1)
			.sort((a, b) => {
				return (
					Math.abs(a.x - options.width * 0.5) -
					Math.abs(b.x - options.width * 0.5)
				);
			})
		[0];

		const path = findPath(
			intersectionGraph,
			(a, b) => geometry.calcDistance(a, b),
			{ x: origin[0], y: origin[1] },
			destination,
		);
		river.push(...geometry.getPolygonEdges({ points: path }));

		for (const edge of river) {
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
				break;
			}
			const left = vEdge.left ? getDistrictBySite(vEdge.left.data) : null;
			const right = vEdge.right ? getDistrictBySite(vEdge.right.data) : null;
			if (left && right) {
				left.rivers.push(right);
				right.rivers.push(left);
			}
		}

		map.river.path = path;
		map.river.width = riverWidth;
	})();

	// remove river from intersections graph
	// for (const edge of river) {
	// 	const graph = intersectionGraph;
	// 	const p0String = [edge.p1.x, edge.p1.y].toString();
	// 	const p1String = [edge.p2.x, edge.p2.y].toString();
	// 	if (graph[p0String]) {
	// 		graph[p0String] = graph[p0String].filter((p: Point) => !geometry.arePointsEquivalent(p, edge.p2));
	// 	}
	// 	if (graph[p1String]) {
	// 		graph[p1String] = graph[p1String].filter((p: Point) => !geometry.arePointsEquivalent(p, edge.p1));
	// 	}
	// }

	// place villages
	for (let i = 0; i < NUM_VILLAGES; i++) {
		const potentialDistricts = districts.filter((d) => d.type === 'rural');
		const newVillage = pickWeighted<District>(potentialDistricts, (d) => d.calcVillageScore(), rng);
		newVillage.type = 'village';
		newVillage.chaos = VILLAGE_CHAOS;
		newVillage.blockSize = VILLAGE_BLOCK_SIZE;
		newVillage.streetWidth = VILLAGE_STREET_WIDTH;
	}

	// place bridges on villages on river
	for (const village of districts.filter((d) => d.type === 'village').filter((d) => d.rivers.length)) {
		// first place bridges between fillages
		for (const neighbor of village.neighbors.filter((d) => d.type === 'village')) {
			if (village.rivers.includes(neighbor)) {
				village.bridges.push(neighbor);
			}
		}
		// if still no bridges, choose a random neighbor across the river
		if (!village.bridges.length) {
			const bridgeTo = village.rivers[Math.floor(rng.random() * village.rivers.length)];
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

	// place roads on Delauney triangulation between villages
	const mainRoads = createRoads(districts, diagram, intersectionGraph, options);

	// determine urban core
	const core = districts
		.filter((d) => d.type === 'village')
		.sort((d1, d2) => d2.calcUrbanScore() - d1.calcUrbanScore())[0];
	core.isCore = true;

	// grow city along rivers, coasts, and roads
	const urbanRim: District[] = [];
	urbanize(core, urbanRim);
	for (let i = 0; i < NUM_URBAN_DISTRICTS; i++) {
		const newUrbanDistrict = pickWeighted<District>(urbanRim, (d) => d.calcUrbanScore(), rng);
		urbanize(newUrbanDistrict, urbanRim);
	}

	// TODO determine urban district densities
	core.blockSize = INNER_BLOCK_SIZE;
	core.chaos = INNER_CHAOS;
	core.streetWidth = INNER_STREET_WIDTH;
	for (const district of core.neighbors.filter((d) => d.type === 'urban')) {
		district.chaos = INNER_CHAOS;
		district.blockSize = INNER_BLOCK_SIZE;
		district.streetWidth = INNER_STREET_WIDTH;
	}
	for (const district of urbanRim) {
		district.type = 'urban';
		district.chaos = OUTER_CHAOS;
		district.blockSize = OUTER_BLOCK_SIZE;
		district.streetWidth = OUTER_STREET_WIDTH;
	}

	// smooth urban districts
	const districtsToDeurbanize = [];
	for (const district of districts.filter((d) => d.type === 'urban')) {
		const numRuralNonRiverNeighbors = district.neighbors
			.filter((d) => d.type === 'rural' && !district.rivers.includes(d))
			.length;
		if (numRuralNonRiverNeighbors > district.neighbors.length * 0.67) {
			districtsToDeurbanize.push(district);
		}
	}
	for (const district of districtsToDeurbanize) {
		district.type = 'rural';
		district.blockSize = 0;
		district.chaos = 0;
	}

	let riversAndRoads = river.concat(mainRoads);
	// remove duplicates
	riversAndRoads = riversAndRoads.reduce((acc, cur) => {
		if (acc.every((edge) => !geometry.areEdgesEquivalent(edge, cur))) {
			acc.push(cur);
		}
		return acc;
	}, []);
	// make space for roads and rivers
	for (const district of districts.filter((d) => d.type !== 'water')) {
		const copy = geometry.clonePolygon(district.polygon);
		const edges = geometry.getPolygonEdges(copy);
		edges.forEach((edge, index) => {
			for (const road of riversAndRoads) {
				if (geometry.areEdgesEquivalent(edge, road)) {
					if (copy.points.indexOf(edge.p1) !== -1) {
						let inset: number;
						if (river.includes(road)) {
							inset = riverWidth / 2 + 3;
						} else {
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
							if (district.type === 'rural') { // add urban sprawl buildings
								let numBuildings;
								let minWidth;
								let maxWidth;
								if (district.neighbors.some((d) => d.type === 'urban')) {
									numBuildings = 10;
									minWidth = 10;
									maxWidth = 20;
								} else if (district.neighbors.some((d) => d.neighbors.some((n) => n.type === 'urban'))) {
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
									while (
										tries < 10 &&
										(geometry.calcEuclideanDistance(p1, p2) > 20 ||
										geometry.calcEuclideanDistance(p1, p2) < 5
									)) {
										p2 = geometry.getRandomPointOnEdge(result.newEdge, rng);
										tries++;
									}
									const width = rng.random() * (maxWidth - minWidth) + minWidth;
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

	map.districts = districts.map((d) => d.toJson());

	return map;
}
