<template>
  <goa-radio-group
    :name="name"
    :value="modelValue"
    :error="error"
    :aria-label="ariaLabel"
    @_change="handleChange"
  >
    <slot />
  </goa-radio-group>
</template>

<script setup lang="ts">
/**
 * GoabRadioGroup - Vue wrapper for goa-radio-group web component with v-model support
 *
 * @example
 * <GoabRadioGroup v-model="selected" name="preference">
 *   <goa-radio-item value="yes" label="Yes" />
 *   <goa-radio-item value="no" label="No" />
 * </GoabRadioGroup>
 */

defineProps<{
  modelValue?: string
  name?: string
  error?: boolean
  ariaLabel?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function handleChange(event: CustomEvent) {
  const value = event.detail?.value ?? (event.target as HTMLInputElement)?.value
  emit('update:modelValue', String(value))
}
</script>
