import axios from "axios";
import dotenv from "dotenv";
import express, { json } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit"
import Redis from "ioredis"
import axiosRetry from "axios-retry"
import { cache } from "react";

dotenv.config();
const app = express();
const redis = new Redis()

app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(cors({origin: process.env.TRUSTED_FRONTEND || "*"}));

const limiter = rateLimit({
    windowMs: 15 * 1000 * 60,
    max: 150,
    standardHeaders: true,
    legacyHeaders: true,
})
app.use(limiter);

const axios_instance = axios.create({timeout: 8000});
axiosRetry(axios_instance, {retries: 2, retryDelay: axiosRetry.exponentialDelay});

const catalog_url = `https://catalog.roblox.com/v1/search/items/details`;
const API_KEY = process.env.API_KEY;

function cacheKey(req) {
    const qs = Object.keys(req.query).sort().map(k => `${k}=${req.query[k]}`).join("&");
    return `${req.path}?${qs}`;
}

app.get("/catalog", async(req, res) => {
    try {
        const key = cacheKey(req);
        const cached = await redis.get(key);

        if (cached) return res.json(JSON.parse(cached));
        await redis.set(key, JSON.stringify(payload), "EX", process.env.CACHE_TTL_SECONDS)

        const response = await axios_instance.get(catalog_url, {
            params: req.query,
        });

        const payload = {cached: false, source: "catalog.roblox.com", data: response.data};

        res.json(payload);
    } catch(err) {
        console.error("Error proxy: ", err.response?.data || err.message)
        const status = err.response?.status || 500;
        res.status(status).json({error: "Cant access catalog", details: err.response?.data || err.message});
    }
});

const port = process.env.PORT
app.listen(port, () => console.log(`Proxy seguro rodando em http://localhost:${port}`))