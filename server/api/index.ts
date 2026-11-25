// Vercel entry point: the whole Express app runs as one serverless function.
// vercel.json rewrites every path to /api, and Express routes on the original URL.
import { createApp } from "../src/app.js";

export default createApp();
