import * as d3 from 'd3';
import * as geometry from './geometry';

export function renderCoast(coast: geometry.Point[]): void {
	let d3Coast = d3.select('#coast');	

	let line = d3.line()
		.x(d => d[0])
		.y(d => d[1])
		.curve(d3.curveCatmullRom);

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

export function renderRiver(path: geometry.Point[], width: number = 40): void {
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
	// d3River.append('path')
	// 	.attr('d', riverLine(path))
	// 	.attr('fill', 'none')
	// 	.attr('stroke-linecap', 'round')
	// 	.attr('stroke', 'rgb(100, 100, 200)')
	// 	.attr('stroke-width', 15);
	// d3River.append('path')
	// 	.attr('fill', 'none')
	// 	.attr('d', riverLine(path))
	// 	.attr('stroke-linecap', 'round')
	// 	.attr('stroke', 'rgb(200, 200, 255)')
	// 	.attr('stroke-width', 13);
	// d3River.append('path')
	// 	.attr('d', riverLine(path))
	// 	.attr('stroke-linecap', 'round')
	// 	.attr('fill', 'none')
	// 	.attr('stroke', 'rgb(100, 100, 200)')
	// 	.attr('stroke-width', 11);
	// d3River.append('path')
	// 	.attr('fill', 'none')
	// 	.attr('d', riverLine(path))
	// 	.attr('stroke-linecap', 'round')
	// 	.attr('stroke', 'rgb(200, 200, 255)')
	// 	.attr('stroke-width', 9);
	// d3River.append('path')
	// 	.attr('d', riverLine(path))
	// 	.attr('fill', 'none')
	// 	.attr('stroke-linecap', 'round')
	// 	.attr('stroke', 'rgb(100, 100, 200)')
	// 	.attr('stroke-width', 5);
	// d3River.append('path')
	// 	.attr('fill', 'none')
	// 	.attr('d', riverLine(path))
	// 	.attr('stroke-linecap', 'round')
	// 	.attr('stroke', 'rgb(200, 200, 255)')
	// 	.attr('stroke-width', 3);
}