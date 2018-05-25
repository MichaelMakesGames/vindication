import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as http from 'http';
import * as socketIo from 'socket.io';

import { getAvailableActions } from './common/gamelogic';
import GameState from './common/gamestate';
import { Map, mapFromJson, MapJson } from './common/map';
import { generate } from './mapgen/mapgen';

const app = express();
const httpServer = new http.Server(app);
const io = socketIo(httpServer);

app.use(express.static('public'));
app.use(bodyParser.json());

interface Game {
	id: number;
	name: string;
	rebel: string;
	authority: string;
	seed: number;
	state: GameState;
}
const games: Game[] = [];

const maps: { [id: number]: Map } = {};
const mapsJson: { [id: number]: MapJson } = {};

function getGame(id: number) {
	return games.find((game) => game.id === id);
}

io.on('connection', (socket) => {
	socket.emit('games', games);

	socket.on('preview-map', (seed) => {
		const options = { seed };
		socket.emit('preview-map', generate(options), options);
	});

	socket.on('new-game', function(name: string, seed: number, role: string) {
		const id = Math.floor(Math.random() * 1000000000000); // TODO use UUID
		const game: Game = {
			authority: role === 'authority' ? socket.id : null,
			id,
			name: name || id.toString(),
			rebel: role === 'rebel' ? socket.id : null,
			seed,
			state: {
				log: [],
				patrols: [],
				rebelControlled: [],
				rebelPosition: 0,
				turns: {
					authority: null,
					number: 1,
					rebel: null,
				},
				uncovered: [],
				victor: null,
			},
		};

		const mapJson = generate({ seed: seed || Math.random() * 1000000 });
		const map = mapFromJson(mapJson);
		mapsJson[game.id] = mapJson;
		maps[game.id] = map;

		const urbanDistricts = mapJson.districts.filter((d) => d.type === 'urban');
		const rebelStart = urbanDistricts[Math.floor(Math.random() * urbanDistricts.length)];
		game.state.rebelControlled.push(rebelStart.id);
		game.state.rebelPosition = rebelStart.id;

		games.push(game);
		io.emit('games', games);
		socket.emit('game-joined', game, mapJson);
		socket.emit('game-state', game.state);
	});

	socket.on('join-game', function(id: number, role: string) {
		const game = getGame(id);
		if ((role === 'rebel' || role === 'authority') && !game[role]) {
			game[role] = socket.id;
			io.emit('games', games);
			socket.emit('game-joined', game, mapsJson[game.id]);
			socket.emit('game-state', game.state);
		}
	});

	socket.on('disconnect', function() {
		for (const game of games) {
			if (game.rebel === socket.id) {
				game.rebel = null;
			}
			if (game.authority === socket.id) {
				game.authority = null;
			}
		}
		while (games.some((g) => !g.rebel && !g.authority)) {
			games.splice(games.findIndex((g) => !g.rebel && !g.authority), 1);
		}
		io.emit('games', games);
	});

	socket.on('submit-turn', (id, role, turn) => {
		const game = getGame(id);
		if (game[role] === socket.id) {
			game.state = submitTurn(maps[game.id], game.state, role, turn);
			if (game.state.turns.rebel && game.state.turns.authority) {
				game.state = processTurn(maps[game.id], game.state);
			}
			io.to(game.rebel).to(game.authority).emit('game-state', game.state);
		}
	});
});

function submitTurn(map: Map, state: GameState, role: string, turn: {district: number, action: string}): GameState {
	// validate turn
	if (!turn) {
		return state;
	}
	const district = map.districts[turn.district];
	const actions = getAvailableActions(role, district, state);
	if (!actions.includes(turn.action)) {
		return state;
	}

	if (role === 'rebel') {
		state.turns.rebel = turn;
	}
	if (role === 'authority') {
		state.turns.authority = turn;
	}
	return state;
}

function processTurn(map: Map, state: GameState): GameState {

	const rebelDistrict = map.districts[state.turns.rebel.district];
	const authorityDistrict = map.districts[state.turns.authority.district];

	const log = {
		headlines: [],
		turn: state.turns.number,
	};

	if (state.turns.rebel.action === 'move') {
		state.rebelPosition = rebelDistrict.id;
	} else if (state.turns.rebel.action === 'organize') {
		state.rebelControlled.push(rebelDistrict.id);
		if (state.patrols.includes(rebelDistrict.id)) {
			state.patrols = state.patrols.filter((id) => id !== rebelDistrict.id);
			state.uncovered.push(rebelDistrict.id);
			log.headlines.push({
				district: rebelDistrict.id,
				text: `Police patrols driven out of ${rebelDistrict.name} by rebel attack`,
			});
		}
	}

	if (state.turns.authority.action === 'patrol') {
		if (state.uncovered.includes(authorityDistrict.id)) {
			state.uncovered = state.uncovered.filter((id) => id !== authorityDistrict.id);
			state.rebelControlled = state.rebelControlled.filter((id) => id !== authorityDistrict.id);
			state.patrols.push(authorityDistrict.id);
			log.headlines.push({
				district: authorityDistrict.id,
				text: `Raid in ${authorityDistrict.name}, rebels on the retreat!`,
			});
		} else if (state.rebelControlled.includes(authorityDistrict.id)) {
			state.uncovered.push(authorityDistrict.id);
			log.headlines.push({
				distrct: authorityDistrict.id,
				text: `Police uncover rebel menace in ${authorityDistrict.name}`,
			});
		} else {
			state.patrols.push(authorityDistrict.id);
			log.headlines.push({
				district: authorityDistrict.id,
				text: `New patrols established in ${authorityDistrict.name}, no insurgents found`,
			});
		}
	}

	if (state.rebelControlled.length >= 15) {
		state.victor = 'rebel';
		log.headlines.push({
			district: rebelDistrict.id,
			text: `The Old Regime has fallen, long live the Revolution!`,
		});
	}
	if (state.patrols.includes(state.rebelPosition)) {
		state.victor = 'authority';
		log.headlines.push({
			district: authorityDistrict.id,
			text: `Rebellion leadership captured during raid in ${authorityDistrict.name}`,
		});
	}

	state.turns.number++;
	state.turns.rebel = null;
	state.turns.authority = null;
	state.log.push(log);

	return state;
}

httpServer.listen(3000);
