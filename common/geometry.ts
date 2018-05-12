export type Point = [number, number];
export type Polygon = Point[];
export type Edge = [Point, Point];

export function clonePoint(p: Point): Point {
	return [p[0], p[1]];
}

export function cloneEdge(e: Edge): Edge {
	return [clonePoint(e[0]), clonePoint(e[1])];
}

export function clonePolygon(p: Polygon): Polygon {
	return p.map<Point>((point) => clonePoint(point));
}

export function getBBoxCenter(polygon: Polygon): Point {
	const xValues = polygon.map((point) => point[0]);
	const yValues = polygon.map((point) => point[1]);
	const xMin = Math.min(...xValues);
	const xMax = Math.max(...xValues);
	const yMin = Math.min(...yValues);
	const yMax = Math.max(...yValues);
	return [
		(xMin + xMax) / 2,
		(yMin + yMax) / 2,
	];
}

/**
 * Finds a rectangle that fits within the given convex polygon
 *
 * For each edge of the polygon, it creates several rectangles with at least one side along that edge
 * Returns the largest of these rectangles
 *
 * @param {Polygon} polygon A convex polygon
 * @return {Polygon} largest rectangle found
 */
export function findRectInPolygon(polygon: Polygon): Polygon {
	let largestRect: Polygon = null;
	let largestRectArea = 0;

	const edges = getPolygonEdges(polygon);
	for (const edge of edges) {
		const slope = calcPerpendicularSlope(edge);

		let points = getEvenlyDistributedPoints(edge, 10);
		let intersections = points.map<Point>((p) => {
			const testEdge: Edge = [p, [p[0] + 1, p[1] + slope]];
			for (const otherEdge of edges.filter((e) => e !== edge)) {
				const intersection = calcLineIntersection(otherEdge, testEdge);
				if (intersection && isIntersectionInEdge(intersection, otherEdge)) {
					return intersection;
				}
			}
			return null;
		});

		// filter down to points that successfully produces intersections
		points = points.filter((p, i) => intersections[i]);
		intersections = intersections.filter(Boolean);

		for (const point of points) {
			const index = points.indexOf(point);
			const intersection = intersections[index];
			const length = calcDistance(point, intersection);
			for (const otherPoint of points.filter((p) => p !== point)) {
				const otherIndex = points.indexOf(otherPoint);
				const otherIntersection = intersections[otherIndex];
				const otherLength = calcDistance(otherPoint, otherIntersection);
				const width = calcDistance(point, otherPoint);
				const minLength = Math.min(length, otherLength);
				const area = width * minLength;

				if (area > largestRectArea) {
					largestRectArea = area;
					const widthSlope = calcSlope([point, otherPoint]);
					const rect: Polygon = [
						point,
						otherPoint,
						otherLength === minLength ?
							otherIntersection :
							calcLineIntersection(
								[otherPoint, otherIntersection],
								[intersection, [intersection[0] + 1, intersection[1] + widthSlope]],
							),
						length === minLength ?
							intersection :
							calcLineIntersection(
								[point, intersection],
								[otherIntersection, [otherIntersection[0] + 1, otherIntersection[1] + widthSlope]],
							),
					];
					largestRect = rect;
				}
			}
		}
	}

	return largestRect;
}

export function getEvenlyDistributedPoints(edge: Edge, numPoints: number): Point[] {
	const points: Point[] = [];
	const dx = Math.abs(edge[0][0] - edge[1][0]);
	const dy = Math.abs(edge[0][1] - edge[1][1]);
	for (let i = 0; i < numPoints; i++) {
		const x = Math.min(edge[0][0], edge[1][0]) + dx * i / (numPoints - 1);
		points.push(getPointOnLine(edge, x));
	}
	return points;
}

export function getPointOnLine(edge: Edge, x: number): Point {
	return [
		x,
		calcSlope(edge) * (x - edge[0][0]) + edge[0][1],
	];
}

