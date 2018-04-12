const key = require('./auth.json')

var google = require('googleapis')
const sheets = google.sheets('v4')
let jwtClient = new google.auth.JWT(
  key.client_email,
  null,
  key.private_key,
  ['https://www.googleapis.com/auth/spreadsheets'])
const spreadsheetId = '1g75OIJGOqvZveIReuurPtDY-Yau39PBcMQ6qrTlFddE'

let authorized = false
let sheet = []

// Authorize
jwtClient.authorize(async (err, tokens) => {
  authorized = true

  // Start updating the sheet
  await getSheet()
  checkReminders()

  setInterval(async () => {
    await getSheet()
    checkReminders()
  }, 1000 * 60 * 10)
})