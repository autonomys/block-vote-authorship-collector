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
    Solution: {
        public_key: 'AccountId32',
        reward_address: 'AccountId32',
    },
    SubPreDigest: {
        slot: 'u64',
        solution: 'Solution',
    }

}

function solutionRangeToSpace(solutionRange: bigint): number {
    const MAX_U64 = (2n ** 64n) - 1n;
    const SLOT_PROBABILITY = [1n, 6n];
    const PIECE_SIZE = 4096n;

    return Number(
        MAX_U64 * SLOT_PROBABILITY[0] / SLOT_PROBABILITY[1] / solutionRange * PIECE_SIZE
    );
}

async function main(wsUrl: string, output: string) {
    const provider = new WsProvider(wsUrl);
    const api = await ApiPromise.create({
        provider,
        types,
    });

    const file = await fs.open(output, 'w');
    file.appendFile(
        `Block number,Slot,Author,Reward address,Space according to consensus\n`,
    );

    let nextBlockHash = await api.rpc.chain.getBlockHash();
    let processedBlocks = 0;
    while (true) {
        const header: Header = await api.rpc.chain.getHeader(nextBlockHash);

        const preRuntime: SubPreDigest = api.registry.createType(
            'SubPreDigest',
            header.digest.logs
                .find((digestItem) => digestItem.isPreRuntime)
                ?.asPreRuntime![1]
        );
        const consensusSolutionRange = (await api.query.subspace.solutionRanges.at(nextBlockHash) as any).current.toBigInt();

        const blockNumber = header.number.toNumber();
        const slot = preRuntime.slot;
        const author = preRuntime.solution.public_key;
        const rewardAddress = preRuntime.solution.reward_address ?? author;
        const consensusSpace = solutionRangeToSpace(consensusSolutionRange);
        await file.appendFile(
            `${blockNumber},${slot},${author},${rewardAddress},${consensusSpace}\n`,
        );

        if (blockNumber === 0) {
            break;
        }

        processedBlocks++;

        if (processedBlocks % 1000 === 0) {
            console.log(`Processed ${processedBlocks} blocks`);
        }

        nextBlockHash = header.parentHash;
    }

    await file.close();

    console.log('Finsihed successfully');

    process.exit(0);
}

main(wsUrl, output);