export function createCross(rect: Polygon): Polygon {
	rect = clonePolygon(rect);

	// make sure the first edge is a short edge
	if (calcDistance(rect[0], rect[1]) > calcDistance(rect[1], rect[2])) {
		rect.unshift(rect.pop());
	}

	const shortDistance = calcDistance(rect[0], rect[1]) / 3;
	const longDistance = calcDistance(rect[1], rect[2]) - shortDistance * 2;
	const shortTheta = Math.atan(calcSlope([rect[0], rect[1]]));
	const longTheta = Math.atan(calcSlope([rect[1], rect[2]]));

	const shortTestPoint: Point = [rect[0][0] + Math.cos(shortTheta), rect[0][1] + Math.sin(shortTheta)];
	const shortThetaMultiplier = calcDistance(shortTestPoint, rect[1]) > calcDistance(rect[0], rect[1]) ? -1 : 1;
	const longTestPoint: Point = [rect[0][0] + Math.cos(longTheta), rect[0][1] + Math.sin(longTheta)];
	const longThetaMultiplier = calcDistance(longTestPoint, rect[3]) > calcDistance(rect[0], rect[3]) ? -1 : 1;

	const cross: Polygon = [];

	cross.push([
		rect[0][0] + Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		rect[0][1] + Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	]);
	cross.push([
		cross[0][0] + Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		cross[0][1] + Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	]);
	cross.push([
		cross[1][0] + Math.cos(longTheta) * shortDistance * longThetaMultiplier,
		cross[1][1] + Math.sin(longTheta) * shortDistance * longThetaMultiplier,
	]);
	cross.push([
		cross[2][0] + Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		cross[2][1] + Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	]);
	cross.push([
		cross[3][0] + Math.cos(longTheta) * shortDistance * longThetaMultiplier,
		cross[3][1] + Math.sin(longTheta) * shortDistance * longThetaMultiplier,
	]);
	cross.push([
		cross[4][0] - Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		cross[4][1] - Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	]);
	cross.push([
		cross[5][0] + Math.cos(longTheta) * longDistance * longThetaMultiplier,
		cross[5][1] + Math.sin(longTheta) * longDistance * longThetaMultiplier,
	]);
	cross.push([
		cross[6][0] - Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		cross[6][1] - Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	]);
	cross.push([
		cross[7][0] - Math.cos(longTheta) * longDistance * longThetaMultiplier,
		cross[7][1] - Math.sin(longTheta) * longDistance * longThetaMultiplier,
	]);
	cross.push([
		cross[8][0] - Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		cross[8][1] - Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	]);
	cross.push([
		cross[9][0] - Math.cos(longTheta) * shortDistance * longThetaMultiplier,
		cross[9][1] - Math.sin(longTheta) * shortDistance * longThetaMultiplier,
	]);
	cross.push([
		cross[10][0] + Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		cross[10][1] + Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	]);

	return cross;
}

export function rotatePoint(point: Point, origin: Point, theta: number): Point {
	return [
		Math.cos(theta) * (point[0] - origin[0]) - Math.sin(theta) * (point[1] - origin[1]) + origin[0],
		Math.sin(theta) * (point[0] - origin[0]) + Math.cos(theta) * (point[1] - origin[1]) + origin[1],
	];
}

export function getRandomPointOnEdge(edge: Edge, rng: any): Point {
	const n: number = rng.random();
	const dx = edge[0][0] - edge[1][0];
	const dy = edge[0][1] - edge[1][1];
	return [edge[0][0] - n * dx, edge[0][1] - n * dy];
}

export function createRectFromEdge(edge: Edge, width: number, towards: Point): Polygon {
	const slope = calcPerpendicularSlope(edge);
	const theta = Math.atan(slope);
	const dx = Math.cos(theta) * width;
	const dy = Math.sin(theta) * width;
	const p3c1: Point = [edge[1][0] + dx, edge[1][1] + dy];
	const p3c2: Point = [edge[1][0] - dx, edge[1][1] - dy];
	const p4c1: Point = [edge[0][0] + dx, edge[0][1] + dy];
	const p4c2: Point = [edge[0][0] - dx, edge[0][1] - dy];
	const c1 = calcEuclideanDistance(p3c1, towards) < calcEuclideanDistance(p3c2, towards);
	const p3: Point = c1 ? p3c1 : p3c2;
	const p4: Point = c1 ? p4c1 : p4c2;
	const rect = [[...edge[0]] as Point, [...edge[1]] as Point, p3, p4];
	return rect;
}

