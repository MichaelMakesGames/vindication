import * as d3 from 'd3';
import * as geometry from './geometry';

type DistrictType = 'rural' | 'urban' | 'plaza' | 'water' | 'village';

const VILLAGE_SCORE_BASE = 1;
const VILLAGE_SCORE_ON_COAST = 5;
const VILLAGE_SCORE_ON_RIVER = 10;
const VILLAGE_SCORE_ON_MOUTH = 30;
const VILLAGE_SCORE_NEXT_TO_VILLAGE = -6;

const URBAN_SCORE_BASE = 5;
const URBAN_SCORE_EACH_ADJACENT_VILLAGE = 5;
const URBAN_SCORE_EACH_ADJACENT_URBAN = 10
const URBAN_SCORE_ON_COAST = 5;
const URBAN_SCORE_ON_RIVER = 10;
const URBAN_SCORE_ON_MOUTH = 30;
const URBAN_SCORE_HAS_BRIDGE = 5;

export default class District {
	public blocks: [number, number][][] = [];
	public isCore: boolean = false;
	public chaos: number = 0;
	public blockSize: number = 0;
	public streetWidth: number = 4;
	public neighbors: District[] = [];
	public rivers: District[] = []; // neighbors across a river segment
	public bridges: District[] = []; // neighbors across a river segment with a bridge
	public roadEnds: geometry.Point[] = []; // points (from this.originalPolygon) that major roads start/end at
	public site: geometry.Point | null = null;
	public originalPolygon: geometry.Polygon;

	constructor(
		public polygon: geometry.Polygon,
		public type: DistrictType
	) {
		this.originalPolygon = [...polygon];
	}

	originalPolygonPointToPolygonPoint(point: geometry.Point): geometry.Point { // TODO make this smarter...
		let index = this.originalPolygon.findIndex(p => geometry.arePointsEquivalent(p, point));
		return this.polygon[index];
	}

	calcVillageScore(): number {
		const onCoast: boolean = this.neighbors.some(d => d.type === 'water');
		const onRiver: boolean = !!this.rivers.length;
		const onMouth: boolean = onCoast && onRiver;
		const nextToVillage: boolean = this.neighbors.some(d => d.type === 'village');

		return VILLAGE_SCORE_BASE +
			Number(onCoast) * VILLAGE_SCORE_ON_COAST +
			Number(onRiver) * VILLAGE_SCORE_ON_RIVER +
			Number(onMouth) * VILLAGE_SCORE_ON_MOUTH +
			Number(nextToVillage) * VILLAGE_SCORE_NEXT_TO_VILLAGE;
	}

	calcUrbanScore(): number {
		const numAdjacentVillages = this.neighbors.filter(d => d.type === 'village').length;
		const numAdjacentUrban = this.neighbors.filter(d => d.type === 'urban').length;
		const onCoast = this.neighbors.some(d => d.type === 'water');
		const onRiver = !!this.rivers.length;
		const onMouth = onCoast && onRiver;
		const hasBridge = !!this.bridges.length;

		return URBAN_SCORE_BASE +
			numAdjacentVillages * URBAN_SCORE_EACH_ADJACENT_VILLAGE +
			numAdjacentUrban * URBAN_SCORE_EACH_ADJACENT_URBAN + 
			Number(onCoast) * URBAN_SCORE_ON_COAST +
			Number(onRiver) * URBAN_SCORE_ON_RIVER +
			Number(onMouth) * URBAN_SCORE_ON_MOUTH +
			Number(hasBridge) * URBAN_SCORE_HAS_BRIDGE;
	}

	createBlocks(queue: geometry.Polygon[]) {
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

			let testEdge: geometry.Edge = [
				[
					1000000,
					slope * (1000000 - splitPoint[0]) + splitPoint[1]
				],
				[
					-1000000,
					slope * (-1000000 - splitPoint[0]) + splitPoint[1]
				]
			];

			let sliceResult = geometry.slicePolygon(polygon, testEdge, this.streetWidth);
			if (sliceResult) {
				queue.push(...sliceResult);
			} else {
				console.warn('Split polygon failed');
				return null;
			}
		}
	}

}