require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");
const fs = require("fs");

// Data global
let config = {
    privateKeys: process.env.PRIVATE_KEYS ? process.env.PRIVATE_KEYS.split(",").map((key) => key.trim()) : [],
    tokenContracts: process.env.TOKEN_CONTRACTS ? process.env.TOKEN_CONTRACTS.split(",").map((contract) => contract.trim()) : [],
    addresses: [],
    transactionSettings: {
        minToken: 0,
        maxToken: 0,
        minDelay: 0,
        maxDelay: 0,
        transactionCount: 0,
    },
};

// URL RPC publik
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

// Fungsi untuk memperbarui dan menyimpan file .env
const updateEnvFile = () => {
    const envData = `PRIVATE_KEYS=${config.privateKeys.join(",")}\nTOKEN_CONTRACTS=${config.tokenContracts.join(",")}\n`;
    fs.writeFileSync(".env", envData);
    console.log("✅ Data berhasil disimpan ke file .env.");
};

// Fungsi untuk menambahkan private key
const addPrivateKey = async () => {
    const privateKey = await askQuestion("Masukkan Private Key: ");
    if (/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
        config.privateKeys.push(privateKey);
        console.log(`✅ Private Key berhasil ditambahkan: ${privateKey}`);
        updateEnvFile();
    } else {
        console.error("❌ Private Key tidak valid. Silakan coba lagi.");
    }
};

// Fungsi untuk menambahkan token kontrak
const addTokenContract = async () => {
    const tokenAddress = await askQuestion("Masukkan alamat Token Contract ERC-20: ");
    if (ethers.isAddress(tokenAddress)) {
        config.tokenContracts.push(tokenAddress);
        console.log(`✅ Token Contract berhasil ditambahkan: ${tokenAddress}`);
        updateEnvFile();
    } else {
        console.error("❌ Alamat Token Contract tidak valid. Silakan coba lagi.");
    }
};

// Fungsi untuk memuat daftar address dari file
const loadRecipientAddresses = () => {
    try {
        const data = fs.readFileSync("addresses.json", "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("❌ Gagal memuat file 'addresses.json':", error.message);
        return [];
    }
};

// Fungsi untuk menyimpan daftar address ke file
const saveRecipientAddresses = (addresses) => {
    fs.writeFileSync("addresses.json", JSON.stringify(addresses, null, 2));
    console.log("✅ Address penerima berhasil disimpan ke file.");
};

// Sinkronisasi Data
const synchronizeData = async () => {
    if (config.privateKeys.length === 0 || config.tokenContracts.length === 0) {
        console.error("❌ Tidak ada Private Key atau Token Contract yang diinput.");
        return;
    }

    console.log("🔄 Sinkronisasi data...");
    for (let i = 0; i < config.privateKeys.length; i++) {
        const privateKey = config.privateKeys[i];
        const tokenAddress = config.tokenContracts[i];
        const wallet = new ethers.Wallet(privateKey, provider);
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

        try {
            const symbol = await contract.symbol();
            const balance = await contract.balanceOf(wallet.address);
            const gasFee = await provider.getBalance(wallet.address);

            console.log(`✅ Akun ${i + 1}:`);
            console.log(`   - Wallet Address: ${wallet.address}`);
            console.log(`   - Token Symbol: ${symbol}`);
            console.log(`   - Saldo Token: ${ethers.formatUnits(balance)} ${symbol}`);
            console.log(`   - Gas Fee: ${ethers.formatEther(gasFee)} ETH`);
        } catch (error) {
            console.error(`❌ Gagal sinkronisasi untuk Akun ${i + 1}:`, error.message);
        }
    }
};

// Atur dan Jalankan Transaksi
const setTransactionSettingsAndRun = async () => {
    config.transactionSettings.minDelay = parseInt(await askQuestion("Masukkan interval delay minimum (detik): "));
    config.transactionSettings.maxDelay = parseInt(await askQuestion("Masukkan interval delay maksimum (detik): "));
    config.transactionSettings.minToken = parseFloat(await askQuestion("Masukkan jumlah token minimum: "));
    config.transactionSettings.maxToken = parseFloat(await askQuestion("Masukkan jumlah token maksimum: "));
    config.transactionSettings.transactionCount = parseInt(await askQuestion("Berapa kali transaksi yang akan dikirim? "));

    console.log("⚙️ Pengaturan transaksi berhasil disimpan. Memulai pengiriman...");
    await sendRandomizedTransactions(config.transactionSettings.transactionCount);
};

// Fungsi Transaksi
const sendRandomizedTransactions = async (transactionCount) => {
    const addresses = loadRecipientAddresses();
    if (addresses.length === 0) {
        console.error("❌ Tidak ada address penerima di file.");
        return;
    }

    for (let i = 0; i < transactionCount; i++) {
        const randomAddress = addresses[Math.floor(Math.random() * addresses.length)];
        const randomAmount = (
            Math.random() * (config.transactionSettings.maxToken - config.transactionSettings.minToken) +
            config.transactionSettings.minToken
        ).toFixed(18); // Asumsikan 18 desimal

        try {
            const privateKey = config.privateKeys[0]; // Contoh: hanya gunakan privateKey pertama
            const wallet = new ethers.Wallet(privateKey, provider);
            const tokenContract = config.tokenContracts[0];
            const contract = new ethers.Contract(tokenContract, ERC20_ABI, wallet);

            const tx = await contract.transfer(randomAddress, ethers.parseUnits(randomAmount));
            console.log(`✅ Transaksi ${i + 1}: ${randomAmount} token ke ${randomAddress}. Tx Hash: ${tx.hash}`);
            await tx.wait();

            const delay = Math.floor(Math.random() * (config.transactionSettings.maxDelay - config.transactionSettings.minDelay) + config.transactionSettings.minDelay) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
        } catch (error) {
            console.error(`❌ Transaksi ${i + 1} gagal:`, error.message);
        }
    }
    console.log("✅ Semua transaksi selesai.");
};

// Menu Utama
const mainMenu = async () => {
    while (true) {
        console.log("\nPilih opsi:");
        console.log("1. Tambah Private Key");
        console.log("2. Tambah Token Contract");
        console.log("3. Sinkronisasi Data");
        console.log("4. Isi Address Penerima");
        console.log("5. Atur dan Jalankan Transaksi");
        console.log("6. Keluar");

        const choice = await askQuestion("Pilihan Anda: ");
        if (choice === "1") {
            await addPrivateKey();
        } else if (choice === "2") {
            await addTokenContract();
        } else if (choice === "3") {
            await synchronizeData();
        } else if (choice === "4") {
            await addRecipientAddresses();
        } else if (choice === "5") {
            await setTransactionSettingsAndRun();
        } else if (choice === "6") {
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