/**
 * adapted from SO post
 * https://stackoverflow.com/questions/13937782/calculating-the-point-of-intersection-of-two-lines#answer-38977789
 *
 * @param edge1
 * @param edge2
 */
export function calcLineIntersection(edge1: Edge, edge2: Edge): Point {
	const x1 = edge1[0][0];
	const y1 = edge1[0][1];
	const x2 = edge1[1][0];
	const y2 = edge1[1][1];
	const x3 = edge2[0][0];
	const y3 = edge2[0][1];
	const x4 = edge2[1][0];
	const y4 = edge2[1][1];

	let ua = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
	let ub = ua;
	const denom = ua;
	if (denom === 0) {
		return null;
	}
	ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
	ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
	return [
		x1 + ua * (x2 - x1),
		y1 + ua * (y2 - y1),
	];
}

export function isIntersectionInEdge(intersection: Point, edge: Edge): boolean {
	if (!intersection) {
		return false;
	}

	return (
		(
			intersection[0] <= Math.max(edge[0][0], edge[1][0]) &&
			intersection[0] >= Math.min(edge[0][0], edge[1][0])
		) ||
		(
			Math.abs(intersection[0] - edge[0][0]) < 0.001 ||
			Math.abs(intersection[0] - edge[1][0]) < 0.001
		)
	);
}

export function getPolygonEdges(polygon: Polygon): Edge[] {
	const mapFunc = (point: Point, index: number) => {
		return [point, polygon[(index + 1) % polygon.length]] as Edge;
	};
	return polygon.map(mapFunc);
}

export function doesLineIntersectPolygon(testEdge: Edge, polygon: Polygon): boolean {
	const edges: Edge[] = getPolygonEdges(polygon);
	for (const edge of edges) {
		const intersection = calcLineIntersection(edge, testEdge);
		if (intersection && isIntersectionInEdge(intersection, edge)) {
			return true;
		}
	}
	return false;
}

export function doesSegmentIntersectPolygon(segment: Edge, polygon: Polygon): Point | null {
	const edges = getPolygonEdges(polygon);
	for (const edge of edges) {
		const intersection = calcLineIntersection(edge, segment);
		if (intersection &&
				isIntersectionInEdge(intersection, edge) &&
				isIntersectionInEdge(intersection, segment)) {
			return intersection;
		}
	}
	return null;
}

