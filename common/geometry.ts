import * as lineIntersect from 'line-intersect';

export interface Point {
	x: number;
	y: number;
}
export interface Polygon {
	points: Point[];
}
export interface Edge {
	p1: Point;
	p2: Point;
}

export function clonePoint(p: Point): Point {
	return {
		x: p.x,
		y: p.y,
	};
}

export function cloneEdge(e: Edge): Edge {
	return {
		p1: clonePoint(e.p1),
		p2: clonePoint(e.p2),
	};
}

export function clonePolygon(p: Polygon): Polygon {
	return { points: p.points.map((point) => clonePoint(point)) };
}

export function getBBoxCenter(polygon: Polygon): Point {
	const xValues = polygon.points.map((point) => point.x);
	const yValues = polygon.points.map((point) => point.y);
	const xMin = Math.min(...xValues);
	const xMax = Math.max(...xValues);
	const yMin = Math.min(...yValues);
	const yMax = Math.max(...yValues);
	return {
		x: (xMin + xMax) / 2,
		y: (yMin + yMax) / 2,
	};
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
			const testEdge: Edge = {
				p1: p,
				p2: {
					x: p.x + 1,
					y: p.y + slope,
				},
			};
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
					const widthSlope = calcSlope({ p1: point, p2: otherPoint});
					const rect: Polygon = { points: [
						point,
						otherPoint,
						otherLength === minLength ?
							otherIntersection :
							calcLineIntersection(
								{ p1: otherPoint, p2: otherIntersection },
								{ p1: intersection, p2: {x: intersection.x + 1, y: intersection.y + widthSlope } },
							),
						length === minLength ?
							intersection :
							calcLineIntersection(
								{ p1: point, p2: intersection },
								{ p1: otherIntersection, p2: { x: otherIntersection.x + 1, y: otherIntersection.y + widthSlope } },
							),
					]};
					largestRect = rect;
				}
			}
		}
	}

	return largestRect;
}

export function getEvenlyDistributedPoints(edge: Edge, numPoints: number): Point[] {
	const points: Point[] = [];
	const dx = Math.abs(edge.p1.x - edge.p2.x);
	const dy = Math.abs(edge.p1.y - edge.p2.y);
	for (let i = 0; i < numPoints; i++) {
		const x = Math.min(edge.p1.x, edge.p2.x) + dx * i / (numPoints - 1);
		points.push(getPointOnLine(edge, x));
	}
	return points;
}

export function getPointOnLine(edge: Edge, x: number): Point {
	return {
		x,
		y: calcSlope(edge) * (x - edge.p1.x) + edge.p1.y,
	};
}

