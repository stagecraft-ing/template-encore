<template>
  <AppLayout
    service-name="Internal Portal"
    :user="user"
    :primary-items="primaryItems"
    :secondary-items="secondaryItems"
    :account-items="accountItems"
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
import { useNavigation } from './composables/useNavigation'
import AppLayout from './components/layout/AppLayout.vue'
import { GoabButton } from './components/goa'

const authStore = useAuthStore()
const router = useRouter()
const { primaryItems, secondaryItems, accountItems } = useNavigation()

const user = computed(() => authStore.user)

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
  await authStore.fetchUser()
})
</script>