export interface InsetResult {
	spliced: number[];
	negative: Polygon;
	newEdge: Edge;
}
export function insetPolygonEdge(polygon: Polygon, startPoint: Point, inset: number) {
	startPoint = polygon.find((p) => p[0] === startPoint[0] && p[1] === startPoint[1]);
	if (!startPoint) {
		console.warn('Inset failed, could not find startPoint in polygon');
		return;
	}

	const result: InsetResult = {
		negative: [],
		newEdge: [[0, 0], [0, 0]],
		spliced: [],
	};

	const previousPoint = polygon[(polygon.indexOf(startPoint) - 1 + polygon.length) % polygon.length];
	const nextPoint = polygon[(polygon.indexOf(startPoint) + 1) % polygon.length];
	const nextNextPoint = polygon[(polygon.indexOf(startPoint) + 2) % polygon.length];
	result.negative.push([...startPoint] as Point, [...nextPoint] as Point);

	const edges = polygon.map((p, i) => [p, polygon[(i + 1) % polygon.length]]);
	const edge = edges[polygon.indexOf(startPoint)];

	const slope = (
		(edge[0][1] - edge[1][1]) /
		(edge[0][0] - edge[1][0])
	);
	const perpendicularSlope = -1 / slope;
	const angle = Math.atan(perpendicularSlope);
	const dx = inset * Math.cos(angle);
	const dy = inset * Math.sin(angle);

	let testEdge: Edge = [
		[
			edge[0][0] + dx,
			edge[0][1] + dy,
		],
		[
			edge[1][0] + dx,
			edge[1][1] + dy,
		],
	];
	if (!doesLineIntersectPolygon(testEdge, polygon)) {
		testEdge = [
			[
				edge[0][0] - dx,
				edge[0][1] - dy,
			],
			[
				edge[1][0] - dx,
				edge[1][1] - dy,
			],
		];
	}
	if (!doesLineIntersectPolygon(testEdge, polygon)) {
		console.warn('Inset failed, neither test edge intersected polygon');
		return;
	}

	let currentEdge;

	currentEdge = edges[(polygon.indexOf(startPoint) + 1) % polygon.length];
	while (true) {
		if (edges.length < 3) {
			console.warn('Inset failed, spliced too many edges search for next intersection');
			return null;
		}
		if (currentEdge === edge) {
			console.warn('Inset failed, ested all edges without success');
			return null;
		}
		const intersection = calcLineIntersection(testEdge, currentEdge);
		const intersected = intersection && isIntersectionInEdge(intersection, currentEdge);
		const nextEdge = edges[(edges.indexOf(currentEdge) + 1) % edges.length];
		if (intersected) {
			currentEdge[0] = intersection;
			edge[1] = intersection;
			result.negative.push([...intersection] as Point);
			result.newEdge[0] = [...intersection] as Point;
			break;
		} else {
			result.negative.push([...currentEdge[0]] as Point);
			result.spliced.push(edges.indexOf(currentEdge));
			edges.splice(edges.indexOf(currentEdge), 1);
		}
		currentEdge = nextEdge;
	}

	currentEdge = edges[(edges.indexOf(edge) + edges.length - 1) % edges.length];
	while (true) {
		if (edges.length < 3) {
			console.warn('Inset failed, spliced too many edges search for previous intersection');
			return;
		}
		if (currentEdge === edge) {
			console.warn('Inset failed, tested all edges without success');
			return;
		}
		const intersection = calcLineIntersection(testEdge, currentEdge);
		const intersected = intersection && isIntersectionInEdge(intersection, currentEdge);
		const nextEdgeIndex = (edges.indexOf(currentEdge) + edges.length - 1) % edges.length;
		const nextEdge = edges[nextEdgeIndex];
		if (intersected) {
			currentEdge[1] = intersection;
			edge[0] = intersection;
			result.negative.unshift([...intersection] as Point);
			result.newEdge[1] = [...intersection] as Point;
			break;
		} else {
			result.negative.unshift([...currentEdge[0]] as Point);
			result.spliced.push(edges.indexOf(currentEdge));
			edges.splice(edges.indexOf(currentEdge), 1);
		}
		currentEdge = nextEdge;
	}

	polygon.length = edges.length;
	for (let i = 0; i < edges.length; i++) {
		polygon[i] = edges[i][0];
	}

	return result;
}

export function slicePolygon(polygon: Polygon, testEdge: Edge, inset: number = 0): [Polygon, Polygon] | null {
	const edges = getPolygonEdges(polygon);
	const split = false;
	const intersectionResults = edges.map((edge) => {
		const intersection = calcLineIntersection(edge, testEdge); // tslint:disable-line:no-shadowed-variable
		return intersection && isIntersectionInEdge(intersection, edge) && {edge, intersection};
	}).filter(Boolean);
	if (intersectionResults.length !== 2) {
		console.warn('split failed, line did not intersect 2 edges');
		return null;
	}

	// set to old variable names, TODO cleanup and rename
	const longest = intersectionResults[0].edge;
	const splitPoint = intersectionResults[0].intersection;
	const intersected = intersectionResults[1].edge;
	const intersection = intersectionResults[1].intersection;

	const newEdge = [
		splitPoint,
		intersection,
	];

	let newPolygon1: any = [];
	newPolygon1.push([intersected[0], intersection]);
	newPolygon1.push([intersection, splitPoint]);
	newPolygon1.push([splitPoint, longest[0]]);
	let current = edges[(edges.indexOf(longest) + 1) % edges.length];
	while (current !== intersected) {
		newPolygon1.push(current);
		current = edges[(edges.indexOf(current) + 1) % edges.length];
	}

	let newPolygon2: any = [];
	newPolygon2.push([longest[0], splitPoint]);
	newPolygon2.push([splitPoint, intersection]);
	newPolygon2.push([intersection, intersected[1]]);
	current = edges[(edges.indexOf(intersected) + 1) % edges.length];
	while (current !== longest) {
		newPolygon2.push(current);
		current = edges[(edges.indexOf(current) + 1) % edges.length];
	}

	newPolygon1 = newPolygon1.map((edge) => edge[0]);
	newPolygon1.cssClass = 'building';
	newPolygon2 = newPolygon2.map((edge) => edge[0]);
	newPolygon2.cssClass = 'building';
	insetPolygonEdge(newPolygon1, intersection, inset / 2);
	insetPolygonEdge(newPolygon2, splitPoint, inset / 2);
	return [newPolygon1, newPolygon2];
}

