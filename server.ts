import { generate } from './mapgen/mapgen'
import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as http from 'http';
import * as socketIo from 'socket.io';
import GameState from './common/gamestate';

const app = express();
const httpServer = new http.Server(app);
const io = socketIo(httpServer);

app.use(express.static('public'));
app.use(bodyParser.json())

app.post('/generate', (req, res) => {
  res.send(generate(req.body));
});

let map = generate({
	width: 3200,
	height: 1800,
	seed: 762.0961349286894
});
let gameState: GameState = {
  turns: {
    number: 1,
    rebel: null,
    authority: null
  },
  rebelControlled: [],
  uncovered: [],
  victor: null
}
const urbanDistricts = map.districts.filter(d => d.type === 'urban');
const rebelStart = urbanDistricts[Math.floor(Math.random() * urbanDistricts.length)];
gameState.rebelControlled.push(rebelStart.id);

io.on('connection', socket => {
  socket.emit('map', map);
  socket.emit('role', getRole());
  socket.emit('game-state', gameState);
  socket.on('submit-turn', (role, turn) => {
    gameState = submitTurn(gameState, role, turn);
    if (gameState.turns.rebel && gameState.turns.authority) {
      gameState = processTurn(gameState);
    }
    io.emit('game-state', gameState);
  })
});

httpServer.listen(3000);

const roles = ['rebel', 'authority'];
function getRole() {
  if (roles.length) {
    return roles.pop();
  } else {
    return 'observer'
  }
}

function submitTurn(state: GameState, role: string, turn: any): GameState {
  if (role === 'rebel') {
    state.turns.rebel = turn;
  }
  if (role === 'authority') {
    state.turns.authority = turn;
  }
  return state;
}

function processTurn(state: GameState): GameState {
  state.rebelControlled.push(state.turns.rebel.district);
  if (state.rebelControlled.length === 15) state.victor = 'rebel';
  if (state.turns.rebel.district === state.turns.authority.district) state.victor = 'authority';
  if (state.rebelControlled.includes(state.turns.authority.district)) state.uncovered.push(state.turns.authority.district);
  state.turns.number++;
  state.turns.rebel = null;
  state.turns.authority = null;
  return state;
}