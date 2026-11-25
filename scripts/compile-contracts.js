import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const contractPath = path.join(rootDir, 'contracts', 'TrustWorkProtocol.sol');
const outDir = path.join(rootDir, 'contracts', 'artifacts');

export function compileTrustWorkContract() {
  const source = fs.readFileSync(contractPath, 'utf8');
  const input = {
    language: 'Solidity',
    sources: {
      'TrustWorkProtocol.sol': { content: source },
    },
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun',
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const fatal = output.errors.filter((e) => e.severity === 'error');
    for (const err of output.errors) {
      console.error(err.formattedMessage);
    }
    if (fatal.length > 0) {
      throw new Error(`Solidity compilation failed with ${fatal.length} error(s)`);
    }
  }

  const compiled = output.contracts['TrustWorkProtocol.sol']['TrustWorkProtocol'];
  const artifact = {
    contractName: 'TrustWorkProtocol',
    compilerVersion: solc.version(),
    compiledAt: new Date().toISOString(),
    abi: compiled.abi,
    bytecode: '0x' + compiled.evm.bytecode.object,
    deployedBytecode: '0x' + compiled.evm.deployedBytecode.object,
  };

  fs.mkdirSync(outDir, { recursive: true });
  const artifactPath = path.join(outDir, 'TrustWorkProtocol.json');
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`[solc] Compiled TrustWorkProtocol.sol -> ${artifactPath}`);
  return artifact;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  compileTrustWorkContract();
}