export function createCross(rect: Polygon): Polygon {
	rect = clonePolygon(rect);

	// make sure the first edge is a short edge
	if (calcDistance(rect.points[0], rect.points[1]) > calcDistance(rect.points[1], rect.points[2])) {
		rect.points.unshift(rect.points.pop());
	}

	const shortDistance = calcDistance(rect.points[0], rect.points[1]) / 3;
	const longDistance = calcDistance(rect.points[1], rect.points[2]) - shortDistance * 2;
	const shortTheta = Math.atan(calcSlope({ p1: rect.points[0], p2: rect.points[1] }));
	const longTheta = Math.atan(calcSlope({ p1: rect.points[1], p2: rect.points[2]}));

	const shortTestPoint: Point = {
		x: rect.points[0].x + Math.cos(shortTheta),
		y: rect.points[0].y + Math.sin(shortTheta),
	};
	const shortThetaMultiplier = calcDistance(
		shortTestPoint,
		rect.points[1],
	) > calcDistance(
		rect.points[0],
		rect.points[1],
	) ? -1 : 1;

	const longTestPoint: Point = {
		x: rect.points[0].x + Math.cos(longTheta),
		y: rect.points[0].y + Math.sin(longTheta),
	};
	const longThetaMultiplier = calcDistance(
		longTestPoint,
		rect.points[3],
	) > calcDistance(
		rect.points[0],
		rect.points[3],
	) ? -1 : 1;

	const points: Point[] = [];

	points.push({
		x: rect.points[0].x + Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		y: rect.points[0].y + Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	});
	points.push({
		x: points[0].x + Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		y: points[0].y + Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	});
	points.push({
		x: points[1].x + Math.cos(longTheta) * shortDistance * longThetaMultiplier,
		y: points[1].y + Math.sin(longTheta) * shortDistance * longThetaMultiplier,
	});
	points.push({
		x: points[2].x + Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		y: points[2].y + Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	});
	points.push({
		x: points[3].x + Math.cos(longTheta) * shortDistance * longThetaMultiplier,
		y: points[3].y + Math.sin(longTheta) * shortDistance * longThetaMultiplier,
	});
	points.push({
		x: points[4].x - Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		y: points[4].y - Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	});
	points.push({
		x: points[5].x + Math.cos(longTheta) * longDistance * longThetaMultiplier,
		y: points[5].y + Math.sin(longTheta) * longDistance * longThetaMultiplier,
	});
	points.push({
		x: points[6].x - Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		y: points[6].y - Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	});
	points.push({
		x: points[7].x - Math.cos(longTheta) * longDistance * longThetaMultiplier,
		y: points[7].y - Math.sin(longTheta) * longDistance * longThetaMultiplier,
	});
	points.push({
		x: points[8].x - Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		y: points[8].y - Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	});
	points.push({
		x: points[9].x - Math.cos(longTheta) * shortDistance * longThetaMultiplier,
		y: points[9].y - Math.sin(longTheta) * shortDistance * longThetaMultiplier,
	});
	points.push({
		x: points[10].x + Math.cos(shortTheta) * shortDistance * shortThetaMultiplier,
		y: points[10].y + Math.sin(shortTheta) * shortDistance * shortThetaMultiplier,
	});

	return { points };
}

export function rotatePoint(point: Point, origin: Point, theta: number): Point {
	return {
		x: Math.cos(theta) * (point.x - origin.x) - Math.sin(theta) * (point.y - origin.y) + origin.x,
		y: Math.sin(theta) * (point.x - origin.x) + Math.cos(theta) * (point.y - origin.y) + origin.x,
	};
}

export function getRandomPointOnEdge(edge: Edge, rng: any): Point {
	const n: number = rng();
	const dx = edge.p1.x - edge.p2.x;
	const dy = edge.p1.y - edge.p2.y;
	return {
		x: edge.p1.x - n * dx,
		y: edge.p1.y - n * dy,
	};
}

export function createRectFromEdge(edge: Edge, width: number, towards: Point): Polygon {
	const slope = calcPerpendicularSlope(edge);
	const theta = Math.atan(slope);
	const dx = Math.cos(theta) * width;
	const dy = Math.sin(theta) * width;
	const p3c1: Point = { x: edge.p2.x + dx, y: edge.p2.y + dy };
	const p3c2: Point = { x: edge.p2.x - dx, y: edge.p2.y - dy };
	const p4c1: Point = { x: edge.p1.x + dx, y: edge.p1.y + dy };
	const p4c2: Point = { x: edge.p1.x - dx, y: edge.p1.y - dy };
	const c1 = calcEuclideanDistance(p3c1, towards) < calcEuclideanDistance(p3c2, towards);
	const p1 = clonePoint(edge.p1);
	const p2 = clonePoint(edge.p2);
	const p3: Point = c1 ? p3c1 : p3c2;
	const p4: Point = c1 ? p4c1 : p4c2;
	const points: Point[] = [ p1, p2, p3, p4 ];
	return { points };
}

/**
 * adapted from SO post
 * https://stackoverflow.com/questions/13937782/calculating-the-point-of-intersection-of-two-lines#answer-38977789
 *
 * @param edge1
 * @param edge2
 */
