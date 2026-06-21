<template>
  <goa-checkbox
    :name="name"
    :text="text"
    :value="value"
    :checked="modelValue"
    :disabled="disabled"
    :error="error"
    :aria-label="ariaLabel"
    @_change="handleChange"
  />
</template>

<script setup lang="ts">
/**
 * GoabCheckbox - Vue wrapper for goa-checkbox web component with v-model support
 *
 * @example
 * <GoabCheckbox v-model="accepted" name="terms" text="I accept the terms and conditions" />
 */

defineProps<{
  modelValue?: boolean
  name?: string
  text?: string
  value?: string
  disabled?: boolean
  error?: boolean
  ariaLabel?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function handleChange(event: CustomEvent) {
  const checked = event.detail?.checked ?? (event.target as HTMLInputElement)?.checked
  emit('update:modelValue', Boolean(checked))
}
</script>
