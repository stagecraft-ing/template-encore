<template>
  <div class="dashboard-view">
    <div class="page-topbar">
      <h1>Dashboard</h1>
      <p>Welcome back{{ user ? ', ' + user.name : '' }}.</p>
    </div>

    <div class="page-body">
      <div class="panel-grid">
        <div class="panel">
          <div class="panel-header">
            <h2>Recent Activity</h2>
          </div>
          <div class="panel-body">
            <p class="placeholder-text">
              No recent activity to display.
            </p>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <h2>Quick Actions</h2>
          </div>
          <div class="panel-body">
            <p class="placeholder-text">
              Quick action shortcuts will appear here.
            </p>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <h2>Reports</h2>
          </div>
          <div class="panel-body">
            <p class="placeholder-text">
              Report summaries will appear here.
            </p>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <h2>Settings</h2>
          </div>
          <div class="panel-body">
            <p class="placeholder-text">
              Application configuration options.
            </p>
          </div>
        </div>
      </div>

      <goa-spacer vspacing="xl" />

      <goa-callout
        type="information"
        heading="Template Placeholder"
      >
        <p>This dashboard is a placeholder from the enterprise template. Replace these panels with your application's actual dashboard content during feature scaffolding.</p>
      </goa-callout>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth.store'

const authStore = useAuthStore()
const user = computed(() => authStore.user)
</script>

<style scoped>
.placeholder-text {
  font-size: 0.9375rem;
  color: var(--goa-color-text-secondary, #666);
  margin: 0;
  padding: 8px 0;
}
</style>
