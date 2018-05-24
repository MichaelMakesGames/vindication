import { beforeEach, describe, it } from 'mocha';

import { expect } from 'chai';

import * as geometry from './geometry';

// tslint:disable:no-unused-expression

const PRECISION = 0.000001;

describe('calcLineIntersection', function() {
	it('should return null for parellel lines', function() {
		const edge1: geometry.Edge = {
			p1: { x: -1, y: 0 },
			p2: { x: 1, y: 0 },
		};
		const edge2: geometry.Edge = {
			p1: { x: -1, y: 1 },
			p2: { x: 1, y: 1 },
		};
		expect(geometry.calcLineIntersection(edge1, edge2)).to.be.null;

		const edge3: geometry.Edge = {
			p1: { x: 0, y: -1 },
			p2: { x: 0, y: 1 },
		};
		const edge4: geometry.Edge = {
			p1: { x: 1, y: -1 },
			p2: { x: 1, y: 1 },
		};
		expect(geometry.calcLineIntersection(edge3, edge4)).to.be.null;

		const edge5: geometry.Edge = {
			p1: { x: 0, y: 0 },
			p2: { x: 1, y: 1 },
		};
		const edge6: geometry.Edge = {
			p1: { x: 1, y: 0 },
			p2: { x: 2, y: 1 },
		};
		expect(geometry.calcLineIntersection(edge5, edge6)).to.be.null;
	});

	it('should return null if colinear', function() {
		const edge1: geometry.Edge = {
			p1: { x: 0, y: 0 },
			p2: { x: 1, y: 0 },
		};
		const edge2: geometry.Edge = {
			p1: { x: 1, y: 0 },
			p2: { x: 2, y: 0 },
		};
		expect(geometry.calcLineIntersection(edge1, edge2)).to.be.null;

		const edge3: geometry.Edge = {
			p1: { x: 0, y: 0 },
			p2: { x: 0, y: 1 },
		};
		const edge4: geometry.Edge = {
			p1: { x: 0, y: 1 },
			p2: { x: 0, y: 2 },
		};
		expect(geometry.calcLineIntersection(edge3, edge4)).to.be.null;

		const edge5: geometry.Edge = {
			p1: { x: 0, y: 0 },
			p2: { x: 1, y: 1 },
		};
		const edge6: geometry.Edge = {
			p1: { x: 1, y: 1 },
			p2: { x: 2, y: 2 },
		};
		expect(geometry.calcLineIntersection(edge5, edge6)).to.be.null;
	});

	it('should return the intersection point for intersecting lines', function() {
		const verticalEdge: geometry.Edge = {
			p1: { x: 0, y: -1 },
			p2: { x: 0, y: 1 },
		};
		const horizontalEdge: geometry.Edge = {
			p1: { x: -1, y: 0 },
			p2: { x: 1, y: 0 },
		};
		const upwardEdge: geometry.Edge = {
			p1: { x: -1, y: -1 },
			p2: { x: 1, y: 1 },
		};
		const downwardEdge: geometry.Edge = {
			p1: { x: -1, y: 1 },
			p2: { x: 1, y: -1 },
		};
		const expected: geometry.Point = { x: 0, y: 0 };

		expect(geometry.calcLineIntersection(verticalEdge, horizontalEdge)).to.deep.equal(expected);
		expect(geometry.calcLineIntersection(verticalEdge, upwardEdge)).to.deep.equal(expected);
		expect(geometry.calcLineIntersection(horizontalEdge, upwardEdge)).to.deep.equal(expected);
		expect(geometry.calcLineIntersection(upwardEdge, downwardEdge)).to.deep.equal(expected);
	});
});

