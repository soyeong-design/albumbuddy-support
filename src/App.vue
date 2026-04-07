<script setup lang="ts">
import { ref } from 'vue';
import TheHeader from './components/TheHeader.vue';
import TheFooter from './components/TheFooter.vue';
import HomeView from './views/HomeView.vue';
import NoticesView from './views/NoticesView.vue';
import FaqView from './views/FaqView.vue';
import ContactView from './views/ContactView.vue';

const currentView = ref('home');

function navigate(view: string) {
  currentView.value = view;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
</script>

<template>
  <div class="min-h-screen font-sans" style="background-color: #ffffff; overflow-x: hidden">
    <TheHeader :current-view="currentView" @navigate="navigate" />

    <main>
      <HomeView v-if="currentView === 'home'" @navigate="navigate" />
      <NoticesView v-else-if="currentView === 'notices'" />
      <FaqView v-else-if="currentView === 'faq'" @navigate="navigate" />
      <ContactView v-else-if="currentView === 'contact'" />
    </main>

    <TheFooter @navigate="navigate" />
  </div>
</template>

<style scoped>
:deep(*) {
  font-family:
    'Pretendard Variable',
    'Pretendard JP Variable',
    -apple-system,
    BlinkMacSystemFont,
    system-ui,
    sans-serif;
}
</style>
