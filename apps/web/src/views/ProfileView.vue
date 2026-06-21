<template>
  <div class="wide-content profile-view">
    <h1 class="page-title">
      User Profile
    </h1>

    <template v-if="loading">
      <div
        role="status"
        aria-label="Loading profile information"
        class="loading-state"
      >
        <goa-skeleton
          type="text"
          size="2"
        />
        <goa-spacer vspacing="s" />
        <goa-skeleton
          type="text"
          size="2"
        />
        <goa-spacer vspacing="s" />
        <goa-skeleton
          type="text"
          size="2"
        />
      </div>
    </template>

    <goa-callout
      v-else-if="!user"
      type="important"
      heading="Not Authenticated"
    >
      <p>
        You are not currently authenticated. Please <router-link to="/login">
          sign in
        </router-link> to view your profile.
      </p>
    </goa-callout>

    <template v-else>
      <goa-callout
        type="success"
        heading="Authenticated"
      >
        <p>Your profile information is retrieved from the authentication provider.</p>
      </goa-callout>

      <goa-spacer vspacing="l" />

      <goa-container accent="thin">
        <h2 class="section-title">
          Profile Information
        </h2>

        <dl class="info-list">
          <div class="info-row">
            <dt>User ID</dt>
            <dd class="mono">
              {{ user.id }}
            </dd>
          </div>

          <div class="info-row">
            <dt>Full Name</dt>
            <dd>{{ user.name }}</dd>
          </div>

          <div class="info-row">
            <dt>Email Address</dt>
            <dd>{{ user.email || 'Not provided' }}</dd>
          </div>

          <div
            v-if="user.roles && user.roles.length"
            class="info-row"
          >
            <dt>Roles</dt>
            <dd class="roles">
              <goa-badge
                v-for="role in user.roles"
                :key="role"
                type="information"
                :content="role"
              />
            </dd>
          </div>
        </dl>
      </goa-container>

      <goa-spacer vspacing="l" />

      <goa-container>
        <h2 class="section-title">
          Session Information
        </h2>

        <dl class="info-list">
          <div class="info-row">
            <dt>Session Status</dt>
            <dd>
              <goa-badge
                type="success"
                content="Active"
              />
            </dd>
          </div>
        </dl>
      </goa-container>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth.store'

const authStore = useAuthStore()

const user = computed(() => authStore.user)
const loading = computed(() => authStore.loading)

onMounted(async () => {
  if (!user.value) {
    await authStore.fetchUser()
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

.roles {
  display: flex;
  gap: var(--goa-space-xs);
  flex-wrap: wrap;
}

.loading-state {
  padding: var(--goa-space-l) 0;
}
</style>
