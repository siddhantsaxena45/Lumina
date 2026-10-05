import express from "express";
import http from "http";
import dotenv from "dotenv";
import cors from "cors";
import { Server } from "socket.io";
import connectDB from "./config/db.js";
import userRoutes from "./routes/userRoutes.js";
import sessionRoutes from "./routes/sessionRoutes.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import { rateLimit } from "express-rate-limit";

dotenv.config();

connectDB();

const allowedOrigin = [
    'http://localhost:5174',
    'http://localhost:5173',
    'https://ai-interviewer-phi-ten.vercel.app',
    process.env.FRONTEND_URL,
].filter(Boolean);

const app = express();

app.set('trust proxy', 1);

// 1. CORS Middleware MUST be first!
app.use(cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', "X-Requested-With"],
}));

// 2. Security Middleware
app.use(helmet({
    crossOriginResourcePolicy: false,
}));
app.use(mongoSanitize());

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window`
    standardHeaders: true, 
    legacyHeaders: false, 
    // Render requires trust proxy if rate limit is used behind their load balancer
    // However, rate-limit handles missing trust proxy gracefully by using the proxy's IP.
});
app.use("/api/", apiLimiter);

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: allowedOrigin,
        methods: ['GET', 'POST', 'PUT', 'DELETE',  'OPTIONS'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization'],
    }
})

// CORS is already configured above

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("io", io);

app.get("/", (req, res) => {
    // Wake up the AI service in the background if it's sleeping on Render
    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    fetch(AI_SERVICE_URL).catch(err => console.error("AI Service wake-up ping failed:", err.message));
    
    res.send("API is running");
});

app.use("/api/users", userRoutes);
app.use("/api/sessions", sessionRoutes);

io.on("connection", (socket) => {
    console.log(`A user Connected ${socket.id}`);
    const userId=socket.handshake.query.userId;
    if(userId){

        socket.join(userId);
        console.log(`User ${socket.id} joined room: ${userId}`);
    }

    socket.on("disconnect", () => {
        console.log(`User Disconnected ${socket.id}`);
    });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(
    PORT,
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
);


