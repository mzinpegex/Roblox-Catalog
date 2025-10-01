import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const API_KEY = process.env.API_KEY;

async function Request(params) {
    try {
        const response = axios.get("https://apis.roblox.com/oauth/v1/credentials", {
            headers: {
                "x-api-key": API_KEY,
            },
        });
        
        console.log((await response).data);
    } catch (err) {
        console.error("Erro na request:", err.response?.status, err.response?.data || err.message);
    }
}

Request();