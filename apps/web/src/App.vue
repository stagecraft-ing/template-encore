<template>
  <AppLayout
    service-name="Enterprise Template"
    :user="user"
    :navigation-items="navigationItems"
  >
    <div
      v-if="showSessionExpired"
      class="session-expired-banner"
    >
      <goa-callout
        type="emergency"
        heading="Session Expired"
      >
        <p>Your session has expired. Please sign in again to continue.</p>
        <goa-spacer vspacing="s" />
        <goa-button-group gap="relaxed">
          <GoabButton
            type="primary"
            @click="goToSignIn"
          >
            Sign In
          </GoabButton>
          <GoabButton
            type="tertiary"
            @click="dismissSessionExpired"
          >
            Dismiss
          </GoabButton>
        </goa-button-group>
      </goa-callout>
      <goa-spacer vspacing="m" />
    </div>
    <router-view />
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth.store'
import { useNavigation, resolveLabel } from './composables/useNavigation'
import AppLayout from './components/layout/AppLayout.vue'
import { GoabButton } from './components/goa'

/**
 * App - Root application component
 *
 * Provides:
 * - Main layout structure via AppLayout
 * - User authentication state
 * - Navigation configuration (dynamic, driven by installed modules)
 * - Session expiry notification
 */

const authStore = useAuthStore()
const router = useRouter()
const { leftItems } = useNavigation()

// Get user from auth store
const user = computed(() => authStore.user)

// Map NavItem to the { path, label } format expected by AppLayout
const navigationItems = computed(() =>
  leftItems.value.map((item) => ({ path: item.to, label: resolveLabel(item.label) }))
)

const showSessionExpired = ref(false)

watch(() => authStore.sessionExpired, (expired) => {
  if (expired) showSessionExpired.value = true
})

function dismissSessionExpired() {
  showSessionExpired.value = false
  authStore.sessionExpired = false
}

function goToSignIn() {
  showSessionExpired.value = false
  authStore.sessionExpired = false
  void router.push('/login')
}

onMounted(async () => {
  // Fetch current user from API
  await authStore.fetchUser()
})
</script>
