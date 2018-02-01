export interface GameState {
  turns: {
    number: number,
    rebel: any | null,
    authority: any | null
  },
  rebelControlled: number[],
  uncovered: number[],
  victor: 'rebel' | 'authority' | null,
  log: string[]
}

export default GameState;