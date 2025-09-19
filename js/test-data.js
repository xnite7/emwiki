// Test data for development when external API is not available
window.TEST_DATA = {
  gears: [
    {
      name: "Ancient Sword",
      img: "https://via.placeholder.com/64x64/4CAF50/ffffff?text=S1",
      from: "Season 1 Steel Chest",
      price: "1500",
      "price/code/rarity": "1500 Coins\nUncommon",
      tradable: true,
      retired: false,
      premium: false,
      new: false
    },
    {
      name: "Dragon Helmet",
      img: "https://via.placeholder.com/64x64/FF9800/ffffff?text=H1",
      from: "Halloween 2023 Event",
      price: "2500",
      "price/code/rarity": "2500 Coins\nRare",
      tradable: true,
      retired: false,
      premium: true,
      new: false
    },
    {
      name: "Gamenight Shield",
      img: "https://via.placeholder.com/64x64/9C27B0/ffffff?text=G1",
      from: "Gamenight Exclusive",
      price: "5000",
      "price/code/rarity": "5000 Coins\nEpic",
      tradable: false,
      retired: false,
      premium: false,
      new: true
    },
    {
      name: "Season 13 Boots",
      img: "https://via.placeholder.com/64x64/2196F3/ffffff?text=B1",
      from: "Season 13 Lucky Chest",
      price: "800",
      "price/code/rarity": "800 Coins\nCommon",
      tradable: true,
      retired: false,
      premium: false,
      new: false
    },
    {
      name: "Easter Bunny Ears",
      img: "https://via.placeholder.com/64x64/E91E63/ffffff?text=E1",
      from: "Easter 2024 Bundle",
      price: "1200",
      "price/code/rarity": "1200 Coins\nUncommon",
      tradable: true,
      retired: false,
      premium: false,
      new: false
    },
    {
      name: "Birthday Crown",
      img: "https://via.placeholder.com/64x64/FF5722/ffffff?text=C1",
      from: "Birthday Chest Special",
      price: "3000",
      "price/code/rarity": "3000 Coins\nRare",
      tradable: true,
      retired: false,
      premium: true,
      new: false
    },
    {
      name: "Rodis Gamenight Sword",
      img: "https://via.placeholder.com/64x64/795548/ffffff?text=R1",
      from: "Rodis Gamenight Event",
      price: "4500",
      "price/code/rarity": "4500 Coins\nEpic",
      tradable: false,
      retired: false,
      premium: false,
      new: false
    },
    {
      name: "Staff Exclusive Armor",
      img: "https://via.placeholder.com/64x64/607D8B/ffffff?text=A1",
      from: "Staff Item",
      price: "N/A",
      "price/code/rarity": "Staff Only\nLegendary",
      tradable: false,
      retired: false,
      premium: false,
      new: false
    }
  ]
};

// Add more test items to test pagination
for (let i = 9; i <= 50; i++) {
  window.TEST_DATA.gears.push({
    name: `Test Gear ${i}`,
    img: `https://via.placeholder.com/64x64/${Math.floor(Math.random()*16777215).toString(16)}/ffffff?text=T${i}`,
    from: i % 2 === 0 ? `Season ${Math.ceil(i/4)} Item` : `Random Chest Item ${i}`,
    price: (Math.floor(Math.random() * 5000) + 100).toString(),
    "price/code/rarity": `${Math.floor(Math.random() * 5000) + 100} Coins\n${['Common', 'Uncommon', 'Rare', 'Epic'][Math.floor(Math.random() * 4)]}`,
    tradable: Math.random() > 0.3,
    retired: Math.random() > 0.8,
    premium: Math.random() > 0.7,
    new: Math.random() > 0.9
  });
}