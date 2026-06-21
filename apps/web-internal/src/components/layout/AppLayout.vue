<template>
  <div class="app-layout">
    <a
      href="#main-content"
      class="skip-link"
    >Skip to main content</a>

    <goa-work-side-menu
      :heading="serviceName"
      :user-name="user?.name"
      :user-secondary-text="user?.email"
    >
      <goa-work-side-menu-item
        v-for="item in primaryItems"
        :key="item.id"
        slot="primary"
        :icon="item.icon"
        :label="resolveLabel(item.label)"
        :url="item.to"
        :current="isCurrentRoute(item.to)"
        @click.prevent="navigateTo(item.to)"
      />
      <goa-work-side-menu-item
        v-for="item in secondaryItems"
        :key="item.id"
        slot="secondary"
        :icon="item.icon"
        :label="resolveLabel(item.label)"
        :badge="resolveBadge(item.badge)"
        @click.prevent="navigateTo(item.to)"
      />
      <goa-work-side-menu-item
        v-for="item in accountItems"
        :key="item.id"
        slot="account"
        :label="resolveLabel(item.label)"
        :url="item.to"
        @click.prevent="navigateTo(item.to)"
      />
      <goa-work-side-menu-item
        slot="account"
        label="Sign Out"
        @click.prevent="handleLogout"
      />
    </goa-work-side-menu>

    <div class="card-container">
      <div class="desktop-card-container">
        <main
          id="main-content"
          class="main-content"
        >
          <slot />
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { resolveLabel, resolveBadge } from '@/composables/useNavigation'
import type { SidebarNavItem } from '@/composables/useNavigation'

interface User {
  name: string
  email?: string
}

withDefaults(
  defineProps<{
    serviceName?: string
    user?: User | null
    primaryItems?: SidebarNavItem[]
    secondaryItems?: SidebarNavItem[]
    accountItems?: SidebarNavItem[]
  }>(),
  {
    serviceName: 'Internal Portal',
    primaryItems: () => [],
    secondaryItems: () => [],
    accountItems: () => [],
  }
)

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

function navigateTo(path: string) {
  void router.push(path)
}

function isCurrentRoute(path: string): boolean {
  return route.path === path
}

async function handleLogout() {
  try {
    await authStore.logout()
    void router.push('/login')
  } catch {
    void router.push('/login')
  }
}
</script>

<style scoped>
.app-layout {
  height: 100vh;
  display: flex;
  overflow: hidden;
}

.card-container {
  flex: 1;
  padding: 16px;
  background: #f1f1f1;
  overflow: hidden;
  display: flex;
  min-width: 0;
}

.desktop-card-container {
  flex: 1;
  background: #ffffff;
  border-radius: 24px;
  border: 1px solid var(--goa-color-greyscale-200, #dcdcdc);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-width: 0;
}

.skip-link {
  position: absolute;
  top: -100%;
  left: var(--goa-space-m);
  z-index: 9999;
  padding: var(--goa-space-s) var(--goa-space-m);
  background: var(--goa-color-interactive-default);
  color: var(--goa-color-greyscale-white);
  text-decoration: none;
  border-radius: var(--goa-border-radius-m);
  font-weight: 600;
}

.skip-link:focus {
  top: var(--goa-space-m);
}
</style>
