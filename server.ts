import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as http from 'http';
import * as socketIo from 'socket.io';

import { createInitialState, processTurn, submitTurn } from './common/gamelogic';
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
			state: null,
		};

		const mapJson = generate({ seed: seed || Math.random() * 1000000 });
		const map = mapFromJson(mapJson);
		mapsJson[game.id] = mapJson;
		maps[game.id] = map;

		game.state = createInitialState(map, seed);

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

httpServer.listen(3000);
