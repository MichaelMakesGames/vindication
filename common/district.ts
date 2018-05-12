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
const URBAN_SCORE_EACH_ADJACENT_URBAN = 10;
const URBAN_SCORE_ON_COAST = 5;
const URBAN_SCORE_ON_RIVER = 10;
const URBAN_SCORE_ON_MOUTH = 30;
const URBAN_SCORE_HAS_BRIDGE = 5;

export interface DistrictJson {
	id: number;
	name: string;
	blocks: geometry.Polygon[];
	isCore: boolean;
	chaos: number;
	blockSize: number;
	streetWidth: number;
	neighbors: geometry.Point[];
	rivers: geometry.Point[];
	bridges: geometry.Point[];
	roadEnds: geometry.Point[];
	site: geometry.Point;
	originalPolygon: geometry.Polygon;
	polygon: geometry.Polygon;
	type: DistrictType;
	rebelControlled: boolean;
}

export class District {
	public static fromJson(json: DistrictJson): District {
		const district: District = new District(json.id, json.polygon, json.type);
		district.name = json.name;
		district.blocks = json.blocks;
		district.isCore = json.isCore;
		district.chaos = json.chaos;
		district.blockSize = json.blockSize;
		district.streetWidth = json.streetWidth;
		district.neighborSites = json.neighbors;
		district.riverSites = json.rivers;
		district.bridgeSites = json.bridges;
		district.roadEnds = json.roadEnds;
		district.site = json.site;
		district.originalPolygon = json.originalPolygon;
		district.rebelControlled = json.rebelControlled;
		return district;
	}

	public name: string = '';
	public blocks: geometry.Polygon[] = [];
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
	public rebelControlled: boolean = false;

	private neighborSites: geometry.Point[];
	private riverSites: geometry.Point[];
	private bridgeSites: geometry.Point[];

	constructor(
		public id: number,
		public polygon: geometry.Polygon,
		public type: DistrictType,
	) {
		this.originalPolygon = [...polygon];
	}

	public toJson(): DistrictJson {
		return {
			blockSize: this.blockSize,
			blocks: this.blocks,
			bridges: this.bridges.map((d) => d.site),
			chaos: this.chaos,
			id: this.id,
			isCore: this.isCore,
			name: this.name,
			neighbors: this.neighbors.map((d) => d.site),
			originalPolygon: this.originalPolygon,
			polygon: this.polygon,
			rebelControlled: this.rebelControlled,
			rivers: this.rivers.map((d) => d.site),
			roadEnds: this.roadEnds,
			site: this.site,
			streetWidth: this.streetWidth,
			type: this.type,
		};
	}

	public linkSites(districts: District[]): void {
		const getDistrict = (site: geometry.Point): District => {
			return districts.find((d) => geometry.arePointsEquivalent(d.site, site));
		};
		this.neighbors = this.neighborSites.map(getDistrict);
		this.rivers = this.riverSites.map(getDistrict);
		this.bridges = this.bridgeSites.map(getDistrict);
	}

	public originalPolygonPointToPolygonPoint(point: geometry.Point): geometry.Point { // TODO make this smarter...
		const index = this.originalPolygon.findIndex((p) => geometry.arePointsEquivalent(p, point));
		return this.polygon[index];
	}

	public calcVillageScore(): number {
		const onCoast: boolean = this.neighbors.some((d) => d.type === 'water');
		const onRiver: boolean = !!this.rivers.length;
		const onMouth: boolean = onCoast && onRiver;
		const nextToVillage: boolean = this.neighbors.some((d) => d.type === 'village');

		return VILLAGE_SCORE_BASE +
			Number(onCoast) * VILLAGE_SCORE_ON_COAST +
			Number(onRiver) * VILLAGE_SCORE_ON_RIVER +
			Number(onMouth) * VILLAGE_SCORE_ON_MOUTH +
			Number(nextToVillage) * VILLAGE_SCORE_NEXT_TO_VILLAGE;
	}

	public calcUrbanScore(): number {
		const numAdjacentVillages = this.neighbors.filter((d) => d.type === 'village').length;
		const numAdjacentUrban = this.neighbors.filter((d) => d.type === 'urban').length;
		const onCoast = this.neighbors.some((d) => d.type === 'water');
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

	public createBlocks(queue: geometry.Polygon[]) {
		// split 'building' districts into blocks
		// let queue = [this.polygon];
		let queueLoopCounter = 0;
		while (queue.length) {
			queueLoopCounter++;
			if (queueLoopCounter > 2000) {
				return false;
			}

			const polygon = queue.shift();
			const area = d3.polygonArea(polygon);

			if (area < this.blockSize) {
				this.blocks.push(polygon);
				continue;
			}

			// split in two
			const edges = polygon.map((point, index, points) => [point, points[(index + 1) % points.length]]);

			const longest = [...edges].sort((a, b) => {
				const aLength = Math.pow(
					Math.pow(a[0][0] - a[1][0], 2) +
					Math.pow(a[0][1] - a[1][1], 2),
					0.5);
				const bLength = Math.pow(
					Math.pow(b[0][0] - b[1][0], 2) +
					Math.pow(b[0][1] - b[1][1], 2),
					0.5);
				return bLength - aLength;
			})[0];

			let slope = (
				longest[0][1] - longest[1][1]) /
				(longest[0][0] - longest[1][0]
			);

			const percent = 0.5 + Math.random() * this.chaos - this.chaos / 2;
			const splitPoint = [
				(longest[0][0] + (longest[1][0] - longest[0][0]) * percent),
				(longest[0][1] + (longest[1][1] - longest[0][1]) * percent),
			];
			slope = -1 / slope; // get perpendicular
			slope *= (1 + Math.random() * this.chaos - this.chaos / 2);
			if (slope === Infinity || slope === -Infinity) {
				console.warn('infinite slope');
				slope = 999999999;
			}

			const testEdge: geometry.Edge = [
				[
					1000000,
					slope * (1000000 - splitPoint[0]) + splitPoint[1],
				],
				[
					-1000000,
					slope * (-1000000 - splitPoint[0]) + splitPoint[1],
				],
			];

			const sliceResult = geometry.slicePolygon(polygon, testEdge, this.streetWidth);
			if (sliceResult) {
				queue.push(...sliceResult);
			} else {
				console.warn('Split polygon failed');
				return null;
			}
		}
	}

}

export default District;
