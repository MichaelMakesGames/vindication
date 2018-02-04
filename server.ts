import { generate } from './mapgen/mapgen'
import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as http from 'http';
import * as socketIo from 'socket.io';
import GameState from './common/gamestate';
import { Map, MapJson, mapFromJson } from './common/map';
import { getAvailableActions } from './common/gamelogic';

const app = express();
const httpServer = new http.Server(app);
const io = socketIo(httpServer);

app.use(express.static('public'));
app.use(bodyParser.json())

let roles = ['rebel', 'authority', 'observer'];
let mapJson: MapJson = null;
let map: Map = null;
let gameState: GameState = null;

io.on('connection', socket => {
  socket.emit('roles', roles);
  if (gameState) {
    socket.emit('start-game');
    socket.emit('preview-map', mapJson, {width: 3200, height: 1800, seed: 0});
  }

  socket.on('preview-map', seed => {
    const options = {
      width: 3200,
      height: 1800,
      seed
    }
    socket.emit('preview-map', generate(options), options);
  });

  function assignRole(requestedRole) {
    role = requestedRole;
    if (role !== 'observer') {
      roles = roles.filter(r => r !== role);
    }
    io.emit('roles', roles);
  }

  socket.on('start-game', ({seed, role}) => {
    mapJson = generate({
      width: 3200,
      height: 1800,
      seed: parseFloat(seed || Math.random() * 1000000)
    });
    map = mapFromJson(mapJson);
    gameState = {
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
    };
    const urbanDistricts = mapJson.districts.filter(d => d.type === 'urban');
    const rebelStart = urbanDistricts[Math.floor(Math.random() * urbanDistricts.length)];
    gameState.rebelControlled.push(rebelStart.id);
    gameState.rebelPosition = rebelStart.id;

    io.emit('start-game');
    assignRole(role);
    socket.emit('join-game', {role, mapJson});
    socket.emit('game-state', gameState);
  });

  let role = null;
  socket.on('join-game', requestedRole => {
    if (roles.includes(requestedRole)) {
      assignRole(requestedRole);
      socket.emit('join-game', {role, mapJson});
      socket.emit('game-state', gameState);
    }
  });

  socket.on('disconnect', () => {
    if (role && role !== 'observer') {
      roles.push(role);
    }
  });

  socket.on('submit-turn', (role, turn) => {
    gameState = submitTurn(gameState, role, turn);
    if (gameState.turns.rebel && gameState.turns.authority) {
      gameState = processTurn(gameState);
    }
    io.emit('game-state', gameState);

    if (gameState.victor) {
      roles = ['rebel', 'authority', 'observer'];
      mapJson = null;
      gameState = null;
    }
  });
});

function submitTurn(state: GameState, role: string, turn: {district: number, action: string}): GameState {
  // validate turn
  if (!turn) return state;
  const district = map.districts[turn.district];
  const actions = getAvailableActions(role, district, state);
  if (!actions.includes(turn.action)) return state;

  if (role === 'rebel') {
    state.turns.rebel = turn;
  }
  if (role === 'authority') {
    state.turns.authority = turn;
  }
  return state;
}

function processTurn(state: GameState): GameState {

  let rebelDistrict = mapJson.districts[state.turns.rebel.district];
  let authorityDistrict = mapJson.districts[state.turns.authority.district];

  if (state.turns.rebel.action === 'move') {
    state.rebelPosition = rebelDistrict.id;
  } else if (state.turns.rebel.action === 'organize') {
    state.rebelControlled.push(rebelDistrict.id);
    if (state.patrols.includes(rebelDistrict.id)) {
      state.patrols = state.patrols.filter(id => id !== rebelDistrict.id);
      state.uncovered.push(rebelDistrict.id);
      state.log.push(`Police patrols driven out of ${rebelDistrict.name} by rebel attack`);
    }
  }

  if (state.turns.authority.action === 'patrol') {
    if (state.uncovered.includes(authorityDistrict.id)) {
      state.uncovered = state.uncovered.filter(id => id !== authorityDistrict.id);
      state.rebelControlled = state.rebelControlled.filter(id => id !== authorityDistrict.id);
      state.patrols.push(authorityDistrict.id);
      state.log.push(`Raid in ${authorityDistrict.name}, rebels on the retreat!`);
    } else if (state.rebelControlled.includes(authorityDistrict.id)) {
      state.uncovered.push(authorityDistrict.id);
      state.log.push(`Police uncover rebel menace in ${authorityDistrict.name}`)
    } else {
      state.patrols.push(authorityDistrict.id);
      state.log.push(`New patrols established in ${authorityDistrict.name}, no insurgents found`);
    }
  }

  if (state.rebelControlled.length >= 15) {
    state.victor = 'rebel';
    state.log.push(`The Old Regime has fallen, long live the Revolution!`);
  }
  if (state.patrols.includes(state.rebelPosition)) {
    state.victor = 'authority';
    state.log.push(`Rebellion leadership captured during raid in ${authorityDistrict.name}`);
  }

  state.turns.number++;
  state.turns.rebel = null;
  state.turns.authority = null;

  return state;
}

httpServer.listen(3000);
