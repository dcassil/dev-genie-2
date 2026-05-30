import "./styles.css";
import { mountGame } from "./ui";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error('Expected root element "#app" to exist.');
}

mountGame(app);
