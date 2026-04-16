<template>
  <div>
    <nav class="nav">
      <!-- ロゴ -->
      <span class="nav-title">🚤 競艇予想</span>

      <!-- PC: 通常のリンク -->
      <div class="nav-links-pc">
        <NuxtLink to="/" class="nav-link" active-class="active" exact>出走表</NuxtLink>
        <NuxtLink to="/racers" class="nav-link" active-class="active">選手検索</NuxtLink>
        <NuxtLink to="/predict" class="nav-link" active-class="active">🎯 予想</NuxtLink>
        <NuxtLink to="/history" class="nav-link" active-class="active">📊 履歴</NuxtLink>
        <NuxtLink to="/accuracy" class="nav-link" active-class="active">🎯 的中率</NuxtLink>
      </div>

      <div class="nav-spacer" />

      <!-- データ更新ボタン（PC） -->
      <button
        class="refresh-btn nav-refresh-pc"
        :class="statusClass"
        :disabled="loading"
        @click="doRefresh"
      >
        {{ loading ? "⏳ 更新中..." : statusIcon + " データ更新" }}
      </button>

      <!-- ハンバーガーボタン（スマホのみ表示） -->
      <button class="hamburger" @click="menuOpen = !menuOpen" :aria-expanded="menuOpen">
        <span class="hamburger-line" :class="{ open: menuOpen }"></span>
        <span class="hamburger-line" :class="{ open: menuOpen }"></span>
        <span class="hamburger-line" :class="{ open: menuOpen }"></span>
      </button>
    </nav>

    <!-- スマホ用ドロワーメニュー -->
    <transition name="drawer">
      <div v-if="menuOpen" class="drawer" @click.self="menuOpen = false">
        <div class="drawer-inner">
          <NuxtLink to="/" class="drawer-link" active-class="active" exact @click="menuOpen = false">
            🚤 出走表
          </NuxtLink>
          <NuxtLink to="/racers" class="drawer-link" active-class="active" @click="menuOpen = false">
            🔍 選手検索
          </NuxtLink>
          <NuxtLink to="/predict" class="drawer-link" active-class="active" @click="menuOpen = false">
            🎯 AI予想
          </NuxtLink>
          <NuxtLink to="/history" class="drawer-link" active-class="active" @click="menuOpen = false">
            📊 履歴
          </NuxtLink>
          <NuxtLink to="/accuracy" class="drawer-link" active-class="active" @click="menuOpen = false">
            🎯 的中率
          </NuxtLink>
          <div class="drawer-divider"></div>
          <button
            class="drawer-refresh"
            :class="statusClass"
            :disabled="loading"
            @click="doRefresh(); menuOpen = false"
          >
            {{ loading ? "⏳ 更新中..." : statusIcon + " データ更新" }}
          </button>
        </div>
      </div>
    </transition>

    <main>
      <slot />
    </main>

    <!-- 結果トースト -->
    <transition name="toast">
      <div
        v-if="toast"
        class="toast"
        :class="toast.ok ? 'toast-ok' : 'toast-err'"
      >
        {{ toast.msg }}
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
const loading = ref(false);
const statusIcon = ref("🔄");
const statusClass = ref("");
const toast = ref<{ ok: boolean; msg: string } | null>(null);
const menuOpen = ref(false);

async function doRefresh() {
  loading.value = true;
  statusClass.value = "";
  statusIcon.value = "🔄";
  try {
    const res = await $fetch<any>("/api/refresh", { method: "POST" });
    if (res.success) {
      statusIcon.value = "✅";
      statusClass.value = "refresh-ok";
      showToast(true, `✅ 更新完了！${res.summary ? "  " + res.summary : ""}`);
      setTimeout(() => refreshNuxtData(), 1000);
    } else {
      statusIcon.value = "❌";
      statusClass.value = "refresh-err";
      showToast(false, `❌ エラー: ${res.error}`);
    }
  } catch (e: any) {
    statusIcon.value = "❌";
    statusClass.value = "refresh-err";
    showToast(false, `❌ 接続エラー: ${e.message}`);
  } finally {
    loading.value = false;
    setTimeout(() => {
      statusIcon.value = "🔄";
      statusClass.value = "";
    }, 5000);
  }
}

