require("dotenv").config();
const { ethers } = require("ethers");
const axios = require("axios");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ETHEREUM_RPC = process.env.ETHEREUM_RPC;
const WATCH_ADDRESS = process.env.WATCH_ADDRESS.toLowerCase();
const PINKSALE_URL = "https://www.pinksale.finance/launchpad/ethereum/0xd287F714F74a5dCd8E081d6445778C55D7EF5324";
const VIDEO_FILE_ID = "CgACAgEAAxkBAAMFZ8CN6-snPhwSsn0fq9otn1CrLFYAAtQDAAKDGglG6ZmUaPllRw82BA";
const COINGECKO_API = "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT";

const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC);
const sentTransactions = new Set();
let lastCheckedBlock = 0;
let fakeTransactionSent = false;

console.log(`✅  ${WATCH_ADDRESS} `);

async function getLogsRetry(fromBlock, toBlock, retries = 3) {
    let attempts = 0;
    while (attempts < retries) {
        try {
            return await provider.getLogs({
                fromBlock: fromBlock,
                toBlock: toBlock,
                address: WATCH_ADDRESS,
            });
        } catch (error) {
            console.warn(`⚠️ getLogs  (${attempts + 1}. ): ${error.message}`);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    console.error(`❌ getLogs ${retries} `);
    return [];
}

let lastKnownEthPrice = null; 



async function getEthPrice() {
    let attempts = 0;
    while (attempts < 3) { 
        try {
            const response = await axios.get("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT");
            lastKnownEthPrice = parseFloat(response.data.price); 
            console.log(`✅  $${lastKnownEthPrice}`);
            return lastKnownEthPrice;
        } catch (error) {
            console.warn(`⚠️(${attempts + 1})`);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 2000)); 
        }
    }
    console.error("❌ ");
    return lastKnownEthPrice; 
}

function getGreenEmojis(usdtAmount) {
    if (usdtAmount >= 500) return "🟣".repeat(60);
    if (usdtAmount >= 400) return "🟣".repeat(52);
    if (usdtAmount >= 300) return "🟣".repeat(44);
    if (usdtAmount >= 200) return "🟣".repeat(36);
    if (usdtAmount >= 150) return "🟣".repeat(28);
    if (usdtAmount >= 100) return "🟣".repeat(20);
    return "🟣".repeat(16);
}

async function checkNewTransfers() {
    try {
        const latestBlock = await provider.getBlockNumber();
        console.log(`🔍 Son blok numarası: ${latestBlock}`);

        if (lastCheckedBlock === 0) {
            lastCheckedBlock = latestBlock - 1;
        }

        
        for (let block = lastCheckedBlock + 1; block <= latestBlock; block++) {
            console.log(`📡 ${block}`);

            const logs = await getLogsRetry(block, block);
            const ethPrice = await getEthPrice(); 

            for (const log of logs) {
                try {
                    const tx = await provider.getTransaction(log.transactionHash);
                    if (tx && tx.to && tx.to.toLowerCase() === WATCH_ADDRESS) {
                        if (!sentTransactions.has(tx.hash)) {
                            console.log(` ${tx.hash}`);

                            const ethAmount = ethers.formatEther(tx.value);
                            const usdtAmount = ethPrice 
                                ? (parseFloat(ethAmount) * ethPrice).toFixed(2) 
                                : "";
                            const newBalance = await provider.getBalance(WATCH_ADDRESS);
                            const formattedBalance = ethers.formatEther(newBalance);
                            const totalUsdt = ethPrice 
                                ? (parseFloat(formattedBalance) * ethPrice).toFixed(2) 
                                : "";

                            const greenEmojis = getGreenEmojis(parseFloat(usdtAmount)); 

                            console.log(`🟢 Debug:  $${ethPrice}, ${ethAmount}, $${usdtAmount}`);

                            const shortAddress = `${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`;
                            const txnLink = `https://etherscan.io/tx/${tx.hash}`;

                            const message = `
🔥 **Cloud AI Buy** 🔥

${greenEmojis}

💸 **Spent:** ${ethAmount} ETH (**$${usdtAmount}**)
👤 **Buyer:** [${shortAddress}](https://etherscan.io/address/${tx.from}) **/[Txn](${txnLink})**
💰 **Total Buy:** ${formattedBalance} ETH (**$${totalUsdt}**)
                            `;

                            await sendTelegramVideo(message);
                            sentTransactions.add(tx.hash);

                            if (sentTransactions.size > 1000) {
                                const firstItem = sentTransactions.values().next().value;
                                sentTransactions.delete(firstItem);
                            }
                        }
                    }
                } catch (txError) {
                    console.error("", txError);
                }
            }
        }

        lastCheckedBlock = latestBlock;
    } catch (error) {
        console.error("", error);
    }
}




setInterval(checkNewTransfers, 15000);

async function sendTelegramVideo(text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`, {
            chat_id: TELEGRAM_CHAT_ID,
            video: VIDEO_FILE_ID,
            caption: text,
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "💎 Buy $CLAI 💎", url: PINKSALE_URL }]
                ]
            }
        });
        console.log("");
    } catch (error) {
        console.error("", error.response.data);
    }
}
