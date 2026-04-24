const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
const admin = require("firebase-admin");
const serviceAccount = require(process.env.FIREBASE_KEY_PATH || "./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const TelegramBot = require('node-telegram-bot-api');

let orderCounter = 1000;
const orders = {};

const products = [
    { id: "shoe_rack_24", name: "Shoe Rack (24 pairs)", price: 1700, image: "https://t.me/ro118l/57?single" },
    { id: "shoe_rack_17", name: "Shoe Rack (17 pairs)", price: 1500, image: "https://t.me/ro118l/51?single" },
    { id: "bag_holder_8", name: "Bag Holder (8 bags)", price: 800, image: "https://t.me/ro118l/56" },
    { id: "bag_holder_6", name: "Bag Holder (6 bags)", price: 700, image: "https://t.me/ro118l/60?single" },
    { id: "satin_bonnet", name: "Satin Bonnet", price: 300, image: "https://t.me/ro118l/55?single" },
    { id: "pillow_case", name: "Pillow Case", price: 600, image: "https://t.me/ro118l/59?single" }
];

// 🔑 Replace with your real token
const token = '8652995302:AAGkHEYygJZcwu2dDazdtco6etDSPFpJ74Q';

// Create bot
const bot = new TelegramBot(token, { polling: true });

// Start command
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Welcome to Romi's Design 🛍️\n\nChoose an option:", {
        reply_markup: {
            keyboard: [
                ["🛍 View Products"],
                ["📦 Order Now"],
                ["📞 Contact Us"],
                ["📤 Share with Friends"]
            ],
            resize_keyboard: true
        }
    });
});

// Handle messages
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "🛍 View Products") {
        products.forEach(product => {
            const imageUrl = product.image || "https://via.placeholder.com/300";
            bot.sendPhoto(msg.chat.id, imageUrl, {
                caption: `${product.name}\nPrice: ${product.price} ETB`,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Order", callback_data: `order_${product.id}` }]
                    ]
                }
            });
        });
    }

    if (text === "📦 Order Now") {
        bot.sendMessage(msg.chat.id, "Please type the product name you want to order.");
    }

    if (text === "📞 Contact Us") {
        bot.sendMessage(
            msg.chat.id,
            "📞 Contact Romi's Design\n\nPhone 1: 0970050032\nPhone 2: 0970050025\n\nOr chat with us on Telegram:",
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "💬 Chat on Telegram", url: "https://t.me/romisdesign" }
                        ]
                    ]
                }
            }
        );
    }

    if (text === "📤 Share with Friends") {
        bot.sendMessage(chatId,
            "Love our products? 😄\n\nShare Romi's Design with your friends:",
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "📤 Share Bot",
                                url: "https://t.me/romis_design_bot"
                            }
                        ]
                    ]
                }
            }
        );
    }

    if (text.startsWith("/done")) {
        const orderId = text.split(" ")[1];
        await db.collection("orders").doc(orderId).update({
            status: "Delivered"
        });
        bot.sendMessage(chatId, `✅ Order #${orderId} marked as Delivered`);
        return;
    }

    if (text.startsWith("/processing")) {
        const orderId = text.split(" ")[1];
        await db.collection("orders").doc(orderId).update({
            status: "Processing"
        });
        bot.sendMessage(chatId, `🔄 Order #${orderId} is now Processing`);
        return;
    }

    // Check if user is ordering
    if (orders[chatId]) {
        const step = orders[chatId].step;

        if (step === "quantity") {
            const qty = parseInt(msg.text);

            if (isNaN(qty) || qty <= 0) {
                bot.sendMessage(chatId, "Please enter a valid number.");
                return;
            }

            orders[chatId].quantity = qty;
            orders[chatId].total = qty * orders[chatId].price;
            orders[chatId].step = "name";

            bot.sendMessage(chatId, "What is your name?");
            return;
        }

        if (step === "name") {
            orders[chatId].name = msg.text;
            orders[chatId].step = "phone";
            bot.sendMessage(chatId, "Please enter your phone number:");
            return;
        }

        if (step === "phone") {
            orders[chatId].phone = msg.text;
            orders[chatId].step = "location";
            bot.sendMessage(chatId, "Enter your location:");
            return;
        }

        if (step === "location") {
            orders[chatId].location = msg.text;
            orders[chatId].step = "confirm";

            bot.sendMessage(chatId,
                `🧾 Order Summary:\n\nProduct: ${orders[chatId].product}\nQuantity: ${orders[chatId].quantity}\nTotal: ${orders[chatId].total} ETB\n\nConfirm your order?`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✅ Confirm", callback_data: "confirm_order" }
                            ],
                            [
                                { text: "✏️ Edit Quantity", callback_data: "edit_quantity" },
                                { text: "❌ Cancel", callback_data: "cancel_order" }
                            ]
                        ]
                    }
                }
            );

            return;
        }
    }
});

// Handle button clicks
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    const product = products.find(p => `order_${p.id}` === data);

    if (product) {
        orders[chatId] = {
            step: "quantity",
            product: product.name,
            price: product.price
        };
        bot.sendMessage(chatId, `You selected: ${product.name}\n\nHow many do you want?`);
        return;
    }

    if (data === "confirm_order") {
        const order = orders[chatId];
        const orderId = ++orderCounter;
        await db.collection("orders").doc(orderId.toString()).set({
            orderId: orderId,
            product: order.product,
            quantity: order.quantity,
            total: order.total,
            name: order.name,
            phone: order.phone,
            location: order.location,
            status: "Pending",
            createdAt: new Date()
        });
        const orderDetails = `🆕 New Order!\n\nOrder ID: #${orderId}\nProduct: ${order.product}\nQuantity: ${order.quantity}\nTotal: ${order.total} ETB\nName: ${order.name}\nPhone: ${order.phone}\nLocation: ${order.location}`;
        // Send to customer
        bot.sendMessage(chatId,
            `✅ Order confirmed!\n\n🧾 Your Order ID: #${orderId}\n\nWe will contact you soon.`
        );
        // Send to you (admin)
        bot.sendMessage(393103761, orderDetails);
        delete orders[chatId];
        return;
    }

    if (data === "cancel_order") {
        bot.sendMessage(chatId, "❌ Order cancelled. You can start again anytime.");
        delete orders[chatId];
        return;
    }

    if (data === "edit_quantity") {
        orders[chatId].step = "quantity";
        bot.sendMessage(chatId, "Enter new quantity:");
        return;
    }
});
