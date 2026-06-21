<template>
  <div class="not-found-view">
    <goa-callout
      type="important"
      heading="Page Not Found"
    >
      <p>The page you are looking for does not exist or may have been moved.</p>
    </goa-callout>

    <goa-spacer vspacing="l" />

    <GoabButton
      type="primary"
      leadingicon="home"
      @click="goHome"
    >
      Back to Home
    </GoabButton>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { GoabButton } from '../components/goa'

const router = useRouter()

function goHome() {
  void router.push('/')
}
</script>

<style scoped>
.not-found-view {
  max-width: 600px;
  padding: var(--goa-space-xl) 0;
}
</style>