export function calcCloserPoint(origin: Point, target: Point, distance): Point {
	const dx = origin[0] - target[0];
	const dy = origin[1] - target[1];
	const slope = dy / dx;
	const length = calcEuclideanDistance(origin, target);
	const theta = Math.atan(slope);
	const dxMove = Math.abs(Math.cos(theta) * distance);
	const dyMove = Math.abs(Math.sin(theta) * distance);

	const newX = dx > 0 ? origin[0] - dxMove : origin[0] + dxMove;
	const newY = dy > 0 ? origin[1] - dyMove : origin[1] + dyMove;

	return [newX, newY];
}

export function clipCorner(polygon: Polygon, pointOrIndex: Point | number, clip: number): void {
	let index: number;
	let point: Point;
	if (typeof pointOrIndex === 'number') {
		index = pointOrIndex;
		point = polygon[index];
	} else {
		point = pointOrIndex;
		index = polygon.findIndex((p) => arePointsEquivalent(p, point));
	}

	const previousPoint = polygon[(polygon.length + index - 1) % polygon.length];
	const nextPoint = polygon[(index + 1) % polygon.length];
	polygon.splice(index, 1,
		calcCloserPoint(point, previousPoint, clip),
		calcCloserPoint(point, nextPoint, clip));
}

export function clipCorners(polygon: Polygon, clip: number): void {
	const edges = getPolygonEdges(polygon);
	for (const edge of edges) {
		edge[0] = [...edge[0]] as Point;
		edge[1] = [...edge[1]] as Point;
	}
	for (const edge of edges) {
		const dx = edge[0][0] - edge[1][0];
		const dy = edge[0][1] - edge[1][1];
		const slope = dy / dx;
		const length = Math.pow(Math.pow(dx, 2) + Math.pow(dy, 2), 0.5);
		const theta = Math.atan(slope);
		if (length > clip * 2) {
			const dxClip = Math.abs(Math.cos(theta) * clip);
			const dyClip = Math.abs(Math.sin(theta) * clip);
			if (dx > 0) {
				edge[0][0] -= dxClip;
				edge[1][0] += dxClip;
			} else {
				edge[0][0] += dxClip;
				edge[1][0] -= dxClip;
			}
			if (dy > 0) {
				edge[0][1] -= dyClip;
				edge[1][1] += dyClip;
			} else {
				edge[0][1] += dyClip;
				edge[1][1] -= dyClip;
			}
		} else  {
			const midPoint: Point = [
				(edge[0][0] + edge[1][0]) / 2,
				(edge[0][1] + edge[1][1]) / 2,
			];
			edge[0] = midPoint;
			edge[1] = midPoint;
		}
	}
	polygon.length = 0;
	for (const edge of edges) {
		if (edge[0] === edge[1]) {
			polygon.push(edge[0]);
		} else {
			polygon.push(...edge);
		}
	}
}

export function arePointsEquivalent(p1: Point, p2: Point) {
	return p1[0] === p2[0] && p1[1] === p2[1];
}

