<template>
  <div class="app-layout">
    <a
      href="#main-content"
      class="skip-link"
    >Skip to main content</a>

    <goa-microsite-header
      type="alpha"
      version="live"
    />

    <AppHeader
      :service-name="serviceName"
      :user="user"
      :navigation-items="navigationItems"
    />

    <main id="main-content">
      <div class="page-content">
        <slot />
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import AppHeader from './AppHeader.vue'
import AppFooter from './AppFooter.vue'

/**
 * AppLayout - Main application layout wrapper
 *
 * Provides consistent page structure with:
 * - GoA-compliant header (with navigation)
 * - Centered content area
 * - GoA-compliant footer (sticky at bottom)
 *
 * Navigation has been moved into the header per GoA design patterns.
 */

interface NavigationItem {
  path: string
  label: string
}

interface User {
  name: string
  email?: string
}

withDefaults(
  defineProps<{
    serviceName?: string
    user?: User | null
    navigationItems?: NavigationItem[]
  }>(),
  {
    serviceName: 'Application Template',
    navigationItems: () => [
      { path: '/', label: 'Home' },
      { path: '/about', label: 'About' }
    ]
  }
)
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
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
