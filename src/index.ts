import {ApiPromise, WsProvider} from "@polkadot/api";
import * as fs from "fs/promises";
import {Struct, u64} from "@polkadot/types";
import {AccountId32, Header} from "@polkadot/types/interfaces";

const wsUrl = process.env.WS_URL;
const output = process.env.OUTPUT;

if (!wsUrl) {
    console.error('Specify `WS_URL` environment variable pointing to WebSocket RPC endpoint of Subspace chain');
    process.exit(1);
}

if (!output) {
    console.error('Specify `OUTPUT` environment variable with path to CSV file where results should be written');
    process.exit(2);
}

interface Solution extends Struct {
    readonly public_key: AccountId32;
    readonly reward_address?: AccountId32;
}

interface SubPreDigest extends Struct {
    readonly slot: u64;
    readonly solution: Solution;
}

const types = {
    // snapshot-2022-jan-05 doesn't have reward address
    Solution2022Jan02: {
        public_key: 'AccountId32',
    },
    SubPreDigest2022Jan02: {
        slot: 'u64',
        solution: 'Solution2022Jan02'
    },
    Solution: {
        public_key: 'AccountId32',
        reward_address: 'AccountId32'
    },
    SubPreDigest: {
        slot: 'u64',
        solution: 'Solution'
    }

}

async function main(wsUrl: string, output: string) {
    const provider = new WsProvider(wsUrl);
    const api = await ApiPromise.create({
        provider,
        types,
    });

    const genesisBlockHash = await api.rpc.chain.getBlockHash(0);
    // snapshot-2022-jan-05 doesn't have reward address
    const preDigestType =  genesisBlockHash.toHex() === '0x6ada0792ea62bf3501abc87d92e1ce0e78ddefba66f02973de54144d12ed0d38'
        ? 'SubPreDigest2022Jan02'
        : 'SubPreDigest';

    const file = await fs.open(output, 'w');
    file.appendFile(`Block number;Slot;Author;Reward address\n`);

    let nextBlockHash = await api.rpc.chain.getBlockHash();
    let processedBlocks = 0;
    while (true) {
        const header: Header = await api.rpc.chain.getHeader(nextBlockHash);
        nextBlockHash = header.parentHash;
        const preRuntime: SubPreDigest = api.registry.createType(
            preDigestType,
            header.digest.logs
                .find((digestItem) => digestItem.isPreRuntime)
                ?.asPreRuntime![1]
        )

        const blockNumber = header.number.toNumber();
        const slot = preRuntime.slot;
        const author = preRuntime.solution.public_key;
        const rewardAddress = preRuntime.solution.reward_address ?? author;
        await file.appendFile(`${blockNumber};${slot};${author};${rewardAddress}\n`);

        if (blockNumber === 0) {
            break;
        }

        processedBlocks++;

        if (processedBlocks % 1000 === 0) {
            console.log(`Processed ${processedBlocks} blocks`);
        }
    }

    await file.close();

    console.log('Finsihed successfully');

    process.exit(0);
}

main(wsUrl, output);
