/**
 * mintAttendanceNFT.js
 *
 * Mints a Metaplex Token-Metadata NFT (non-fungible, supply=1) to the
 * connected Phantom wallet on Devnet.
 *
 * Stack:
 *   @solana/web3.js               — transactions, accounts
 *   @solana/spl-token             — Mint + ATA creation
 *   @metaplex-foundation/mpl-token-metadata — on-chain metadata program
 *
 * No Node-only libs; works in Vite browser builds.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getMinimumBalanceForRentExemptMint,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
} from "@solana/spl-token";

import {
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
  createCreateMetadataAccountV3Instruction,
  createCreateMasterEditionV3Instruction,
} from "@metaplex-foundation/mpl-token-metadata";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Derive the Metadata PDA for a given mint */
async function getMetadataPDA(mint) {
  const [pda] = await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

/** Derive the Master Edition PDA for a given mint */
async function getMasterEditionPDA(mint) {
  const [pda] = await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from("edition"),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Build a data-URI that acts as the NFT's off-chain JSON metadata.
 * In production you'd upload this to Arweave / IPFS and use that URI.
 */
function buildMetadataUri(eventId) {
  const json = {
    name: "Event Attendance",
    symbol: "ATTEND",
    description: `Proof of attendance for event ${eventId}`,
    image: "https://placehold.co/400x400/0a0f0c/63ffb4?text=ATTEND",
    attributes: [
      { trait_type: "Event ID",  value: eventId },
      { trait_type: "Network",   value: "Solana Devnet" },
      { trait_type: "Timestamp", value: new Date().toISOString() },
    ],
    properties: {
      category: "image",
      creators: [],
    },
  };
  // data URIs work fine as metadata URIs on Devnet
  return "data:application/json;base64," + btoa(JSON.stringify(json));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main mint function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mint an attendance NFT.
 *
 * @param {Connection}  connection  — Solana RPC connection
 * @param {object}      provider    — Phantom wallet provider (window.solana)
 * @param {string}      walletAddr  — connected wallet public key (string)
 * @param {string}      eventId     — e.g. "EVENT123"
 * @param {Function}    onStep      — callback(string) for UI progress updates
 * @returns {{ mintAddress: string, txSignature: string }}
 */
export async function mintAttendanceNFT(connection, provider, walletAddr, eventId, onStep) {
  const walletPubkey = new PublicKey(walletAddr);

  // ── 1. Generate a fresh Mint keypair ──────────────────────────────────────
  onStep("Generating mint keypair…");
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  // ── 2. Derive PDAs ────────────────────────────────────────────────────────
  onStep("Deriving metadata & edition PDAs…");
  const metadataPDA     = await getMetadataPDA(mint);
  const masterEditionPDA = await getMasterEditionPDA(mint);
  const ata              = await getAssociatedTokenAddress(mint, walletPubkey);

  // ── 3. Calculate rent ─────────────────────────────────────────────────────
  const mintRentLamports = await getMinimumBalanceForRentExemptMint(connection);

  // ── 4. Build the transaction ──────────────────────────────────────────────
  onStep("Building transaction…");

  const metadataUri = buildMetadataUri(eventId);

  const tx = new Transaction();

  // 4a. Create Mint account
  tx.add(
    SystemProgram.createAccount({
      fromPubkey:           walletPubkey,
      newAccountPubkey:     mint,
      space:                MINT_SIZE,
      lamports:             mintRentLamports,
      programId:            TOKEN_PROGRAM_ID,
    })
  );

  // 4b. Init Mint (0 decimals = NFT)
  tx.add(
    createInitializeMintInstruction(
      mint,           // mint account
      0,              // decimals
      walletPubkey,   // mint authority
      walletPubkey,   // freeze authority
      TOKEN_PROGRAM_ID
    )
  );

  // 4c. Create Associated Token Account for the wallet
  tx.add(
    createAssociatedTokenAccountInstruction(
      walletPubkey,   // payer
      ata,            // ata address
      walletPubkey,   // owner
      mint            // mint
    )
  );

  // 4d. Mint exactly 1 token into the ATA
  tx.add(
    createMintToInstruction(
      mint,
      ata,
      walletPubkey,   // mint authority
      1               // amount
    )
  );

  // 4e. Create on-chain Metadata account (Metaplex Token Metadata v3)
  tx.add(
    createCreateMetadataAccountV3Instruction(
      {
        metadata:                metadataPDA,
        mint:                    mint,
        mintAuthority:           walletPubkey,
        payer:                   walletPubkey,
        updateAuthority:         walletPubkey,
      },
      {
        createMetadataAccountArgsV3: {
          data: {
            name:                  "Event Attendance",
            symbol:                "ATTEND",
            uri:                   metadataUri,
            sellerFeeBasisPoints:  0,
            creators:              null,
            collection:            null,
            uses:                  null,
          },
          isMutable:     true,
          collectionDetails: null,
        },
      }
    )
  );

  // 4f. Create Master Edition (enforces supply = 1, making it a true NFT)
  tx.add(
    createCreateMasterEditionV3Instruction(
      {
        edition:         masterEditionPDA,
        mint:            mint,
        updateAuthority: walletPubkey,
        mintAuthority:   walletPubkey,
        payer:           walletPubkey,
        metadata:        metadataPDA,
      },
      {
        createMasterEditionArgs: {
          maxSupply: 0, // 0 = unique (no prints)
        },
      }
    )
  );

  // ── 5. Set fee payer & recent blockhash ───────────────────────────────────
  onStep("Fetching latest blockhash…");
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer        = walletPubkey;

  // ── 6. Partial-sign with the ephemeral mint keypair ───────────────────────
  // (Phantom will add the wallet signature)
  tx.partialSign(mintKeypair);

  // ── 7. Ask Phantom to sign & send ─────────────────────────────────────────
  onStep("Waiting for wallet signature…");
  const signed = await provider.signTransaction(tx);

  onStep("Sending transaction…");
  const rawTx = signed.serialize();
  const txSignature = await connection.sendRawTransaction(rawTx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  // ── 8. Confirm ────────────────────────────────────────────────────────────
  onStep("Confirming on-chain…");
  await connection.confirmTransaction(
    { signature: txSignature, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return {
    mintAddress:  mint.toString(),
    txSignature,
  };
}
