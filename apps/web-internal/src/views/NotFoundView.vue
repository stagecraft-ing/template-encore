<template>
  <div class="not-found-view">
    <div class="page-topbar">
      <h1>Page Not Found</h1>
    </div>

    <div class="page-body">
      <goa-callout
        type="important"
        heading="404 — Not Found"
      >
        <p>The page you are looking for does not exist or may have been moved.</p>
      </goa-callout>

      <goa-spacer vspacing="l" />

      <GoabButton
        type="primary"
        leadingicon="home"
        @click="goHome"
      >
        Back to Dashboard
      </GoabButton>
    </div>
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
