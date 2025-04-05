const { ethers } = require("ethers");
const readline = require("readline");
const fs = require("fs");
const path = require("path");
const sebra = require("./sebra");
const zebra = require("./zebra");

let timeRange = { min: 0, max: 0 }; // Interval waktu delay
let tokenAmountRange = { min: 0, max: 0 }; // Rentang jumlah token

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

// Fungsi untuk mengambil input manual
const askForCustomData = (dataType, validationRegex = null) => {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        console.log(`Masukkan daftar ${dataType} satu per baris. Ketik 'done' jika sudah selesai:`);
        let dataList = [];

        rl.on("line", (line) => {
            const trimmedLine = line.trim();
            if (trimmedLine.toLowerCase() === "done") {
                rl.close();
                resolve(dataList);
            } else if (!validationRegex || validationRegex.test(trimmedLine)) {
                dataList.push(trimmedLine);
            } else {
                console.error(`❌ Data ${dataType} tidak valid: ${trimmedLine}`);
            }
        });
    });
};

// 1: Menambahkan Private Key
const addPrivateKeys = async () => {
    const privateKeys = await askForCustomData(
        "private key",
        /^0x[a-fA-F0-9]{64}$/ // Validasi format private key
    );

    if (privateKeys.length === 0) {
        console.log("⚠️ Tidak ada private key yang valid untuk ditambahkan.");
        return;
    }

    sebra.privateKeys.push(...privateKeys);
    fs.writeFileSync(
        path.join(__dirname, "sebra.js"),
        `module.exports = ${JSON.stringify(sebra, null, 2)};`
    );

    console.log(`✅ ${privateKeys.length} Private key berhasil ditambahkan!`);
};

// 2: Menambahkan Address
const addAddresses = async () => {
    const addresses = await askForCustomData("address", /^0x[a-fA-F0-9]{40}$/); // Validasi format address

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

// 3: Hubungkan Token Kontrak ke Private Key
const assignTokensToPrivateKeys = async () => {
    console.log("🚀 Sekarang Anda akan menghubungkan token kontrak dengan masing-masing private key.");

    const provider = new ethers.JsonRpcProvider("https://tea-sepolia.g.alchemy.com/public");
    const ERC20_ABI = ["function decimals() view returns (uint8)"]; // Minimal ABI untuk validasi kontrak

    const tokenAssignments = []; // Menyimpan pasangan private key dan token

    for (let i = 0; i < sebra.privateKeys.length; i++) {
        const privateKey = sebra.privateKeys[i];
        console.log(`\n🔑 Private Key ${i + 1} dari ${sebra.privateKeys.length}`);
        console.log(privateKey);

        const wallet = new ethers.Wallet(privateKey, provider);
        let tokenAddress;

        while (true) {
            tokenAddress = await askQuestion(
                "Masukkan alamat kontrak token ERC-20 untuk private key ini (ketik 'skip' untuk melewati): "
            );

            if (tokenAddress.toLowerCase() === "skip") {
                console.log("⏭️ Melewati private key ini tanpa menghubungkan token.");
                break;
            }

            // Validasi kontrak token
            if (ethers.isAddress(tokenAddress)) {
                try {
                    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
                    const decimals = await contract.decimals();
                    console.log(`✅ Token valid dengan ${decimals} desimal.`);
                    tokenAssignments.push({ privateKey, tokenAddress });
                    break;
                } catch (error) {
                    console.error(`❌ Kontrak tidak valid atau tidak mendukung ERC-20: ${error.message}`);
                }
            } else {
                console.error("❌ Alamat kontrak tidak valid. Silakan coba lagi.");
            }
        }
    }

    // Simpan pasangan private key dan token
    if (tokenAssignments.length > 0) {
        fs.writeFileSync(
            path.join(__dirname, "tokenAssignments.json"),
            JSON.stringify(tokenAssignments, null, 2)
        );
        console.log("✅ Semua pasangan private key dan token berhasil disimpan ke 'tokenAssignments.json'.");
    } else {
        console.log("⚠️ Tidak ada pasangan private key dan token yang disimpan.");
    }
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

// 5: Atur Jumlah Token
const setTokenAmount = async () => {
    const minAmount = await askQuestion("Masukkan jumlah minimum token yang akan dikirim: ");
    const maxAmount = await askQuestion("Masukkan jumlah maksimum token yang akan dikirim: ");

    if (isNaN(parseFloat(minAmount)) || isNaN(parseFloat(maxAmount))) {
        console.error("❌ Jumlah minimum atau maksimum tidak valid.");
        return;
    }

    tokenAmountRange = {
        min: parseFloat(minAmount),
        max: parseFloat(maxAmount),
    };

    console.log(`✅ Jumlah token berhasil disimpan: Minimum ${tokenAmountRange.min}, Maksimum ${tokenAmountRange.max}`);
};

// 6: Pengiriman Token
const sendTokens = async () => {
    const tokenAssignments = JSON.parse(fs.readFileSync(path.join(__dirname, "tokenAssignments.json")));
    const provider = new ethers.JsonRpcProvider("https://tea-sepolia.g.alchemy.com/public");
    const ERC20_ABI = [
        "function transfer(address to, uint256 amount) public returns (bool)",
        "function decimals() view returns (uint8)"
    ];

    if (tokenAmountRange.min === 0 && tokenAmountRange.max === 0) {
        console.error("❌ Jumlah token minimum dan maksimum belum diatur. Silakan pilih opsi untuk 'Atur Jumlah Token'.");
        return;
    }

    for (const assignment of tokenAssignments) {
        const { privateKey, tokenAddress } = assignment;
        console.log(`\n🔑 Memulai transaksi untuk Private Key: ${privateKey}`);
        console.log(`📄 Token Kontrak yang Terhubung: ${tokenAddress}`);

        const wallet = new ethers.Wallet(privateKey, provider);
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
        const decimals = Number(await contract.decimals());

        for (const address of zebra.addresses) {
            const randomAmount = (
                Math.random() * (tokenAmountRange.max - tokenAmountRange.min) + tokenAmountRange.min
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

        console.log(`✅ Transaksi selesai untuk Private Key: ${privateKey}`);
    }

    console.log("\n⏳ Semua transaksi selesai. Menunggu 24 jam sebelum mengulangi proses...");
    await new Promise((resolve) => setTimeout(resolve, 24 * 60 * 60 * 1000));

    // Panggil fungsi ini kembali untuk mengulang siklus
    sendTokens();
};

// Menu Utama
(async () => {
    while (true) {
        const action = await askQuestion(
            "\nPilih opsi:\n1: Tambah Private Key\n2: Tambah Address\n3: Hubungkan Token & Private Key\n4: Atur Waktu\n5: Atur Jumlah Token\n6: Kirim Token\nPilihan Anda: "
        );

        if (action === "1") {
            await addPrivateKeys();
        } else if (action === "2") {
            await addAddresses();
        } else if (action === "3") {
            await assignTokensToPrivateKeys();
        } else if (action === "4") {
            await setTime();
        } else if (action === "5") {
            await setTokenAmount();
        } else if (action === "6") {
            await sendTokens();
        } else {
            console.error("❌ Pilihan tidak valid.");
        }
    }
})();
