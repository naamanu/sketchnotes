import { createRoot } from "react-dom/client";
import App from "./App";
import { warmUpInk } from "./ink";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
warmUpInk();