export function calcLineIntersection(edge1: Edge, edge2: Edge): Point {
	const TRILLION = 1000000000000;

	edge1 = cloneEdge(edge1);
	const slope1 = calcSlope(edge1);
	if (!isFinite(slope1)) {
		edge1.p1.y = TRILLION;
		edge1.p2.y = -TRILLION;
	} else {
		edge1.p1.x += TRILLION;
		edge1.p1.y += slope1 * TRILLION;
		edge1.p2.x -= TRILLION;
		edge1.p2.y -= slope1 * TRILLION;
	}

	edge2 = cloneEdge(edge2);
	const slope2 = calcSlope(edge2);
	if (!isFinite(slope2)) {
		edge2.p1.y = TRILLION;
		edge2.p2.y = -TRILLION;
	} else {
		edge2.p1.x += TRILLION;
		edge2.p1.y += slope2 * TRILLION;
		edge2.p2.x -= TRILLION;
		edge2.p2.y -= slope2 * TRILLION;
	}

	const result: { type: string, point: Point } = lineIntersect.checkIntersection(
		edge1.p1.x,
		edge1.p1.y,
		edge1.p2.x,
		edge1.p2.y,
		edge2.p1.x,
		edge2.p1.y,
		edge2.p2.x,
		edge2.p2.y,
	);
	if (result.type !== 'intersecting') {
		return null;
	} else {
		return result.point;
	}
}

export function isIntersectionInEdge(intersection: Point, edge: Edge): boolean {
	if (!intersection) {
		return false;
	}

	const xMin = Math.min(edge.p1.x, edge.p2.x) - 0.001;
	const xMax = Math.max(edge.p1.x, edge.p2.x) + 0.001;

	return intersection.x > xMin && intersection.x < xMax;
}

export function getPolygonEdges(polygon: Polygon): Edge[] {
	const mapFunc = (point: Point, index: number) => {
		return {
			p1: point,
			p2: polygon.points[(index + 1) % polygon.points.length],
		};
	};
	return polygon.points.map<Edge>(mapFunc);
}

