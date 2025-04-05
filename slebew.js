const { ethers } = require("ethers");
const readline = require("readline");
const fs = require("fs");
const path = require("path");
const sebra = require("./sebra");

// RPC URL
const TEA_RPC_URL = "https://tea-sepolia.g.alchemy.com/public";
const provider = new ethers.JsonRpcProvider(TEA_RPC_URL);

// Fungsi untuk meminta input dari pengguna
const askQuestion = (query) => {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question(query, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
};

// Fungsi untuk menambahkan private key baru ke Sebra.js
const addPrivateKey = async () => {
    const privateKey = await askQuestion("Masukkan private key baru: ");
    if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
        console.error("❌ Private key tidak valid.");
        return;
    }

    sebra.privateKeys.push(privateKey);
    fs.writeFileSync(
        path.join(__dirname, "sebra.js"),
        `module.exports = ${JSON.stringify(sebra, null, 2)};`
    );

    console.log("✅ Private key berhasil ditambahkan!");
};

// Fungsi untuk meminta alamat penerima
const getRecipientAddresses = async () => {
    const addresses = [];
    console.log("Masukkan address penerima satu per satu. Ketik 'end' jika selesai.");

    while (true) {
        const address = await askQuestion("Address penerima: ");
        if (address.toLowerCase() === "end") break;
        if (!ethers.isAddress(address)) {
            console.error("❌ Address tidak valid. Silakan coba lagi.");
            continue;
        }
        addresses.push(address);
    }

    return addresses;
};

// Fungsi untuk mengirim transaksi dengan semua private key
const sendTransactions = async (addresses) => {
    for (const privateKey of sebra.privateKeys) {
        console.log(`\n🔑 Menggunakan private key: ${privateKey}`);
        const wallet = new ethers.Wallet(privateKey, provider);

        for (const address of addresses) {
            try {
                const tx = await wallet.sendTransaction({
                    to: address,
                    value: ethers.parseEther("0.01"), // Kirim 0.01 TEA
                });
                console.log(`✅ Mengirim 0.01 TEA ke ${address}. Tx Hash: ${tx.hash}`);
                await tx.wait();
            } catch (error) {
                console.error(`❌ Gagal mengirim ke ${address}:`, error.message);
            }
        }
    }
};

// Main function
(async () => {
    const action = await askQuestion("\nApa yang ingin Anda lakukan? (addKey/send): ");

    if (action.toLowerCase() === "addkey") {
        await addPrivateKey();
    } else if (action.toLowerCase() === "send") {
        const addresses = await getRecipientAddresses();
        console.log(`\n📬 Daftar address penerima: ${addresses.join(", ")}`);
        await sendTransactions(addresses);
    } else {
        console.error("❌ Pilihan tidak valid.");
    }
})();
