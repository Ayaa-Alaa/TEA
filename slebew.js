const { ethers } = require("ethers");
const readline = require("readline");
const fs = require("fs");
const path = require("path");
const sebra = require("./sebra");
const zebra = require("./zebra");

let tokenDetails = {};
let timeRange = { min: 0, max: 0 };

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

// 1: Menambahkan Private Key
const addPrivateKeys = async () => {
    console.log("Masukkan private key satu per baris. Ketik 'end' jika selesai:");

    const keys = [];
    while (true) {
        const input = await askQuestion("> ");
        if (input.toLowerCase() === "end") break;

        const lines = input.split(/\s+/); // Pisahkan input per baris atau spasi
        for (const line of lines) {
            if (/^0x[a-fA-F0-9]{64}$/.test(line)) {
                keys.push(line);
            } else {
                console.error(`❌ Private key tidak valid: ${line}`);
            }
        }
    }

    if (keys.length === 0) {
        console.log("⚠️ Tidak ada private key yang valid untuk ditambahkan.");
        return;
    }

    sebra.privateKeys.push(...keys);
    fs.writeFileSync(
        path.join(__dirname, "sebra.js"),
        `module.exports = ${JSON.stringify(sebra, null, 2)};`
    );

    console.log(`✅ ${keys.length} Private key berhasil ditambahkan!`);
};

// 2: Menambahkan Address
const addAddresses = async () => {
    console.log("Masukkan address penerima satu per baris. Ketik 'end' jika selesai:");

    const addresses = [];
    while (true) {
        const input = await askQuestion("> ");
        if (input.toLowerCase() === "end") break;

        const lines = input.split(/\s+/); // Pisahkan input per baris atau spasi
        for (const line of lines) {
            if (ethers.isAddress(line)) {
                addresses.push(line);
            } else {
                console.error(`❌ Address tidak valid: ${line}`);
            }
        }
    }

    if (addresses.length === 0) {
        console.log("⚠️ Tidak ada address yang valid untuk ditambahkan.");
        return;
    }

    zebra.addresses.push(...addresses);
    fs.writeFileSync(
        path.join(__dirname, "zebra.js"),
        `module.exports = ${JSON.stringify(zebra, null, 2)};`
    );

    console.log(`✅ ${addresses.length} Address berhasil ditambahkan!`);
};

// 3: Menambahkan Token ERC-20 dan Mengatur Jumlah
const setTokenAndAmount = async () => {
    const tokenAddress = await askQuestion("Masukkan alamat kontrak token ERC-20: ");
    if (!ethers.isAddress(tokenAddress)) {
        console.error("❌ Alamat kontrak token tidak valid.");
        return;
    }

    const minAmount = await askQuestion("Masukkan jumlah minimum token yang akan dikirim: ");
    const maxAmount = await askQuestion("Masukkan jumlah maksimum token yang akan dikirim: ");

    tokenDetails = {
        address: tokenAddress,
        min: parseFloat(minAmount),
        max: parseFloat(maxAmount),
    };

    console.log("✅ Token ERC-20 berhasil disimpan dengan konfigurasi jumlah acak.");
};

// 4: Mengatur Delay Waktu
const setTime = async () => {
    const minTime = await askQuestion("Masukkan waktu delay minimum (dalam detik): ");
    const maxTime = await askQuestion("Masukkan waktu delay maksimum (dalam detik): ");

    timeRange = {
        min: parseInt(minTime, 10),
        max: parseInt(maxTime, 10),
    };

    console.log("✅ Interval waktu acak berhasil disimpan.");
};

// 5: Pengiriman Token
const sendTokens = async () => {
    const provider = new ethers.JsonRpcProvider("https://tea-sepolia.g.alchemy.com/public");
    const ERC20_ABI = [
        "function transfer(address to, uint256 amount) public returns (bool)",
        "function decimals() view returns (uint8)",
    ];

    if (!tokenDetails.address || timeRange.min === 0 || timeRange.max === 0) {
        console.error("❌ Token, jumlah, atau waktu delay belum diatur.");
        return;
    }

    for (const privateKey of sebra.privateKeys) {
        const wallet = new ethers.Wallet(privateKey, provider);
        const contract = new ethers.Contract(tokenDetails.address, ERC20_ABI, wallet);
        const decimals = await contract.decimals();

        const shuffledAddresses = zebra.addresses.sort(() => 0.5 - Math.random()).slice(0, 110);

        for (const address of shuffledAddresses) {
            const randomAmount = (
                Math.random() * (tokenDetails.max - tokenDetails.min) + tokenDetails.min
            ).toFixed(decimals);

            try {
                const tx = await contract.transfer(address, ethers.parseUnits(randomAmount, decimals));
                console.log(`✅ Mengirim ${randomAmount} token ke ${address}. Tx Hash: ${tx.hash}`);
                await tx.wait();
            } catch (error) {
                console.error(`❌ Gagal mengirim token ke ${address}:`, error.message);
            }

            const randomDelay = Math.floor(
                Math.random() * (timeRange.max - timeRange.min) + timeRange.min
            ) * 1000;
            await new Promise((resolve) => setTimeout(resolve, randomDelay));
        }
    }

    console.log("✅ Semua transaksi selesai. Menunggu 24 jam sebelum mengulang...");
    setTimeout(sendTokens, 24 * 60 * 60 * 1000);
};

// Main Program
(async () => {
    while (true) {
        const action = await askQuestion(
            "\nPilih opsi:\n1: Tambah Private Key\n2: Tambah Address\n3: Atur Token & Jumlah\n4: Atur Waktu\n5: Kirim Token\nPilihan Anda: "
        );

        if (action === "1") {
            await addPrivateKeys();
        } else if (action === "2") {
            await addAddresses();
        } else if (action === "3") {
            await setTokenAndAmount();
        } else if (action === "4") {
            await setTime();
        } else if (action === "5") {
            await sendTokens();
        } else {
            console.error("❌ Pilihan tidak valid.");
        }
    }
})();
