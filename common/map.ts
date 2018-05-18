import {District, DistrictJson} from './district';
import { Edge, Point, Polygon } from './geometry';

export interface Map {
	coasts: Point[][];
	districts: District[];
	subRiver: {
		path: Point[],
		width: number,
	};
	river: {
		path: Point[],
		width: number,
	};
	bridges: Edge[];
	sprawl: Polygon[];
	ridges: Point[][];
}

export interface MapJson {
	coasts: Point[][];
	districts: DistrictJson[];
	subRiver: {
		path: Point[],
		width: number,
	};
	river: {
		path: Point[],
		width: number,
	};
	bridges: Edge[];
	sprawl: Polygon[];
	ridges: Point[][];
}

export function mapFromJson(mapJson: MapJson): Map {
	const map = {
		bridges: mapJson.bridges,
		coasts: mapJson.coasts,
		districts: [] as District[],
		ridges: mapJson.ridges,
		river: mapJson.river,
		sprawl: mapJson.sprawl,
		subRiver: mapJson.subRiver,
	};
	map.districts = mapJson
		.districts
		.map((d) => District.fromJson(d));
	for (const district of map.districts) {
		district.linkSites(map.districts);
	}
	return map;
}

export default Map;
