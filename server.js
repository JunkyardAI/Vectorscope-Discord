const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// 1. Serve Static Assets
// This allows the server to access 'styles/style.css' and 'js/main.js'
// because they are included via vercel.json
app.use(express.static(path.join(__dirname)));

// 2. Main Entry Point
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 3. Health Check
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// 4. Start Server
app.listen(port, () => {
    console.log(`\n--- CONSTELLATION SERVER ONLINE ---`);
    console.log(`Local: http://localhost:${port}`);
    console.log(`Mode:  ${process.env.NODE_ENV || 'development'}`);
});