export function doesLineIntersectPolygon(testEdge: Edge, polygon: Polygon): boolean {
	return getPolygonEdges(polygon).some((e) => {
		const intersection = calcLineIntersection(testEdge, e);
		return intersection && isIntersectionInEdge(intersection, e);
	});
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
	startPoint = polygon.points.find((p) => arePointsEquivalent(p, startPoint));
	if (!startPoint) {
		// console.warn('Inset failed, could not find startPoint in polygon');
		return;
	}

	const result: InsetResult = {
		negative: { points: [] },
		newEdge: { p1: { x: 0, y: 0 }, p2: {x: 0, y: 0} },
		spliced: [],
	};

	const startPointIndex = polygon.points.indexOf(startPoint);
	const previousPointIndex = (startPointIndex - 1 + polygon.points.length) % polygon.points.length;
	const nextPointIndex = (startPointIndex + 1) % polygon.points.length;
	const nextNextPointIndex = (startPointIndex + 2) % polygon.points.length;
	const previousPoint = polygon.points[previousPointIndex];
	const nextPoint = polygon.points[nextPointIndex];
	const nextNextPoint = polygon.points[nextNextPointIndex];
	result.negative.points.push(
		clonePoint(startPoint),
		clonePoint(nextPoint),
	);

	const edges: Edge[] = polygon.points.map((p, i) => {
		return { p1: p, p2: polygon.points[(i + 1) % polygon.points.length] };
	});
	const edge = edges[polygon.points.indexOf(startPoint)];

	const perpendicularSlope = calcPerpendicularSlope(edge);
	const angle = Math.atan(perpendicularSlope);
	const dx = inset * Math.cos(angle);
	const dy = inset * Math.sin(angle);

	let testEdge: Edge = {
		p1: {
			x: edge.p1.x + dx,
			y: edge.p1.y + dy,
		},
		p2: {
			x: edge.p2.x + dx,
			y: edge.p2.y + dy,
		},
	};
	if (!doesLineIntersectPolygon(testEdge, polygon)) {
		testEdge = {
			p1: {
				x: edge.p1.x - dx,
				y: edge.p1.y - dy,
			},
			p2: {
				x: edge.p2.x - dx,
				y: edge.p2.y - dy,
			},
		};
	}
	if (!doesLineIntersectPolygon(testEdge, polygon)) {
		// console.warn('Inset failed, neither test edge intersected polygon');
		return;
	}

	let currentEdge: Edge;

	currentEdge = edges[(polygon.points.indexOf(startPoint) + 1) % polygon.points.length];
	while (true) {
		if (edges.length < 3) {
			// console.warn('Inset failed, spliced too many edges search for next intersection');
			return null;
		}
		if (currentEdge === edge) {
			// console.warn('Inset failed, ested all edges without success');
			return null;
		}
		const intersection = calcLineIntersection(testEdge, currentEdge);
		const intersected = intersection && isIntersectionInEdge(intersection, currentEdge);
		const nextEdge = edges[(edges.indexOf(currentEdge) + 1) % edges.length];
		if (intersected) {
			currentEdge.p1 = intersection;
			edge.p2 = intersection;
			result.negative.points.push(clonePoint(intersection));
			result.newEdge.p1 = clonePoint(intersection);
			break;
		} else {
			result.negative.points.push(clonePoint(currentEdge.p1));
			result.spliced.push(edges.indexOf(currentEdge));
			edges.splice(edges.indexOf(currentEdge), 1);
		}
		currentEdge = nextEdge;
	}

	currentEdge = edges[(edges.indexOf(edge) + edges.length - 1) % edges.length];
	while (true) {
		if (edges.length < 3) {
			// console.warn('Inset failed, spliced too many edges search for previous intersection');
			return;
		}
		if (currentEdge === edge) {
			// console.warn('Inset failed, tested all edges without success');
			return;
		}
		const intersection = calcLineIntersection(testEdge, currentEdge);
		const intersected = intersection && isIntersectionInEdge(intersection, currentEdge);
		const nextEdgeIndex = (edges.indexOf(currentEdge) + edges.length - 1) % edges.length;
		const nextEdge = edges[nextEdgeIndex];
		if (intersected) {
			currentEdge.p2 = intersection;
			edge.p1 = intersection;
			result.negative.points.unshift(clonePoint(intersection));
			result.newEdge.p2 = clonePoint(intersection);
			break;
		} else {
			result.negative.points.unshift(clonePoint(currentEdge.p1));
			result.spliced.push(edges.indexOf(currentEdge));
			edges.splice(edges.indexOf(currentEdge), 1);
		}
		currentEdge = nextEdge;
	}

	polygon.points.length = edges.length;
	for (let i = 0; i < edges.length; i++) {
		polygon.points[i] = edges[i].p1;
	}

	return result;
}

