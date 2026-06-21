<template>
  <div class="wide-content connectivity-view">
    <h1 class="page-title">
      Connectivity Test
    </h1>

    <goa-callout
      v-if="!user"
      type="important"
      heading="Not Authenticated"
    >
      <p>
        You must be <router-link to="/login">
          signed in
        </router-link> to test backend connectivity.
      </p>
    </goa-callout>

    <template v-else>
      <p class="description">
        Tests end-to-end connectivity from this application through the BFF gateway to the private backend API.
      </p>

      <!-- Live region for screen reader announcements -->
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        class="visually-hidden"
      >
        <span v-if="loading">Testing backend connectivity, please wait.</span>
        <span v-else-if="error">Connection check failed. See error details on screen.</span>
        <span v-else-if="result">Successfully connected to the backend.</span>
      </div>

      <goa-spacer vspacing="l" />

      <goa-container
        accent="thin"
        :aria-busy="loading ? 'true' : 'false'"
      >
        <div class="section-header">
          <h2 class="section-title">
            Private Backend — /info
          </h2>
          <GoabButton
            type="secondary"
            :disabled="loading"
            @click="runTest"
          >
            {{ loading ? 'Testing...' : 'Test Again' }}
          </GoabButton>
        </div>

        <template v-if="loading">
          <goa-callout
            type="information"
            heading="Testing..."
          >
            <p>Checking the connection to the private backend. This may take a moment.</p>
          </goa-callout>
        </template>

        <template v-else-if="error">
          <goa-callout
            type="emergency"
            heading="Connection Failed"
          >
            <p>{{ error }}</p>
          </goa-callout>

          <goa-spacer vspacing="m" />

          <goa-container>
            <h3 class="section-title">
              What to check
            </h3>
            <ul class="troubleshoot-list">
              <li>Make sure <code>PRIVATE_API_BASE_URL</code> is set in your <code>.env</code> file</li>
              <li>Make sure <code>OAUTH_*</code> credentials are filled in</li>
              <li>Confirm the private backend service is running and reachable</li>
              <li>Check the API server logs for more details</li>
            </ul>
          </goa-container>
        </template>

        <template v-else-if="result">
          <goa-callout
            type="success"
            heading="Connected"
          >
            <p>Successfully reached the private backend through the BFF gateway.</p>
          </goa-callout>

          <goa-spacer vspacing="m" />

          <dl class="info-list">
            <div class="info-row">
              <dt>Status</dt>
              <dd>
                <goa-badge
                  type="success"
                  content="Connected"
                />
              </dd>
            </div>

            <div class="info-row">
              <dt>Response Time</dt>
              <dd class="mono">
                {{ responseTime }}ms
              </dd>
            </div>

            <div
              v-for="(value, key) in result"
              :key="key"
              class="info-row"
            >
              <dt>{{ key }}</dt>
              <dd class="mono">
                {{ typeof value === 'object' ? JSON.stringify(value) : value }}
              </dd>
            </div>
          </dl>
        </template>

        <template v-else>
          <p>Click <strong>Test Again</strong> or wait for the automatic test to complete.</p>
        </template>
      </goa-container>

      <goa-spacer vspacing="l" />

      <goa-container>
        <h2 class="section-title">
          Request Path
        </h2>
        <dl class="info-list">
          <div class="info-row">
            <dt>Frontend</dt>
            <dd class="mono">
              GET /api/v1/data/info
            </dd>
          </div>
          <div class="info-row">
            <dt>BFF Gateway</dt>
            <dd class="mono">
              requireAuth + OAuth token injection
            </dd>
          </div>
          <div class="info-row">
            <dt>Private Backend</dt>
            <dd class="mono">
              GET {PRIVATE_API_BASE_URL}/info
            </dd>
          </div>
        </dl>
      </goa-container>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth.store'
import { GoabButton } from '../components/goa'
import axios from 'axios'

const API_BASE = '/api/v1'

const authStore = useAuthStore()
const user = computed(() => authStore.user)

const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<Record<string, unknown> | null>(null)
const responseTime = ref<number>(0)

async function runTest() {
  loading.value = true
  error.value = null
  result.value = null

  const start = performance.now()

  try {
    const response = await axios.get<{ success: boolean; data?: Record<string, unknown>; error?: { message?: string } }>(`${API_BASE}/data/info`, {
      withCredentials: true,
    })

    responseTime.value = Math.round(performance.now() - start)

    if (response.data.success) {
      result.value = response.data.data ?? null
    } else {
      error.value = response.data.error?.message || 'Unknown error from gateway'
    }
  } catch (err: unknown) {
    responseTime.value = Math.round(performance.now() - start)

    const axiosErr = err as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string }
    if (axiosErr.response?.status === 401) {
      error.value = 'Your session has expired. Please sign in again to continue.'
    } else if (axiosErr.response?.status === 503) {
      error.value = 'The gateway is not set up correctly. Check your environment configuration.'
    } else if (axiosErr.response?.status === 502) {
      error.value = 'Could not reach the private backend. Make sure the service is running.'
    } else if (axiosErr.response?.status === 504) {
      error.value = 'The backend took too long to respond. The service may be busy or unavailable.'
    } else {
      error.value = axiosErr.response?.data?.error?.message || 'Something went wrong. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!user.value) {
    await authStore.fetchUser()
  }
  if (user.value) {
    await runTest()
  }
})
</script>

<style scoped>
.page-title {
  font-size: var(--goa-font-size-7);
  font-weight: 700;
  color: var(--goa-color-greyscale-black);
  margin: 0 0 var(--goa-space-l) 0;
  padding-bottom: var(--goa-space-s);
  border-bottom: 2px solid var(--goa-color-interactive-default);
}

.description {
  color: var(--goa-color-greyscale-700);
  margin: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--goa-space-l);
}

.section-header .section-title {
  margin: 0;
}

.section-title {
  font-size: var(--goa-font-size-5);
  font-weight: 600;
  color: var(--goa-color-greyscale-black);
  margin: 0 0 var(--goa-space-l) 0;
}

.info-list {
  margin: 0;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--goa-space-m) 0;
  border-bottom: 1px solid var(--goa-color-greyscale-200);
}

.info-row:last-child {
  border-bottom: none;
}

.info-row dt {
  font-weight: 600;
  color: var(--goa-color-greyscale-700);
}

.info-row dd {
  margin: 0;
  color: var(--goa-color-greyscale-black);
}

.info-row dd.mono {
  font-family: monospace;
  font-size: var(--goa-font-size-3);
  word-break: break-all;
  max-width: 60%;
  text-align: right;
}

.troubleshoot-list {
  margin: var(--goa-space-s) 0 0 0;
  padding-left: var(--goa-space-l);
}

.troubleshoot-list li {
  margin-bottom: var(--goa-space-xs);
}

.troubleshoot-list code {
  background: var(--goa-color-greyscale-100);
  padding: var(--goa-space-3xs) var(--goa-space-xs);
  border-radius: var(--goa-border-radius-s);
  font-size: var(--goa-font-size-2);
}
</style>
