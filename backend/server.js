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
import rateLimit from "express-rate-limit";

dotenv.config();

connectDB();

const app = express();

// Security Middleware
app.use(helmet());
app.use(mongoSanitize());

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use("/api/", apiLimiter);

const server = http.createServer(app);

const allowedOrigin = [
    'http://localhost:5174',
    'http://localhost:5173',
    'https://ai-interviewer-phi-ten.vercel.app',
    process.env.FRONTEND_URL,
].filter(Boolean);

const io = new Server(server, {
    cors: {
        origin: allowedOrigin,
        methods: ['GET', 'POST', 'PUT', 'DELETE',  'OPTIONS'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization'],
    }
})

app.use(cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization',"X-Requested-With"],
}))

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("io", io);

import fetch from "node-fetch";

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


