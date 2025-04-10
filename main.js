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

// Daftar RPC yang tersedia
let RPC_URLS = [
    "https://tea-sepolia.g.alchemy.com/public", // RPC Default
    "https://tea-sepolia.g.alchemy.com/v2/TnWZWAFaF3TQkYJV-LvoYIaUH1aNsTf8" // RPC Alternatif
];

// Fungsi untuk mencoba koneksi ke berbagai RPC
const getResponsiveProvider = async () => {
    for (const url of RPC_URLS) {
        try {
            const provider = new ethers.JsonRpcProvider(url);
            const network = await provider.getNetwork();
            console.log(`✅ Terhubung ke RPC: ${url} (${network.name}, chainId: ${network.chainId})`);
            return provider; // Kembalikan provider yang responsif
        } catch (error) {
            console.error(`❌ Gagal terhubung ke RPC: ${url} (${error.message})`);
        }
    }
    throw new Error("Tidak ada endpoint RPC yang responsif.");
};

// Fungsi untuk membuat provider
let provider = null;
const initializeProvider = async () => {
    try {
        provider = await getResponsiveProvider();
    } catch (error) {
        console.error("❌ Gagal menginisialisasi provider RPC:", error.message);
        process.exit(1); // Hentikan program jika tidak ada RPC yang tersedia
    }
};

// Definisi ABI ERC-20
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

// Fungsi untuk menambahkan endpoint RPC baru
const addRPC = async () => {
    const rpcUrl = await askQuestion("Masukkan URL endpoint RPC baru: ");
    if (rpcUrl.startsWith("http")) {
        RPC_URLS.push(rpcUrl);
        console.log(`✅ Endpoint RPC baru berhasil ditambahkan: ${rpcUrl}`);
    } else {
        console.error("❌ URL RPC tidak valid. Silakan coba lagi.");
    }
};

