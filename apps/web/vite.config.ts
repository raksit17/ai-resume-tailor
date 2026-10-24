import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],server:{proxy:{'/v1':{target:process.env.API_PROXY || 'http://localhost:3010',changeOrigin:true}}}});
