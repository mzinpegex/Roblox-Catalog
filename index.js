import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors({origin: process.env.TRUSTED_FRONTEND}))

const API_KEY = process.env.API_KEY;

app.get("/assets", async(req, res) => {
    try {
        const response = await axios.get(`https://apis.roblox.com/oauth/v1/credentials`, {
            headers: {
                "x-api-key": API_KEY,
            },
        });
    } catch(err) {
        res.status(500).json({error: err.message})
    }
});

app.listen(3000, () => console.log("porta 3000"))