require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");
const fs = require("fs");

// Data global
let config = {
    privateKeys: [],
    tokenContracts: [],
    addresses: [],
    transactionSettings: {
        minToken: 0,
        maxToken: 0,
        minDelay: 0,
        maxDelay: 0,
        transactionCount: 0,
    },
};

// URL RPC publik (tanpa API key)
const TEA_RPC_URL = "https://tea-sepolia.g.alchemy.com/public";
const provider = new ethers.JsonRpcProvider(TEA_RPC_URL);

// Validasi koneksi ke RPC
provider.getNetwork()
    .then((network) => console.log(`✅ Terhubung ke jaringan: ${network.name} (${network.chainId})`))
    .catch((error) => {
        console.error("❌ Gagal terhubung ke jaringan:", error.message);
        process.exit(1);
    });

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) public returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

// Fungsi untuk input data dari user
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

// Langkah 1: Tambahkan Private Key dan Token Smart Contract
const addPrivateKeysAndContracts = async () => {
    while (true) {
        const privateKey = await askQuestion("Masukkan Private Key (atau ketik 'done' untuk selesai): ");
        if (privateKey.toLowerCase() === "done") break;

        if (/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
            const tokenAddress = await askQuestion("Masukkan alamat smart contract token ERC-20: ");
            if (ethers.isAddress(tokenAddress)) {
                config.privateKeys.push(privateKey);
                config.tokenContracts.push(tokenAddress);
                console.log("✅ Private key dan token contract berhasil ditambahkan!");
            } else {
                console.error("❌ Alamat smart contract tidak valid.");
            }
        } else {
            console.error("❌ Private key tidak valid.");
        }
    }
};

// Langkah 2: Tambahkan Address Penerima
const addRecipientAddresses = async () => {
    const addresses = [];
    while (true) {
        const address = await askQuestion("Masukkan address penerima (atau ketik 'done' untuk selesai): ");
        if (address.toLowerCase() === "done") break;

        if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
            addresses.push(address);
            console.log("✅ Address berhasil ditambahkan!");
        } else {
            console.error("❌ Address tidak valid.");
        }
    }

    // Simpan address ke file
    fs.writeFileSync("addresses.json", JSON.stringify(addresses, null, 2));
    config.addresses = addresses;
    console.log("📁 Address penerima berhasil disimpan ke file 'addresses.json'.");
};

// Langkah 3: Atur Interval Waktu
const setTransactionInterval = async () => {
    config.transactionSettings.minDelay = parseInt(
        await askQuestion("Masukkan waktu delay minimum (dalam detik): ")
    );
    config.transactionSettings.maxDelay = parseInt(
        await askQuestion("Masukkan waktu delay maksimum (dalam detik): ")
    );
    console.log("✅ Interval waktu berhasil diatur!");
};

// Langkah 4: Atur Jumlah Kirim
const setTokenAmounts = async () => {
    config.transactionSettings.minToken = parseFloat(
        await askQuestion("Masukkan jumlah minimum token yang akan dikirim: ")
    );
    config.transactionSettings.maxToken = parseFloat(
        await askQuestion("Masukkan jumlah maksimum token yang akan dikirim: ")
    );
    console.log("✅ Jumlah token berhasil diatur!");
};

// Langkah 5: Atur Jumlah Transaksi
const setTransactionCount = async () => {
    config.transactionSettings.transactionCount = parseInt(
        await askQuestion("Masukkan jumlah transaksi yang akan dikirim per private key: ")
    );
    console.log("✅ Jumlah transaksi berhasil diatur!");
};

// Langkah 6: Jalankan Program
const sendTokens = async () => {
    for (let index = 0; index < config.privateKeys.length; index++) {
        const privateKey = config.privateKeys[index];
        const tokenAddress = config.tokenContracts[index];
        const wallet = new ethers.Wallet(privateKey, provider);
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

        const decimals = Number(await contract.decimals());
        const accountLabel = `Akun ${index + 1}`;
        console.log(`\n🚀 Mulai transaksi dengan ${accountLabel}: ${wallet.address}`);

        for (let i = 0; i < config.transactionSettings.transactionCount; i++) {
            const transactionLabel = `Transaksi ${i + 1}`;
            console.log(`\n📌 Mulai ${transactionLabel} untuk ${accountLabel}`);

            for (const address of config.addresses) {
                const randomAmount = (
                    Math.random() *
                    (config.transactionSettings.maxToken - config.transactionSettings.minToken) +
                    config.transactionSettings.minToken
                ).toFixed(decimals);

                try {
                    const tx = await contract.transfer(address, ethers.parseUnits(randomAmount, decimals));
                    console.log(`✅ ${transactionLabel}: ${randomAmount} token ke ${address}. Tx Hash: ${tx.hash}`);
                    await tx.wait();
                } catch (error) {
                    console.error(`❌ ${transactionLabel}: Gagal mengirim token ke ${address}: ${error.message}`);
                }

                const delay = Math.floor(
                    Math.random() *
                    (config.transactionSettings.maxDelay - config.transactionSettings.minDelay) +
                    config.transactionSettings.minDelay
                ) * 1000;
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
        console.log(`✅ Semua transaksi selesai untuk ${accountLabel}`);
    }
};

// Menu Utama
const mainMenu = async () => {
    while (true) {
        console.log("\nPilih opsi:");
        console.log("1. Isi Private Key dan Smart Contract");
        console.log("2. Isi Address Penerima");
        console.log("3. Atur Interval Waktu");
        console.log("4. Atur Jumlah Kirim");
        console.log("5. Atur Jumlah Transaksi");
        console.log("6. Jalankan Program");
        console.log("7. Keluar");

        const choice = await askQuestion("Pilihan Anda: ");
        if (choice === "1") {
            await addPrivateKeysAndContracts();
        } else if (choice === "2") {
            await addRecipientAddresses();
        } else if (choice === "3") {
            await setTransactionInterval();
        } else if (choice === "4") {
            await setTokenAmounts();
        } else if (choice === "5") {
            await setTransactionCount();
        } else if (choice === "6") {
            await sendTokens();
        } else if (choice === "7") {
            console.log("🚀 Program selesai. Sampai jumpa!");
            break;
        } else {
            console.error("❌ Pilihan tidak valid. Silakan coba lagi.");
        }
    }
};

// Jalankan Program
(async () => {
    console.log("\n🚀 Program dimulai...");
    mainMenu();
})();
