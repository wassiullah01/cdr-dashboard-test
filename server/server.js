import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import uploadRoutes from './routes/upload.js';
import ingestRoutes from './routes/ingest.js';
import eventsRoutes from './routes/events.js';
import analyticsRoutes from './routes/analytics.js';

dotenv.config();

const app = express();
// PORT: Vercel provides PORT env var automatically, fallback to 5000 for local dev
const PORT = process.env.PORT || 5000;

// CORS Configuration
// In production, allow requests from deployed frontend URL
// In development, allow localhost
const allowedOrigins = [
  process.env.FRONTEND_URL, // Production frontend URL from env
  'http://localhost:3000',   // Local development
  'http://127.0.0.1:3000'     // Alternative localhost
].filter(Boolean); 

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      // In production, be strict about origins
      if (process.env.NODE_ENV === 'production') {
        callback(new Error('Not allowed by CORS'));
      } else {
        // In development, allow all origins for easier testing
        callback(null, true);
      }
    }
  },
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  console.error('Error stack:', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Routes
app.use('/api/uploads', uploadRoutes);
app.use('/api/ingest', ingestRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// MongoDB connection with retry logic
const connectDB = async () => {
  try {
    // MONGODB_URI is required in production (set in Vercel env vars)
    // For local development, fallback to localhost
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cdr_dashboard';
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err.message);
    });
    
    mongoose.connection.on('disconnected', () => {
      // Only log in development to avoid issues in production
      if (process.env.NODE_ENV === 'development') {
        console.warn('MongoDB disconnected. Attempting to reconnect...');
      }
    });
    
    mongoose.connection.on('reconnected', () => {
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.log('MongoDB reconnected');
      }
    });
    
    // Vercel handles server startup automatically
    if (process.env.VERCEL !== '1') {
      app.listen(PORT, () => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`Server running on port ${PORT}`);
        }
      });
    }
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    // Only retry in non-Vercel environments
    if (process.env.VERCEL !== '1') {
      console.error('Retrying connection in 5 seconds...');
      setTimeout(connectDB, 5000);
    }
  }
};

connectDB();

export default app;