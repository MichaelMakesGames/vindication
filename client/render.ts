import * as d3 from 'd3';

import District from '../common/district';
import * as geometry from '../common/geometry';
import { Map, MapJson } from '../common/map';
import { Options } from '../common/options';

export function polygonToSVGPoints(polygon: geometry.Polygon): string {
	return polygon.points.map((p) => `${p.x},${p.y}`).join(' ');
}

export function renderPreview(map: MapJson, options: Options): void {
	const svg = d3.select('#map-preview');
	svg.selectAll('*').remove();
	svg.attr('viewBox', `100 100 ${options.width} ${options.height}`);

	const districtTypeToClassName = {
		forest: 'preview-forest-district',
		plaza: 'preview-urban-district',
		rural: 'preview-rural-district',
		urban: 'preview-urban-district',
		village: 'preview-urban-district',
		water: 'preview-water-district',
	};
	const colorScale = d3.scaleLinear<d3.Color>()
		.domain([-1, -Number.MIN_VALUE, 0, 1])
		.range([d3.rgb(0, 0, 127), d3.rgb(255, 255, 255), d3.rgb(0, 127, 0), d3.rgb(255, 255, 255)]);
	svg.selectAll('polygon').data(map.districts).enter().append('polygon')
		.attr('points', (d) => polygonToSVGPoints(d.originalPolygon))
		.style('fill', (d) => d.type === 'rural' || d.type === 'forest' ? colorScale(d.height).toString() : '')
		.attr('class', (d) => districtTypeToClassName[d.type]);
	svg.append('polyline')
		.attr('points', polygonToSVGPoints({ points: map.river.path }))
		.attr('stroke-width', map.river.width + 4)
		.attr('class', 'preview-river-outline');
	svg.append('polyline')
		.attr('points', polygonToSVGPoints({ points: map.river.path }))
		.attr('stroke-width', map.river.width)
		.attr('class', 'preview-river');
	map.bridges.forEach((bridge) => {
		svg.append('polyline')
			.attr('points', `${bridge.p1.x},${bridge.p1.y} ${bridge.p2.x},${bridge.p2.y}`)
			.attr('class', 'preview-bridge');
	});
	map.ridges.forEach((ridge) => {
		svg.append('polyline')
			.attr('points', ridge.map((p) => `${p.x},${p.y}`).join(' '))
			.attr('class', 'preview-ridge');
	});
}

export function render(map: Map, options: Options): void {
	let svg = d3.select('#map');
	svg
		.attr('width', options.width)
		// .attr('height', 'auto')
		.attr('viewBox', `100 100 ${options.width - 200} ${options.height - 200}`);
	svg = svg.select('g');

	renderBorder(options);

	map.coasts.forEach((coast) => {
		renderCoast(coast);
	});

	renderRidges(map.ridges);

	const d3Land = d3.select('#land');
	for (const district of map.districts.filter((d) => d.type !== 'water')) {
		d3Land.append('polygon')
			.attr('fill', 'white')
			.attr('stroke-width', 0)
			.attr('points', polygonToSVGPoints(district.originalPolygon));
	}

	if (map.subRiver.path.length) {
		renderRiver(map.subRiver.path, map.subRiver.width);
	}
	renderRiver(map.river.path, map.river.width);

	for (const edge of map.bridges) {
		svg.append('line')
			.attr('stroke-width', '12')
			.attr('stroke', 'black')
			.attr('x1', edge.p1.x)
			.attr('y1', edge.p1.y)
			.attr('x2', edge.p2.x)
			.attr('y2', edge.p2.y);
		svg.append('line')
			.attr('stroke-width', '8')
			.attr('stroke', 'white')
			.attr('x1', edge.p1.x)
			.attr('y1', edge.p1.y)
			.attr('x2', edge.p2.x)
			.attr('y2', edge.p2.y);
	}

	const districtTypeToRenderTarget = {
		forest: document.getElementById('forest'),
		plaza: document.getElementById('urban'),
		rural: document.getElementById('rural'),
		urban: document.getElementById('urban'),
		village: document.getElementById('urban'),
		water: document.getElementById('water'),
	};
	for (const district of map.districts) {
		renderDistrict(district, districtTypeToRenderTarget[district.type]);
	}

	for (const rect of map.sprawl) {
		svg.select('#urban').append('polygon')
			.attr('class', 'building')
			.attr('points', polygonToSVGPoints(rect));
	}
}

