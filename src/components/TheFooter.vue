<script setup lang="ts">
import { t } from '../i18n';

const emit = defineEmits<{ navigate: [view: string] }>();
</script>

<template>
  <footer style="background-color: #f0f3f4">
    <div class="footer-inner">
      <!-- Top: brand + nav -->
      <div class="footer-top">
        <!-- Left: brand + description -->
        <div style="display: flex; flex-direction: column; gap: 8px">
          <span
            style="
              font-size: 16px;
              font-weight: 700;
              line-height: 24px;
              letter-spacing: -0.3px;
              color: #6d7f92;
            "
          >
            AlbumBuddy
          </span>
          <p
            style="
              font-size: 14px;
              font-weight: 600;
              line-height: 20px;
              letter-spacing: -0.3px;
              color: #8a99a8;
              margin: 0;
              white-space: pre-line;
            "
          >
            {{ t('footer-desc') }}
          </p>
        </div>

        <!-- Right: nav links -->
        <nav class="footer-nav">
          <button class="footer-link" @click="emit('navigate', 'notices:terms')">
            {{ t('이용약관') }}
          </button>
          <button class="footer-link" @click="emit('navigate', 'notices:privacy')">
            {{ t('개인정보 처리방침') }}
          </button>
        </nav>
      </div>

      <!-- Divider -->
      <div style="height: 1px; background-color: #e1e6ea" />

      <!-- Sponsored by -->
      <div style="display: flex; flex-direction: column; gap: 4px">
        <span
          style="
            font-size: 14px;
            font-weight: 600;
            line-height: 20px;
            letter-spacing: -0.3px;
            color: #8a99a8;
          "
        >
          Sponsored by
        </span>
        <span style="font-size: 16px; font-weight: 800; letter-spacing: -0.5px; color: #8a99a8">
          Makestar
        </span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.footer-inner {
  max-width: 1440px;
  margin: 0 auto;
  padding: 32px 24px 60px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.footer-top {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.footer-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
}

.footer-link {
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  letter-spacing: -0.3px;
  color: #6d7f92;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
}
.footer-link:hover {
  color: #4c5a66;
}

@media (min-width: 768px) {
  .footer-inner {
    padding: 32px 100px 60px;
  }
  .footer-top {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
  }
  .footer-nav {
    gap: 44px;
    flex-wrap: nowrap;
  }
}
</style>
