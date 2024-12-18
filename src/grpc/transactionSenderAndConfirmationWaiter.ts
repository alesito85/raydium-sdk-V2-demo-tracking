import {
    BlockhashWithExpiryBlockHeight,
    Connection,
    TransactionExpiredBlockheightExceededError,
    VersionedTransactionResponse,
  } from '@solana/web3.js';
  import promiseRetry from 'promise-retry';
  import fs from 'fs';
  
  type TransactionSenderAndConfirmationWaiterArgs = {
    connectionUrl: string;
    serializedTransaction: Buffer;
    blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight;
  };
  
  const SEND_OPTIONS = {
    skipPreflight: true,
      // skipPreflight:      false,
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  
  export default async ({
    connectionUrl,
    serializedTransaction,
    blockhashWithExpiryBlockHeight,
  }: TransactionSenderAndConfirmationWaiterArgs): Promise<VersionedTransactionResponse | null> => {
    console.log({connectionUrl})
    const connection = new Connection(connectionUrl);
    console.log('initial send...')
    fs.appendFileSync('txStuff.log', 'initial send...' + '\n')
    fs.appendFileSync('txStuff.log', serializedTransaction.toString('hex') + '\n')
    const txid = await connection.sendRawTransaction(
      serializedTransaction,
      SEND_OPTIONS
    );
  
    const controller = new AbortController();
    const abortSignal = controller.signal;
  
    const abortableResender = async () => {
      while (true) {
        await sleep(250);
        if (abortSignal.aborted) return;
        try {
          console.log('sending...')
          fs.appendFileSync('txStuff.log', 'sending...' + '\n')
          await connection.sendRawTransaction(
            serializedTransaction,
            SEND_OPTIONS
          );
        } catch (e) {
          console.warn(`Failed to resend transaction: ${e}`);
        }
      }
    };
  
    try {
      abortableResender();
      const lastValidBlockHeight =
        blockhashWithExpiryBlockHeight.lastValidBlockHeight - 150;
  
      // this would throw TransactionExpiredBlockheightExceededError
      await Promise.race([
        connection.confirmTransaction(
          {
            ...blockhashWithExpiryBlockHeight,
            lastValidBlockHeight,
            signature: txid,
            abortSignal,
          },
          'confirmed'
        ),
        new Promise(async (resolve) => {
          // in case ws socket died
          while (!abortSignal.aborted) {
            await sleep(250);
            const tx = await connection.getSignatureStatus(txid, {
              searchTransactionHistory: false,
            });
            if (tx?.value?.confirmationStatus === 'confirmed') {
              resolve(tx);
            }
          }
        }),
      ]);
    } catch (e) {
      console.error(
        `Error while waiting for transaction ${txid} confirmation: ${e}`
      );
      if (e instanceof TransactionExpiredBlockheightExceededError) {
        // we consume this error and getTransaction would return null
        return null;
      } else {
        // invalid state from web3.js
        throw e;
      }
    } finally {
      controller.abort();
    }
  
    // in case rpc is not synced yet, we add some retries
    const response = promiseRetry(
      async (retry) => {
        const response = await connection.getTransaction(txid, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        if (!response) {
          retry(response);
        }
        return response;
      },
      {
        retries: 5,
        minTimeout: 1e3,
      }
    );
  
    return response;
  };
  