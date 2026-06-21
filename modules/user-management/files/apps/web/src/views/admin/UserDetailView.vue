<template>
  <div class="user-detail-view">
    <div class="page-topbar">
      <h1>User Detail</h1>
      <goa-button
        type="tertiary"
        size="compact"
        @_click="goBack"
      >
        Back to Users
      </goa-button>
    </div>

    <div class="page-body">
      <!-- Loading -->
      <template v-if="loading">
        <goa-skeleton
          type="text"
          size="4"
        />
        <goa-spacer vspacing="s" />
        <goa-skeleton
          type="text"
          size="4"
        />
      </template>

      <!-- Error -->
      <goa-callout
        v-else-if="error"
        type="emergency"
        heading="Error"
      >
        <p>{{ error }}</p>
      </goa-callout>

      <!-- Not found -->
      <goa-callout
        v-else-if="!user"
        type="important"
        heading="User Not Found"
      >
        <p>The requested user could not be found.</p>
      </goa-callout>

      <!-- User detail -->
      <template v-else>
        <!-- User info -->
        <goa-container accent="thin">
          <h2 class="section-title">
            Profile Information
          </h2>
          <dl class="info-list">
            <div class="info-row">
              <dt>Name</dt>
              <dd>{{ user.name }}</dd>
            </div>
            <div class="info-row">
              <dt>Email</dt>
              <dd>{{ user.email }}</dd>
            </div>
            <div class="info-row">
              <dt>External ID</dt>
              <dd class="mono">
                {{ user.external_id }}
              </dd>
            </div>
            <div class="info-row">
              <dt>Created</dt>
              <dd>{{ formatDate(user.created_at) }}</dd>
            </div>
            <div class="info-row">
              <dt>Last Login</dt>
              <dd>{{ formatDate(user.last_login_at) }}</dd>
            </div>
            <div class="info-row">
              <dt>Status</dt>
              <dd>
                <goa-badge
                  :type="user.is_active ? 'success' : 'emergency'"
                  :content="user.is_active ? 'Active' : 'Inactive'"
                />
              </dd>
            </div>
          </dl>

          <goa-spacer vspacing="m" />

          <goa-button
            :type="user.is_active ? 'secondary' : 'primary'"
            size="compact"
            @_click="toggleActive"
          >
            {{ user.is_active ? 'Deactivate User' : 'Activate User' }}
          </goa-button>
        </goa-container>

        <goa-spacer vspacing="l" />

        <!-- Role assignment -->
        <goa-container accent="thin">
          <h2 class="section-title">
            Role Assignment
          </h2>
          <p class="section-description">
            Select the roles to assign to this user. Changes take effect on their next login.
          </p>

          <goa-spacer vspacing="m" />

          <div class="role-list">
            <div
              v-for="role in allRoles"
              :key="role.id"
              class="role-item"
            >
              <goa-checkbox
                :name="'role-' + role.id"
                :text="role.name"
                :checked="selectedRoleIds.has(role.id) || undefined"
                @_change="toggleRole(role.id, $event)"
              />
              <span
                v-if="role.description"
                class="role-description"
              >
                {{ role.description }}
              </span>
              <goa-badge
                v-if="role.is_system"
                type="midtone"
                content="System"
              />
            </div>
          </div>

          <goa-spacer vspacing="l" />

          <div class="actions">
            <goa-button
              type="primary"
              size="compact"
              :disabled="!rolesChanged || saving || undefined"
              @_click="saveRoles"
            >
              {{ saving ? 'Saving...' : 'Save Roles' }}
            </goa-button>
            <goa-button
              v-if="rolesChanged"
              type="tertiary"
              size="compact"
              @_click="resetRoles"
            >
              Reset
            </goa-button>
          </div>
        </goa-container>

        <!-- Save confirmation -->
        <goa-spacer vspacing="m" />
        <goa-callout
          v-if="saveSuccess"
          type="success"
          heading="Roles Updated"
        >
          <p>Role assignments have been saved. Changes take effect on the user's next login.</p>
        </goa-callout>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'

interface Role {
  id: string
  name: string
  description: string | null
  is_system: boolean
}

interface User {
  id: string
  external_id: string
  email: string
  name: string
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
  roles: Role[]
}

const route = useRoute()
const router = useRouter()

const user = ref<User | null>(null)
const allRoles = ref<Role[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const saving = ref(false)
const saveSuccess = ref(false)

// Track selected role IDs (reactive set)
const selectedRoleIds = ref<Set<string>>(new Set())
const originalRoleIds = ref<Set<string>>(new Set())

const rolesChanged = computed(() => {
  if (selectedRoleIds.value.size !== originalRoleIds.value.size) return true
  for (const id of selectedRoleIds.value) {
    if (!originalRoleIds.value.has(id)) return true
  }
  return false
})

async function fetchData() {
  loading.value = true
  error.value = null
  try {
    const [userRes, rolesRes] = await Promise.all([
      axios.get(`/api/v1/admin/users/${String(route.params.id)}`),
      axios.get('/api/v1/admin/roles'),
    ])
    user.value = userRes.data.data.user
    allRoles.value = rolesRes.data.data.roles

    // Initialize selected roles
    const userRoleIds = new Set(user.value!.roles.map((r: Role) => r.id))
    selectedRoleIds.value = new Set(userRoleIds)
    originalRoleIds.value = new Set(userRoleIds)
  } catch {
    error.value = 'Failed to load user data.'
  } finally {
    loading.value = false
  }
}

function toggleRole(roleId: string, event: Event) {
  const checked = (event as CustomEvent<{ checked: boolean }>).detail.checked
  const newSet = new Set(selectedRoleIds.value)
  if (checked) {
    newSet.add(roleId)
  } else {
    newSet.delete(roleId)
  }
  selectedRoleIds.value = newSet
}

function resetRoles() {
  selectedRoleIds.value = new Set(originalRoleIds.value)
  saveSuccess.value = false
}

async function saveRoles() {
  if (!user.value) return
  saving.value = true
  saveSuccess.value = false
  try {
    await axios.put(`/api/v1/admin/users/${user.value.id}/roles`, {
      roleIds: [...selectedRoleIds.value],
    })
    originalRoleIds.value = new Set(selectedRoleIds.value)
    saveSuccess.value = true
  } catch {
    error.value = 'Failed to save roles.'
  } finally {
    saving.value = false
  }
}

async function toggleActive() {
  if (!user.value) return
  try {
    const res = await axios.put(`/api/v1/admin/users/${user.value.id}`, {
      is_active: !user.value.is_active,
    })
    user.value = { ...user.value, ...res.data.data.user }
  } catch {
    error.value = 'Failed to update user status.'
  }
}

function goBack() {
  void router.push({ name: 'admin-users' })
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(fetchData)
</script>

<style scoped>
.section-title {
  font-size: var(--goa-font-size-5);
  font-weight: 600;
  color: var(--goa-color-greyscale-black);
  margin: 0 0 var(--goa-space-s) 0;
}

.section-description {
  color: var(--goa-color-text-secondary, #666);
  font-size: 0.9375rem;
  margin: 0;
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

.role-list {
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-m);
}

.role-item {
  display: flex;
  align-items: center;
  gap: var(--goa-space-m);
}

.role-description {
  font-size: 0.875rem;
  color: var(--goa-color-text-secondary, #666);
}

.actions {
  display: flex;
  gap: var(--goa-space-m);
}
</style>
