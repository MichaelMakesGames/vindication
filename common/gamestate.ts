export interface GameState {
  turns: {
    number: number,
    rebel: any | null,
    authority: any | null
  }
}

export default GameState;