describe('insetPolygonEdge', function() {
	let polygon: geometry.Polygon = null;

	describe('square ((-1, 1), (1, 1), (1, -1), (-1, -1)', function() {
		beforeEach(function() {
			polygon = { points: [
				{ x: -1, y: 1 },
				{ x: 1, y: 1 },
				{ x: 1, y: -1 },
				{ x: -1, y: -1 },
			]};
		});

		describe('inset edge ((-1, 1), (1, 1)) by 0.5', function() {
			let result = null;

			beforeEach(function() {
				result = geometry.insetPolygonEdge(polygon, { x: -1, y: 1 }, 0.5);
			});

			it('should modify polygon to ((-1, 0.5), (1, 0.5), (1, -1), (-1, 1)', function() {
				expect(geometry.arePolygonsEquivalent(polygon, { points: [
					{ x: -1, y: 0.5 },
					{ x: 1, y: 0.5},
					{ x: 1, y: -1 },
					{ x: -1, y: -1 },
				]})).to.be.true;
			});

			it('should return result with no spliced edges', function() {
				expect(result.spliced.length).to.equal(0);
			});

			it('should return result with newEdge ((-1, 0.5), (1, 0.5))', function() {
				const expected: geometry.Edge = {
					p1: { x: -1, y: 0.5 },
					p2: { x: 1, y: 0.5 },
				};
				expect(geometry.areEdgesEquivalent(result.newEdge, expected)).to.be.true;
			});

			it('should return result with negative ((-1, 0.5), (-1, 1), (1, 1), (1, 0.5))', function() {
				const expected: geometry.Polygon = { points: [
					{ x: -1, y: 0.5 },
					{ x: -1, y: 1 },
					{ x: 1, y: 1 },
					{ x: 1, y: 0.5 },
				]};
				expect(geometry.arePolygonsEquivalent(result.negative, expected)).to.be.true;
			});
		});

		describe('inset edge ((1, 1), (1, -1)) by 0.5', function() {
			let result = null;

			beforeEach(function() {
				result = geometry.insetPolygonEdge(polygon, { x: 1, y: 1 }, 0.5);
			});

			it('should modify polygon to ((-1, 1), (0.5, 1), (0.5, -1), (-1, -1)', function() {
				expect(geometry.arePolygonsEquivalent(polygon, { points: [
					{ x: -1, y: 1 },
					{ x: 0.5, y: 1 },
					{ x: 0.5, y: -1 },
					{ x: -1, y: -1 },
				]})).to.be.true;
			});

			it('should return result with no spliced edges', function() {
				expect(result.spliced.length).to.equal(0);
			});

			it('should return result with newEdge ((0.5, 1), (0.5, -1))', function() {
				const expected: geometry.Edge = {
					p1: { x: 0.5, y: 1 },
					p2: { x: 0.5, y: -1 },
				};
				expect(geometry.areEdgesEquivalent(result.newEdge, expected)).to.be.true;
			});

			it('should return result with negative ((0.5, 1), (1, 1), (1, -1), (0.5, -1))', function() {
				const expected: geometry.Polygon = { points: [
					{ x: 0.5, y: -1 },
					{ x: 0.5, y: 1 },
					{ x: 1, y: 1 },
					{ x: 1, y: -1 },
				]};
				expect(geometry.arePolygonsEquivalent(result.negative, expected)).to.be.true;
			});
		});
	});

	describe('square ((0, 1), (1, 0), (0, -1), (-1, 0))', function() {
		beforeEach(function() {
			polygon = { points: [
				{ x: 0, y: 1 },
				{ x: 1, y: 0 },
				{ x: 0, y: -1 },
				{ x: -1, y: 0 },
			]};
		});

		describe('inset edge ((0, 1), (1, 0)) by SQRT2/2', function() {
			let result = null;

			beforeEach(function() {
				result = geometry.insetPolygonEdge(polygon, { x: 0, y: 1 }, Math.SQRT2 / 2);
			});

			it('should modify polygon to ((-0.5, 0.5), (0.5, -0.5), (0, -1), (-1, 0)', function() {
				expect(geometry.arePolygonsEquivalent(polygon, { points: [
					{ x: -0.5, y: 0.5 },
					{ x: 0.5, y: -0.5 },
					{ x: 0, y: -1 },
					{ x: -1, y: 0 },
				]}, PRECISION)).to.be.true;
			});

			it('should return result with no spliced edges', function() {
				expect(result.spliced.length).to.equal(0);
			});

			it('should return result with newEdge ((-0.5, 0.5), (0.5, -0.5))', function() {
				expect(geometry.areEdgesEquivalent(result.newEdge, {
					p1: { x: -0.5, y: 0.5 },
					p2: { x: 0.5, y: -0.5 },
				}, PRECISION)).to.be.true;
			});

			it('should return result with negative ((-0.5, 0.5), (0, 1), (1, 0), (0.5, -0.5))', function() {
				expect(geometry.arePolygonsEquivalent(result.negative, { points: [
					{ x: -0.5, y: 0.5 },
					{ x: 0, y: 1 },
					{ x: 1, y: 0 },
					{ x: 0.5, y: -0.5 },
				]}, PRECISION)).to.be.true;
			});
		});
	});
});