export function areEdgesEquivalent(e1: Edge, e2: Edge) {
	return (
		(arePointsEquivalent(e1[0], e2[0]) && arePointsEquivalent(e1[1], e2[1])) ||
		(arePointsEquivalent(e1[0], e2[1]) && arePointsEquivalent(e1[1], e2[0]))
	);
}

export function findCommonEdge(p1: Polygon, p2: Polygon): Edge | null {
	const p1Edges = getPolygonEdges(p1);
	const p2Edges = getPolygonEdges(p2);

	for (const edge1 of p1Edges) {
		for (const edge2 of p2Edges) {
			if (areEdgesEquivalent(edge1, edge2)) {
				return edge1;
			}
		}
	}

	return null;
}

export function calcMidPoint(edge: Edge): Point {
	return [
		(edge[0][0] + edge[1][0]) / 2,
		(edge[0][1] + edge[1][1]) / 2,
	];
}

export function calcSlope(edge: Edge): number {
	return (edge[0][1] - edge[1][1]) / (edge[0][0] - edge[1][0]);
}

export function calcPerpendicularSlope(edgeOrSlope: Edge | number): number {
	let slope: number;
	if (Array.isArray(edgeOrSlope)) {
		slope = calcSlope(edgeOrSlope);
	} else {
		slope = edgeOrSlope as number;
	}
	return -1 / slope;
}

export function calcEuclideanDistance(p1: Point, p2: Point) {
	return ((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2) ** 0.5;
}

export const calcDistance = calcEuclideanDistance;

export function getPointClosestTo(points: Point[], target: Point): Point {
	const copy = [...points];
	copy.sort((p1, p2) => calcEuclideanDistance(p1, target) - calcEuclideanDistance(p2, target));
	return copy[0];
}

export function shatterPolygon(polygon: Polygon, point: Point): Polygon[] {
	const edges = getPolygonEdges(polygon);
	return edges.map((edge) => edge.concat([point]));
}

export function joinEdges(edges: Edge[]): Point[][] {
	const results: Point[][] = [];
	for (const edge of edges) {
		let joinedToEnd = null;
		let joinedToFront = null;
		for (const points of results) {
			if (arePointsEquivalent(edge[0], points[0])) {
				points.unshift([...edge[1]] as Point);
				joinedToFront = points;
				break;
			}
			if (arePointsEquivalent(edge[1], points[0])) {
				points.unshift([...edge[0]] as Point);
				joinedToFront = points;
				break;
			}
			if (arePointsEquivalent(edge[0], points[points.length - 1])) {
				points.push([...edge[1]] as Point);
				joinedToEnd = points;
				break;
			}
			if (arePointsEquivalent(edge[1], points[points.length - 1])) {
				points.push([...edge[0]] as Point);
				joinedToEnd = points;
				break;
			}
		}
		if (joinedToEnd) {
			const newPoint = joinedToEnd[joinedToEnd.length - 1];
			for (const points of results.filter((result) => result !== joinedToEnd)) {
				if (arePointsEquivalent(newPoint, points[0])) {
					results.splice(results.indexOf(points), 1);
					results.splice(results.indexOf(joinedToEnd), 1);
					results.push(joinedToEnd.concat(points));
					break;
				}
				if (arePointsEquivalent(newPoint, points[points.length - 1])) {
					results.splice(results.indexOf(points), 1);
					results.splice(results.indexOf(joinedToEnd), 1);
					results.push(joinedToEnd.concat(points.reverse()));
					break;
				}
			}
		} else if (joinedToFront) {
			const newPoint = joinedToFront[0];
			for (const points of results.filter((result) => result !== joinedToFront)) {
				if (arePointsEquivalent(newPoint, points[0])) {
					results.splice(results.indexOf(points), 1);
					results.splice(results.indexOf(joinedToFront), 1);
					results.push(joinedToFront.reverse().concat(points));
					break;
				}
				if (arePointsEquivalent(newPoint, points[points.length - 1])) {
					results.splice(results.indexOf(points), 1);
					results.splice(results.indexOf(joinedToFront), 1);
					results.push(points.concat(joinedToFront));
					break;
				}
			}
		} else {
			results.push([...edge]);
		}
	}

	return  results;
}
