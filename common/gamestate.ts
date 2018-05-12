import Headline from './headline';

export interface GameState {
  turns: {
    number: number,
    rebel: any | null,
    authority: any | null
  },
  rebelControlled: number[],
  rebelPosition: number,
  uncovered: number[],
  patrols: number[],
  victor: 'rebel' | 'authority' | null,
  log: {
    turn: number,
    headlines: Headline[]
  }[]
}

export default GameState;