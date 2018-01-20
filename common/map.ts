import { Point, Polygon, Edge } from './geometry';
import { District, DistrictJson } from './district';

export interface Map {
  coasts: Point[][],
  districts: District[],
  subRiver: {
    path: Point[],
    width: number
  },
  river: {
    path: Point[],
    width: number
  },
  bridges: Edge[],
  sprawl: Polygon[]
}

export interface MapJson {
  coasts: Point[][],
  districts: DistrictJson[],
  subRiver: {
    path: Point[],
    width: number
  },
  river: {
    path: Point[],
    width: number
  },
  bridges: Edge[],
  sprawl: Polygon[]
}

export default Map;