<template>
  <div>
    <nav class="nav">
      <span class="nav-title">🚤 競艇予想</span>
      <NuxtLink to="/" class="nav-link" active-class="active" exact
        >出走表</NuxtLink
      >
      <NuxtLink to="/racers" class="nav-link" active-class="active"
        >選手検索</NuxtLink
      >
      <NuxtLink to="/predict" class="nav-link" active-class="active"
        >🎯 予想</NuxtLink
      >
      <NuxtLink to="/history" class="nav-link" active-class="active"
        >📊 履歴</NuxtLink
      >
      <NuxtLink to="/accuracy" class="nav-link" active-class="active"
        >🎯 的中率</NuxtLink
      >

      <div class="nav-spacer" />

      <!-- 更新ボタン（今日＋明日を取得） -->
      <button
        class="refresh-btn"
        :class="statusClass"
        :disabled="loading"
        @click="doRefresh"
      >
        {{ loading ? "⏳ 更新中..." : statusIcon + " データ更新" }}
      </button>
    </nav>
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

async function doRefresh() {
  loading.value = true;
  statusClass.value = "";
  statusIcon.value = "🔄";
  try {
    // body 省略 → サーバー側で今日〜明日を自動設定
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
.nav-spacer {
  flex: 1;
}

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
  transition:
    background 0.2s,
    border-color 0.2s;
}
.refresh-btn:hover:not(:disabled) {
  background: var(--color-white-opaque-hover);
  border-color: rgba(255, 255, 255, 0.6);
}
.refresh-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.refresh-btn.refresh-ok {
  background: var(--color-success-opaque);
  border-color: var(--color-success-bright);
}
.refresh-btn.refresh-err {
  background: var(--color-error-opaque);
  border-color: var(--color-error-soft);
}

/* トースト */
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
.toast-ok {
  background: var(--color-success);
}
.toast-err {
  background: var(--color-error);
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
