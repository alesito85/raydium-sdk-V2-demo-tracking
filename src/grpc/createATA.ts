import dotenv from 'dotenv';
dotenv.config();

import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotent, createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, getAssociatedTokenAddress, NATIVE_MINT } from "@solana/spl-token";
import bs58 from 'bs58';

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');

const owners = JSON.parse(process.env.OWNERS || '{}');

const main = async () => {
  await Promise.all(
    Object.keys(owners).map(async (owner) => {
      try {
        const userOwner = Keypair.fromSecretKey(bs58.decode(owner || ''));
        // const userSourceTokenAccount = await getAssociatedTokenAddress(
        //   new PublicKey('rizo34MUwbCBqpSTSfnEktdWB4CTByqqYh8zBxL3WAR'),
        //   userOwner.publicKey,
        //   false
        // );

        // console.log(owner, {userOwner, userSourceTokenAccount})
        // Uncomment if needed to create first
        const createATA = await createAssociatedTokenAccountIdempotent(
          connection,
          userOwner,
          // Swap to NATIVE_MINT if required for WSOL
          new PublicKey('rizo34MUwbCBqpSTSfnEktdWB4CTByqqYh8zBxL3WAR'),
          userOwner.publicKey
        );
        console.log(owner, {createATA})
        
        // const transfer = SystemProgram.transfer({
        //   fromPubkey: userOwner.publicKey,
        //   toPubkey: userSourceTokenAccount,
        //   lamports: BigInt(owners[owner])// + 2_039_280
        // });
        // const tx = new Transaction().add(transfer, createSyncNativeInstruction(userSourceTokenAccount));
        // const recentBlockhash = await connection.getLatestBlockhash();
        // tx.recentBlockhash = recentBlockhash.blockhash;
        // tx.feePayer = userOwner.publicKey;
        // tx.lastValidBlockHeight = recentBlockhash.lastValidBlockHeight + 300;
        // // tx.sign(userOwner);
        // const transferSig = await connection.sendTransaction(tx, [userOwner]);
        // console.log(owner, transferSig)
      } catch (err) {
        console.error(owner, err);
      }
    })
  );
}

main().then(
  () => {
    console.log('done');
  }
).catch((err) => {
  console.error(JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
});
