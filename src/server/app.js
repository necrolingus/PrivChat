const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

require('dotenv').config();

const channelRoutes = require('./routes/channels');
const profileRoutes = require('./routes/profile');
const phraseGeneratorRoutes = require('./routes/phraseGenerator');
const adminRoutes = require('./routes/admin');
const registerChatHandlers = require('./sockets/chatHandler');

const app = express();
const server = http.createServer(app);

// Socket.io initialization
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB limit for encrypted photo payloads
});

// Global Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Allowed for inline scripts / blob URLs used in E2EE media viewer
  })
);

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

// Global Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' },
});

app.use('/api', globalLimiter);

// API Routes
app.use('/api/channels', channelRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/generate', phraseGeneratorRoutes);
app.use('/api/admin', adminRoutes);

// Dedicated Admin Web Interface route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/admin.html'));
});

// Static frontend assets (served at root '/' and at '/src/client')
app.use(express.static(path.join(__dirname, '../client')));
app.use('/src/client', express.static(path.join(__dirname, '../client')));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Register Socket.io Chat Handlers
registerChatHandlers(io);

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const isPrivateServer = String(process.env.PRIVATE_SERVER || 'false').toLowerCase() === 'true';

  if (isPrivateServer) {
    const key = process.env.PRIVATE_SERVER_KEY || '';
    if (!/^[a-zA-Z0-9]{32,}$/.test(key)) {
      console.error(`\n❌ ERROR: PRIVATE_SERVER is true, but PRIVATE_SERVER_KEY must be an alphanumeric string of at least 32 characters in .env!`);
      console.error(`Current length: ${key.length}. Server start aborted.\n`);
      process.exit(1);
    }
  }

  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🔒 E2EE Secure Chat Server running on http://localhost:${PORT}`);
    console.log(`🔒 Server Mode: ${isPrivateServer ? 'PRIVATE (Invite Token Required)' : 'PUBLIC'}`);
    console.log(`=======================================================`);
  });
}

module.exports = { app, server, io };
