import * as d3 from 'd3';
import { slicePolygon, clipCorners, insetPolygonEdge, shatterPolygon, Point, Edge, Polygon } from './geometry';
import * as geometry from './geometry';

type DistrictType = 'rural' | 'urban' | 'plaza' | 'water' | 'village';

const VILLAGE_SCORE_BASE = 1;
const VILLAGE_SCORE_ON_COAST = 5;
const VILLAGE_SCORE_ON_RIVER = 10
const VILLAGE_SCORE_NEXT_TO_VILLAGE = -6;

const URBAN_SCORE_BASE = 5;
const URBAN_SCORE_EACH_ADJACENT_VILLAGE = 5;
const URBAN_SCORE_EACH_ADJACENT_URBAN = 10
const URBAN_SCORE_ON_COAST = 5;
const URBAN_SCORE_ON_RIVER = 10;
const URBAN_SCORE_HAS_BRIDGE = 5;

export default class District {
	private blocks: [number, number][][] = [];
	public isCore: boolean = false;
	public chaos: number = 0;
	public blockSize: number = 0;
	public streetWidth: number = 4;
	public neighbors: District[] = [];
	public rivers: District[] = []; // neighbors across a river segment
	public bridges: District[] = []; // neighbors across a river segment with a bridge
	public roadEnds: Point[] = []; // points (from this.originalPolygon) that major roads start/end at
	public site: Point | null = null;
	public originalPolygon: Polygon;

	constructor(
		public polygon: Polygon,
		public type: DistrictType
	) {
		this.originalPolygon = [...polygon];
	}

	originalPolygonPointToPolygonPoint(point: Point): Point { // TODO make this smarter...
		let index = this.originalPolygon.findIndex(p => geometry.arePointsEquivalent(p, point));
		return this.polygon[index];
	}

	calcVillageScore(): number {
		const onCoast: boolean = this.neighbors.some(d => d.type === 'water');
		const onRiver: boolean = !!this.rivers.length;
		const nextToVillage: boolean = this.neighbors.some(d => d.type === 'village');

		return VILLAGE_SCORE_BASE +
			Number(onCoast) * VILLAGE_SCORE_ON_COAST +
			Number(onRiver) * VILLAGE_SCORE_ON_RIVER +
			Number(nextToVillage) * VILLAGE_SCORE_NEXT_TO_VILLAGE;
	}

	calcUrbanScore(): number {
		const numAdjacentVillages = this.neighbors.filter(d => d.type === 'village').length;
		const numAdjacentUrban = this.neighbors.filter(d => d.type === 'urban').length;
		const onCoast = this.neighbors.some(d => d.type === 'water');
		const onRiver = !!this.rivers.length;
		const hasBridge = !!this.bridges.length;

		return URBAN_SCORE_BASE +
			numAdjacentVillages * URBAN_SCORE_EACH_ADJACENT_VILLAGE +
			numAdjacentUrban * URBAN_SCORE_EACH_ADJACENT_URBAN + 
			Number(onCoast) * URBAN_SCORE_ON_COAST +
			Number(onRiver) * URBAN_SCORE_ON_RIVER +
			Number(hasBridge) * URBAN_SCORE_HAS_BRIDGE;
	}

	createBlocks(queue: Polygon[]) {
		// split 'building' districts into blocks
		// let queue = [this.polygon];
		let queueLoopCounter = 0;
		while (queue.length) {
			queueLoopCounter++;
			if (queueLoopCounter > 2000) {
				return false;
			}

			let polygon = queue.shift();
			let area = d3.polygonArea(polygon);

			if (area < this.blockSize) {
				//polygon.cssClass = 'building';
				this.blocks.push(polygon);
				continue;
			}

			// split in two
			let edges = polygon.map((point, index, points) => [point, points[(index + 1) % points.length]]);

			let longest = [...edges].sort((a, b) => {
				let aLength = Math.pow(
					Math.pow(a[0][0] - a[1][0], 2) +
					Math.pow(a[0][1] - a[1][1], 2),
					0.5);
				let bLength = Math.pow(
					Math.pow(b[0][0] - b[1][0], 2) +
					Math.pow(b[0][1] - b[1][1], 2),
					0.5);
				return bLength - aLength;
			})[0];

			let slope = (
				longest[0][1] - longest[1][1]) /
				(longest[0][0] - longest[1][0]
			);

			let percent = 0.5 + Math.random() * this.chaos - this.chaos / 2;
			let splitPoint = [
				(longest[0][0] + (longest[1][0] - longest[0][0]) * percent),
				(longest[0][1] + (longest[1][1] - longest[0][1]) * percent)
			]
			slope = -1 / slope; // get perpendicular
			slope *= (1 + Math.random() * this.chaos - this.chaos / 2);
			if (slope === Infinity || slope === -Infinity) {
				console.warn('infinite slope')
				slope = 999999999;
			}

			let testEdge: Edge = [
				[
					1000000,
					slope * (1000000 - splitPoint[0]) + splitPoint[1]
				],
				[
					-1000000,
					slope * (-1000000 - splitPoint[0]) + splitPoint[1]
				]
			];

			let sliceResult = slicePolygon(polygon, testEdge, this.streetWidth);
			if (sliceResult) {
				queue.push(...sliceResult);
			} else {
				console.warn('Split polygon failed');
				return null;
			}
		}
	}