function showToast(ok: boolean, msg: string) {
  toast.value = { ok, msg };
  setTimeout(() => {
    toast.value = null;
  }, 6000);
}
</script>

<style scoped lang="scss">
/* ===== ナビ共通 ===== */
.nav-spacer { flex: 1; }

/* ===== PC用リンク・更新ボタン ===== */
.nav-links-pc {
  display: flex;
  align-items: center;
  gap: 4px;
}
.nav-refresh-pc {
  display: block;
}

/* ===== ハンバーガーボタン ===== */
.hamburger {
  display: none;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 5px;
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
}
.hamburger:hover {
  background: rgba(255, 255, 255, 0.1);
}
.hamburger-line {
  display: block;
  width: 22px;
  height: 2px;
  background: #fff;
  border-radius: 2px;
  transition: transform 0.25s, opacity 0.25s;
  transform-origin: center;
}
.hamburger-line:nth-child(1).open { transform: translateY(7px) rotate(45deg); }
.hamburger-line:nth-child(2).open { opacity: 0; }
.hamburger-line:nth-child(3).open { transform: translateY(-7px) rotate(-45deg); }

/* ===== ドロワー（スマホ用） ===== */
.drawer {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(0, 0, 0, 0.45);
}
.drawer-inner {
  position: absolute;
  top: 0;
  right: 0;
  width: 72vw;
  max-width: 300px;
  height: 100%;
  background: var(--color-primary, #1e3a8a);
  display: flex;
  flex-direction: column;
  padding: 80px 0 24px;
  box-shadow: -4px 0 20px rgba(0,0,0,0.3);
}
.drawer-link {
  display: block;
  color: rgba(255,255,255,0.85);
  text-decoration: none;
  font-size: 15px;
  font-weight: 600;
  padding: 14px 24px;
  transition: background 0.15s;
}
.drawer-link:hover,
.drawer-link.active {
  background: rgba(255,255,255,0.12);
  color: #fff;
}
.drawer-divider {
  margin: 12px 24px;
  border-top: 1px solid rgba(255,255,255,0.15);
}
.drawer-refresh {
  margin: 0 24px;
  background: rgba(255,255,255,0.12);
  border: 1.5px solid rgba(255,255,255,0.3);
  color: #fff;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
  transition: background 0.2s;
}
.drawer-refresh:hover:not(:disabled) {
  background: rgba(255,255,255,0.22);
}
.drawer-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ===== ドロワーアニメーション ===== */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.25s;
}
.drawer-enter-active .drawer-inner,
.drawer-leave-active .drawer-inner {
  transition: transform 0.25s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .drawer-inner,
.drawer-leave-to .drawer-inner {
  transform: translateX(100%);
}

/* ===== 更新ボタン ===== */
.refresh-btn {
  background: var(--color-white-opaque-weak);
  border: 1.5px solid var(--color-white-opaque-strong);
  color: var(--color-white);
  border-radius: 6px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s, border-color 0.2s;
}
.refresh-btn:hover:not(:disabled) {
  background: var(--color-white-opaque-hover);
  border-color: rgba(255, 255, 255, 0.6);
}
.refresh-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.refresh-btn.refresh-ok { background: var(--color-success-opaque); border-color: var(--color-success-bright); }
.refresh-btn.refresh-err { background: var(--color-error-opaque); border-color: var(--color-error-soft); }

/* ===== トースト ===== */
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-white);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  z-index: 9999;
  max-width: 420px;
}
.toast-ok { background: var(--color-success); }
.toast-err { background: var(--color-error); }
.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(20px); }

/* ===== スマホ対応（768px以下） ===== */
@media (max-width: 768px) {
  .nav-links-pc,
  .nav-refresh-pc {
    display: none;
  }
  .hamburger {
    display: flex;
  }
}
</style>
