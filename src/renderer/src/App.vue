<script setup lang="ts">
import AppShell from '@renderer/components/AppShell.vue'
</script>

<template>
  <AppShell />
</template>

<style>
:root,
[data-theme='dark'] {
  --color-bg: #1e1e2e;
  --color-bg-alt: #181825;
  --color-bg-surface: #313244;
  --color-border: #313244;
  --color-border-alt: #45475a;
  --color-text: #cdd6f4;
  --color-text-muted: #a6adc8;
  --color-text-dim: #585b70;
  --color-primary: #89b4fa;
  --color-primary-hover: #b4befe;
  --color-success: #a6e3a1;
  --color-danger: #f38ba8;
  --color-warning: #f9e2af;
}

[data-theme='light'] {
  --color-bg: #eff1f5;
  --color-bg-alt: #e6e9ef;
  --color-bg-surface: #ccd0da;
  --color-border: #ccd0da;
  --color-border-alt: #bcc0cc;
  --color-text: #4c4f69;
  --color-text-muted: #6c6f85;
  --color-text-dim: #9ca0b0;
  --color-primary: #1e66f5;
  --color-primary-hover: #04a5e5;
  --color-success: #40a02b;
  --color-danger: #d20f39;
  --color-warning: #df8e1d;
}

@media (prefers-color-scheme: light) {
  [data-theme='system'] {
    --color-bg: #eff1f5;
    --color-bg-alt: #e6e9ef;
    --color-bg-surface: #ccd0da;
    --color-border: #ccd0da;
    --color-border-alt: #bcc0cc;
    --color-text: #4c4f69;
    --color-text-muted: #6c6f85;
    --color-text-dim: #9ca0b0;
    --color-primary: #1e66f5;
    --color-primary-hover: #04a5e5;
    --color-success: #40a02b;
    --color-danger: #d20f39;
    --color-warning: #df8e1d;
  }
}

@media (prefers-color-scheme: dark) {
  [data-theme='system'] {
    --color-bg: #1e1e2e;
    --color-bg-alt: #181825;
    --color-bg-surface: #313244;
    --color-border: #313244;
    --color-border-alt: #45475a;
    --color-text: #cdd6f4;
    --color-text-muted: #a6adc8;
    --color-text-dim: #585b70;
    --color-primary: #89b4fa;
    --color-primary-hover: #b4befe;
    --color-success: #a6e3a1;
    --color-danger: #f38ba8;
    --color-warning: #f9e2af;
  }
}
</style>
