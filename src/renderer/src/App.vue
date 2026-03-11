<script setup lang="ts">
import { useAppStore } from '@renderer/stores/app'

const appStore = useAppStore()
</script>

<template>
  <div class="app-container">
    <h1>{{ appStore.appName }}</h1>
    <p>Event Driven Test Application</p>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  font-family: sans-serif;
}
</style>
