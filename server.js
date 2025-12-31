const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// 1. Serve Static Assets
// This tells Express to serve files from your root, /js, and /styles folders
app.use(express.static(path.join(__dirname)));

// 2. Main Entry Point
// When Discord requests the root URL, send index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 3. Health Check (Optional but good for hosting platforms)
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// 4. Start Server
app.listen(port, () => {
    console.log(`\n--- CONSTELLATION SERVER ONLINE ---`);
    console.log(`Local: http://localhost:${port}`);
    console.log(`Mode:  ${process.env.NODE_ENV || 'development'}`);
});