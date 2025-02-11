require("dotenv").config();
const { ethers } = require("ethers");
const axios = require("axios");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ETHEREUM_RPC = process.env.ETHEREUM_RPC;
const WATCH_ADDRESS = process.env.WATCH_ADDRESS.toLowerCase();
const PINKSALE_URL = "https://www.pinksale.finance/"; // PinkSale linki
const VIDEO_FILE_ID = "CgACAgQAAyEFAASIyYeKAAMFZ6oY9tbEvM_z7C5A2fTEAygPW6AAAoQYAAJepFBRrVQxiN0BtD02BA"; // Telegram'daki video ID

const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC);
const sentTransactions = new Set(); // Daha önce gönderilen işlemleri saklamak için
let lastCheckedBlock = 0; // **Kaçırılan blokları tespit etmek için en son kontrol edilen blok**

console.log(`✅ Bot çalışıyor! ${WATCH_ADDRESS} adresine gelen ETH transferleri takip ediliyor...`);

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
            console.warn(`⚠️ getLogs hatası (${attempts + 1}. deneme):`, error.message);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 saniye bekle ve tekrar dene
        }
    }
    console.error(`❌ getLogs ${retries} denemeden sonra başarısız oldu.`);
    return [];
}

async function checkNewTransfers() {
    try {
        const latestBlock = await provider.getBlockNumber();
        console.log(`🔍 Son blok numarası: ${latestBlock}`);

        if (lastCheckedBlock === 0) {
            lastCheckedBlock = latestBlock - 1; // **İlk başta son bloğun bir öncesinden başla**
        }

        // **Kaçırılan blokları kontrol etmek için tüm eksik blokları incele**
        for (let block = lastCheckedBlock + 1; block <= latestBlock; block++) {
            console.log(`📡 Blok inceleniyor: ${block}`);

            const logs = await getLogsRetry(block, block);

            for (const log of logs) {
                try {
                    const tx = await provider.getTransaction(log.transactionHash);
                    if (tx && tx.to && tx.to.toLowerCase() === WATCH_ADDRESS) {
                        if (!sentTransactions.has(tx.hash)) {
                            console.log(`📩 Yeni ETH Transferi: ${tx.hash}`);

                            const ethAmount = ethers.formatEther(tx.value);

                            // **Adresin toplam ETH bakiyesini al**
                            const newBalance = await provider.getBalance(WATCH_ADDRESS);
                            const formattedBalance = ethers.formatEther(newBalance);

                            const message = `
🚀 **Yeni Satın Alım Gerçekleşti!** 🚀
📥 **Miktar:** ${ethAmount} ETH
👤 **Gönderen:** [${tx.from}](https://etherscan.io/address/${tx.from})
💰 **Toplam ETH Bakiyesi:** ${formattedBalance} ETH


                            `;

                            await sendTelegramVideo(message);
                            sentTransactions.add(tx.hash);

                            // **Set'in Boyutunu Kontrol Et ve Eski İşlemleri Sil**
                            if (sentTransactions.size > 1000) {
                                const firstItem = sentTransactions.values().next().value;
                                sentTransactions.delete(firstItem);
                            }
                        }
                    }
                } catch (txError) {
                    console.error("❌ Hata: İşlem detayları alınırken bir sorun oluştu.", txError);
                }
            }
        }

        lastCheckedBlock = latestBlock; // **En son kontrol edilen bloğu güncelle**
    } catch (error) {
        console.error("❌ Hata: Transferleri kontrol ederken bir sorun oluştu.", error);
    }
}

// **Her 15 saniyede bir yeni transferleri kontrol et**
setInterval(checkNewTransfers, 15000);

// **Telegram’a Video ile Mesaj Gönderen Fonksiyon**
async function sendTelegramVideo(text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`, {
            chat_id: TELEGRAM_CHAT_ID,
            video: VIDEO_FILE_ID,
            caption: text,
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🚀 PinkSale Sayfasına Git", url: PINKSALE_URL }]
                ]
            }
        });
        console.log("✅ Telegram mesajı gönderildi.");
    } catch (error) {
        console.error("❌ Telegram mesaj gönderme hatası:", error.response.data);
    }
}
