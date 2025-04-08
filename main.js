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
        batchSize: 10, // Jumlah transaksi per akun dalam satu batch
        maxLoops: 11, // Total loop sebelum delay 24 jam
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

// Langkah 1: Tambahkan Data Private Key dan Token Smart Contract
const addPrivateKeysAndContracts = async () => {
    const input = await askQuestion(
        "Masukkan daftar private key dan alamat smart contract token ERC-20, dipisahkan dengan tanda koma.\n" +
        "Format: privateKey1,tokenContract1,privateKey2,tokenContract2,...\n" +
        "Input: "
    );

    const data = input.split(",").map((item) => item.trim());
    if (data.length % 2 !== 0) {
        console.error("❌ Jumlah private key dan alamat smart contract tidak sesuai.");
        return;
    }

    for (let i = 0; i < data.length; i += 2) {
        const privateKey = data[i];
        const tokenAddress = data[i + 1];

        if (/^0x[a-fA-F0-9]{64}$/.test(privateKey) && ethers.isAddress(tokenAddress)) {
            config.privateKeys.push(privateKey);
            config.tokenContracts.push(tokenAddress);
            console.log(`✅ Berhasil menambahkan: Private Key ${privateKey} dan Token Contract ${tokenAddress}`);
        } else {
            console.error(`❌ Data tidak valid: Private Key: ${privateKey}, Token Contract: ${tokenAddress}`);
        }
    }
};

// Langkah 2: Tambahkan Address Penerima
const addRecipientAddresses = async () => {
    const input = await askQuestion(
        "Masukkan daftar address penerima, dipisahkan dengan tanda koma atau baris baru (Enter).\n" +
        "Input: "
    );

    const addresses = input.split(/[\s,]+/).filter((address) => address.trim() !== "");
    const invalidAddresses = addresses.filter((addr) => !ethers.isAddress(addr));
    if (invalidAddresses.length > 0) {
        console.error("❌ Alamat-alamat berikut tidak valid:");
        invalidAddresses.forEach((addr) => console.error(`- ${addr}`));
        return;
    }

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

// Langkah 5: Jalankan Program dengan Transaksi Silang
const sendTokensInterleavedWithDelay = async () => {
    const totalAccounts = config.privateKeys.length;
    for (let loopIndex = 0; loopIndex < config.transactionSettings.maxLoops; loopIndex++) {
        console.log(`\n🔁 Mulai Loop ${loopIndex + 1} dari ${config.transactionSettings.maxLoops}`);
        for (let accountIndex = 0; accountIndex < totalAccounts; accountIndex++) {
            const privateKey = config.privateKeys[accountIndex];
            const tokenAddress = config.tokenContracts[accountIndex];
            const wallet = new ethers.Wallet(privateKey, provider);
            const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

            const decimals = Number(await contract.decimals());
            const accountLabel = `Akun ${accountIndex + 1}`;
            console.log(`\n🚀 Mulai transaksi untuk ${accountLabel}: ${wallet.address}`);

            for (let transactionIndex = 0; transactionIndex < config.transactionSettings.batchSize; transactionIndex++) {
                for (const address of config.addresses) {
                    const randomAmount = (
                        Math.random() *
                        (config.transactionSettings.maxToken - config.transactionSettings.minToken) +
                        config.transactionSettings.minToken
                    ).toFixed(decimals);

                    try {
                        const tx = await contract.transfer(address, ethers.parseUnits(randomAmount, decimals));
                        console.log(
                            `✅ ${accountLabel}, Transaksi ${transactionIndex + 1}: ${randomAmount} token ke ${address}. Tx Hash: ${tx.hash}`
                        );
                        await tx.wait();
                    } catch (error) {
                        console.error(
                            `❌ ${accountLabel}, Transaksi ${transactionIndex + 1}: Gagal mengirim token ke ${address}: ${error.message}`
                        );
                    }

                    const delay = Math.floor(
                        Math.random() *
                        (config.transactionSettings.maxDelay - config.transactionSettings.minDelay) +
                        config.transactionSettings.minDelay
                    ) * 1000;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }

        console.log("\n⏳ Delay selama 5 menit sebelum loop berikutnya...");
        await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
    }

    console.log("\n⏳ Delay selama 24 jam sebelum memulai proses kembali...");
    await new Promise((resolve) => setTimeout(resolve, 24 * 60 * 60 * 1000));
    console.log("✅ Semua proses transaksi selesai!");
};

// Menu Utama
const mainMenu = async () => {
    while (true) {
        console.log("\nPilih opsi:");
        console.log("1. Isi Private Key dan Smart Contract");
        console.log("2. Isi Address Penerima");
        console.log("3. Atur Interval Waktu");
        console.log("4. Atur Jumlah Kirim");
        console.log("5. Jalankan Program");
        console.log("6. Keluar");

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
            await sendTokensInterleavedWithDelay();
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

