import { useState, useCallback, useEffect, useRef } from "react";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import QRCode from "qrcode";
import { mintAttendanceNFT } from "./mintNFT";

// ── Constants ──────────────────────────────────────────────────────────────
const NETWORK    = clusterApiUrl("devnet");
const EVENT_ID   = "EVENT123";
const QR_PAYLOAD = JSON.stringify({ event: EVENT_ID, issuer: "SolanaAttendance", version: 1 });
const EXPLORER   = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const MINT_EXPLORER = (addr) => `https://explorer.solana.com/address/${addr}?cluster=devnet`;

function truncate(addr) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

// ── QR Panel ───────────────────────────────────────────────────────────────
function QRPanel({ scanned, onSimulateScan }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, QR_PAYLOAD, {
        width: 160,
        margin: 2,
        color: { dark: "#63ffb4", light: "#0a0f0c" },
      });
    }
  }, []);

  return (
    <div style={styles.qrPanel}>
      <p style={styles.qrLabel}>Event QR · {EVENT_ID}</p>
      <div style={{ position: "relative", display: "inline-block" }}>
        <canvas ref={canvasRef} style={styles.qrCanvas} />
        {scanned && (
          <div style={styles.qrOverlay}>
            <span style={styles.qrCheckmark}>✓</span>
          </div>
        )}
      </div>
      {!scanned ? (
        <button style={{ ...styles.btn, ...styles.btnScan }} onClick={onSimulateScan}>
          ⬡ Simulate Scan
        </button>
      ) : (
        <div style={styles.scannedBadge}>QR Verified · {EVENT_ID}</div>
      )}
    </div>
  );
}