// Fungsi untuk memperbarui dan menyimpan file .env
const updateEnvFile = () => {
    const envData = `PRIVATE_KEYS=${config.privateKeys.join(",")}\nTOKEN_CONTRACTS=${config.tokenContracts.join(",")}\n`;
    fs.writeFileSync(".env", envData);
    console.log("✅ Data berhasil disimpan ke file .env.");
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

// Fungsi Sinkronisasi Data
const synchronizeData = async () => {
    if (config.privateKeys.length === 0 || config.tokenContracts.length === 0) {
        console.error("❌ Tidak ada Private Key atau Token Contract yang diinput.");
        return;
    }

    console.log("🔄 Sinkronisasi data dengan jaringan...");
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

// Fungsi untuk input private key dan token kontrak
const inputPrivateKeyAndContract = async () => {
    const privateKey = await askQuestion("Masukkan Private Key: ");
    const tokenAddress = await askQuestion("Masukkan alamat Token Contract ERC-20: ");

    if (/^0x[a-fA-F0-9]{64}$/.test(privateKey) && ethers.isAddress(tokenAddress)) {
        config.privateKeys.push(privateKey);
        config.tokenContracts.push(tokenAddress);
        console.log(`✅ Private Key dan Token Contract berhasil ditambahkan.`);
        updateEnvFile();
    } else {
        console.error("❌ Data tidak valid. Silakan coba lagi.");
    }
};

// Fungsi untuk input address penerima
const inputRecipientAddresses = async () => {
    const input = await askQuestion(
        "Masukkan daftar address penerima, dipisahkan dengan tanda koma atau baris baru (Enter):\n"
    );
    const addresses = input.split(/[\s,]+/).filter((address) => address.trim() !== "");

    const invalidAddresses = addresses.filter((addr) => !ethers.isAddress(addr));
    if (invalidAddresses.length > 0) {
        console.error("❌ Alamat-alamat berikut tidak valid:");
        invalidAddresses.forEach((addr) => console.error(`- ${addr}`));
        return;
    }

    saveRecipientAddresses(addresses);
    config.addresses = addresses;
};

// Fungsi untuk mengatur dan memulai transaksi
const setTransactionSettingsAndStart = async () => {
    await synchronizeData(); // Sinkronisasi jaringan dan data token

    config.transactionSettings.minDelay = parseInt(await askQuestion("Masukkan interval delay minimum (detik): "));
    config.transactionSettings.maxDelay = parseInt(await askQuestion("Masukkan interval delay maksimum (detik): "));
    config.transactionSettings.minToken = parseFloat(await askQuestion("Masukkan jumlah token minimum: "));
    config.transactionSettings.maxToken = parseFloat(await askQuestion("Masukkan jumlah token maksimum: "));
    config.transactionSettings.transactionCount = parseInt(await askQuestion("Berapa kali transaksi yang akan dikirim? "));

    console.log("⚙️ Pengaturan transaksi berhasil disimpan. Memulai pengiriman...");
    await loopTransactions();
};

// Fungsi Looping Transaksi
const loopTransactions = async () => {
    const startTime = Date.now();
    const addresses = loadRecipientAddresses();

    if (addresses.length === 0) {
        console.error("❌ Tidak ada address penerima di file.");
        return;
    }

    while ((Date.now() - startTime) < (24 * 60 * 60 * 1000)) { // Looping selama kurang dari 24 jam
        for (let i = 0; i < config.transactionSettings.transactionCount; i++) {
            const randomAddress = addresses[Math.floor(Math.random() * addresses.length)];
            const randomAmount = (
                Math.random() * (config.transactionSettings.maxToken - config.transactionSettings.minToken) +
                config.transactionSettings.minToken
            ).toFixed(18);

            try {
                const privateKey = config.privateKeys[0]; // Contoh menggunakan privateKey pertama
                const wallet = new ethers.Wallet(privateKey, provider);
                const tokenContract = config.tokenContracts[0];
                const contract = new ethers.Contract(tokenContract, ERC20_ABI, wallet);

                const tx = await contract.transfer(randomAddress, ethers.parseUnits(randomAmount));
                console.log(`✅ Transaksi: ${randomAmount} token ke ${randomAddress}. Tx Hash: ${tx.hash}`);
                await tx.wait();

                const delay = Math.floor(
                    Math.random() * (config.transactionSettings.maxDelay - config.transactionSettings.minDelay) +
                    config.transactionSettings.minDelay
                ) * 1000;
                await new Promise((resolve) => setTimeout(resolve, delay));
            } catch (error) {
                console.error(`❌ Transaksi gagal:`, error.message);
            }
        }
        console.log("🔄 Looping transaksi berikutnya dimulai...");
    }

    console.log("⏳ Semua transaksi selesai dalam 24 jam.");
};

// Menu Utama
const mainMenu = async () => {
    await initializeProvider(); // Inisialisasi provider dengan endpoint RPC yang responsif

    while (true) {
        console.log("\nPilih opsi:");
        console.log("1. Input Private Key dan Token Contract");
        console.log("2. Input Address Penerima");
        console.log("3. Tambah Endpoint RPC Baru");
        console.log("4. Atur dan Mulai Transaksi");
        console.log("5. Keluar");

        const choice = await askQuestion("Pilihan Anda: ");
        if (choice === "1") {
            await inputPrivateKeyAndContract(); // Opsi untuk input private key dan token kontrak
        } else if (choice === "2") {
            await inputRecipientAddresses(); // Opsi untuk input address penerima
        } else if (choice === "3") {
            await addRPC(); // Opsi untuk menambahkan endpoint RPC baru
        } else if (choice === "4") {
            await setTransactionSettingsAndStart(); // Opsi untuk mengatur dan mulai transaksi
        } else if (choice === "5") {
            console.log("🚀 Program selesai. Sampai jumpa!"); // Keluar dari program
            break;
        } else {
            console.error("❌ Pilihan tidak valid. Silakan coba lagi.");
        }
    }
};

// Jalankan Program
(async () => {
    console.log("\n🚀 Program dimulai...");
    mainMenu(); // Memulai program dari menu utama
})();
