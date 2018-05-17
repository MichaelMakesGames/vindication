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
	roads: geometry.Point[];
	site: geometry.Point;
	originalPolygon: geometry.Polygon;
	polygon: geometry.Polygon;
	type: DistrictType;
	rebelControlled: boolean;
	height: number;
}

export class District {
	public static fromJson(json: DistrictJson): District {
		const district: District = new District(json.id, json.polygon, json.type);
		district.blockSize = json.blockSize;
		district.blocks = json.blocks;
		district.bridgeSites = json.bridges;
		district.chaos = json.chaos;
		district.height = json.height;
		district.isCore = json.isCore;
		district.name = json.name;
		district.neighborSites = json.neighbors;
		district.originalPolygon = json.originalPolygon;
		district.rebelControlled = json.rebelControlled;
		district.riverSites = json.rivers;
		district.roadEnds = json.roadEnds;
		district.roadSites = json.roads;
		district.site = json.site;
		district.streetWidth = json.streetWidth;
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
	public roads: District[] = [];
	public site: geometry.Point | null = null;
	public originalPolygon: geometry.Polygon;
	public rebelControlled: boolean = false;
	public height: number = 0;

	private neighborSites: geometry.Point[];
	private riverSites: geometry.Point[];
	private bridgeSites: geometry.Point[];
	private roadSites: geometry.Point[];

	constructor(
		public id: number,
		public polygon: geometry.Polygon,
		public type: DistrictType,
	) {
		this.originalPolygon = geometry.clonePolygon(polygon);
	}

	public toJson(): DistrictJson {
		return {
			blockSize: this.blockSize,
			blocks: this.blocks,
			bridges: this.bridges.map((d) => d.site),
			chaos: this.chaos,
			height: this.height,
			id: this.id,
			isCore: this.isCore,
			name: this.name,
			neighbors: this.neighbors.map((d) => d.site),
			originalPolygon: this.originalPolygon,
			polygon: this.polygon,
			rebelControlled: this.rebelControlled,
			rivers: this.rivers.map((d) => d.site),
			roadEnds: this.roadEnds,
			roads: this.roads.map((d) => d.site),
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
		this.roads = this.roadSites.map(getDistrict);
	}

	public originalPolygonPointToPolygonPoint(point: geometry.Point): geometry.Point { // TODO make this smarter...
		const index = this.originalPolygon.points.findIndex((p) => geometry.arePointsEquivalent(p, point));
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
			const area = d3.polygonArea(polygon.points.map<[number, number]>((p) => [p.x, p.y]));

			if (area < this.blockSize) {
				this.blocks.push(polygon);
				continue;
			}

			// split in two
			const edges: geometry.Edge[] = polygon.points.map((point, index, points) => {
				return { p1: point, p2: points[(index + 1) % points.length] };
			});

			const longest = [...edges].sort((a, b) => {
				const aLength = geometry.calcDistance(a.p1, a.p2);
				const bLength = geometry.calcDistance(b.p1, b.p2);
				return bLength - aLength;
			})[0];

			let slope = geometry.calcSlope(longest);

			const percent = 0.5 + Math.random() * this.chaos - this.chaos / 2;
			const splitPoint: geometry.Point = {
				x: (longest.p1.x + (longest.p2.x - longest.p1.x) * percent),
				y: (longest.p1.y + (longest.p2.y - longest.p1.y) * percent),
			};
			slope = geometry.calcPerpendicularSlope(slope);
			slope *= (1 + Math.random() * this.chaos - this.chaos / 2);
			if (slope === Infinity || slope === -Infinity) {
				console.warn('infinite slope');
				slope = 999999999;
			}

			const testEdge: geometry.Edge = {
				p1: {
					x: 1000000,
					y: slope * (1000000 - splitPoint.x) + splitPoint.y,
				},
				p2: {
					x: -1000000,
					y: slope * (-1000000 - splitPoint.x) + splitPoint.y,
				},
			};

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
