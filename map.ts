import { Point, Polygon, Edge } from './geometry';
import District from './district';

interface Map {
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

export default Map;