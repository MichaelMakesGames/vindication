import {Point, Polygon, Edge} from './geometry';
import {District, DistrictJson} from './district';

export interface Map {
	coasts : Point[][],
	districts : District[],
	subRiver : {
		path: Point[],
		width: number
	},
	river : {
		path: Point[],
		width: number
	},
	bridges : Edge[],
	sprawl : Polygon[]
}

export interface MapJson {
	coasts : Point[][],
	districts : DistrictJson[],
	subRiver : {
		path: Point[],
		width: number
	},
	river : {
		path: Point[],
		width: number
	},
	bridges : Edge[],
	sprawl : Polygon[]
}

export function mapFromJson(mapJson : MapJson): Map {
	const map = {
		districts: []as District[],
		coasts: mapJson.coasts,
		river: mapJson.river,
		subRiver: mapJson.subRiver,
		sprawl: mapJson.sprawl,
		bridges: mapJson.bridges
	};
	map.districts = mapJson
		.districts
		.map(d => District.fromJson(d));
	for (let district of map.districts) {
		district.linkSites(map.districts);
	}
	return map;
}

export default Map;