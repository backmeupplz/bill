const TelegramBot = require('node-telegram-bot-api')
const token = '454530498:AAEGpFbjeIhKsL7hprcsEZC27NvMbAaegoY'
let bot = new TelegramBot(token, {polling: true})
module.exports = bot