<template>
  <div class="user-list-view">
    <div class="page-topbar">
      <h1>User Management</h1>
      <p>Manage application users and their role assignments.</p>
    </div>

    <div class="page-body">
      <!-- Search -->
      <div class="search-bar">
        <goa-input
          name="search"
          type="search"
          :value="search"
          placeholder="Search by name or email..."
          width="320px"
          @_change="onSearch"
        />
      </div>

      <goa-spacer vspacing="l" />

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

      <!-- Empty state -->
      <goa-callout
        v-else-if="users.length === 0"
        type="information"
        heading="No Users Found"
      >
        <p>{{ search ? 'No users match your search criteria.' : 'No users have been provisioned yet. Users are created automatically on first login.' }}</p>
      </goa-callout>

      <!-- User table -->
      <template v-else>
        <goa-table width="100%">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Status</th>
              <th>Last Login</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in users"
              :key="user.id"
            >
              <td>{{ user.name }}</td>
              <td>{{ user.email }}</td>
              <td>
                <div class="roles">
                  <goa-badge
                    v-for="role in user.roles"
                    :key="role.id"
                    type="information"
                    :content="role.name"
                  />
                  <span
                    v-if="!user.roles?.length"
                    class="no-roles"
                  >No roles</span>
                </div>
              </td>
              <td>
                <goa-badge
                  :type="user.is_active ? 'success' : 'emergency'"
                  :content="user.is_active ? 'Active' : 'Inactive'"
                />
              </td>
              <td>{{ formatDate(user.last_login_at) }}</td>
              <td>
                <goa-button
                  type="tertiary"
                  size="compact"
                  @_click="viewUser(user.id)"
                >
                  Manage
                </goa-button>
              </td>
            </tr>
          </tbody>
        </goa-table>

        <!-- Pagination -->
        <goa-spacer vspacing="l" />
        <div
          v-if="totalPages > 1"
          class="pagination"
        >
          <goa-button
            type="tertiary"
            size="compact"
            :disabled="page <= 1 || undefined"
            @_click="goToPage(page - 1)"
          >
            Previous
          </goa-button>
          <span class="page-info">Page {{ page }} of {{ totalPages }}</span>
          <goa-button
            type="tertiary"
            size="compact"
            :disabled="page >= totalPages || undefined"
            @_click="goToPage(page + 1)"
          >
            Next
          </goa-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

interface UserRole {
  id: string
  name: string
}

interface UserItem {
  id: string
  name: string
  email: string
  is_active: boolean
  last_login_at: string | null
  roles: UserRole[]
}

const router = useRouter()

const users = ref<UserItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const search = ref('')
const page = ref(1)
const totalPages = ref(1)
const limit = 20

async function fetchUsers() {
  loading.value = true
  error.value = null
  try {
    const params: Record<string, string | number> = { page: page.value, limit }
    if (search.value) params.search = search.value

    const res = await axios.get('/api/v1/admin/users', { params })
    users.value = res.data.data.items
    totalPages.value = res.data.data.pagination.totalPages
  } catch {
    error.value = 'Failed to load users. Please try again.'
  } finally {
    loading.value = false
  }
}

function onSearch(e: CustomEvent) {
  search.value = (e as CustomEvent<{ value: string }>).detail.value ?? ''
  page.value = 1
  void fetchUsers()
}

function goToPage(p: number) {
  page.value = p
  void fetchUsers()
}

function viewUser(id: string) {
  void router.push({ name: 'admin-user-detail', params: { id } })
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

onMounted(fetchUsers)
</script>

<style scoped>
.search-bar {
  display: flex;
  align-items: center;
  gap: var(--goa-space-m);
}

.roles {
  display: flex;
  gap: var(--goa-space-xs);
  flex-wrap: wrap;
}

.no-roles {
  color: var(--goa-color-text-secondary, #666);
  font-size: 0.875rem;
  font-style: italic;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--goa-space-m);
}

.page-info {
  font-size: 0.875rem;
  color: var(--goa-color-text-secondary, #666);
}
</style>
