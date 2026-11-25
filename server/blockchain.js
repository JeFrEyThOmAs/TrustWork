import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlock } from '@ethereumjs/block';
import { Common, Hardfork, Mainnet } from '@ethereumjs/common';
import { createLegacyTx } from '@ethereumjs/tx';
import {
  bytesToHex,
  createAccount,
  createAddressFromPrivateKey,
  createAddressFromString,
  hexToBytes,
} from '@ethereumjs/util';
import { createVM, runTx } from '@ethereumjs/vm';
import { ethers } from 'ethers';
import { compileTrustWorkContract } from '../scripts/compile-contracts.js';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = path.resolve(__dirname, '..', 'contracts', 'artifacts', 'TrustWorkProtocol.json');

// Deterministic Registrar / Relayer key for submitting dual-signed meta-transactions
const REGISTRAR_PRIV_KEY_HEX =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

class EmbeddedTrustWorkChain {
  constructor() {
    this.vm = null;
    this.common = null;
    this.iface = null;
    this.artifact = null;
    this.contractAddress = null;
    this.registrarKeyBytes = hexToBytes(REGISTRAR_PRIV_KEY_HEX);
    this.registrarAddress = createAddressFromPrivateKey(this.registrarKeyBytes);
    this.blockNumber = 0n;
    this.nonce = 0n;
    this.chainId = 31337;
    this.initialized = false;
    this._txLock = Promise.resolve();
  }

