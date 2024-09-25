import { ApiPromise, WsProvider } from '@polkadot/api';
import * as fs from 'fs/promises';
import { Struct, u64 } from '@polkadot/types';
import { AccountId32, EventRecord, Header } from '@polkadot/types/interfaces';

const stopAtBlock = process.env.STOP_AT_BLOCK ? parseInt(process.env.STOP_AT_BLOCK, 10) : 0;
const startAtBlock = process.env.START_AT_BLOCK ? parseInt(process.env.START_AT_BLOCK, 10) : 0;
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
    },
};

async function main(wsUrl: string, output: string) {
    const provider = new WsProvider(wsUrl);
    const api = await ApiPromise.create({
        provider,
        types,
    });
    const file = await fs.open(output, 'w');
    file.appendFile(`block_number,author_type,reward_address\n`);

    let nextBlockHash = await api.rpc.chain.getBlockHash(startAtBlock);
    console.log(`Starting from block ${startAtBlock}`);
    let processedBlocks = 0;
    while (true) {
        const header: Header = await api.rpc.chain.getHeader(nextBlockHash);

        const preRuntime: SubPreDigest = api.registry.createType(
            'SubPreDigest',
            header.digest.logs.find(digestItem => digestItem.isPreRuntime)?.asPreRuntime![1]
        );

        const blockNumber = header.number.toNumber();
        const rewardAddress = preRuntime.solution.reward_address;
        await file.appendFile(`${blockNumber},block,${rewardAddress}\n`);

        let events: Array<EventRecord> = await api.query.system.events.at(nextBlockHash);

        for (const record of events) {
            const event = record.event;

            if (event.section === 'subspace' && event.method === 'FarmerVote') {
                const [_, rewardAddress, _height, _parentHash] = event.data;
                await file.appendFile(`${blockNumber},vote,${rewardAddress}\n`);
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
