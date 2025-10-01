import axios from "axios";
import dotenv from "dotenv";
import express, { raw } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit"
import { LRUCache } from "lru-cache"
import axiosRetry from "axios-retry"

dotenv.config();
const app = express();

const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || "60", 10);
const PORT = parseInt(process.env.PORT || "3000", 10);
const PROXY_KEY = process.env.PROXY_KEY || null;
const TRUSTED_FRONTEND = process.env.TRUSTED_FRONTEND;
const catalog_url = `https://catalog.roblox.com/v1/search/items/details?`;
const API_KEY = process.env.API_KEY;

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

const localcache = new LRUCache({max: 1000, ttl: CACHE_TTL_SECONDS * 1000})

async function CacheGet(key) {
    return localcache.get(key) || null;
}

async function CacheSet(key, value, ttlseconds) {
    localcache.set(key, value, {ttl: Math.max(1000, ttlseconds * 1000)});
}

if (PROXY_KEY) {
  app.use((req, res, next) => {
    const key = req.header("x-proxy-key");
    if (key !== PROXY_KEY) return res.status(401).json({ error: "Unauthorized" });
    next();
  });
}

function cacheKey(req) {
    const qs = Object.keys(req.query).sort().map(k => `${k}=${req.query[k]}`).join("&");
    return `${req.path}?${qs}`;
}

function sanitizeQuery(q) {
    const map = {
        keyword: "Keyword",
        category: "Category",
        subcategory: "Subcategory",
        limit: "Limit",
        cursor: "Cursor",
        sortorder: "SortOrder"
    }
    const out = {};

    for (const rawkey of Object.keys(q)) {
        const lower = rawkey.toLowerCase();
        const target = map[lower];
        
        if (!target) continue;
        if (target === "Limit") {
            const n = parseInt(q[rawkey], 10) || 10;
            const allowed = [10, 28, 30];
            out[target] = allowed.includes(n) ? n : 10;
        } else {
            out[target] = q[rawkey];
        }
    }

    return out;
}

app.get("/", (req, res) => {
  res.send(`<h1>Roblox Catalog Proxy</h1> <p>Use <code>/catalog?Keyword=sword&Limit=5</code></p>`);
});

app.get("/health", async(req, res) => res.json({ok: true}));

app.get("/catalog", async(req, res) => {
    try {
        const key = cacheKey(req);
        const cached = await CacheGet(key);
        if (cached) return res.json({cached: true, ...cached});

        const params = sanitizeQuery(req.query)
        const response = await axios_instance.get(catalog_url, {
            params,
            headers: {
                "User-Agent": "roblox-catalog-proxy/1.0",
            },
        });

        const payload = {cached: false, source: "catalog.roblox.com", data: response.data};
        
        await CacheSet(key, payload, CACHE_TTL_SECONDS)

        return res.json(payload);
    } catch(err) {
        console.error("Error proxy: ", err.response?.data || err.message || err)
        const status = err.response?.status || 500;
        return res.status(status).json({error: "Cant access catalog", details: err.response?.data || err.message});
    }
});

app.listen(PORT, () => console.log(`Proxy seguro rodando em ${TRUSTED_FRONTEND}`))