export function slicePolygon(polygon: Polygon, testEdge: Edge, inset: number = 0): [Polygon, Polygon] | null {
	const edges = getPolygonEdges(polygon);
	const split = false;
	const intersectionResults = edges.map((edge) => {
		const intersection = calcLineIntersection(edge, testEdge); // tslint:disable-line:no-shadowed-variable
		const inEdge = isIntersectionInEdge(intersection, edge);
		return intersection && isIntersectionInEdge(intersection, edge) && {edge, intersection};
	}).filter(Boolean);
	if (intersectionResults.length !== 2) {
		// console.warn('split failed, line did not intersect 2 edges');
		return null;
	}

	// set to old variable names, TODO cleanup and rename
	const longest = intersectionResults[0].edge;
	const splitPoint = intersectionResults[0].intersection;
	const intersected = intersectionResults[1].edge;
	const intersection = intersectionResults[1].intersection;

	const newEdge: Edge = {
		p1: splitPoint,
		p2: intersection,
	};

	const newPolygon1Edges: Edge[] = [];
	newPolygon1Edges.push({ p1: intersected.p1, p2: intersection });
	newPolygon1Edges.push({ p1: intersection, p2: splitPoint });
	newPolygon1Edges.push({ p1: splitPoint, p2: longest[0] });
	let current = edges[(edges.indexOf(longest) + 1) % edges.length];
	while (current !== intersected) {
		newPolygon1Edges.push(current);
		current = edges[(edges.indexOf(current) + 1) % edges.length];
	}

	const newPolygon2Edges: Edge[] = [];
	newPolygon2Edges.push({ p1: longest.p1, p2: splitPoint });
	newPolygon2Edges.push({ p1: splitPoint, p2: intersection });
	newPolygon2Edges.push({ p1: intersection, p2: intersected[1] });
	current = edges[(edges.indexOf(intersected) + 1) % edges.length];
	while (current !== longest) {
		newPolygon2Edges.push(current);
		current = edges[(edges.indexOf(current) + 1) % edges.length];
	}

	const newPolygon1: Polygon = { points: newPolygon1Edges.map((edge) => edge.p1) };
	const newPolygon2: Polygon = { points: newPolygon2Edges.map((edge) => edge.p1) };
	insetPolygonEdge(newPolygon1, intersection, inset / 2);
	insetPolygonEdge(newPolygon2, splitPoint, inset / 2);
	return [newPolygon1, newPolygon2];
}

export function calcCloserPoint(origin: Point, target: Point, distance): Point {
	const dx = origin.x - target.x;
	const dy = origin.y - target.y;
	const slope = dy / dx;
	const length = calcEuclideanDistance(origin, target);
	const theta = Math.atan(slope);
	const dxMove = Math.abs(Math.cos(theta) * distance);
	const dyMove = Math.abs(Math.sin(theta) * distance);

	const newX = dx > 0 ? origin.x - dxMove : origin.x + dxMove;
	const newY = dy > 0 ? origin.y - dyMove : origin.y + dyMove;

	return { x: newX, y: newY };
}

export function clipCorner(polygon: Polygon, pointOrIndex: Point | number, clip: number): void {
	let index: number;
	let point: Point;
	if (typeof pointOrIndex === 'number') {
		index = pointOrIndex;
		point = polygon.points[index];
	} else {
		point = pointOrIndex;
		index = polygon.points.findIndex((p) => arePointsEquivalent(p, point));
	}

	const previousPoint = polygon.points[(polygon.points.length + index - 1) % polygon.points.length];
	const nextPoint = polygon.points[(index + 1) % polygon.points.length];
	polygon.points.splice(index, 1,
		calcCloserPoint(point, previousPoint, clip),
		calcCloserPoint(point, nextPoint, clip));
}

export function clipCorners(polygon: Polygon, clip: number): void {
	const edges = getPolygonEdges(polygon).map(cloneEdge);

	for (const edge of edges) {
		const dx = edge.p1.x - edge.p2.x;
		const dy = edge.p1.y - edge.p2.y;
		const slope = dy / dx;
		const length = Math.pow(Math.pow(dx, 2) + Math.pow(dy, 2), 0.5);
		const theta = Math.atan(slope);
		if (length > clip * 2) {
			const dxClip = Math.abs(Math.cos(theta) * clip);
			const dyClip = Math.abs(Math.sin(theta) * clip);
			if (dx > 0) {
				edge.p1.x -= dxClip;
				edge.p2.x += dxClip;
			} else {
				edge.p1.x += dxClip;
				edge.p2.x -= dxClip;
			}
			if (dy > 0) {
				edge.p1.y -= dyClip;
				edge.p2.y += dyClip;
			} else {
				edge.p1.y += dyClip;
				edge.p2.y -= dyClip;
			}
		} else  {
			const midPoint: Point = calcMidPoint(edge);
			edge.p1 = midPoint;
			edge.p2 = midPoint;
		}
	}
	polygon.points.length = 0;
	for (const edge of edges) {
		if (edge.p1 === edge.p2) {
			polygon.points.push(edge.p1);
		} else {
			polygon.points.push(edge.p1, edge.p2);
		}
	}
}

