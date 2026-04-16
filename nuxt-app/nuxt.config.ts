// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  ssr: true,

  // node:sqlite は Node.js v24 組み込み。バンドル対象外にする
  nitro: {
    externals: {
      external: ["node:sqlite"],
    },
  },

  // サーバーサイドのみで使う環境変数
  runtimeConfig: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  },

  // グローバルCSS
  css: ["~/assets/css/main.scss"],
});
