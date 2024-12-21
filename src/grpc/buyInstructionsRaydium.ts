import dotenv from 'dotenv';
dotenv.config();

import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import {  createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, getAssociatedTokenAddress, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from 'bs58';
import transactionSenderAndConfirmationWaiter from './transactionSenderAndConfirmationWaiter';
import Redis from 'ioredis';
import { fetchRpcPoolInfo } from '../amm/fetchRpcPoolInfo';
import { initSdk, owner as raydiumOwner } from '../config';
import { ApiV3PoolInfoStandardItem } from '@raydium-io/raydium-sdk-v2';
import { JitoJsonRpcClient } from './JitoJsonRpcClient';

const r = new Redis();

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
const jitoClient = new JitoJsonRpcClient(process.env.JITO_RPC_URL || '', '');

const JITO_TIP_ACCOUNTS = [
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
]

const owners = JSON.parse(process.env.OWNERS || '{}');

// const ammX = new PublicKey('2TWiz99yLm54N4nRfHp69Y8jGHPoUXHbTw7w6eaajo2r');
const ammX = new PublicKey('EQQiG6yv5NJY3LzKYmSsXCvHwGEQ1AkPSiPzvUTVijUF');
const mintX = new PublicKey('9zd2Y2kgCHS1zrvvwr8G4ktjDbVFzEzYDKNW1ZB4pump');

export const executeBuys = async (amm: PublicKey, mint: PublicKey, poolKeys: any) => {
  console.log('incoming parameters:', amm.toBase58(), mint.toBase58());
  const recentBlockhash = await r.get('recentBlockhash') || '';
  const lastValidBlockHeight = parseInt(await r.get('lastValidBlockHeight') || '0');
  const raydiumV4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
  const raydiumAuthorityV4 = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');
  const serumProgram = new PublicKey('srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX');
  const pool1TokenAccount = new PublicKey(poolKeys.vault.A);
  const pool2TokenAccount = new PublicKey(poolKeys.vault.B);

  const txs: string[] = [];
  let first = true;
  let txBuilder = new Transaction();
  let ownerI = 0;
  for (; ownerI < Object.keys(owners).length; ownerI++) {
    if (ownerI % 5 == 0) {
      if (txBuilder.instructions.length > 0) {
        for (let i = ownerI - 5; i < ownerI; i++) {
          console.log('Signing with:', i, Object.keys(owners)[i]);
          txBuilder.partialSign(Keypair.fromSecretKey(bs58.decode(Object.keys(owners)[i])));
        }
        console.log('interim txBuilder:', txBuilder.instructions.length, txBuilder.signatures.length, txBuilder);
        txs.push(txBuilder.serialize().toString('base64'));
      }
      txBuilder = new Transaction();
    }
    const owner = Object.keys(owners)[ownerI];
    try {
      const userOwner = Keypair.fromSecretKey(bs58.decode(owner));
      console.log('owner:', ownerI, userOwner.publicKey.toBase58());
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
      
      if (first) {
        const currentJitoTipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Date.now() % JITO_TIP_ACCOUNTS.length]);
        txBuilder.add(
          SystemProgram.transfer({
            fromPubkey: userOwner.publicKey,
            toPubkey: currentJitoTipAccount,
            lamports: parseInt(process.env.JITO_FEE || '50000')
          })
        )
        first = false;
        txBuilder.add(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: BigInt(process.env.PRIORITY_FEE || '5000'),
          })
        );
      }
      
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
      data.writeBigUInt64LE(BigInt(owners[owner]), 1);
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
            { pubkey: new PublicKey(poolKeys.openOrders), isSigner: false, isWritable: true }, // Open orders
            { pubkey: new PublicKey(poolKeys.targetOrders), isSigner: false, isWritable: true }, // Target orders
            { pubkey: new PublicKey(pool1TokenAccount), isSigner: false, isWritable: true }, // Pool coin token account
            { pubkey: new PublicKey(pool2TokenAccount), isSigner: false, isWritable: true }, // Pool pc token account
            { pubkey: serumProgram, isSigner: false, isWritable: false }, // Serum program
            { pubkey: new PublicKey(poolKeys.marketId), isSigner: false, isWritable: true }, // Serum market
            { pubkey: new PublicKey(poolKeys.marketBids), isSigner: false, isWritable: true }, // Serum bids
            { pubkey: new PublicKey(poolKeys.marketAsks), isSigner: false, isWritable: true }, // Serum asks
            { pubkey: new PublicKey(poolKeys.marketEventQueue), isSigner: false, isWritable: true }, // Serum event queue
            { pubkey: new PublicKey(poolKeys.marketBaseVault), isSigner: false, isWritable: true }, // Serum coin vault account
            { pubkey: new PublicKey(poolKeys.marketQuoteVault), isSigner: false, isWritable: true }, // Serum pc vault account
            { pubkey: new PublicKey(poolKeys.marketAuthority), isSigner: false, isWritable: true }, // Serum vault signer
            { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true }, // User source token account
            { pubkey: userDestTokenAccount, isSigner: false, isWritable: true }, // User dest token account
            { pubkey: userOwner.publicKey, isSigner: true, isWritable: true }, // User owner
          ],
          // keys: poolKeys,
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
      console.log({userOwner}, userOwner.publicKey);
      // txBuilder.sign(userOwner);


      // const transaction = await createTransaction(connection, txBuilder.instructions, userOwner.publicKey);
      // const signature = await sendAndConfirmTransactionWrapper(connection, transaction, [userOwner]);
      // transaction.recentBlockhash = blockhashWithExpiryBlockHeight.blockhash;
      // transaction.lastValidBlockHeight = blockhashWithExpiryBlockHeight.lastValidBlockHeight;
      // transaction.sign(userOwner);
      // const serializedTx = txBuilder.serialize().toString('base64');
      // console.log(owner, `Sending transaction...`, serializedTx);
      // // // // // return serializedTx;
      // const signature = await transactionSenderAndConfirmationWaiter({
      //   connectionUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      //   // serializedTransaction: transaction.serialize(),
      //   serializedTransaction: txBuilder.serialize(),
      //   blockhashWithExpiryBlockHeight: {
      //     blockhash: recentBlockhash,
      //     lastValidBlockHeight: lastValidBlockHeight + 300,
      //   },
      // });
      // console.log(owner, `Tx confirmed with signature: ${JSON.stringify(signature)}`)
    } catch (err) {
      console.error(owner, 'Failed', err);
    }
  }
  if (txBuilder.instructions.length > 0) {
    for (let i = ownerI - ownerI % 5; i < ownerI; i++) {
      console.log('Signing with:', i, Object.keys(owners)[i]);
      txBuilder.partialSign(Keypair.fromSecretKey(bs58.decode(Object.keys(owners)[i])));
    }
    console.log('final txBuilder:', txBuilder.instructions.length, txBuilder.signatures.length, txBuilder);
    txs.push(txBuilder.serialize().toString('base64'));
  }
  console.log('serialized txs for bundling:', txs);
  return txs;
};