export function arePointsEquivalent(p1: Point, p2: Point, precision: number = 0) {
	if (precision) {
		return (
			(Math.abs(p1.x - p2.x) < precision) &&
			(Math.abs(p1.y - p2.y) < precision)
		);
	} else {
		return p1.x === p2.x && p1.y === p2.y;
	}
}

export function areEdgesEquivalent(e1: Edge, e2: Edge, precision: number = 0) {
	return (
		(arePointsEquivalent(e1.p1, e2.p1, precision) && arePointsEquivalent(e1.p2, e2.p2, precision)) ||
		(arePointsEquivalent(e1.p1, e2.p2, precision) && arePointsEquivalent(e1.p2, e2.p1, precision))
	);
}

export function arePolygonsEquivalent(p1: Polygon, p2: Polygon, precision: number = 0) {
	if (p1.points.length !== p2.points.length) {
		return false;
	}

	const p2StartingIndex = p2.points.findIndex((p) => arePointsEquivalent(p, p1.points[0], precision));

	if (p2StartingIndex === -1) {
		return false;
	}

	for (let p1Index = 0; p1Index < p1.points.length; p1Index++) {
		const p2Index = (p2StartingIndex + p1Index) % p2.points.length;
		if (!arePointsEquivalent(p1.points[p1Index], p2.points[p2Index], precision)) {
			return false;
		}
	}

	return true;
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
	return {
		x: (edge.p1.x + edge.p2.x) / 2,
		y: (edge.p1.y + edge.p2.y) / 2,
	};
}

export function calcSlope(edge: Edge): number {
	return (edge.p1.y - edge.p2.y) / (edge.p1.x - edge.p2.x);
}

export function calcPerpendicularSlope(edgeOrSlope: Edge | number): number {
	let slope: number;
	if (typeof(edgeOrSlope) === 'number') {
		slope = edgeOrSlope as number;
	} else {
		slope = calcSlope(edgeOrSlope);
	}
	return -1 / slope;
}

export function calcEuclideanDistance(p1: Point, p2: Point) {
	return ((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2) ** 0.5;
}

export const calcDistance = calcEuclideanDistance;

export function getPointClosestTo(points: Point[], target: Point): Point {
	const copy = [...points];
	copy.sort((p1, p2) => calcEuclideanDistance(p1, target) - calcEuclideanDistance(p2, target));
	return copy[0];
}

export function shatterPolygon(polygon: Polygon, point: Point): Polygon[] {
	const edges = getPolygonEdges(polygon);
	return edges.map((edge) => {
		return { points: [edge.p1, edge.p2, point] };
	});
}

export function joinEdges(edges: Edge[]): Point[][] {
	const results: Point[][] = [];
	for (const edge of edges) {
		let joinedToEnd = null;
		let joinedToFront = null;
		for (const points of results) {
			if (arePointsEquivalent(edge.p1, points[0])) {
				points.unshift(clonePoint(edge.p2));
				joinedToFront = points;
				break;
			}
			if (arePointsEquivalent(edge.p2, points[0])) {
				points.unshift(clonePoint(edge.p1));
				joinedToFront = points;
				break;
			}
			if (arePointsEquivalent(edge.p1, points[points.length - 1])) {
				points.push(clonePoint(edge.p2));
				joinedToEnd = points;
				break;
			}
			if (arePointsEquivalent(edge.p2, points[points.length - 1])) {
				points.push(clonePoint(edge.p1));
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
			results.push([edge.p1, edge.p2]);
		}
	}

	return results;
}
