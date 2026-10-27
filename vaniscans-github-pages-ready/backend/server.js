const express = require('express');
const cors = require('cors');
const path = require('path');
const mangaRoutes = require('./routes/manga');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api', mangaRoutes);

// Serve Frontend Static Files
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Support direct /adminpanel and /comics/... live URLs on page reload
app.get('/adminpanel', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/comics/*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`⚡ VaniScans Server running at http://localhost:${PORT}`);
    console.log(`🔒 Admin Panel accessible at http://localhost:${PORT}/adminpanel`);
});