  async init() {
    if (this.initialized) return this;

    if (fs.existsSync(artifactPath)) {
      this.artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    } else {
      this.artifact = compileTrustWorkContract();
    }

    this.iface = new ethers.Interface(this.artifact.abi);
    this.common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });
    this.vm = await createVM({ common: this.common });

    // Fund registrar with 10,000 ETH for gas
    await this.vm.stateManager.putAccount(
      this.registrarAddress,
      createAccount({
        nonce: 0n,
        balance: 10000n * 10n ** 18n,
      })
    );

    // Deploy TrustWorkProtocol.sol at Block #1
    const deployReceipt = await this._executeRawTx({
      to: undefined,
      dataHex: this.artifact.bytecode,
      timestampSec: Math.floor(Date.now() / 1000) - 86400,
    });

    this.contractAddress = deployReceipt.createdAddress;

    // Replay persisted journal entries to restore exact on-chain state
    const journalRows = db
      .prepare('SELECT seq, method, args_json, timestamp_sec FROM evm_journal ORDER BY seq ASC')
      .all();

    for (const row of journalRows) {
      const args = JSON.parse(row.args_json);
      const calldata = this.iface.encodeFunctionData(row.method, args);
      await this._executeRawTx({
        to: createAddressFromString(this.contractAddress),
        dataHex: calldata,
        timestampSec: row.timestamp_sec,
      });
    }

    this.initialized = true;
    return this;
  }

  async _executeRawTx({ to, dataHex, timestampSec }) {
    const prevBlockNumber = this.blockNumber;

    await this.vm.stateManager.checkpoint();
    try {
      const senderAccount = await this.vm.stateManager.getAccount(this.registrarAddress);
      const currentNonce = senderAccount ? senderAccount.nonce : 0n;

      this.blockNumber += 1n;
      const tx = createLegacyTx(
        {
          nonce: currentNonce,
          gasPrice: 10_000_000_000n,
          gasLimit: 8_000_000n,
          to,
          value: 0n,
          data: hexToBytes(dataHex),
        },
        { common: this.common }
      ).sign(this.registrarKeyBytes);

      const block = createBlock(
        {
          header: {
            number: this.blockNumber,
            timestamp: BigInt(timestampSec || Math.floor(Date.now() / 1000)),
            gasLimit: 30_000_000n,
            baseFeePerGas: 7n,
            excessBlobGas: 0n,
          },
        },
        { common: this.common }
      );

      const result = await runTx(this.vm, {
        tx,
        block,
        skipBlockGasLimitValidation: true,
        skipHardForkValidation: true,
      });

      if (result.execResult.exceptionError) {
        let decodedReason = result.execResult.exceptionError.error;
        const returnBytes = result.execResult.returnValue;
        if (returnBytes && returnBytes.length >= 4) {
          const returnHex = bytesToHex(returnBytes);
          try {
            const parsedErr = this.iface.parseError(returnHex);
            if (parsedErr) {
              decodedReason = parsedErr.name;
            }
          } catch {
            if (returnHex.startsWith('0x08c379a0')) {
              try {
                const [msg] = ethers.AbiCoder.defaultAbiCoder().decode(
                  ['string'],
                  '0x' + returnHex.slice(10)
                );
                decodedReason = msg;
              } catch {
                // ignore
              }
            }
          }
        }
        const err = new Error(`Smart Contract Reverted: ${decodedReason}`);
        err.revertName = decodedReason;
        throw err;
      }

      await this.vm.stateManager.commit();

      return {
        txHash: bytesToHex(tx.hash()),
        blockNumber: Number(this.blockNumber),
        gasUsed: Number(result.totalGasSpent),
        createdAddress: result.createdAddress ? result.createdAddress.toString() : null,
        returnValueHex: bytesToHex(result.execResult.returnValue),
      };
    } catch (err) {
      await this.vm.stateManager.revert();
      this.blockNumber = prevBlockNumber;
      throw err;
    }
  }

  sendTx(method, args, { actorAddress, summary, referenceId, timestampSec } = {}) {
    const run = async () => {
      await this.init();
      const ts = timestampSec || Math.floor(Date.now() / 1000);
      const calldata = this.iface.encodeFunctionData(method, args);
      const receipt = await this._executeRawTx({
        to: createAddressFromString(this.contractAddress),
        dataHex: calldata,
        timestampSec: ts,
      });

      db.prepare(
        `INSERT INTO evm_journal (method, args_json, timestamp_sec, tx_hash, block_number)
         VALUES (?, ?, ?, ?, ?)`
      ).run(method, JSON.stringify(args), ts, receipt.txHash, receipt.blockNumber);

      db.prepare(
        `INSERT OR REPLACE INTO chain_transactions
         (tx_hash, block_number, method, actor_address, contract_address, gas_used, summary, reference_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        receipt.txHash,
        receipt.blockNumber,
        method,
        actorAddress || this.registrarAddress.toString(),
        this.contractAddress,
        receipt.gasUsed,
        summary || `${method}()`,
        referenceId || null,
        new Date(ts * 1000).toISOString()
      );

      return receipt;
    };

    const next = this._txLock.then(run, run);
    this._txLock = next.catch(() => {});
    return next;
  }

  async callView(method, args = []) {
    await this.init();
    const calldata = this.iface.encodeFunctionData(method, args);
    const callRes = await this.vm.evm.runCall({
      to: createAddressFromString(this.contractAddress),
      caller: this.registrarAddress,
      origin: this.registrarAddress,
      data: hexToBytes(calldata),
      gasLimit: 5_000_000n,
    });

    if (callRes.execResult.exceptionError) {
      throw new Error(`View call ${method} reverted: ${callRes.execResult.exceptionError.error}`);
    }

    const hexOut = bytesToHex(callRes.execResult.returnValue);
    return this.iface.decodeFunctionResult(method, hexOut);
  }

  async getChainStatus() {
    await this.init();
    const [totalIdentities, totalAgreements, totalCredentials] = await this.callView(
      'getProtocolStats'
    );
    return {
      networkName: 'TrustWork Consensus EVM (Cancun)',
      chainId: this.chainId,
      contractAddress: this.contractAddress,
      registrarAddress: ethers.getAddress(this.registrarAddress.toString()),
      blockNumber: Number(this.blockNumber),
      compilerVersion: this.artifact.compilerVersion,
      onChainCounts: {
        identities: Number(totalIdentities),
        agreements: Number(totalAgreements),
        credentials: Number(totalCredentials),
      },
    };
  }
}

export const chain = new EmbeddedTrustWorkChain();