// ── NFT Result Card ────────────────────────────────────────────────────────
function NFTCard({ mintAddress, txSignature }) {
  return (
    <div style={styles.nftCard}>
      <div style={styles.nftCardHeader}>
        <span style={styles.nftIcon}>◈</span>
        <span style={styles.nftTitle}>NFT Minted</span>
      </div>
      <div style={styles.nftRow}>
        <span style={styles.nftKey}>Name</span>
        <span style={styles.nftVal}>Event Attendance</span>
      </div>
      <div style={styles.nftRow}>
        <span style={styles.nftKey}>Symbol</span>
        <span style={styles.nftVal}>ATTEND</span>
      </div>
      <div style={styles.nftRow}>
        <span style={styles.nftKey}>Event</span>
        <span style={styles.nftVal}>{EVENT_ID}</span>
      </div>
      <div style={styles.nftRow}>
        <span style={styles.nftKey}>Mint</span>
        <a
          href={MINT_EXPLORER(mintAddress)}
          target="_blank"
          rel="noreferrer"
          style={styles.nftLink}
        >
          {truncate(mintAddress)} ↗
        </a>
      </div>
      <div style={styles.nftRow}>
        <span style={styles.nftKey}>Tx</span>
        <a
          href={EXPLORER(txSignature)}
          target="_blank"
          rel="noreferrer"
          style={styles.nftLink}
        >
          {truncate(txSignature)} ↗
        </a>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [wallet,      setWallet]    = useState(null);
  const [status,      setStatus]    = useState(null);
  const [log,         setLog]       = useState([]);
  const [qrScanned,   setQrScanned] = useState(false);
  const [nftResult,   setNftResult] = useState(null); // { mintAddress, txSignature }
  const [mintStep,    setMintStep]  = useState("");   // granular progress message

  const getProvider = () => {
    if ("solana" in window) {
      const p = window.solana;
      if (p.isPhantom) return p;
    }
    return null;
  };

  const addLog = (action, detail = "") => {
    const ts = new Date().toLocaleTimeString();
    setLog((prev) => [{ ts, action, detail }, ...prev].slice(0, 10));
  };

  // ── Wallet ──────────────────────────────────────────────────────────────
  const connectWallet = async () => {
    const provider = getProvider();
    if (!provider) {
      window.open("https://phantom.app/", "_blank");
      setStatus({ type: "error", message: "Phantom not found — install it first." });
      return;
    }
    try {
      setStatus({ type: "loading", message: "Connecting…" });
      const resp   = await provider.connect();
      const pubkey = resp.publicKey.toString();
      setWallet(pubkey);
      setStatus({ type: "success", message: "Wallet connected." });
      addLog("Wallet connected", pubkey);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  };

  const disconnectWallet = async () => {
    const provider = getProvider();
    if (provider) await provider.disconnect();
    setWallet(null);
    setStatus(null);
    setLog([]);
    setQrScanned(false);
    setNftResult(null);
    setMintStep("");
  };

  // ── QR simulate scan ────────────────────────────────────────────────────
  const handleSimulateScan = async () => {
    setStatus({ type: "loading", message: "Scanning QR code…" });
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const parsed = JSON.parse(QR_PAYLOAD);
      if (parsed.event !== EVENT_ID) throw new Error("Event ID mismatch");
      setQrScanned(true);
      setStatus({ type: "success", message: `QR verified — event: ${parsed.event}` });
      addLog("QR scanned", `Event: ${parsed.event}`);
    } catch (err) {
      setStatus({ type: "error", message: `QR invalid: ${err.message}` });
    }
  };

  // ── Attendance + NFT mint ────────────────────────────────────────────────
  const handleAttendance = useCallback(async () => {
    if (!wallet || !qrScanned) return;

    const provider = getProvider();
    if (!provider) {
      setStatus({ type: "error", message: "Phantom not found." });
      return;
    }

    setNftResult(null);
    setMintStep("");
    setStatus({ type: "loading", message: "Minting attendance NFT…" });

    try {
      const connection = new Connection(NETWORK, "confirmed");

      // Check balance — devnet minting costs ~0.012 SOL
      const pubkey  = new PublicKey(wallet);
      const balance = await connection.getBalance(pubkey);
      const solBal  = balance / 1e9;

      if (solBal < 0.01) {
        setStatus({
          type: "error",
          message: `Insufficient balance (${solBal.toFixed(4)} SOL). Airdrop needed: run \`solana airdrop 1 ${wallet} --url devnet\``,
        });
        return;
      }

      const result = await mintAttendanceNFT(
        connection,
        provider,
        wallet,
        EVENT_ID,
        (step) => {
          setMintStep(step);
          setStatus({ type: "loading", message: step });
        }
      );

      setNftResult(result);
      setMintStep("");
      setStatus({ type: "success", message: "NFT minted! Attendance recorded on-chain." });
      addLog("NFT minted", `Mint: ${result.mintAddress}`);
      addLog("Tx confirmed", result.txSignature);
    } catch (err) {
      setMintStep("");
      // Surface a friendly error for common failure modes
      let msg = err.message || String(err);
      if (msg.includes("0x1")) msg = "Insufficient SOL for rent + fees. Airdrop more devnet SOL.";
      if (msg.includes("User rejected")) msg = "Transaction rejected in wallet.";
      setStatus({ type: "error", message: msg });
    }
  }, [wallet, qrScanned]);

  const isLoading = status?.type === "loading";

  return (
    <div style={styles.root}>
      <div style={styles.grid} aria-hidden />

      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logoMark}>◎</div>
          <h1 style={styles.title}>Attendance</h1>
          <p style={styles.subtitle}>Solana · Devnet · {EVENT_ID}</p>
        </div>

        {/* Wallet */}
        <div style={styles.walletBlock}>
          {wallet ? (
            <>
              <div style={styles.addressPill}>
                <span style={styles.dot} />
                <span style={styles.addressText}>{truncate(wallet)}</span>
              </div>
              <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={disconnectWallet}>
                Disconnect
              </button>
            </>
          ) : (
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={connectWallet}>
              Connect Phantom
            </button>
          )}
        </div>

        {/* QR Panel */}
        {wallet && !nftResult && (
          <QRPanel scanned={qrScanned} onSimulateScan={handleSimulateScan} />
        )}

        {/* Mint progress steps */}
        {isLoading && mintStep && (
          <div style={styles.mintProgress}>
            <span style={styles.spinner}>⟳</span>
            <span style={styles.mintStepText}>{mintStep}</span>
          </div>
        )}

        {/* Status bar */}
        {status && !mintStep && (
          <div style={{ ...styles.statusBar, ...styles[`status_${status.type}`] }}>
            {isLoading && <span style={styles.spinner}>⟳</span>}
            {status.message}
          </div>
        )}

        {/* NFT result card */}
        {nftResult && <NFTCard {...nftResult} />}

        {/* Mark Attendance */}
        {wallet && !nftResult && (
          <div style={styles.attendBlock}>
            {!qrScanned && (
              <p style={styles.attendHint}>Scan QR to unlock attendance</p>
            )}
            {qrScanned && (
              <p style={styles.attendHint}>QR verified — minting an NFT to your wallet</p>
            )}
            <button
              style={{
                ...styles.btn,
                ...styles.btnAttend,
                opacity: (!qrScanned || isLoading) ? 0.4 : 1,
                cursor:  (!qrScanned || isLoading) ? "not-allowed" : "pointer",
              }}
              onClick={handleAttendance}
              disabled={!qrScanned || isLoading}
            >
              {isLoading ? "Minting…" : "Mark Attendance · Mint NFT"}
            </button>
          </div>
        )}

        {/* Mint again button */}
        {nftResult && (
          <button
            style={{ ...styles.btn, ...styles.btnGhost, textAlign: "center" }}
            onClick={() => { setNftResult(null); setQrScanned(false); setStatus(null); }}
          >
            ← Mint Another
          </button>
        )}

        {/* Activity log */}
        {log.length > 0 && (
          <div style={styles.logBox}>
            <p style={styles.logTitle}>Activity</p>
            {log.map((e, i) => (
              <div key={i} style={styles.logRow}>
                <span style={styles.logTs}>{e.ts}</span>
                <span style={styles.logAction}>{e.action}</span>
                {e.detail && <span style={styles.logDetail}>{e.detail}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────────── */
const styles = {
  root: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", fontFamily: "'IBM Plex Mono', monospace", position: "relative", overflow: "hidden" },
  grid: { position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(99,255,180,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,255,180,0.04) 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" },
  card: { background: "rgba(16,16,24,0.92)", border: "1px solid rgba(99,255,180,0.18)", borderRadius: "4px", padding: "40px 36px", width: "100%", maxWidth: "440px", boxShadow: "0 0 60px rgba(99,255,180,0.06)", display: "flex", flexDirection: "column", gap: "24px", position: "relative", zIndex: 1 },
  header: { textAlign: "center" },
  logoMark: { fontSize: "32px", color: "#63ffb4", lineHeight: 1, marginBottom: "10px" },
  title: { margin: 0, fontSize: "22px", fontWeight: 700, color: "#e8ffe8", letterSpacing: "0.12em", textTransform: "uppercase" },
  subtitle: { margin: "4px 0 0", fontSize: "11px", color: "#63ffb4", letterSpacing: "0.2em", opacity: 0.6 },
  walletBlock: { display: "flex", alignItems: "center", gap: "12px", justifyContent: "center" },
  addressPill: { display: "flex", alignItems: "center", gap: "8px", background: "rgba(99,255,180,0.07)", border: "1px solid rgba(99,255,180,0.2)", borderRadius: "2px", padding: "6px 14px" },
  dot: { width: "7px", height: "7px", borderRadius: "50%", background: "#63ffb4", boxShadow: "0 0 6px #63ffb4", display: "inline-block", flexShrink: 0 },
  addressText: { fontSize: "13px", color: "#b4ffd9", letterSpacing: "0.05em" },
  qrPanel: { display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", padding: "20px", background: "rgba(99,255,180,0.03)", border: "1px solid rgba(99,255,180,0.1)", borderRadius: "4px" },
  qrLabel: { margin: 0, fontSize: "10px", letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(99,255,180,0.5)" },
  qrCanvas: { display: "block", borderRadius: "4px" },
  qrOverlay: { position: "absolute", inset: 0, background: "rgba(10,15,12,0.82)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px" },
  qrCheckmark: { fontSize: "48px", color: "#63ffb4", lineHeight: 1, textShadow: "0 0 20px #63ffb4" },
  scannedBadge: { fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#63ffb4", background: "rgba(99,255,180,0.1)", border: "1px solid rgba(99,255,180,0.25)", borderRadius: "2px", padding: "6px 16px" },
  btn: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, border: "none", borderRadius: "2px", cursor: "pointer", padding: "10px 22px", transition: "opacity 0.15s, box-shadow 0.15s" },
  btnPrimary: { background: "#63ffb4", color: "#050f09", boxShadow: "0 0 20px rgba(99,255,180,0.3)" },
  btnGhost: { background: "transparent", color: "#63ffb4", border: "1px solid rgba(99,255,180,0.3)" },
  btnScan: { background: "transparent", color: "#63ffb4", border: "1px dashed rgba(99,255,180,0.45)", padding: "9px 20px" },
  btnAttend: { background: "#63ffb4", color: "#050f09", padding: "14px", fontSize: "13px", boxShadow: "0 0 24px rgba(99,255,180,0.25)", width: "100%" },
  attendBlock: { display: "flex", flexDirection: "column", gap: "8px" },
  attendHint: { margin: 0, fontSize: "10px", textAlign: "center", color: "rgba(99,255,180,0.35)", letterSpacing: "0.1em" },
  mintProgress: { display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "rgba(255,210,80,0.07)", border: "1px solid rgba(255,210,80,0.2)", borderRadius: "2px" },
  mintStepText: { fontSize: "12px", color: "#ffd050", letterSpacing: "0.05em" },
  statusBar: { fontSize: "12px", padding: "10px 14px", borderRadius: "2px", display: "flex", alignItems: "center", gap: "8px" },
  status_success: { background: "rgba(99,255,180,0.08)", border: "1px solid rgba(99,255,180,0.25)", color: "#63ffb4" },
  status_error: { background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.25)", color: "#ff7070", wordBreak: "break-word" },
  status_loading: { background: "rgba(255,210,80,0.07)", border: "1px solid rgba(255,210,80,0.2)", color: "#ffd050" },
  spinner: { display: "inline-block", animation: "spin 1s linear infinite", fontSize: "14px", flexShrink: 0 },
  // NFT card
  nftCard: { background: "rgba(99,255,180,0.04)", border: "1px solid rgba(99,255,180,0.22)", borderRadius: "4px", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "10px" },
  nftCardHeader: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" },
  nftIcon: { fontSize: "20px", color: "#63ffb4" },
  nftTitle: { fontSize: "13px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#e8ffe8" },
  nftRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", fontSize: "11px", borderBottom: "1px solid rgba(99,255,180,0.06)", paddingBottom: "8px" },
  nftKey: { color: "rgba(99,255,180,0.45)", letterSpacing: "0.1em", flexShrink: 0 },
  nftVal: { color: "#b4ffd9" },
  nftLink: { color: "#63ffb4", textDecoration: "none", wordBreak: "break-all" },
  // Log
  logBox: { borderTop: "1px solid rgba(99,255,180,0.1)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "8px" },
  logTitle: { margin: 0, fontSize: "10px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(99,255,180,0.4)" },
  logRow: { display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "baseline", fontSize: "11px" },
  logTs: { color: "rgba(255,255,255,0.2)", flexShrink: 0 },
  logAction: { color: "#b4ffd9" },
  logDetail: { color: "rgba(255,255,255,0.35)", wordBreak: "break-all" },
};
