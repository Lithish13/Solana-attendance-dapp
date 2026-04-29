# Solana Attendance dApp

A minimal Solana dApp — connect Phantom wallet and mark attendance on Devnet.

## Prerequisites

- **Node.js** v18 or later
- **Phantom wallet** browser extension → https://phantom.app/

## Setup & Run

```bash
# 1. Install dependencies
npm install

# 2. Install stream polyfill (needed by @solana/web3.js in Vite)
npm install stream-browserify

# 3. Start the dev server
npm run dev
```

Open **http://localhost:5173** in the browser where Phantom is installed.

## Usage

1. Click **Connect Phantom** — approve in the wallet popup.
2. Your truncated address will appear.
3. Click **Mark Attendance** — the app calls `handleAttendance()`, which:
   - Opens a `Connection` to Devnet
   - Fetches your SOL balance (live on-chain read)
   - Simulates an attendance transaction (mock signature)
   - Logs the result in the activity feed
4. Click **Disconnect** to reset.

## Extending `handleAttendance()`

Replace the mock logic in `src/App.jsx` with a real program call:

```js
import { Transaction, SystemProgram } from "@solana/web3.js";

const tx = new Transaction().add(
  // your program instruction here
);
const { blockhash } = await connection.getLatestBlockhash();
tx.recentBlockhash = blockhash;
tx.feePayer = pubkey;

const signed = await window.solana.signTransaction(tx);
const sig = await connection.sendRawTransaction(signed.serialize());
await connection.confirmTransaction(sig);
```

## Project Structure

```
solana-attendance-dapp/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx      # React entry point
    └── App.jsx       # Full app (wallet + attendance logic + UI)
```
