import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit"
import Redis from "ioredis"
import axiosRetry from "axios-retry"

dotenv.config();
const app = express();

const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || "60", 10);
const PORT = parseInt(process.env.PORT || "3000", 10);
const PROXY_KEY = process.env.PROXY_KEY || null;
const TRUSTED_FRONTEND = process.env.TRUSTED_FRONTEND;
const REDIS_URL = process.env.REDIS_URL;

console.log("REDIS_URL =", REDIS_URL);

const redis = new Redis(3000)

app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(cors({origin: TRUSTED_FRONTEND || "*"}));

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

if (PROXY_KEY) {
  app.use((req, res, next) => {
    const key = req.header("x-proxy-key");
    if (key !== PROXY_KEY) return res.status(401).json({ error: "Unauthorized" });
    return next();
  });
}

function cacheKey(req) {
    const qs = Object.keys(req.query).sort().map(k => `${k}=${req.query[k]}`).join("&");
    return `${req.path}?${qs}`;
}

function sanitizeQuery(q) {
    const allowed = new Set(["Keyword", "Category", "Subcategory", "Limit", "Cursor", "SortOrder"]);
    const out = {};

    for (const k of Object.keys(q)) {
        if (!allowed.has(k)) continue;

        if (k === "Limit") {
            const n = Math.max(1, Math.min(100, parseInt(q[k], 10) || 10));
            out[k] = n;
            continue;
        }

        out[k] = q[k];
    }

    return out;
}

app.get("/health", async(req, res) => res.json({ok: true}));

app.get("/catalog", async(req, res) => {
    try {
        const key = cacheKey(req);

        const cachedRaw = await redis.get(key);
        if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            return res.json({cached: true, ...cached});
        }

        const params = sanitizeQuery(req.query)

        const response = await axios_instance.get(catalog_url, {
            params,
            headers: {
                "User-Agent": "roblox-catalog-proxy/1.0",
            },
        });

        const payload = {cached: false, source: "catalog.roblox.com", data: response.data};
        
        await redis.set(key, JSON.stringify(payload), "EX", CACHE_TTL_SECONDS)

        return res.json(payload);
    } catch(err) {
        console.error("Error proxy: ", err.response?.data || err.message)
        const status = err.response?.status || 500;
        res.status(status).json({error: "Cant access catalog", details: err.response?.data || err.message});
    }
});

app.listen(PORT, () => console.log(`Proxy seguro rodando em ${TRUSTED_FRONTEND}`))