	render(target: Element): void {
		let d3Target = d3.select(target);
		let fieldLine = d3.line()
			.x(d => d[0])
			.y(d => d[1])
			.curve(d3.curveCatmullRomClosed.alpha(0.2));

		if (this.isCore) {
			let rect = geometry.findRectInPolygon(this.polygon);
			// d3Target.append('polygon')
			// 	.attr('stroke', 'red')
			// 	.attr('stroke-width', 2)
			// 	.attr('points', this.polygon.join(' '));
			// d3Target.append('polygon')
			// 	.attr('fill', 'rgba(255, 0, 0, 0.5)')
			// 	.attr('points', rect.join(' '));
			let cross = geometry.createCross(rect);
			d3Target.append('polygon')
				.attr('class', 'building')
				.attr('points', cross.join(' '));
			return;
		}

		if (this.blockSize && !this.blocks.length) {
			let queue = [this.polygon];
			if (this.roadEnds.length) {
				let roads = this.roadEnds.map(p => this.originalPolygonPointToPolygonPoint(p)).filter(Boolean);
				let clip = 10 + Math.random() * 10;
				queue = shatterPolygon(this.polygon, this.site);
				for (let polygon of queue) {
					let inset1 = 2;
					let inset2 = 2;
					if (roads.some(p => geometry.arePointsEquivalent(p, polygon[1]))) {
						inset1 = 5;
					}
					if (roads.some(p => geometry.arePointsEquivalent(p, polygon[0]))) {
						inset2 = 5;
					}
					insetPolygonEdge(polygon, polygon[1], inset1);
					insetPolygonEdge(polygon, polygon[2], inset2);
					geometry.clipCorner(polygon, 2, clip);
				}
			}
			this.createBlocks(queue);
		}

		let polygonsToRender: [number, number][][] = this.blocks.length ? this.blocks : [this.polygon];
		// let hasPlaza = false;
		for (let polygon of polygonsToRender) {
			switch (this.type) {
				case 'village': {
					// // DEBUG
					// for (let point of this.roads) {
					// 	d3Target.append('line')
					// 		.attr('stroke-width', 2)
					// 		.attr('stroke', 'red')
					// 		.attr('x1', point[0])
					// 		.attr('y1', point[1])
					// 		.attr('x2', this.site[0])
					// 		.attr('y2', this.site[1]);
					// }
					// break;
				}
				
				case 'urban': {
					// if (!hasPlaza && polygon.some(blockPoint => this.polygon.some(polygonPoint => blockPoint[0] === polygonPoint[0] && blockPoint[1] === polygonPoint[1]))) {
					// 	if (d3.polygonArea(polygon) < 200 && Math.random() < 1) {
					// 		hasPlaza = true;
					// 		break;
					// 	}
					// }
					d3Target.append('polygon')
						.datum(this)
						.attr('class', 'urban-block')
						.attr('points', polygon.join(' '));

					let copy: Polygon = polygon.map(point => [...point] as Point);
					let success = true;
					for (let point of copy) {
						success = success && !!insetPolygonEdge(copy, point, 10);
					}
					if (success) {
						d3Target.append('polygon')
							.attr('class', 'courtyard')
							.attr('points', copy.join(' '));
					}


					// // DEBUG
					// for (let point of this.roads) {
					// 	d3Target.append('line')
					// 		.attr('stroke-width', 2)
					// 		.attr('stroke', 'red')
					// 		.attr('x1', point[0])
					// 		.attr('y1', point[1])
					// 		.attr('x2', this.site[0])
					// 		.attr('y2', this.site[1]);
					// }

					break;
				}

				case 'rural': {
					clipCorners(polygon, 6);
					let selection = d3Target.append('path')
						.datum(polygon)
						.attr('class', 'field' + Math.floor(Math.random() * 3 + 1))
						.attr('d', fieldLine);

					// // DEBUG
					// let color = d3.scaleLinear<string>()
					// 	.domain([0, VILLAGE_SCORE_BASE + VILLAGE_SCORE_ON_COAST + VILLAGE_SCORE_ON_RIVER])
					// 	.range(['white', 'red']);
					// selection.style('fill', color(this.calcVillageScore()));
					break;
				}

				case 'water': {
					d3Target.append('polygon')
						.attr('class', 'water')
						.style('animation-duration', Math.floor(Math.random() * 8 + 3) + 's')
						.style('animation-delay', Math.floor(Math.random() * 1000) + 'ms')
						.attr('points', polygon.join(' '));
					break;
				}

				case 'plaza': {
					break;
				}

				default: {}
			}
		}
	}

}