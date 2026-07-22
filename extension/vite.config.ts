import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({plugins:[react()],build:{outDir:"dist",emptyOutDir:true,rollupOptions:{input:"src/content/index.tsx",output:{entryFileNames:"content.js"}}}});
