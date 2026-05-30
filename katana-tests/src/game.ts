export type Mark = "X" | "O";
export type Cell = Mark | null;
export type Board = readonly Cell[];
export type WinningLine = readonly [number, number, number];

export type GameStatus =
  | { kind: "in-progress" }
  | { kind: "won"; winner: Mark; line: WinningLine }
  | { kind: "draw" };

export interface GameState {
  readonly board: Board;
  readonly currentPlayer: Mark;
  readonly status: GameStatus;
}

const WINNING_LINES: readonly WinningLine[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function createGame(): GameState {
  return {
    board: Array<Cell>(9).fill(null),
    currentPlayer: "X",
    status: { kind: "in-progress" },
  };
}

export function playMove(state: GameState, index: number): GameState {
  if (!Number.isInteger(index) || index < 0 || index >= 9) {
    return state;
  }

  if (state.status.kind !== "in-progress" || state.board[index] !== null) {
    return state;
  }

  const board = [...state.board];
  board[index] = state.currentPlayer;

  return {
    board,
    currentPlayer: state.currentPlayer === "X" ? "O" : "X",
    status: detectStatus(board),
  };
}

export function reset(): GameState {
  return createGame();
}

function detectStatus(board: Board): GameStatus {
  for (const line of WINNING_LINES) {
    const [firstIndex, secondIndex, thirdIndex] = line;
    const first = board[firstIndex];

    if (first === "X" || first === "O") {
      if (first === board[secondIndex] && first === board[thirdIndex]) {
        return { kind: "won", winner: first, line };
      }
    }
  }

  if (board.every((cell) => cell !== null)) {
    return { kind: "draw" };
  }

  return { kind: "in-progress" };
}