(async () => {
  const raydium = await initSdk(raydiumOwner, { loadToken: true });
  const poolId = ammX.toBase58();
  const poolKeys = await raydium.liquidity.getAmmPoolKeys(poolId)
  const rpcData = await raydium.liquidity.getRpcPoolInfo(poolId)
  const data = await raydium.api.fetchPoolById({ ids: poolId })
  const poolInfo = data[0] as ApiV3PoolInfoStandardItem
  console.log({poolKeys})
  console.log({rpcData})
  console.log({poolInfo})
  // if (1 < 2) process.exit()
  connection.getLatestBlockhash().then(
    async (latestInfo) => {
      await r.set('recentBlockhash', latestInfo.blockhash);
      await r.set('lastValidBlockHeight', latestInfo.lastValidBlockHeight);
      executeBuys(ammX, mintX, poolKeys).then(
        async (serializedTxsForBundling) => {
          console.log('prepare the following serialized txs for bundling:', serializedTxsForBundling);
          const bundle: any[] = [
            // [base58.encode(launchTokenTx.transaction.serialize())],
            serializedTxsForBundling,
            {
                encoding: 'base64',
            }
          ];
          console.log('Bundle to send:', bundle);
          const bundleResponse = await jitoClient.sendBundle(bundle);
          console.log('Bundle response:', bundleResponse, JSON.stringify(bundleResponse, Object.getOwnPropertyNames(bundleResponse)));
          let count = 25;
          while (count-- > 0) {
            const bundleStatusResponse = await jitoClient.getBundleStatuses([[bundleResponse.result]]);
            console.log('Bundle status response:', bundleStatusResponse, JSON.stringify(bundleStatusResponse, Object.getOwnPropertyNames(bundleStatusResponse)));
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }

        }
      ).catch((err) => {
        console.error(JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
      });
    }
  );
})();