import dotenv from 'dotenv';
dotenv.config();

import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {  createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, getAssociatedTokenAddress, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from 'bs58';
import transactionSenderAndConfirmationWaiter from './transactionSenderAndConfirmationWaiter';
import Redis from 'ioredis';

const r = new Redis();

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');

const owners = JSON.parse(process.env.OWNERS || '{}');

const ammX = new PublicKey('2TWiz99yLm54N4nRfHp69Y8jGHPoUXHbTw7w6eaajo2r');
const pool1TokenAccountX = new PublicKey('8d1c8USWTHAkQmLwnqtZqBWVWiv3ytdWE7vpNqds6itE');
const pool2TokenAccountX = new PublicKey('4yDXrqGHZJbaqYPgNzpCKok35Vzw3cBNwkHPXUCCefLE');
const mintX = new PublicKey('oRAiff7Q7iQW384HEv6Kg8MJLn1MCNggT37wNVURGmD');

export const executeBuys = async (amm: PublicKey, pool1TokenAccount: PublicKey, pool2TokenAccount: PublicKey, mint: PublicKey) => {
  console.log('incoming parameters:', amm.toBase58(), pool1TokenAccount.toBase58(), pool2TokenAccount.toBase58(), mint.toBase58());
  const recentBlockhash = await r.get('recentBlockhash') || '';
  const lastValidBlockHeight = parseInt(await r.get('lastValidBlockHeight') || '0');
  const raydiumV4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
  const raydiumAuthorityV4 = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');
  const serumProgram = new PublicKey('srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX');

  await Promise.all(
    Object.keys(owners).map(async (owner) => {
      try {
        const userOwner = Keypair.fromSecretKey(bs58.decode(owner));
        const pool1SourceTokenAccount = await getAssociatedTokenAddress(
          NATIVE_MINT,
          pool1TokenAccount,
          true
        );
        const pool2DestTokenAccount = await getAssociatedTokenAddress(
          mint,
          pool2TokenAccount,
          true
        );
        const userSourceTokenAccount = await getAssociatedTokenAddress(
          NATIVE_MINT,
          userOwner.publicKey,
          false
        );
        const userDestTokenAccount = await getAssociatedTokenAddress(
          mint,
          userOwner.publicKey,
          false
        );
        
        
        // const transfer = SystemProgram.transfer({
        //   fromPubkey: userOwner.publicKey,
        //   toPubkey: userSourceTokenAccount,
        //   lamports: 1_000// + 2_039_280
        // });
        // const tx = new Transaction().add(transfer);
        // const recentBlockhash = await connection.getLatestBlockhash();
        // tx.recentBlockhash = recentBlockhash.blockhash;
        // tx.feePayer = userOwner.publicKey;
        // tx.lastValidBlockHeight = recentBlockhash.lastValidBlockHeight + 300;
        // tx.sign(userOwner);
        // const transferSig = await connection.sendTransaction(tx, [userOwner]);
        // console.log(transferSig)

        const txBuilder = new Transaction();
        txBuilder.add(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: BigInt(process.env.PRIORITY_FEE || '5000'),
          })
        );
        
        txBuilder.add(
          createAssociatedTokenAccountIdempotentInstruction(
              userOwner.publicKey,
              pool1SourceTokenAccount,
              pool1TokenAccount,
              NATIVE_MINT
          )
        );
        txBuilder.add(
          createAssociatedTokenAccountIdempotentInstruction(
              userOwner.publicKey,
              pool2DestTokenAccount,
              pool2TokenAccount,
              mint
          )
        );
        txBuilder.add(
          createAssociatedTokenAccountIdempotentInstruction(
              userOwner.publicKey,
              userDestTokenAccount,
              userOwner.publicKey,
              mint
          ),
          createSyncNativeInstruction(userSourceTokenAccount),
        );
        
        

        const data = Buffer.from(new Uint8Array(1 + 8 + 8));
        data.writeUint8(9, 0);
        data.writeBigUInt64LE(BigInt(1), 1);
        data.writeBigUInt64LE(BigInt(0), 9);
        // console.log(owner, data)
        // console.log(owner, data.toString('hex'))

        txBuilder.add(
          new TransactionInstruction({
            programId: raydiumV4,
            keys: [
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
              { pubkey: amm, isSigner: false, isWritable: true },
              { pubkey: raydiumAuthorityV4, isSigner: false, isWritable: false },
              { pubkey: amm, isSigner: false, isWritable: true },
              { pubkey: amm, isSigner: false, isWritable: true },
              { pubkey: pool1TokenAccount, isSigner: false, isWritable: true },
              { pubkey: pool2TokenAccount, isSigner: false, isWritable: true },
              { pubkey: serumProgram, isSigner: false, isWritable: false },
              { pubkey: amm, isSigner: false, isWritable: true },
              { pubkey: amm, isSigner: false, isWritable: true },
              { pubkey: amm, isSigner: false, isWritable: true },
              { pubkey: amm, isSigner: false, isWritable: true },
              { pubkey: amm, isSigner: false, isWritable: true },
              { pubkey: amm, isSigner: false, isWritable: true },
              { pubkey: amm, isSigner: false, isWritable: true },
              { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true },
              { pubkey: userDestTokenAccount, isSigner: false, isWritable: true },
              { pubkey: userOwner.publicKey, isSigner: true, isWritable: true },
            ],
            // data: Buffer.concat([
            //   Buffer.from(Uint8Array.of(9)),
            //   bufferFromUInt64(1),
            //   bufferFromUInt64(1),
            // ])
            data,
          })
        );
        // console.log(owner, txBuilder.instructions[txBuilder.instructions.length - 1].data);
        // console.log(owner, txBuilder.instructions[txBuilder.instructions.length - 1].data.toString('hex'));
        // if (1 < 2) process.exit()
        // console.log(owner, JSON.stringify(txBuilder.instructions, null, 2))
          // process.exit()
        // txBuilder.sign(userOwner);
        // const blockhashWithExpiryBlockHeight = await connection.getLatestBlockhash();
        txBuilder.recentBlockhash = recentBlockhash;
        txBuilder.lastValidBlockHeight = lastValidBlockHeight + 300;
        txBuilder.feePayer = userOwner.publicKey;
        txBuilder.sign(userOwner);


        // const transaction = await createTransaction(connection, txBuilder.instructions, userOwner.publicKey);
        // const signature = await sendAndConfirmTransactionWrapper(connection, transaction, [userOwner]);
        // transaction.recentBlockhash = blockhashWithExpiryBlockHeight.blockhash;
        // transaction.lastValidBlockHeight = blockhashWithExpiryBlockHeight.lastValidBlockHeight;
        // transaction.sign(userOwner);
        console.log(owner, `Sending transaction...`);
        const signature = await transactionSenderAndConfirmationWaiter({
          connectionUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
          // serializedTransaction: transaction.serialize(),
          serializedTransaction: txBuilder.serialize(),
          blockhashWithExpiryBlockHeight: {
            blockhash: recentBlockhash,
            lastValidBlockHeight: lastValidBlockHeight + 300,
          },
        });
        console.log(owner, `Tx confirmed with signature: ${JSON.stringify(signature)}`)
      } catch (err) {
        console.error(owner, err);
      }
    })
  );
};

// connection.getLatestBlockhash().then(
//   (latestInfo) => {
//     executeBuys(ammX, pool1TokenAccountX, pool2TokenAccountX, mintX, latestInfo.blockhash, latestInfo.lastValidBlockHeight).then(
//       () => {
//         console.log('done');
//       }
//     ).catch((err) => {
//       console.error(JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
//     });
//   }
// );