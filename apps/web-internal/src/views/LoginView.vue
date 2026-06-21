<template>
  <div class="login-view">
    <div class="page-topbar">
      <h1>Sign In</h1>
      <p>Internal Portal</p>
    </div>

    <div class="page-body">
      <div class="login-content">
        <goa-callout
          type="information"
          heading="Authentication Options"
        >
          <p>Choose your sign-in method below. Available options depend on which authentication modules are installed.</p>
        </goa-callout>

        <goa-spacer vspacing="l" />

        <div
          v-if="driversLoading"
          class="auth-buttons"
        >
          <p>Loading authentication options...</p>
        </div>

        <div
          v-else-if="availableDrivers.length === 0"
          class="auth-buttons"
        >
          <goa-callout
            type="emergency"
            heading="No Auth Drivers"
          >
            <p>No authentication drivers are configured. Install at least one auth module (auth-mock, auth-entra-id).</p>
          </goa-callout>
        </div>

        <div
          v-else
          class="auth-buttons"
        >
          <GoabButton
            v-for="driver in availableDrivers"
            :key="driver"
            :type="getDriverType(driver)"
            :leadingicon="driverMeta[driver]?.icon || 'log-in'"
            @click="handleLogin(driver)"
          >
            {{ driverMeta[driver]?.label || `Sign in with ${driver}` }}
          </GoabButton>
        </div>

        <goa-spacer vspacing="xl" />

        <goa-details heading="Development Mode">
          <p>Currently running with {{ availableDrivers.length }} authentication driver(s). The auth package includes:</p>
          <ul>
            <li v-if="availableDrivers.includes('entra-id')">
              <strong>Entra ID Driver:</strong> For internal users via Microsoft Entra ID
            </li>
            <li v-if="availableDrivers.includes('mock')">
              <strong>Mock Driver:</strong> 3 test users (Developer, Admin, User)
            </li>
            <li v-if="availableDrivers.includes('saml')">
              <strong>SAML Driver:</strong> For external users via your SAML identity provider
            </li>
            <li>
              <strong>Session Storage:</strong> PostgreSQL (production) or memory (development)
            </li>
            <li>
              <strong>Security:</strong> Rate limiting, CSRF protection, secure cookies
            </li>
          </ul>
        </goa-details>

        <goa-spacer vspacing="m" />

        <goa-callout
          type="important"
          heading="Configuration Note"
        >
          <p>Authentication drivers are determined by installed modules. Use <code>npx tsx scripts/add-module.ts auth-mock</code> to add drivers.</p>
        </goa-callout>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth.store'
import { GoabButton } from '../components/goa'

const authStore = useAuthStore()

const availableDrivers = ref<string[]>([])
const driversLoading = ref(true)

type ButtonType = 'primary' | 'secondary' | 'tertiary'

const driverMeta: Record<string, { label: string; icon: string; type: ButtonType }> = {
  'entra-id': { label: 'Sign in with Microsoft Entra ID', icon: 'log-in', type: 'primary' },
  'saml': { label: 'Sign in with SAML IdP', icon: 'log-in', type: 'secondary' },
  'mock': { label: 'Mock Login (Development)', icon: 'person', type: 'tertiary' },
}

function getDriverType(driver: string): ButtonType {
  return driverMeta[driver]?.type || 'secondary'
}

onMounted(async () => {
  try {
    const status = await authStore.checkStatus()
    availableDrivers.value = status.drivers || []
  } catch {
    availableDrivers.value = []
  } finally {
    driversLoading.value = false
  }
})

function handleLogin(driver: string) {
  authStore.login(driver)
}
</script>

<style scoped>
.login-content {
  max-width: 640px;
}

.auth-buttons {
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-m);
}

code {
  background: var(--goa-color-greyscale-100);
  padding: 0.125rem var(--goa-space-xs);
  border-radius: var(--goa-border-radius-s);
  font-family: monospace;
  font-size: var(--goa-font-size-3);
}
</style>
