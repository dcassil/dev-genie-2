import { createGame, playMove, reset, type GameState } from "./game";

export function mountGame(root: HTMLElement): void {
  let state = createGame();

  root.replaceChildren(createShell());

  const board = getRequiredElement<HTMLDivElement>(root, "[data-board]");
  const replayButton = getRequiredElement<HTMLButtonElement>(root, "[data-replay]");

  board.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>("[data-cell]");

    if (!button || !board.contains(button)) {
      return;
    }

    const index = Number(button.dataset.index);
    const nextState = playMove(state, index);

    if (nextState !== state) {
      state = nextState;
      render(root, state);
    }
  });

  replayButton.addEventListener("click", () => {
    state = reset();
    render(root, state);
  });

  render(root, state);
}

function createShell(): HTMLElement {
  const game = document.createElement("main");
  game.className = "game";
  game.innerHTML = `
    <section class="game__panel" aria-labelledby="game-title">
      <div class="game__header">
        <div>
          <p class="game__eyebrow">Tic-Tac-Toe</p>
          <h1 id="game-title">3x3 Board</h1>
        </div>
        <button class="replay-button" type="button" data-replay>Replay</button>
      </div>
      <p class="status" data-status role="status" aria-live="polite"></p>
      <div class="banner" data-banner hidden></div>
      <div class="board" data-board role="grid" aria-label="Tic-Tac-Toe board"></div>
    </section>
  `;

  return game;
}

function render(root: HTMLElement, state: GameState): void {
  renderStatus(root, state);
  renderBoard(root, state);
}

function renderStatus(root: HTMLElement, state: GameState): void {
  const status = getRequiredElement<HTMLElement>(root, "[data-status]");
  const banner = getRequiredElement<HTMLElement>(root, "[data-banner]");

  banner.hidden = state.status.kind === "in-progress";
  banner.className = `banner banner--${state.status.kind}`;

  if (state.status.kind === "won") {
    status.textContent = "Game complete";
    banner.textContent = `${state.status.winner} wins!`;
    return;
  }

  if (state.status.kind === "draw") {
    status.textContent = "Game complete";
    banner.textContent = "Draw";
    return;
  }

  status.textContent = `Turn: ${state.currentPlayer}`;
  banner.textContent = "";
}

function renderBoard(root: HTMLElement, state: GameState): void {
  const board = getRequiredElement<HTMLDivElement>(root, "[data-board]");
  const winningCells = new Set<number>(
    state.status.kind === "won" ? state.status.line : [],
  );

  board.replaceChildren(
    ...Array.from({ length: 9 }, (_, index) => {
      const cell = document.createElement("button");
      const mark = state.board[index] ?? null;
      const isWinningCell = winningCells.has(index);
      const isPlayable = state.status.kind === "in-progress" && mark === null;

      cell.className = [
        "cell",
        isPlayable ? "cell--playable" : "",
        isWinningCell ? "cell--winner" : "",
      ]
        .filter(Boolean)
        .join(" ");
      cell.type = "button";
      cell.dataset.cell = "";
      cell.dataset.index = String(index);
      cell.setAttribute("aria-disabled", String(!isPlayable));
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", getCellLabel(mark, index, isWinningCell));
      cell.textContent = mark ?? "";

      return cell;
    }),
  );
}

function getCellLabel(mark: string | null, index: number, isWinningCell: boolean): string {
  const position = `Cell ${index + 1}`;

  if (!mark) {
    return `${position}, empty`;
  }

  return isWinningCell ? `${position}, ${mark}, winning cell` : `${position}, ${mark}`;
}

function getRequiredElement<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Expected element "${selector}" to exist.`);
  }

  return element;
}
