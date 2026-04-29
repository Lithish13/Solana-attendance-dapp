import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App";

// Polyfills required by @solana/web3.js + @metaplex-foundation in browser
window.Buffer = window.Buffer || Buffer;
window.global = window.global || globalThis;

const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0f; }
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap');
  @keyframes spin { to { transform: rotate(360deg); } }
`;
document.head.appendChild(style);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
