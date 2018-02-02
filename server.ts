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
	seed: 762
});
let gameState: GameState = {
  turns: {
    number: 1,
    rebel: null,
    authority: null
  },
  rebelControlled: [],
  rebelPosition: 0,
  uncovered: [],
  patrols: [],
  victor: null,
  log: []
}
const urbanDistricts = map.districts.filter(d => d.type === 'urban');
const rebelStart = urbanDistricts[Math.floor(Math.random() * urbanDistricts.length)];
gameState.rebelControlled.push(rebelStart.id);
gameState.rebelPosition = rebelStart.id;

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

  let rebelDistrict = map.districts[state.turns.rebel.district];
  let authorityDistrict = map.districts[state.turns.authority.district];

  state.rebelPosition = rebelDistrict.id;

  if (!state.rebelControlled.includes(rebelDistrict.id)) {
    state.rebelControlled.push(rebelDistrict.id);
    if (state.patrols.includes(rebelDistrict.id)) {
      state.patrols = state.patrols.filter(id => id !== rebelDistrict.id);
      state.uncovered.push(rebelDistrict.id);
      state.log.push(`Police patrols driven out of ${rebelDistrict.name}, rebel leadership seen leading attack`);
    }
  }
  if (rebelDistrict === authorityDistrict) {
    state.victor = 'authority';
    state.log.push(`Rebellion leadership captured during raid in ${authorityDistrict.name}`);
  } else  if (state.rebelControlled.length === 15) {
    state.victor = 'rebel';
    state.log.push(`The Old Regime has been toppled, long live the Revolution!`);
  } else if (state.uncovered.includes(authorityDistrict.id)) {
    state.uncovered = state.uncovered.filter(id => id !== authorityDistrict.id);
    state.rebelControlled = state.rebelControlled.filter(id => id !== authorityDistrict.id);
    state.patrols.push(authorityDistrict.id);
    state.log.push(`Raid in ${authorityDistrict.name}, rebels on the retreat!`);
  } else if (state.rebelControlled.includes(state.turns.authority.district)) {
    state.uncovered.push(authorityDistrict.id);
    state.log.push(`Police uncover rebel menace in ${authorityDistrict.name}`)
  } else {
    state.patrols.push(authorityDistrict.id);
    state.log.push(`New patrols established in ${authorityDistrict.name}, no insurgents found`);
  }


  state.turns.number++;
  state.turns.rebel = null;
  state.turns.authority = null;

  return state;
}