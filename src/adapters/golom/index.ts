import * as dotenv from "dotenv";
dotenv.config();

import moment from "moment";
import BigNumber from "bignumber.js";
import Ethereum from "../../sdk/EVMC";
import path from "path";
import symbolSdk from "../../sdk/symbol";
import priceSdk from "../../sdk/price";

import { ISaleEntity, ISymbolAPIResponse } from "../../sdk/Interfaces";
import { EventData } from "web3-eth-contract";

class GOLOM {
    name: string;
    symbol: ISymbolAPIResponse | undefined;
    token: string;
    protocol: string;
    block: number;
    contract: string;
    events: string[];
    pathToAbi: string | undefined;
    range: number;
    chunkSize: number;
    sdk: any;

    constructor() {
        this.name = "golom";
        this.symbol = undefined;
        this.token = "eth";
        this.protocol = "ethereum";
        this.block = 14880514;
        this.contract = "0xd29e1fcb07e55eaceb122c63f8e50441c6acedc9";
        this.events = ["OrderFilled"];
        this.pathToAbi = path.join(__dirname, "./abi.json");
        this.range = 500;
        this.chunkSize = 6;
        this.sdk = new Ethereum(this);
    }

    run = async (): Promise<void> => {
        const symbol = await symbolSdk.get(this.token, this.protocol);
        if (!symbol) throw new Error(`Missing symbol metadata for provider ${this.name}`);
        this.symbol = symbol;

        this.sdk = await this.loadSdk();

        await this.sdk.run();
    };

    loadSdk = () => {
        return new Ethereum(this);
    };

    stop = async (): Promise<void> => {
        this.sdk.stop();
    };

    getNftId = async (event: EventData): Promise<string | null> => {
        const txReceipt = await this.sdk.getTransactionReceipt(event.transactionHash);
        if (txReceipt === null) {
            return null;
        }
        const logs = txReceipt.logs;
        for (let i = 0; i < logs.length; i++) {
            const topics = logs[i].topics;
            if (
                topics[0] === "0x5ff9e72404463058acdc1a7367b634d29a9c3c5aa4d41dddf6321b586afb5aed" &&
                topics.length == 4
            ) {
                const transfer_topic = logs[i - 1].topics;
                const nftContract = logs[i - 1].address.toLowerCase();
                const tokenidhex = transfer_topic[3];
                const tokenId = parseInt(tokenidhex, 16);
                return tokenId.toString() + "_" + nftContract;
            }
        }

        return null;
    };

    process = async (event: any): Promise<ISaleEntity | undefined> => {
        const block = await this.sdk.getBlock(event.blockNumber);
        const timestamp = moment.unix(block.timestamp).utc();
        const po = await priceSdk.get(this.token, this.protocol, block.timestamp);
        const nativePrice = new BigNumber(event.returnValues.price).dividedBy(10 ** (this.symbol?.decimals || 0));
        const buyer = event.returnValues.taker.toLowerCase();
        const seller = event.returnValues.maker.toLowerCase();
        const orderType = event.returnValues.orderType;

        const token_symbol = orderType == 0 ? "eth" : "weth";
        const tokenId_nftContract = await this.getNftId(event);

        if (!tokenId_nftContract) {
            return;
        }
        const split_data = tokenId_nftContract.split("_");
        const tokenId = split_data[0];
        const nftContract = split_data[1];
        const entity: ISaleEntity = {
            providerName: this.name, // the name of the folder
            providerContract: this.contract, // the providers contract from which you get data
            protocol: this.protocol,
            nftContract: nftContract,
            nftId: tokenId,
            token: this.token,
            tokenSymbol: token_symbol,
            amount: 1,
            price: nativePrice.toNumber(),
            priceUsd: !this.symbol?.decimals ? null : nativePrice.multipliedBy(po.price).toNumber(),
            seller: seller, // its bought from ens and transfered to the owner
            buyer,
            soldAt: timestamp.format("YYYY-MM-DD HH:mm:ss"),
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
        };

        return this.addToDatabase(entity);
    };

    addToDatabase = async (entity: ISaleEntity): Promise<ISaleEntity> => {
        return entity;
    };
}

export default GOLOM;
