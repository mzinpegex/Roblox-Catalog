import fetch from "node-fetch";

export default async function handler(req, res) {
    const {assetId} = req.query;
    if (!assetId) {
        return res.status(400).json({error: "assetId necessário"})
    }

    const url = `https://catalog.roblox.com/v1/catalog/items/${assetId}/details?itemType=Asset`;

    try {
        const resp = await fetch(url);
        const data = await resp.json();
        res.status(200).json(data);
    } catch (e) {
        res.status(500).json({error: "erro interno"});
    }
}