function renderDistrict(district: District, target: Element): void {
	const d3Target = d3.select(target);
	const fieldLine = d3.line<geometry.Point>()
		.x((d) => d.x)
		.y((d) => d.y)
		.curve(d3.curveCatmullRomClosed.alpha(0.2));

	if (district.isCore) {
		const rect = geometry.findRectInPolygon(district.polygon);
		const cross = geometry.createCross(rect);
		d3Target.append('polygon')
			.attr('class', 'building')
			.attr('points', polygonToSVGPoints(cross));
		return;
	}

	if (district.blockSize && !district.blocks.length) {
		let queue = [district.polygon];
		if (district.roadEnds.length) {
			const roads = district.roadEnds.map((p) => district.originalPolygonPointToPolygonPoint(p)).filter(Boolean);
			const clip = 10 + Math.random() * 10;
			queue = geometry.shatterPolygon(district.polygon, district.site);
			for (const polygon of queue) {
				let inset1 = 2;
				let inset2 = 2;
				if (district.roadEnds.some((p) => geometry.calcDistance(p, polygon.points[1]) < 5)) {
					inset1 = 5;
				}
				if (district.roadEnds.some((p) => geometry.calcDistance(p, polygon.points[0]) < 5)) {
					inset2 = 5;
				}
				geometry.insetPolygonEdge(polygon, polygon.points[1], inset1);
				geometry.insetPolygonEdge(polygon, polygon.points[2], inset2);
				geometry.clipCorner(polygon, 2, clip);
			}
		}
		district.createBlocks(queue);
	}

	const polygonsToRender: geometry.Polygon[] = district.blocks.length ? district.blocks : [district.polygon];
	for (const polygon of polygonsToRender) {
		switch (district.type) {
			case 'village': // fall through
			case 'urban': {
				d3Target.append('polygon')
					.datum(district)
					.attr('class', 'urban-block')
					.attr('points', polygonToSVGPoints(polygon));

				const copy: geometry.Polygon = geometry.clonePolygon(polygon);
				let success = true;
				for (const point of copy.points) {
					success = success && !!geometry.insetPolygonEdge(copy, point, 10);
				}
				if (success) {
					d3Target.append('polygon')
						.attr('class', 'courtyard')
						.attr('points', polygonToSVGPoints(copy));
				}

				break;
			}

			case 'rural': {
				geometry.clipCorners(polygon, 6);
				const selection = d3Target.append('path')
					.datum(polygon.points)
					.attr('class', 'field1') // + Math.floor(Math.random() * 3 + 1))
					.attr('d', fieldLine);
				break;
			}

			case 'water': {
				d3Target.append('polygon')
					.attr('class', 'water')
					.attr('points', polygonToSVGPoints(polygon));
				break;
			}

			case 'forest': {
				d3Target.append('polygon')
					.attr('class', 'forest')
					.attr('points', polygonToSVGPoints(polygon));
				break;
			}

			case 'plaza': {
				break;
			}

			default: {
				// do nothing
			}
		}
	}
}

function renderRidges(ridges: geometry.Point[][]): void {
	const svg = d3.select('#map > g');
	const line = d3.line<geometry.Point>()
		.x((d) => d.x)
		.y((d) => d.y)
		.curve(d3.curveCatmullRom);
	for (const ridge of ridges.map((r) => r.map(geometry.clonePoint))) {
		geometry.clipCorners({ points: ridge }, 5);
		ridge.pop();
		svg.append('path')
			.attr('d', line(ridge))
			.classed('ridge', true);
	}
}

function renderCoast(coast: geometry.Point[]): void {
	const d3Coast = d3.select('#coast');

	const line = d3.line<geometry.Point>()
		.x((d) => d.x)
		.y((d) => d.y)
		.curve(d3.curveCatmullRom);
	if (geometry.arePointsEquivalent(coast[0], coast[coast.length - 1])) {
		line.curve(d3.curveCatmullRomClosed);
	}

	geometry.clipCorners({ points: coast }, 5);
	coast.pop();
	const beachWidth = 5;

	// d3Coast.append('path')
	// 	.attr('d', line(coast))
	// 	.attr('fill', 'none')
	// 	.attr('stroke', 'rgb(100, 100, 200)')
	// 	.attr('stroke-width', beachWidth + 142);
	// d3Coast.append('path')
	// 	.attr('d', line(coast))
	// 	.attr('fill', 'none')
	// 	.attr('stroke', 'rgb(200, 200, 255)')
	// 	.attr('stroke-width', beachWidth + 140);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(100, 100, 200)')
		.attr('stroke-width', beachWidth + 76);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(200, 200, 255)')
		.attr('stroke-width', beachWidth + 74);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(100, 100, 200)')
		.attr('stroke-width', beachWidth + 42);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(200, 200, 255)')
		.attr('stroke-width', beachWidth + 40);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(100, 100, 200)')
		.attr('stroke-width', beachWidth + 24);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(200, 200, 255)')
		.attr('stroke-width', beachWidth + 22);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(100, 100, 200)')
		.attr('stroke-width', beachWidth + 14);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(200, 200, 255)')
		.attr('stroke-width', beachWidth + 12);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(100, 100, 200)')
		.attr('stroke-width', beachWidth + 8);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(200, 200, 255)')
		.attr('stroke-width', beachWidth + 6);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(100, 100, 200)')
		.attr('stroke-width', beachWidth + 4);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(200, 200, 255)')
		.attr('stroke-width', beachWidth + 2);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'white')
		.attr('stroke-width', beachWidth);
}

function renderRiver(path: geometry.Point[], width: number = 40): void {
	const riverLine = d3.line<geometry.Point>()
		.x((d) => d.x)
		.y((d) => d.y)
		.curve(d3.curveCatmullRom);
	geometry.clipCorners({ points: path }, 5);
	path.pop();
	const d3River = d3.select('#river');

	const svgPathD = riverLine(path);
	let i = 0;
	let done = false;
	while (!done) {
		d3River.append('path')
			.attr('d', svgPathD)
			.attr('class', 'river-line')
			.attr('stroke-width', width);
		d3River.append('path')
			.attr('d', svgPathD)
			.attr('class', 'river')
			.attr('stroke-width', width - 2);
		i++;
		width -= 2;
		width -= 2 * i;
		if (width < 2 * i) {
			done = true;
		}
	}
}

function renderBorder(options: Options): void {
	d3.select('#map > defs')
		.append('clipPath')
		.attr('id', 'borderClip')
		.append('rect')
		.attr('x', 100)
		.attr('y', 100)
		.attr('width', options.width - 200)
		.attr('height', options.height - 200);

	d3.select('#map > g')
		.attr('clip-path', 'url(#borderClip)');
}
