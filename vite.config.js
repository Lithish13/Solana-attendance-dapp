import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env": {},
    global: "globalThis",
  },
  resolve: {
    alias: {
      stream: "stream-browserify",
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    include: [
      "@solana/web3.js",
      "@solana/spl-token",
      "@metaplex-foundation/mpl-token-metadata",
      "buffer",
    ],
    esbuildOptions: {
      define: { global: "globalThis" },
    },
  },
});
