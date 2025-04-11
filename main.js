require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");
const fs = require("fs");

// Data global
let config = {
  privateKeys: process.env.PRIVATE_KEYS
    ? process.env.PRIVATE_KEYS.split(",").map((key) => key.trim())
    : [],
  tokenContracts: process.env.TOKEN_CONTRACTS
    ? process.env.TOKEN_CONTRACTS.split(",").map((contract) => contract.trim())
    : [],
  addresses: [],
  transactionSettings: {
    minToken: 0,
    maxToken: 0,
    minDelay: 0,
    maxDelay: 0,
    transactionCount: 0, // Ini akan merepresentasikan total transaksi (n)
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

// Helper function: sleep
const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Fungsi untuk mengirim transaksi dengan retry logic (default → alternatif → default)
const sendTransaction = async (privateKey, tokenContract, randomAddress, randomAmount, currentTx, totalTx) => {
  console.log(`\n[Transaksi ${currentTx} dari ${totalTx}]`);
  const defaultProviderURL = RPC_URLS[0];
  const altProviderURL = RPC_URLS[1];
  
  // Attempt pertama dengan default RPC
  let prov = new ethers.JsonRpcProvider(defaultProviderURL);
  let wallet = new ethers.Wallet(privateKey, prov);
  let contract = new ethers.Contract(tokenContract, ERC20_ABI, wallet);
  try {
    let tx = await contract.transfer(randomAddress, ethers.parseUnits(randomAmount));
    console.log(`✅ Transaksi berhasil dengan default RPC: ${randomAmount} token ke ${randomAddress}. Tx Hash: ${tx.hash}`);
    await tx.wait();
    return;
  } catch (error1) {
    console.error(`❌ Gagal transaksi dengan default RPC: ${error1.message}`);
  }

  // Attempt kedua dengan alternatif RPC
  console.log("⏳ Mencoba dengan RPC alternatif dalam 10 detik...");
  await sleep(10000);
  prov = new ethers.JsonRpcProvider(altProviderURL);
  wallet = new ethers.Wallet(privateKey, prov);
  contract = new ethers.Contract(tokenContract, ERC20_ABI, wallet);
  try {
    let tx = await contract.transfer(randomAddress, ethers.parseUnits(randomAmount));
    console.log(`✅ Transaksi berhasil dengan RPC alternatif: ${randomAmount} token ke ${randomAddress}. Tx Hash: ${tx.hash}`);
    await tx.wait();
    return;
  } catch (error2) {
    console.error(`❌ Gagal transaksi dengan RPC alternatif: ${error2.message}`);
  }

  // Attempt ketiga: tunggu 2 menit dan coba lagi dengan default RPC
  console.log("⏳ Menunggu 2 menit sebelum mencoba kembali dengan default RPC...");
  await sleep(120000);
  prov = new ethers.JsonRpcProvider(defaultProviderURL);
  wallet = new ethers.Wallet(privateKey, prov);
  contract = new ethers.Contract(tokenContract, ERC20_ABI, wallet);
  try {
    let tx = await contract.transfer(randomAddress, ethers.parseUnits(randomAmount));
    console.log(`✅ Transaksi berhasil setelah jeda dengan default RPC: ${randomAmount} token ke ${randomAddress}. Tx Hash: ${tx.hash}`);
    await tx.wait();
    return;
  } catch (error3) {
    console.error(`❌ Transaksi gagal setelah tiga percobaan: ${error3.message}`);
  }
};

// Fungsi untuk mengatur dan memulai transaksi dalam sesi
const setTransactionSettingsAndStart = async () => {
  // Pastikan data jaringan telah disinkronisasi
  await synchronizeData();

  config.transactionSettings.minDelay = parseInt(await askQuestion("Masukkan interval delay minimum (detik) untuk transaksi: "));
  config.transactionSettings.maxDelay = parseInt(await askQuestion("Masukkan interval delay maksimum (detik) untuk transaksi: "));
  config.transactionSettings.minToken = parseFloat(await askQuestion("Masukkan jumlah token minimum: "));
  config.transactionSettings.maxToken = parseFloat(await askQuestion("Masukkan jumlah token maksimum: "));
  config.transactionSettings.transactionCount = parseInt(await askQuestion("Masukkan jumlah transaksi total (n) yang akan dikirim: "));

  await startTransactionSessions();
};

// Fungsi utama untuk mengatur sesi transaksi harian
const startTransactionSessions = async () => {
  let totalTx = config.transactionSettings.transactionCount;
  // Hitung jumlah transaksi tiap sesi
  let session1Count = Math.floor(totalTx * 0.2);
  let session2Count = Math.floor(totalTx * 0.1);
  let session3Count = Math.floor(totalTx * 0.5);
  let session4Count = totalTx - (session1Count + session2Count + session3Count);

  console.log("\nSesi transaksi telah diatur sebagai berikut:");
  console.log(`- Sesi 1: ${session1Count} transaksi (20%)`);
  console.log(`- Sesi 2: ${session2Count} transaksi (10%)`);
  console.log(`- Sesi 3: ${session3Count} transaksi (50%)`);
  console.log(`- Sesi 4: ${session4Count} transaksi (20%)\n`);

  while (true) {
    // Reload alamat penerima tiap siklus
    let addresses = loadRecipientAddresses();
    if (addresses.length === 0) {
      console.error("❌ Tidak ada address penerima di file addresses.json.");
      return;
    }
    // Asumsikan untuk transaksi menggunakan privateKey dan tokenContract yang pertama
    let privateKey = config.privateKeys[0];
    let tokenContract = config.tokenContracts[0];

    let globalTxCounter = 1;
    // Sesi 1
    console.log("🔄 Memulai Sesi 1...");
    for (let i = 0; i < session1Count; i++) {
      let randomAddress = addresses[Math.floor(Math.random() * addresses.length)];
      let randomAmount = (
        Math.random() * (config.transactionSettings.maxToken - config.transactionSettings.minToken) +
        config.transactionSettings.minToken
      ).toFixed(18);
      await sendTransaction(privateKey, tokenContract, randomAddress, randomAmount, globalTxCounter, totalTx);
      globalTxCounter++;
      const delaySec = Math.floor(Math.random() * (config.transactionSettings.maxDelay - config.transactionSettings.minDelay) + config.transactionSettings.minDelay);
      await sleep(delaySec * 1000);
    }
    console.log("✅ Sesi 1 selesai. Menunggu 1 jam 5 menit sebelum sesi berikutnya...");
    await sleep(3900000); // 1 jam 5 menit = 65 menit

    // Sesi 2
    console.log("🔄 Memulai Sesi 2...");
    for (let i = 0; i < session2Count; i++) {
      let randomAddress = addresses[Math.floor(Math.random() * addresses.length)];
      let randomAmount = (
        Math.random() * (config.transactionSettings.maxToken - config.transactionSettings.minToken) +
        config.transactionSettings.minToken
      ).toFixed(18);
      await sendTransaction(privateKey, tokenContract, randomAddress, randomAmount, globalTxCounter, totalTx);
      globalTxCounter++;
      const delaySec = Math.floor(Math.random() * (config.transactionSettings.maxDelay - config.transactionSettings.minDelay) + config.transactionSettings.minDelay);
      await sleep(delaySec * 1000);
    }
    console.log("✅ Sesi 2 selesai. Menunggu 1 jam 5 menit sebelum sesi berikutnya...");
    await sleep(3900000);

    // Sesi 3
    console.log("🔄 Memulai Sesi 3...");
    for (let i = 0; i < session3Count; i++) {
      let randomAddress = addresses[Math.floor(Math.random() * addresses.length)];
      let randomAmount = (
        Math.random() * (config.transactionSettings.maxToken - config.transactionSettings.minToken) +
        config.transactionSettings.minToken
      ).toFixed(18);
      await sendTransaction(privateKey, tokenContract, randomAddress, randomAmount, globalTxCounter, totalTx);
      globalTxCounter++;
      const delaySec = Math.floor(Math.random() * (config.transactionSettings.maxDelay - config.transactionSettings.minDelay) + config.transactionSettings.minDelay);
      await sleep(delaySec * 1000);
    }
    console.log("✅ Sesi 3 selesai. Menunggu 1 jam 5 menit sebelum sesi berikutnya...");
    await sleep(3900000);

    // Sesi 4
    console.log("🔄 Memulai Sesi 4...");
    for (let i = 0; i < session4Count; i++) {
      let randomAddress = addresses[Math.floor(Math.random() * addresses.length)];
      let randomAmount = (
        Math.random() * (config.transactionSettings.maxToken - config.transactionSettings.minToken) +
        config.transactionSettings.minToken
      ).toFixed(18);
      await sendTransaction(privateKey, tokenContract, randomAddress, randomAmount, globalTxCounter, totalTx);
      globalTxCounter++;
      const delaySec = Math.floor(Math.random() * (config.transactionSettings.maxDelay - config.transactionSettings.minDelay) + config.transactionSettings.minDelay);
      await sleep(delaySec * 1000);
    }
    console.log("✅ Sesi 4 selesai.");

    // Setelah semua sesi, tunggu hingga pukul 07:30 keesokan harinya
    let now = new Date();
    let nextRun = new Date(now);
    nextRun.setDate(now.getDate() + 1);
    nextRun.setHours(7, 30, 0, 0);
    let waitMs = nextRun - now;
    console.log(`⏳ Semua sesi selesai. Menunggu hingga pukul 07:30 besok (sekitar ${Math.round(waitMs / 60000)} menit)...`);
    await sleep(waitMs);
  }
};

// Menu Utama
const mainMenu = async () => {
  await initializeProvider(); // Inisialisasi provider dengan endpoint RPC yang responsif

  while (true) {
    console.log("\nPilih opsi:");
    console.log("1. Input Private Key dan Token Contract");
    console.log("2. Input Address Penerima");
    console.log("3. Tambah Endpoint RPC Baru");
    console.log("4. Atur dan Mulai Transaksi (sesi harian)");
    console.log("5. Keluar");

    const choice = await askQuestion("Pilihan Anda: ");
    if (choice === "1") {
      await inputPrivateKeyAndContract();
    } else if (choice === "2") {
      await inputRecipientAddresses();
    } else if (choice === "3") {
      await addRPC();
    } else if (choice === "4") {
      await setTransactionSettingsAndStart();
    } else if (choice === "5") {
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
