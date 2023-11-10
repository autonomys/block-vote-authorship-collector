import {ApiPromise, Keyring, WsProvider} from "@polkadot/api";
import * as fs from "fs/promises";
import {Struct, u64} from "@polkadot/types";
import {AccountId32, EventRecord, Header} from "@polkadot/types/interfaces";

const stopAtBlock = process.env.STOP_AT_BLOCK ? parseInt(process.env.STOP_AT_BLOCK, 10) : 0;
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
    readonly reward_address: AccountId32;
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
    const PIECE_SIZE = 1048672n;
    const MAX_PIECES_IN_SECTOR = 1000n;
    const NUM_CHUNKS = (2n ** 15n);
    const NUM_S_BUCKETS = (2n ** 16n);

    return Number(
        MAX_U64 * SLOT_PROBABILITY[0] / SLOT_PROBABILITY[1] 
        / (MAX_PIECES_IN_SECTOR * NUM_CHUNKS / NUM_S_BUCKETS)
        / solutionRange * PIECE_SIZE
    );
}

async function main(wsUrl: string, output: string) {
    const provider = new WsProvider(wsUrl);
    const api = await ApiPromise.create({
        provider,
        types,
    });
    const keyring = new Keyring({type: 'sr25519', ss58Format: 2254});

    const file = await fs.open(output, 'w');
    file.appendFile(
        `Block number,Authorship type,Slot,Plot public key,Reward address,Space according to consensus\n`,
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
        const publicKey = preRuntime.solution.public_key;
        const rewardAddress = preRuntime.solution.reward_address;
        const consensusSpace = solutionRangeToSpace(consensusSolutionRange);
        await file.appendFile(
            `${blockNumber},Block,${slot},${publicKey},${rewardAddress},${consensusSpace}\n`,
        );

        let events: Array<EventRecord> = await api.query.system.events.at(nextBlockHash);

        for (const record of events) {
            const event = record.event;

            if (event.section === 'subspace' && event.method === 'FarmerVote') {
                const [publicKey, rewardAddress, _height, _parentHash] = event.data;
                await file.appendFile(
                    `${blockNumber},Vote,${slot},${keyring.encodeAddress(publicKey as any)},${rewardAddress},${consensusSpace}\n`,
                );
            }
        }

        if (blockNumber === stopAtBlock) {
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
