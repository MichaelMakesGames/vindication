import * as d3 from 'd3';
import * as geometry from '../common/geometry';
import { Map, MapJson } from '../common/map';
import { Options } from '../common/options'
import District from '../common/district';

export function renderPreview(map: MapJson, options: Options): void {
	const svg = d3.select('#map-preview');
	svg.selectAll('*').remove();
	svg.attr('viewBox', `100 100 ${options.width - 200} ${options.height - 200}`);

	const districtTypeToClassName = {
		'village': 'preview-urban-district',
		'urban': 'preview-urban-district',
		'rural': 'preview-rural-district',
		'water': 'preview-water-district',
		'plaza': 'preview-urban-district'
	}
	svg.selectAll('polygon').data(map.districts).enter().append('polygon')
		.attr('points', d => d.originalPolygon.join(' '))
		.attr('class', d => districtTypeToClassName[d.type]);
	svg.append('polyline')
		.attr('points', map.river.path.join(' '))
		.attr('stroke-width', map.river.width + 4)
		.attr('class', 'preview-river-outline');
	svg.append('polyline')
		.attr('points', map.river.path.join(' '))
		.attr('stroke-width', map.river.width)
		.attr('class', 'preview-river');
	map.bridges.forEach(bridge => {
		svg.append('polyline')
			.attr('points', bridge.join(' '))
			.attr('class', 'preview-bridge');
	});
}

export function render(map: Map, options: Options): void {
	let svg = d3.select('#map')
	svg
		.attr('width', options.width)
		// .attr('height', 'auto')
		.attr('viewBox', `100 100 ${options.width - 200} ${options.height - 200}`);
	svg = svg.select('g');
	
	renderBorder(options);

	map.coasts.forEach(coast => {
		renderCoast(coast);
	});

	let d3Land = d3.select('#land');
	for (let district of map.districts.filter(d => d.type !== 'water')) {
		d3Land.append('polygon')
			.attr('fill', 'white')
			.attr('stroke-width', 0)
			.attr('points', district.originalPolygon.join(' '));
	}

	if (map.subRiver.path.length) renderRiver(map.subRiver.path, map.subRiver.width);
	renderRiver(map.river.path, map.river.width);

	for (let edge of map.bridges) {
		svg.append('line')
			.attr('stroke-width', '12')
			.attr('stroke', 'black')
			.attr('x1', edge[0][0])
			.attr('y1', edge[0][1])
			.attr('x2', edge[1][0])
			.attr('y2', edge[1][1]);
		svg.append('line')
			.attr('stroke-width', '8')
			.attr('stroke', 'white')
			.attr('x1', edge[0][0])
			.attr('y1', edge[0][1])
			.attr('x2', edge[1][0])
			.attr('y2', edge[1][1]);
	}

	let districtTypeToRenderTarget = {
		'urban': document.getElementById('urban'),
		'plaza': document.getElementById('urban'),
		'water': document.getElementById('water'),
		'rural': document.getElementById('rural'),
		'village': document.getElementById('urban')
	};
	for (let district of map.districts) {
		renderDistrict(district, districtTypeToRenderTarget[district.type]);
	}

	for (let rect of map.sprawl) {
		svg.select('#urban').append('polygon')
			.attr('class', 'building')
			.attr('points', rect.join(' '));
	}
}

function renderDistrict(district: District, target: Element): void {
	let d3Target = d3.select(target);
	let fieldLine = d3.line()
		.x(d => d[0])
		.y(d => d[1])
		.curve(d3.curveCatmullRomClosed.alpha(0.2));

	if (district.isCore) {
		let rect = geometry.findRectInPolygon(district.polygon);
		let cross = geometry.createCross(rect);
		d3Target.append('polygon')
			.attr('class', 'building')
			.attr('points', cross.join(' '));
		return;
	}

	if (district.blockSize && !district.blocks.length) {
		let queue = [district.polygon];
		if (district.roadEnds.length) {
			let roads = district.roadEnds.map(p => district.originalPolygonPointToPolygonPoint(p)).filter(Boolean);
			let clip = 10 + Math.random() * 10;
			queue = geometry.shatterPolygon(district.polygon, district.site);
			for (let polygon of queue) {
				let inset1 = 2;
				let inset2 = 2;
				if (roads.some(p => geometry.arePointsEquivalent(p, polygon[1]))) {
					inset1 = 5;
				}
				if (roads.some(p => geometry.arePointsEquivalent(p, polygon[0]))) {
					inset2 = 5;
				}
				geometry.insetPolygonEdge(polygon, polygon[1], inset1);
				geometry.insetPolygonEdge(polygon, polygon[2], inset2);
				geometry.clipCorner(polygon, 2, clip);
			}
		}
		district.createBlocks(queue);
	}

	let polygonsToRender: [number, number][][] = district.blocks.length ? district.blocks : [district.polygon];
	for (let polygon of polygonsToRender) {
		switch (district.type) {
			case 'village': {} // fall through
			case 'urban': {
				d3Target.append('polygon')
					.datum(district)
					.attr('class', 'urban-block')
					.attr('points', polygon.join(' '));

				let copy: geometry.Polygon = polygon.map(point => [...point] as geometry.Point);
				let success = true;
				for (let point of copy) {
					success = success && !!geometry.insetPolygonEdge(copy, point, 10);
				}
				if (success) {
					d3Target.append('polygon')
						.attr('class', 'courtyard')
						.attr('points', copy.join(' '));
				}

				break;
			}

			case 'rural': {
				geometry.clipCorners(polygon, 6);
				let selection = d3Target.append('path')
					.datum(polygon)
					.attr('class', 'field' + Math.floor(Math.random() * 3 + 1))
					.attr('d', fieldLine);
				break;
			}

			case 'water': {
				d3Target.append('polygon')
					.attr('class', 'water')
					.style('animation-duration', Math.floor(Math.random() * 8 + 3) + 's')
					.style('animation-delay', Math.floor(Math.random() * 1000) + 'ms')
					.attr('points', polygon.join(' '));
				break;
			}

			case 'plaza': {
				break;
			}

			default: {}
		}
	}
}

function renderCoast(coast: geometry.Point[]): void {
	let d3Coast = d3.select('#coast');	

	let line = d3.line()
		.x(d => d[0])
		.y(d => d[1])
		.curve(d3.curveCatmullRom);
	if (geometry.arePointsEquivalent(coast[0], coast[coast.length - 1])) {
		line.curve(d3.curveCatmullRomClosed);
	}

	geometry.clipCorners(coast, 5);
	coast.pop();
	let beachWidth = 5;

	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(100, 100, 200)')
		.attr('stroke-width', beachWidth + 142);
	d3Coast.append('path')
		.attr('d', line(coast))
		.attr('fill', 'none')
		.attr('stroke', 'rgb(200, 200, 255)')
		.attr('stroke-width', beachWidth + 140);
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
	let riverLine = d3.line()
		.x(d => d[0])
		.y(d => d[1])
		.curve(d3.curveCatmullRom);
	geometry.clipCorners(path, 5);
	path.pop();
	let d3River = d3.select('#river');

	const d = riverLine(path);
	let i = 0;
	let done = false;
	while (!done) {
		d3River.append('path')
			.attr('d', d)
			.attr('class', 'river-line')
			.attr('stroke-width', width);
		d3River.append('path')
			.attr('d', d)
			.attr('class', 'river')
			.attr('stroke-width', width - 2);
		i++;
		width -= 2;
		width -= 2 * i;
		if (width < 2 * i) done = true;
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