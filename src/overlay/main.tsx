import ReactDOM from "react-dom/client";
import OverlayApp from "./OverlayApp";
import { followSystemTheme } from "../lib/theme";
import "./overlay.css";

followSystemTheme();

ReactDOM.createRoot(
  document.getElementById("overlay-root") as HTMLElement
).render(<OverlayApp />);
