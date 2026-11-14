import ReactDOM from "react-dom/client";
import LoadingApp from "./LoadingApp";
import { followSystemTheme } from "../lib/theme";
import "./loading.css";

followSystemTheme();

ReactDOM.createRoot(
  document.getElementById("loading-root") as HTMLElement
).render(<LoadingApp />);
