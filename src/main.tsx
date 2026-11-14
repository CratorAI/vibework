import ReactDOM from "react-dom/client";
import App from "./App";
import { followSystemTheme } from "./lib/theme";
import "./index.css";

followSystemTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
